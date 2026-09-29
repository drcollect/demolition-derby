// Publishes the playable build to GitHub Pages: builds with the /demolition-derby/ base, then force-pushes
// the result as the only commit on the repository's gh-pages branch (the site serves from there).
//   npm run publish:pages
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const game = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd = game) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const out = (cmd, args, cwd = game) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const remote = out('git', ['remote', 'get-url', 'origin']);
// commit the build as the repository's own author (its noreply address), not the global git identity
const who = ['-c', `user.name=${out('git', ['config', 'user.name'])}`, '-c', `user.email=${out('git', ['config', 'user.email'])}`];
const commit = out('git', ['rev-parse', '--short', 'HEAD']);
run('npm', ['run', '-s', 'build:pages']);

const dir = mkdtempSync(path.join(tmpdir(), 'derby-pages-'));
try {
  cpSync(path.join(game, 'dist-pages'), dir, { recursive: true });
  run('git', ['init', '-q', '-b', 'gh-pages'], dir);
  run('git', ['add', '-A'], dir);
  run('git', [...who, 'commit', '-q', '-m', `Playable build of ${commit}`], dir);
  run('git', ['push', '-q', '-f', remote, 'gh-pages'], dir);
  console.log(`Published ${commit}. GitHub Pages updates in a minute or so.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
