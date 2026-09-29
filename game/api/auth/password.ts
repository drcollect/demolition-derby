import { createSession, json, sessionCookie } from '../_lib/auth.js';
import { verifyPassword } from '../_lib/password.js';
import { USERS } from '../_lib/users.js';

// Wrong guesses per client address, per server instance. Best effort (instances don't share it), on top
// of scrypt's cost and the delay below, which is what really slows guessing down.
const FAILS = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The sign-in page posts { username, password } here and gets the same session cookie as Google users. */
export async function POST(request: Request) {
  // a custom header can't be sent cross-site without a CORS preflight, which this API never allows
  if (request.headers.get('x-requested-with') !== 'derby') return json({ error: 'bad_request' }, 400);
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const f = FAILS.get(ip);
  if (f && f.until > now && f.n >= MAX_FAILS) return json({ error: 'too_many' }, 429, { 'retry-after': String(Math.ceil((f.until - now) / 1000)) });

  let username = '';
  let password = '';
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    username = String(body.username ?? '').trim().toLowerCase();
    password = String(body.password ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!username || !password || username.length > 64 || password.length > 256) return json({ error: 'bad_request' }, 400);

  const stored = Object.hasOwn(USERS, username) ? USERS[username] : undefined;
  if (!(await verifyPassword(password, stored))) {
    const cur = f && f.until > now ? f : { n: 0, until: now + WINDOW_MS };
    cur.n++;
    FAILS.set(ip, cur);
    await sleep(300 + Math.random() * 400);
    return json({ error: 'invalid' }, 401);
  }
  FAILS.delete(ip);
  try {
    const token = await createSession({ user: username });
    return json({ ok: true, user: username }, 200, { 'set-cookie': sessionCookie(token) });
  } catch {
    return json({ error: 'not_configured' }, 503);
  }
}
