// Username/password accounts for the online game (api/_lib/users.ts).
//
//   npm run user -- add <username>      asks for the password twice (hidden); also changes a password
//   npm run user -- remove <username>
//   npm run user -- list
//
// Then `npm run deploy` to make the change live. Removing a user or changing a password signs that
// user out everywhere. Needs Node 22.18+ (it loads api/_lib/password.ts directly).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../api/_lib/password.ts';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'api', '_lib', 'users.ts');
const NAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function load() {
  if (!existsSync(FILE)) return {}; // not in the repository: the first `add` creates it
  const m = readFileSync(FILE, 'utf8').match(/USERS[^=]*=\s*(\{[\s\S]*\});/);
  return m ? JSON.parse(m[1]) : {};
}

function save(users) {
  const sorted = Object.fromEntries(Object.entries(users).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    FILE,
    `// Username/password accounts, written by \`npm run user\` (scripts/users.mjs). Don't edit by hand.\n` +
      `// Username → scrypt hash; the passwords themselves are never stored.\n` +
      `export const USERS: Record<string, string> = ${JSON.stringify(sorted, null, 2)};\n`,
  );
}

/** Hidden prompt on a terminal; one line from stdin when piped. */
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : '');
    }
    rl.question(question, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const [cmd, rawName] = process.argv.slice(2);
const users = load();
const name = (rawName ?? '').trim().toLowerCase();

if (cmd === 'list') {
  const names = Object.keys(users);
  console.log(names.length ? names.join('\n') : '(no username/password accounts)');
} else if (cmd === 'add') {
  if (!NAME.test(name)) {
    console.error('Username: 2–32 characters, letters, digits, dot, dash or underscore, starting with a letter or digit.');
    process.exit(1);
  }
  const pw = await ask(`Password for ${name}: `);
  if (process.stdin.isTTY) {
    const again = await ask('Same again: ');
    if (again !== pw) {
      console.error("The passwords don't match; nothing changed.");
      process.exit(1);
    }
  }
  if (pw.length < 8) {
    console.error('Use at least 8 characters; nothing changed.');
    process.exit(1);
  }
  const existed = name in users;
  users[name] = await hashPassword(pw);
  save(users);
  console.log(`${existed ? 'Changed the password for' : 'Added'} ${name}. Run \`npm run deploy\` to make it live.`);
} else if (cmd === 'remove') {
  if (!(name in users)) {
    console.error(`No account called ${name}.`);
    process.exit(1);
  }
  delete users[name];
  save(users);
  console.log(`Removed ${name}. Run \`npm run deploy\` to make it live.`);
} else {
  console.log('Usage: npm run user -- add <username> | remove <username> | list');
  process.exit(cmd ? 1 : 0);
}
