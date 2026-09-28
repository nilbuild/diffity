// Mirror of `diffity_core::mentions::mentions_agent`: `@claude` (case-insensitive, whole word) outside code.

function stripCode(body: string): string {
  const out: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  for (const line of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes = marker && marker[1][0] === fence.ch && marker[1].length >= fence.len && line.trim() === marker[1];
      if (closes) {
        fence = null;
      }
      out.push('');
      continue;
    }
    if (marker) {
      fence = { ch: marker[1][0], len: marker[1].length };
      out.push('');
      continue;
    }
    out.push(line.replace(/(`+)[\s\S]*?\1(?!`)/g, ' '));
  }
  return out.join('\n');
}

const MENTION = /(^|[^\p{L}\p{N}_\-@./])@claude(?![\p{L}\p{N}_\-@/]|\.[\p{L}\p{N}_-])/iu;

export function mentionsAgent(body: string): boolean {
  return MENTION.test(stripCode(body));
}
