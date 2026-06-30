import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import open from 'open';
import pc from 'picocolors';
import { isGitRepo, isValidGitRef, getRepoRoot, getRepoName, normalizeRef, WORKING_TREE_REFS } from '@diffity/git';
import {
  isGitHubPrUrl,
  parseGitHubPrUrl,
  checkoutPr,
  getPrBaseRef,
  isCliInstalled,
  isAuthenticated,
  detectRemote,
} from '@diffity/github';
import { startServer, getHost } from './server.js';
import { registerAgentCommands } from './agent.js';
import { findInstanceForRepo, findAvailablePort, deregisterInstance, killInstance, checkInstanceHealth } from './registry.js';
import { registerOpenCommand } from './commands/open.js';
import { registerListCommand } from './commands/list.js';
import { registerPruneCommand } from './commands/prune.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerTreeCommand } from './commands/tree.js';
import { registerKillCommand } from './commands/kill.js';
import { SKILLS_HASH } from './generated/skills-hash.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('diffity')
  .description('GitHub-style git diff viewer in the browser')
  .version(pkg.version)
  .enablePositionalOptions()
  .passThroughOptions()
  .option('--skills-hash', 'Print skills hash and exit', false)
  .argument('[refs...]', 'Git refs to diff')
  .option('--base <ref>', 'Base ref to compare from (e.g. main, HEAD~3, v1.0.0)')
  .option('--compare <ref>', 'Ref to compare against base (default: working tree)')
  .option('--port <port>', 'Port to use (default: auto-assigned from 5391)', '5391')
  .option('--no-open', 'Do not open browser automatically')
  .option('--quiet', 'Minimal terminal output')
  .option('--dark', 'Open in dark mode (default: light)')
  .option('--unified', 'Open in unified view (default: split)')
  .option('--new', 'Stop existing instance and start fresh')
  .addHelpText('after', `
Common usage:
  $ diffity                              See all uncommitted changes
  $ diffity main                         What changed since main
  $ diffity HEAD~1                       Review your last commit
  $ diffity main..feature                Compare two branches
  $ diffity --base main --compare feature   Same as above
  $ diffity v1.0.0 v2.0.0               Compare two tags
  $ diffity staged                       Only staged changes
  $ diffity unstaged                     Only unstaged changes
  $ diffity https://github.com/owner/repo/pull/123   Review a GitHub PR
  $ diffity --dark --unified             Dark mode, unified view
  $ diffity --new                        Force restart existing instance

Other commands:
  $ diffity tree                         Browse repository files
  $ diffity tree --dark                  Browse in dark mode
  $ diffity list                         List running instances
  $ diffity kill                         Stop all running instances
  $ diffity prune                        Remove all diffity data

The --base/--compare flags are optional — positional args and
range syntax (main..feature, main...feature) also work.`)
  .action(async (refs: string[], opts) => {
    if (opts.skillsHash) {
      console.log(SKILLS_HASH);
      return;
    }

    if (!isGitRepo()) {
      console.error(pc.red('Error: Not a git repository'));
      process.exit(1);
    }

    // When the first positional is a PR URL, `passThroughOptions()` above slurps any
    // trailing flags (e.g. `diffity <url> --no-open`) into `refs` as positional args.
    // Without this reparse, `refs.length === 1` would be false and the PR URL path
    // would be skipped, producing a confusing "not a valid git reference" error.
    if (refs.length > 1 && isGitHubPrUrl(refs[0])) {
      const extras = refs.splice(1);
      for (const arg of extras) {
        switch (arg) {
          case '--no-open': opts.open = false; break;
          case '--quiet': opts.quiet = true; break;
          case '--dark': opts.dark = true; break;
          case '--unified': opts.unified = true; break;
          case '--new': opts.new = true; break;
          default:
            console.error(pc.red(`Error: Unexpected argument after PR URL: ${arg}`));
            process.exit(1);
        }
      }
    }

    if (refs.length === 1 && isGitHubPrUrl(refs[0])) {
      const parsed = parseGitHubPrUrl(refs[0]);
      if (!parsed) {
        console.error(pc.red('Error: Invalid GitHub PR URL format.'));
        console.log(`  Expected: ${pc.cyan('https://github.com/owner/repo/pull/123')}`);
        process.exit(1);
      }

      if (!isCliInstalled()) {
        console.error(pc.red('Error: GitHub CLI (gh) is not installed.'));
        console.log(`  Install it from ${pc.cyan('https://cli.github.com')}`);
        process.exit(1);
      }

      if (!isAuthenticated()) {
        console.error(pc.red('Error: Not authenticated with GitHub CLI.'));
        console.log(`  Run ${pc.cyan('gh auth login')} to authenticate.`);
        process.exit(1);
      }

      const remote = detectRemote();
      if (!remote) {
        console.error(pc.red('Error: No GitHub remote detected for this repository.'));
        process.exit(1);
      }

      if (
        remote.owner.toLowerCase() !== parsed.owner.toLowerCase() ||
        remote.repo.toLowerCase() !== parsed.repo.toLowerCase()
      ) {
        console.error(pc.red('Error: PR belongs to a different repository.'));
        console.log(`  PR:    ${pc.cyan(`${parsed.owner}/${parsed.repo}`)}`);
        console.log(`  Local: ${pc.cyan(`${remote.owner}/${remote.repo}`)}`);
        process.exit(1);
      }

      try {
        if (!opts.quiet) {
          console.log(pc.dim(`  Checking out PR #${parsed.number}...`));
        }
        checkoutPr(parsed.number);
      } catch (err) {
        console.error(pc.red(`Error: Failed to checkout PR #${parsed.number}.`));
        console.log(`  ${err}`);
        process.exit(1);
      }

      let baseRef: string;
      try {
        baseRef = getPrBaseRef(parsed.number);
      } catch {
        console.error(pc.red(`Error: Could not determine base branch for PR #${parsed.number}.`));
        process.exit(1);
      }

      refs[0] = baseRef;
    }

    // --base/--compare flags take precedence over positional args
    if (opts.base || opts.compare) {
      if (refs.length > 0) {
        console.error(pc.red('Error: Cannot use --base/--compare with positional ref arguments.'));
        console.log(`  Use either ${pc.cyan('diffity --base main --compare feature')} or ${pc.cyan('diffity main feature')}, not both.`);
        process.exit(1);
      }
      if (opts.compare && !opts.base) {
        console.error(pc.red('Error: --compare requires --base.'));
        console.log(`  Example: ${pc.cyan('diffity --base main --compare feature')}`);
        process.exit(1);
      }
      refs.push(opts.base);
      if (opts.compare) {
        refs.push(opts.compare);
      }
    }

    for (let i = 0; i < refs.length; i++) {
      if (refs[i] === '.') {
        refs[i] = 'work';
      }
    }

    for (const ref of refs) {
      if (WORKING_TREE_REFS.has(ref)) {
        continue;
      }
      if (!isValidGitRef(ref)) {
        console.error(pc.red(`Error: '${ref}' is not a valid git reference.`));
        console.log('');
        console.log('Examples:');
        console.log(`  ${pc.cyan('diffity')}                              See all uncommitted changes`);
        console.log(`  ${pc.cyan('diffity main')}                         What changed since main`);
        console.log(`  ${pc.cyan('diffity HEAD~1')}                       Review your last commit`);
        console.log(`  ${pc.cyan('diffity main..feature')}                Compare two branches`);
        console.log(`  ${pc.cyan('diffity --base main --compare feature')}   Compare two branches`);
        console.log(`  ${pc.cyan('diffity staged')}                       Only staged changes`);
        console.log(`  ${pc.cyan('diffity tree')}                         Browse repository files`);
        console.log('');
        console.log(`Run ${pc.cyan('diffity --help')} for more options.`);
        process.exit(1);
      }
    }

    const diffArgs: string[] = [];
    let description = '';

    if (refs.length === 1) {
      const ref = refs[0];
      if (WORKING_TREE_REFS.has(ref)) {
        description = `${ref.charAt(0).toUpperCase() + ref.slice(1)} changes`;
      } else {
        diffArgs.push(normalizeRef(ref));
        description = ref.includes('..') ? ref : `Changes from ${ref}`;
      }
    } else if (refs.length === 2) {
      diffArgs.push(normalizeRef(`${refs[0]}..${refs[1]}`));
      description = `${refs[0]}..${refs[1]}`;
    } else {
      description = 'Unstaged changes';
    }

    let effectiveRef: string;
    if (refs.length > 0) {
      effectiveRef = refs.length === 2 ? `${refs[0]}..${refs[1]}` : refs[0];
    } else {
      effectiveRef = 'work';
    }

    const repoRoot = getRepoRoot();
    const repoHash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
    const repoName = getRepoName();

    const existing = findInstanceForRepo(repoHash);
    if (existing) {
      const isStale = existing.version !== pkg.version;
      const isHealthy = !opts.new && !isStale && await checkInstanceHealth(existing.port);
      if (!isHealthy) {
        killInstance(existing);
        if (!opts.quiet && !isStale && !opts.new) {
          console.log(pc.dim(`  Removed stale instance (pid ${existing.pid})`));
        } else if (!opts.quiet && opts.new) {
          console.log(pc.dim(`  Stopped existing instance (pid ${existing.pid})`));
        }
      } else {
        const urlParams = new URLSearchParams({ ref: effectiveRef });
        if (opts.dark) {
          urlParams.set('theme', 'dark');
        }
        if (opts.unified) {
          urlParams.set('view', 'unified');
        }
        const url = `http://${getHost()}:${existing.port}/diff?${urlParams.toString()}`;

        if (!opts.quiet) {
          console.log('');
          console.log(pc.bold('  diffity'));
          console.log(`  ${pc.dim('Already running for this repo')}`);
          console.log('');
          console.log(`  ${pc.green('→')} ${pc.cyan(url)}`);
          console.log('');
        }

        if (opts.open !== false) {
          await open(url);
        }
        return;
      }
    }

    const explicitPort = program.getOptionValueSource('port') === 'cli';
    const port = explicitPort ? parseInt(opts.port, 10) : findAvailablePort();

    try {
      const { port: actualPort, close } = await startServer({
        port,
        portIsExplicit: explicitPort,
        diffArgs,
        description,
        effectiveRef,
        version: pkg.version,
        registryInfo: { repoRoot, repoHash, repoName },
      });
      const urlParams = new URLSearchParams({ ref: effectiveRef });
      if (opts.dark) {
        urlParams.set('theme', 'dark');
      }
      if (opts.unified) {
        urlParams.set('view', 'unified');
      }
      const url = `http://${getHost()}:${actualPort}/diff?${urlParams.toString()}`;

      if (!opts.quiet) {
        console.log('');
        console.log(pc.bold('  diffity'));
        console.log(`  ${pc.dim(description)}`);
        console.log('');
        console.log(`  ${pc.green('→')} ${pc.cyan(url)}`);
        console.log(`  ${pc.dim('Press Ctrl+C to stop')}`);
        console.log('');
      }

      process.on('SIGINT', () => {
        if (!opts.quiet) {
          console.log(pc.dim('\n  Shutting down...'));
        }
        deregisterInstance(process.pid);
        close();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        deregisterInstance(process.pid);
        close();
        process.exit(0);
      });

      if (opts.open !== false) {
        await open(url);
      }
    } catch (err) {
      console.error(pc.red(`Failed to start server: ${err}`));
      process.exit(1);
    }
  });

registerOpenCommand(program);
registerListCommand(program);
registerPruneCommand(program);
registerUpdateCommand(program, pkg.version, SKILLS_HASH);
registerDoctorCommand(program, pkg.version);
registerTreeCommand(program, pkg.version);
registerKillCommand(program);
registerAgentCommands(program);

program.parse();
