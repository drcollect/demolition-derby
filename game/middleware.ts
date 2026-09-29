// Everything except the sign-in page, the privacy and terms pages and the auth API needs a valid session
// (see api/_lib/auth.ts).
import { next } from '@vercel/functions';
import { readSession } from './api/_lib/auth.js';

export const config = {
  matcher: ['/((?!login|privacy|terms|api/auth|favicon\\.ico).*)'],
};

export default async function middleware(request: Request) {
  if (await readSession(request)) return next();
  const accept = request.headers.get('accept') ?? '';
  if (request.method === 'GET' && accept.includes('text/html')) {
    return new Response(null, { status: 302, headers: { location: '/login', 'cache-control': 'no-store' } });
  }
  return new Response('Sign in required', { status: 401, headers: { 'cache-control': 'no-store' } });
}
