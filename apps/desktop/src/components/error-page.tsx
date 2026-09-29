import { AlertCircleIcon } from "./icons/alert-circle-icon";
import { isAppError } from "../lib/tauri";

type ErrorPageProps = {
  error: unknown;
  actions: Array<{ label: string; primary?: boolean; onClick: () => void }>;
};

export function ErrorPage(props: ErrorPageProps) {
  const { error, actions } = props;

  let title = "Something went wrong";
  let message = "An unexpected error occurred.";
  let detail = "";

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
    <div className="flex items-center justify-center h-screen bg-bg text-text">
      <div className="max-w-lg text-center px-6">
        <AlertCircleIcon className="w-5 h-5 mx-auto mb-4 text-red-400" />
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-sm text-text-secondary mb-6">{message}</p>
        {detail && (
          <pre className="text-left text-xs text-text-muted bg-bg-secondary border border-border rounded-md p-4 mb-6 overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
            {detail}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          {actions.map((action) => {
            if (action.primary) {
              return (
                <button
                  key={action.label}
                  className="px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover cursor-pointer transition-colors"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              );
            }

            return (
              <button
                key={action.label}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-hover cursor-pointer transition-colors"
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
