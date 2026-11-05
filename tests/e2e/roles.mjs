// Admin vs non-admin access after Google sign-in, and removal of all old sign-in paths.
//   BASE_URL=... SESSION_SECRET=... ADMIN_EMAILS=a@x,b@y node tests/e2e/roles.mjs
import { chromium } from 'playwright';
import { SignJWT } from 'jose';

const BASE = process.env.BASE_URL;
const host = new URL(BASE).hostname;
const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
let failed = 0;
const check = (n, ok, d = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
};
const cookie = async (email, secret = process.env.SESSION_SECRET) => ({
  name: 'corsi_session',
  value: await new SignJWT({ email, name: 'Role Check', pid: `role_${email}` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(`role_${email}`)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret)),
  domain: host,
  path: '/',
  httpOnly: true,
  secure: BASE.startsWith('https'),
  sameSite: 'Lax'
});

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy });

async function asUser(email, secret) {
  const ctx = await browser.newContext();
  await ctx.addCookies([await cookie(email, secret)]);
  return ctx.newPage();
}

for (const email of admins) {
  const p = await asUser(email);
  await p.goto(`${BASE}/admin`);
  const ok = await p.locator('text=Corsi experiment data').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  check(`admin via Google email: ${email}`, ok);
  const upper = await asUser(email.toUpperCase());
  await upper.goto(`${BASE}/admin`);
  check(`admin email match is case-insensitive: ${email.toUpperCase()}`, await upper.locator('text=Corsi experiment data').isVisible().catch(() => false));
}

const user = await asUser('someone.else@example.com');
await user.goto(`${BASE}/admin`);
check('non-admin Google account → access denied page', (await user.textContent('body')).includes('not an administrator'));
const act = await user.request.post(`${BASE}/api/admin/action`, { data: { action: 'start-test' } });
check('non-admin cannot start a test run (API)', act.status() === 403);
const exp = await user.request.get(`${BASE}/api/admin/export?type=sessions`);
check('non-admin cannot export (API)', exp.status() === 403);

const forged = await asUser(admins[0], 'not-the-real-secret-0123456789abcdefghijk');
await forged.goto(`${BASE}/admin`);
check('forged session cookie is ignored (→ Google login)', forged.url().includes('/admin/login'));

const anon = await (await browser.newContext()).newPage();
for (const path of ['/test-mode', '/api/participant/resume', '/api/participant/test-mode']) {
  const r = await anon.request.fetch(`${BASE}${path}`, { method: path.startsWith('/api') ? 'POST' : 'GET', data: path.startsWith('/api') ? {} : undefined });
  check(`old sign-in path is gone: ${path}`, [401, 404].includes(r.status()), String(r.status()));
}
for (const path of ['/register', '/admin/login']) {
  await anon.goto(`${BASE}${path}`);
  const pw = await anon.locator('input[type=password], input#code, input#email').count();
  check(`${path}: only "Sign in with Google" (no code/password/email fields)`, pw === 0 && (await anon.locator('[data-testid=google-signin]').count()) === 1);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
