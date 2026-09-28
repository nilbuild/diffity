use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(3);
const SKIP_VARS: &[&str] = &["PWD", "OLDPWD", "SHLVL", "_", "TERM", "TERM_PROGRAM", "PS1"];

/// GUI launches on macOS get a minimal environment; import the user's login-shell env so git/node/agents resolve.
pub fn load_login_shell_env() {
    if cfg!(windows) {
        return;
    }
    let Some(output) = read_shell_env() else {
        tracing::warn!("env_fix: could not read login shell environment");
        return;
    };
    for entry in output.split('\0') {
        let Some((key, value)) = entry.split_once('=') else {
            continue;
        };
        if key.is_empty() || SKIP_VARS.contains(&key) {
            continue;
        }
        std::env::set_var(key, value);
    }
}

fn read_shell_env() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(shell)
        .args(["-ilc", "env -0"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                break;
            }
            Ok(None) => {
                if start.elapsed() > TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => return None,
        }
    }
    let buf = reader.join().ok()?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    if !text.contains("PATH=") {
        return None;
    }
    Some(text)
}
