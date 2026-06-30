import type { Command } from 'commander';
import { createHash } from 'node:crypto';
import open from 'open';
import pc from 'picocolors';
import { isGitRepo, getRepoRoot, getRepoName } from '@diffity/git';
import { startServer, getHost } from '../server.js';
import { findInstanceForRepo, findAvailablePort, deregisterInstance, killInstance, checkInstanceHealth } from '../registry.js';

export function registerTreeCommand(program: Command, version: string) {
  program
    .command('tree')
    .description('Open a file browser view of the repository')
    .option('--port <port>', 'Port to use')
    .option('--no-open', 'Do not open browser automatically')
    .option('--dark', 'Open in dark mode')
    .option('--quiet', 'Minimal terminal output')
    .option('--new', 'Stop existing instance and start fresh')
    .action(async (opts) => {
      if (!isGitRepo()) {
        console.error(pc.red('Error: Not a git repository'));
        process.exit(1);
      }

      const repoRoot = getRepoRoot();
      const repoHash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
      const repoName = getRepoName();

      const existing = findInstanceForRepo(repoHash);
      if (existing) {
        const isStale = existing.version !== version;
        const isHealthy = !opts.new && !isStale && await checkInstanceHealth(existing.port);
        if (!isHealthy) {
          killInstance(existing);
          if (!opts.quiet && !isStale && !opts.new) {
            console.log(pc.dim(`  Removed stale instance (pid ${existing.pid})`));
          } else if (!opts.quiet && opts.new) {
            console.log(pc.dim(`  Stopped existing instance (pid ${existing.pid})`));
          }
        } else {
          const urlParams = new URLSearchParams();
          if (opts.dark) {
            urlParams.set('theme', 'dark');
          }
          const qs = urlParams.toString();
          const url = `http://${getHost()}:${existing.port}/tree${qs ? `?${qs}` : ''}`;

          if (!opts.quiet) {
            console.log('');
            console.log(pc.bold('  diffity tree'));
            console.log(`  ${pc.dim('Reusing running instance')}`);
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

      const explicitPort = !!opts.port;
      const port = explicitPort ? parseInt(opts.port, 10) : findAvailablePort();

      try {
        const { port: actualPort, close } = await startServer({
          port,
          portIsExplicit: explicitPort,
          diffArgs: [],
          description: 'Repository file browser',
          effectiveRef: '__tree__',
          version,
          registryInfo: { repoRoot, repoHash, repoName },
        });

        const urlParams = new URLSearchParams();
        if (opts.dark) {
          urlParams.set('theme', 'dark');
        }
        const qs = urlParams.toString();
        const url = `http://${getHost()}:${actualPort}/tree${qs ? `?${qs}` : ''}`;

        if (!opts.quiet) {
          console.log('');
          console.log(pc.bold('  diffity tree'));
          console.log(`  ${pc.dim('Repository file browser')}`);
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
}
