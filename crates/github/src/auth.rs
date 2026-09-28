use std::process::Stdio;

use diffity_core::{AppError, Result};
use serde::Deserialize;
use tokio::process::Command;

use crate::graphql::Http;
use crate::types::DeviceCode;

const KEYCHAIN_SERVICE: &str = "com.diffity.app";
const KEYCHAIN_ACCOUNT: &str = "github";
pub const CLIENT_ID_KEY: &str = "DIFFITY_GITHUB_CLIENT_ID";
pub const TOKEN_SOURCE_KEY: &str = "github.token_source";

const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

fn keyring_error(e: keyring::Error) -> AppError {
    AppError::new("keychain", e.to_string())
}

pub async fn keychain_read() -> Result<Option<String>> {
    tokio::task::spawn_blocking(|| {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(keyring_error)?;
        match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(keyring_error(e)),
        }
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?
}

pub async fn keychain_write(token: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(keyring_error)?;
        entry.set_password(&token).map_err(keyring_error)
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?
}

pub async fn keychain_delete() -> Result<()> {
    tokio::task::spawn_blocking(|| {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(keyring_error)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(keyring_error(e)),
        }
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))?
}

pub async fn gh_auth_token() -> Result<String> {
    let out = Command::new("gh")
        .args(["auth", "token"])
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| AppError::new("gh_missing", format!("could not run `gh`: {e}")))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::new(
            "gh_not_logged_in",
            format!("`gh auth token` failed: {}", stderr.trim()),
        ));
    }
    let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if token.is_empty() {
        return Err(AppError::new("gh_not_logged_in", "`gh auth token` returned nothing"));
    }
    Ok(token)
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: Option<u64>,
}

pub async fn device_start(http: &Http, client_id: &str) -> Result<DeviceCode> {
    let resp = http
        .raw()
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", "repo")])
        .send()
        .await
        .map_err(|e| AppError::new("network", e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::new("github", format!("device code request failed: {}", resp.status())));
    }
    let body: DeviceCodeResponse = resp
        .json()
        .await
        .map_err(|e| AppError::new("github", format!("bad device code response: {e}")))?;
    Ok(DeviceCode {
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        device_code: body.device_code,
        interval: body.interval.unwrap_or(5),
        expires_in: body.expires_in,
    })
}

#[derive(Deserialize)]
struct AccessTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

pub fn interpret_poll(body: &str) -> Result<String> {
    let parsed: AccessTokenResponse = serde_json::from_str(body)
        .map_err(|e| AppError::new("github", format!("bad token response: {e}")))?;
    if let Some(token) = parsed.access_token {
        return Ok(token);
    }
    let message = parsed.error_description.unwrap_or_default();
    match parsed.error.as_deref() {
        Some("authorization_pending") => Err(AppError::new("pending", "waiting for authorization")),
        Some("slow_down") => Err(AppError::new("slow_down", "polling too fast")),
        Some("expired_token") => Err(AppError::new("expired", "device code expired")),
        Some("access_denied") => Err(AppError::new("denied", "authorization was denied")),
        Some(other) => Err(AppError::new("github", format!("{other}: {message}"))),
        None => Err(AppError::new("github", "empty token response")),
    }
}

pub async fn device_poll(http: &Http, client_id: &str, device_code: &str) -> Result<String> {
    let resp = http
        .raw()
        .post(ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| AppError::new("network", e.to_string()))?;
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::new("network", e.to_string()))?;
    interpret_poll(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interprets_poll_responses() {
        assert_eq!(interpret_poll(r#"{"access_token":"gho_x","token_type":"bearer"}"#).unwrap(), "gho_x");
        assert_eq!(interpret_poll(r#"{"error":"authorization_pending"}"#).unwrap_err().code, "pending");
        assert_eq!(interpret_poll(r#"{"error":"slow_down"}"#).unwrap_err().code, "slow_down");
        assert_eq!(interpret_poll(r#"{"error":"expired_token"}"#).unwrap_err().code, "expired");
        assert_eq!(interpret_poll(r#"{"error":"access_denied"}"#).unwrap_err().code, "denied");
    }
}
