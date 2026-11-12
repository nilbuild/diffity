export interface Requirement {
  name: string;
  tag: string;
  text: string;
}

export const REQUIREMENTS: Requirement[] = [
  { name: 'A Mac or Linux', tag: 'Needed', text: 'macOS 13.3 or later on Apple Silicon or Intel. Or Linux on x86_64: Ubuntu 22.04+, Debian 12+, Fedora.' },
  { name: 'Claude Code or Codex', tag: 'For AI', text: 'One or both, installed and signed in. Review works without them.' },
  { name: 'Node.js', tag: 'For AI', text: 'Used to talk to your agent. Only the AI features need it.' },
];
