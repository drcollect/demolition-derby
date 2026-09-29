// Password hashing for the username/password accounts (Node runtime only: the sign-in function and the
// scripts/users.mjs tool use the same format). Stored as `scrypt$N$r$p$<salt b64>$<hash b64>`.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 32768; // 2^15: ~32 MB and ~0.1 s per check, which makes guessing slow
const R = 8;
const P = 1;
const KEYLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, { N: n, r, p, maxmem: 256 * n * r }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

interface Parsed {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return null;
  return { n, r, p, salt: Buffer.from(parts[4], 'base64'), hash: Buffer.from(parts[5], 'base64') };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Unknown usernames are checked against this, so a wrong name costs the same time as a wrong password.
const DUMMY: Parsed = { n: N, r: R, p: P, salt: randomBytes(16), hash: randomBytes(KEYLEN) };

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const rec = (stored && parse(stored)) || DUMMY;
  const got = await derive(password, rec.salt, rec.n, rec.r, rec.p, rec.hash.length);
  return rec !== DUMMY && got.length === rec.hash.length && timingSafeEqual(got, rec.hash);
}
