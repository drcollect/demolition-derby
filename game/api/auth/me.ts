import { json, readSession } from '../_lib/auth.js';

/** Who is signed in (the game shows it on the title screen). */
export async function GET(request: Request) {
  const s = await readSession(request);
  return s ? json({ email: s.email ?? null, user: s.user ?? null, name: s.name ?? null }) : json({ error: 'signed_out' }, 401);
}
