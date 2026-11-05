import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Gate for every administrator page and API, evaluated on the server before any
 * admin page or route handler runs. The session cookie is only ever issued by /api/auth/session after
 * the Firebase ID token was verified (Google provider, verified email); admin status
 * is decided here from that verified email and the ADMIN_EMAILS list.
 *   signed out → pages redirect to Google sign-in, APIs return 401
 *   signed in but not an admin → 403
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();
  const isApi = pathname.startsWith('/api/');

  const email = await verifiedEmail(req.cookies.get('corsi_session')?.value);
  if (!email) {
    if (isApi) return NextResponse.json({ error: 'Please sign in with Google.', code: 'NOT_AUTHENTICATED' }, { status: 401 });
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!admins.includes(email)) {
    if (isApi) return NextResponse.json({ error: 'Administrator access required.', code: 'ADMIN_ONLY' }, { status: 403 });
    return new NextResponse(forbiddenHtml(email), { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return NextResponse.next();
}

async function verifiedEmail(token: string | undefined): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
    return typeof payload.email === 'string' && payload.sub ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function forbiddenHtml(email: string) {
  const safe = email.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>403 · Corsi Experiment</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060b18;color:#eef3ff;font:16px/1.5 ui-sans-serif,-apple-system,'Segoe UI',Roboto,sans-serif;padding:16px}
.card{max-width:28rem;padding:2rem;border-radius:1rem;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);text-align:center}
h1{margin:0 0 .5rem;font-size:1.4rem}p{margin:0;color:#a9b6d3}a{display:inline-block;margin-top:1.5rem;color:#fff;background:#4d8dff;padding:.6rem 1.2rem;border-radius:12px;text-decoration:none;font-weight:600}
</style></head><body><div class="card"><h1>403 — Administrators only</h1>
<p>${safe} is signed in with Google but is not on the list of researchers for this experiment.</p>
<a href="/dashboard">Go to my progress</a></div></body></html>`;
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
