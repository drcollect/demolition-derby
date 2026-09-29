// Shared by the auth endpoints and the routing middleware. Web APIs only, so it runs on Edge and Node.
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { USERS } from './users.js';

export const COOKIE = 'dd_session';
const SESSION_DAYS = 7;

/** Google accounts from these domains get in automatically. */
export function allowedDomains(): string[] {
  const env = (process.env.ALLOWED_DOMAINS ?? '').trim();
  const list = env ? env.split(',') : ['2iqresearch.com', 'collect.app'];
  return list.map((d) => d.trim().toLowerCase()).filter(Boolean);
}

/** Individual extra addresses (optional). */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string): boolean {
  const e = email.toLowerCase();
  const domain = e.split('@')[1] ?? '';
  return allowedDomains().includes(domain) || allowedEmails().includes(e);
}

function sessionKey(): Uint8Array | null {
  const s = process.env.SESSION_SECRET ?? '';
  return s.length >= 32 ? new TextEncoder().encode(s) : null;
}

/** A Google user (email, name) or a username/password user (user, pv). */
export interface Session extends JWTPayload {
  email?: string;
  name?: string;
  user?: string;
  /** password version: changes when the password does, which ends the old sessions */
  pv?: string;
}

/** Ties a session to the current password: a slice of the stored hash's random salt. */
export function passwordVersion(user: string): string | null {
  const stored = Object.hasOwn(USERS, user) ? USERS[user] : undefined;
  return stored ? (stored.split('$')[4] ?? '').slice(0, 16) : null;
}

export async function createSession(who: { email: string; name?: string } | { user: string }): Promise<string> {
  const key = sessionKey();
  if (!key) throw new Error('SESSION_SECRET is not set');
  const claims = 'user' in who ? { user: who.user, name: who.user, pv: passwordVersion(who.user) } : { email: who.email, name: who.name };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

/** The signed-in user, or null. Fails closed when the secret is missing. */
export async function readSession(request: Request): Promise<Session | null> {
  const key = sessionKey();
  const token = getCookie(request, COOKIE);
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    // re-checked on every request: removing a domain, an address or an account, or changing a
    // password, takes effect at once
    if (typeof payload.user === 'string') {
      const pv = passwordVersion(payload.user);
      return pv && payload.pv === pv ? (payload as Session) : null;
    }
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!email || !isAllowed(email)) return null;
    return payload as Session;
  } catch {
    return null;
  }
}

/** Whether any username/password accounts exist (the sign-in page shows the form only then). */
export const hasPasswordAccounts = () => Object.keys(USERS).length > 0;

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleUser {
  email: string;
  name?: string;
  emailVerified: boolean;
  hostedDomain?: string;
}

/** Verify a Google Identity Services ID token (signature, issuer, audience, expiry). */
export async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleUser> {
  const { payload } = await jwtVerify(credential, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });
  return {
    email: String(payload.email ?? '').toLowerCase(),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    hostedDomain: typeof payload.hd === 'string' ? payload.hd : undefined,
  };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
