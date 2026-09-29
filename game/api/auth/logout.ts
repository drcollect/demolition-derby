import { clearCookie } from '../_lib/auth.js';

export function GET() {
  return new Response(null, { status: 302, headers: { location: '/login?signedout=1', 'set-cookie': clearCookie(), 'cache-control': 'no-store' } });
}

export const POST = GET;
