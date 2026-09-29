import { createSession, isAllowed, json, sessionCookie, verifyGoogleCredential } from '../_lib/auth.js';

/**
 * The sign-in page posts the Google ID token here. Verified 2iqresearch.com / collect.app accounts (plus
 * anyone in ALLOWED_EMAILS) get a session cookie; everyone else gets a 403.
 */
export async function POST(request: Request) {
  // a custom header can't be sent cross-site without a CORS preflight, which this API never allows
  if (request.headers.get('x-requested-with') !== 'derby') return json({ error: 'bad_request' }, 400);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return json({ error: 'not_configured' }, 503);
  let credential = '';
  try {
    credential = String(((await request.json()) as { credential?: string }).credential ?? '');
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!credential) return json({ error: 'bad_request' }, 400);

  let user;
  try {
    user = await verifyGoogleCredential(credential, clientId);
  } catch {
    return json({ error: 'invalid_token' }, 401);
  }
  if (!user.email || !user.emailVerified) return json({ error: 'unverified', email: user.email }, 403);
  if (!isAllowed(user.email)) return json({ error: 'not_allowed', email: user.email }, 403);

  try {
    const token = await createSession({ email: user.email, name: user.name });
    return json({ ok: true, email: user.email }, 200, { 'set-cookie': sessionCookie(token) });
  } catch {
    return json({ error: 'not_configured' }, 503);
  }
}
