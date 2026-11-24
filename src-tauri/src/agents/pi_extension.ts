// Loaded by pi when Diffity runs it (`pi --mode rpc -e <this file>`). Diffity writes this file; edits are overwritten.
//
// It connects Diffity's review tools for this session only, and asks Diffity before any tool call that could change
// something. Diffity answers from the chat's permissions: a review never edits, and edits ask the way Settings → Agents
// says. A call is blocked unless Diffity says yes.

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const READ_ONLY = new Set(["read", "grep", "find", "ls"]);
// They only run other tools, and each of those calls comes through here on its own.
const ORCHESTRATORS = new Set(["codemode", "tool_search"]);
const FILE_TOOLS = new Set(["edit", "write"]);
const UNICODE_SPACES = /[  -   　]/g;

interface DiffityConfig {
  server: string;
  command: string;
  args: string[];
}

function config(): DiffityConfig | null {
  try {
    const value = JSON.parse(process.env.DIFFITY_PI ?? "");
    return typeof value?.command === "string" ? value : null;
  } catch {
    return null;
  }
}

// pi's own rules for a tool's `path` (`resolveToCwd`): a leading `@`, `~`, `file://` URLs, then relative to the folder.
function absolutePath(input: string, cwd: string): string {
  let path = input.replace(UNICODE_SPACES, " ");
  if (path.startsWith("@")) {
    path = path.slice(1);
  }
  if (path === "~") {
    path = homedir();
  } else if (path.startsWith("~/")) {
    path = join(homedir(), path.slice(2));
  } else if (path.startsWith("file://")) {
    path = fileURLToPath(path);
  }
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

export default function (pi: any) {
  const diffity = config();
  if (diffity) {
    pi.registerMcpServer(diffity.server, {
      command: diffity.command,
      args: diffity.args,
      exposure: "direct",
      description: "Diffity: the diff under review and its comment threads",
    });
  }

  pi.on("tool_call", async (event: any, ctx: any) => {
    const name: string = event.toolName;
    if (READ_ONLY.has(name) || ORCHESTRATORS.has(name)) {
      return undefined;
    }
    // Diffity judges the file pi will really touch, so the path is made absolute here and pi uses that same path.
    if (FILE_TOOLS.has(name) && typeof event.input?.path === "string") {
      event.input.path = absolutePath(event.input.path, ctx.cwd);
    }
    let allowed = false;
    try {
      const request = JSON.stringify({ toolCallId: event.toolCallId, toolName: name, input: event.input });
      allowed = (await ctx.ui.confirm("diffity:permission", request, { signal: ctx.signal })) === true;
    } catch {
      allowed = false;
    }
    if (allowed) {
      return undefined;
    }
    return {
      block: true,
      reason: "Not allowed in Diffity: the user declined it, or this chat can't change files or run commands. Don't retry; describe the change instead.",
    };
  });
}
