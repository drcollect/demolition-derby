import { allowedDomains, hasPasswordAccounts, json } from '../_lib/auth.js';

/** Public settings for the sign-in page. */
export function GET() {
  return json({ clientId: process.env.GOOGLE_CLIENT_ID ?? null, domains: allowedDomains(), passwordLogin: hasPasswordAccounts() });
}
