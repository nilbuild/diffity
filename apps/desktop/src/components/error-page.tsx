import { AlertCircleIcon } from "./ui/icon";
import { buttonOutline, buttonPrimary } from "./ui/button-styles";
import { useEffect } from "react";
import { isAppError } from "../lib/tauri";
import { hideStaticSplash } from "./layout/skeleton";

type ErrorPageProps = {
  error: unknown;
  actions: Array<{ label: string; primary?: boolean; onClick: () => void }>;
};

export function ErrorPage(props: ErrorPageProps) {
  const { error, actions } = props;

  useEffect(() => {
    hideStaticSplash();
  }, []);

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";
  let detail = "";
  const code = isAppError(error) ? error.code : null;
  let hint = "";
  if (code === "not_a_repo") {
    title = "Not a Git repository";
    hint = "Diffity reviews changes tracked by Git. Run git init in that folder, or open the repository root.";
  } else if (code === "not_found") {
    title = "Folder not found";
  } else if (code === "invalid_ref") {
    title = "Could not find that commit or branch";
  } else if (code === "git_failed") {
    title = "Git command failed";
  }

  const text = isAppError(error) ? error.message : error instanceof Error ? error.message : null;
  if (text !== null) {
    const lines = text.split("\n");
    const gitError = lines.find((l) => l.includes("fatal:"));
    if (gitError) {
      message = gitError.trim();
    } else {
      message = lines[0];
    }
    detail = lines.length > 1 ? text : "";
  }

  return (
    <div data-tauri-drag-region className="flex items-center justify-center h-screen bg-bg text-text font-sans">
      <div className="max-w-lg text-center px-6">
        <AlertCircleIcon className="w-5 h-5 mx-auto mb-4 text-deleted" />
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-sm text-text-secondary mb-2 break-words">{message}</p>
        {hint && <p className="text-xs text-text-muted mb-6">{hint}</p>}
        {!hint && <div className="mb-4" />}
        {detail && (
          <pre className="text-left text-xs text-text-muted bg-bg-secondary border border-border rounded-md p-4 mb-6 overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
            {detail}
          </pre>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actions.map((action) => {
            if (action.primary) {
              return (
                <button
                  key={action.label}
                  className={buttonPrimary}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              );
            }

            return (
              <button
                key={action.label}
                className={buttonOutline}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
