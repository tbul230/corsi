// End-to-end browser test of the Firebase version.
// Google's sign-in popup cannot be automated, so this script mints the same signed
// session cookie the server issues after verifying a Google ID token (needs SESSION_SECRET).
//
//   BASE_URL=http://localhost:3200 SESSION_SECRET=... ADMIN_EMAIL=... node tests/e2e/flow.mjs
//   With FIRESTORE_EMULATOR_HOST set, the 15-minute break is shortened in the emulator
//   (BACKDATE=1) so the whole flow runs in a few minutes.
import { chromium, devices } from 'playwright';
import { SignJWT } from 'jose';

const BASE = process.env.BASE_URL;
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const clock = (t) => t.trim().split(':').map(Number).reduce((m, s) => m * 60 + s);

async function cookieFor(uid, email, name) {
  const jwt = await new SignJWT({ email, name, pid: uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(SECRET);
  const url = new URL(BASE);
  return { name: 'corsi_session', value: jwt, domain: url.hostname, path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'Lax' };
}

async function backdate(sid) {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'corsitask' });
  const ref = getFirestore().collection('sessions').doc(sid);
  const s = (await ref.get()).data();
  const shift = (iso) => new Date(Date.parse(iso) - 15 * 60 * 1000).toISOString();
  await ref.update({ break_started_at: shift(s.break_started_at), break_ends_at: shift(s.break_ends_at) });
}

async function playTest(page, correctUntil) {
  const trials = [];
  for (let guard = 0; guard < 30; guard++) {
    await page.waitForFunction(
      () => document.querySelector('[data-testid=corsi-grid]')?.getAttribute('data-phase') === 'watch' || document.querySelector('[data-testid=results]'),
      null,
      { timeout: 30000 }
    );
    if (await page.locator('[data-testid=results]').count()) break;
    const seen = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const order = [];
          let last = null;
          const t0 = performance.now();
          const id = setInterval(() => {
            const lit = document.querySelector('.corsi-block[data-lit=true]');
            const b = lit ? Number(lit.getAttribute('data-block')) : null;
            if (b !== null && b !== last) order.push({ b, t: performance.now() - t0 });
            last = b;
            if (document.querySelector('[data-testid=corsi-grid]')?.getAttribute('data-phase') === 'respond') {
              clearInterval(id);
              resolve(order);
            }
          }, 20);
        })
    );
    const seq = seen.map((s) => s.b);
    const len = Number(/· (\d+) blocks/.exec(await page.textContent('[data-testid=trial-meta]'))?.[1]);
    const gaps = seen.slice(1).map((s, i) => Math.round(s.t - seen[i].t));
    const answer = len > correctUntil ? [...seq].reverse() : seq;
    for (const b of answer) {
      await page.locator(`.corsi-block[data-block="${b}"]`).click();
      await page.waitForTimeout(120);
    }
    await page.waitForFunction(
      () => document.querySelector('[data-testid=corsi-grid]')?.getAttribute('data-phase') === 'feedback' || document.querySelector('[data-testid=results]'),
      null,
      { timeout: 15000 }
    );
    trials.push({ len, seq, gaps, feedback: await page.textContent('[data-testid=status]').catch(() => '') });
  }
  return trials;
}

const post = async (page, action, data) => {
  const r = await page.request.post(`${BASE}/api/participant/${action}`, { data });
  return { status: r.status(), json: await r.json().catch(() => ({})) };
};

(async () => {
  // Route the browser and its request API through an outbound proxy when one is configured.
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ proxy });
  const errors = [];

  // ---------- anonymous visitor ----------
  const anon = await (await browser.newContext()).newPage();
  anon.on('pageerror', (e) => errors.push(e.message));
  await anon.goto(BASE);
  check('landing: single "Sign in with Google" button', (await anon.locator('[data-testid=google-signin]').count()) === 1 && (await anon.locator('input').count()) === 0);
  for (const path of ['/dashboard', '/select', '/session/x__youtube']) {
    await anon.goto(BASE + path);
    check(`signed out: ${path} → sign-in`, anon.url().endsWith('/register') && (await anon.locator('[data-testid=google-signin]').count()) === 1);
  }
  await anon.goto(`${BASE}/results`);
  check('signed out: /results asks to sign in', (await anon.locator('[data-testid=google-signin]').count()) === 1);
  for (const [method, path] of [['POST', '/api/participant/start-break'], ['POST', '/api/participant/state'], ['GET', '/api/results'], ['GET', '/api/admin/export?type=sessions'], ['POST', '/api/admin/action'], ['POST', '/api/auth/session']]) {
    const r = await anon.request.fetch(BASE + path, { method, data: method === 'POST' ? {} : undefined });
    check(`signed out: ${method} ${path} → 401`, r.status() === 401, String(r.status()));
  }
  const badToken = await anon.request.post(`${BASE}/api/auth/session`, { data: { idToken: 'eyJhbGciOiJSUzI1NiJ9.e30.c2ln' } });
  check('forged Google ID token rejected (401)', badToken.status() === 401);
  await anon.goto(`${BASE}/admin`);
  check('admin page → Google login', anon.url().includes('/admin/login') && (await anon.locator('[data-testid=google-signin]').count()) === 1);
  check('no admin password field anymore', (await anon.locator('input[type=password]').count()) === 0);

  // ---------- participant (Google user) ----------
  const uid = `e2e_${RUN}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addCookies([await cookieFor(uid, `${uid}@example.com`, 'Zztest Foxtrot')]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/register`);
  check('name pre-filled from Google', (await page.inputValue('#first')) === 'Zztest' && (await page.inputValue('#last')) === 'Foxtrot');
  await page.fill('#first', '');
  await page.click('button[type=submit]');
  check('first name required', await page.locator('text=First name is required.').count());
  await page.fill('#first', 'Zztest');
  await page.fill('#last', `Foxtrot${RUN.replace(/\d/g, '')}`);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Experiment agreement');
  const agree = page.locator('button:has-text("I agree")');
  check('consent required (button disabled)', await agree.isDisabled());
  for (const n of [1, 2, 3]) await page.locator(`label:has-text("Agreement ${n}")`).click();
  await agree.click();
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(1200);
  check('registered → dashboard 0 of 3', (await page.textContent('[data-testid=progress-text]')).includes('0 of 3'));
  const noConsent = await post(page, 'register', { firstName: 'A', lastName: 'B', consent: {} });
  check('server rejects missing consent', noConsent.status === 400);

  await page.click('text=Choose a break');
  await page.waitForURL('**/select');
  await page.click('[data-testid=card-video_game]');
  await page.check('[data-testid=ack]');
  await page.click('[data-testid=start-break]');
  await page.waitForURL('**/session/**');
  const sid = decodeURIComponent(page.url().split('/session/')[1]);
  await page.waitForSelector('[data-testid=timer]');
  await page.waitForTimeout(1500);
  const t1 = clock(await page.textContent('[data-testid=timer]'));
  check('timer starts at 15:00', t1 >= 897 && t1 <= 900, String(t1));
  await page.waitForTimeout(3000);
  const t2 = clock(await page.textContent('[data-testid=timer]'));
  check('timer counts down', t1 - t2 >= 2 && t1 - t2 <= 4, `${t1}→${t2}`);
  await page.reload();
  await page.waitForSelector('[data-testid=timer]');
  await page.waitForTimeout(1500);
  const t3 = clock(await page.textContent('[data-testid=timer]'));
  check('timer resumes after refresh', t3 <= t2 && t3 > t2 - 8, `${t2}→${t3}`);
  check('no skip button for real participants', (await page.locator('[data-testid=skip-break]').count()) === 0);
  const early = await post(page, 'next-trial', { sessionId: sid });
  check('test cannot start early', early.status === 409 && early.json.code === 'BREAK_NOT_FINISHED');
  const skip = await post(page, 'skip-break', { sessionId: sid });
  check('real participant cannot skip', skip.status === 403);
  const other = await post(page, 'start-break', { condition: 'youtube' });
  check('one condition at a time', other.status === 409 && other.json.code === 'SESSION_IN_PROGRESS');
  const again = await post(page, 'start-break', { condition: 'video_game' });
  check('cannot restart same condition', again.status === 409 && again.json.code === 'CONDITION_ALREADY_DONE');

  // Returning user (same Google account, new browser): lands on their next step
  const back = await browser.newContext({ ...devices['iPhone 13'] });
  await back.addCookies([await cookieFor(uid, `${uid}@example.com`, 'Zztest Foxtrot')]);
  const bp = await back.newPage();
  await bp.goto(BASE);
  const cont = bp.locator('[data-testid=continue]');
  check('returning user: landing offers "Resume your session"', (await cont.textContent())?.includes('Resume'));
  check('returning user: resume link goes to the running break', (await cont.getAttribute('href')) === `/session/${sid}`);
  await cont.click();
  await bp.waitForSelector('[data-testid=timer]');
  await bp.waitForTimeout(1500);
  const tb = clock(await bp.textContent('[data-testid=timer]'));
  const ta = clock(await page.textContent('[data-testid=timer]'));
  check('returning user: same remaining time on another device', Math.abs(tb - ta) <= 2, `${ta} vs ${tb}`);
  await back.close();

  // Someone else cannot touch this session
  const intruderCtx = await browser.newContext();
  await intruderCtx.addCookies([await cookieFor(`x_${RUN}`, `x_${RUN}@example.com`, 'Other Person')]);
  const intruder = await intruderCtx.newPage();
  const steal = await post(intruder, 'next-trial', { sessionId: sid });
  check("other users cannot access someone's session", steal.status === 404);

  if (process.env.BACKDATE) {
    await backdate(sid);
    await page.reload();
  } else {
    console.log('Waiting the full 15 minutes…');
  }
  await page.waitForSelector('[data-testid=begin-test]', { timeout: 17 * 60 * 1000 });
  const sb = (await post(page, 'session', { sessionId: sid })).json.session;
  check('break completion timestamp saved', Boolean(sb.break_completed_at) && Number(sb.actual_break_seconds) >= 900, String(sb.actual_break_seconds));
  await page.click('[data-testid=begin-test]');
  await page.waitForSelector('[data-testid=corsi-surface]');
  check('nine blocks', (await page.locator('.corsi-block').count()) === 9);
  const trials = await playTest(page, 4);
  check('lengths 2,3,4,5,5', trials.map((t) => t.len).join(',') === '2,3,4,5,5', trials.map((t) => t.len).join(','));
  check('no repeated blocks', trials.every((t) => new Set(t.seq).size === t.seq.length && t.seq.length === t.len));
  const gaps = trials.flatMap((t) => t.gaps);
  check('timing 1500 ms between onsets', gaps.every((g) => g > 1350 && g < 1700), `${Math.min(...gaps)}–${Math.max(...gaps)}`);
  check('correct / incorrect recognised', trials.slice(0, 3).every((t) => /Correct/.test(t.feedback)) && trials.slice(3).every((t) => /Incorrect/.test(t.feedback)));
  await page.waitForSelector('[data-testid=results]');
  await page.waitForTimeout(1600);
  check('final span = 4 (stopping rule)', (await page.textContent('[data-testid=final-span]')).trim() === '4');
  check('accuracy 60%', (await page.textContent('[data-testid=results]')).includes('60.0%'));
  await page.reload();
  await page.waitForSelector('[data-testid=results]');
  await page.waitForTimeout(1600);
  check('results survive refresh', (await page.textContent('[data-testid=final-span]')).trim() === '4');
  const dup = await post(page, 'submit-trial', { sessionId: sid, response: [0, 1], responseTimeMs: 1 });
  check('duplicate submission blocked', dup.status === 409);
  const redo = await post(page, 'reset-condition', { condition: 'video_game' });
  check('real participant cannot redo', redo.status === 403);
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(1500);
  check('dashboard 1 of 3 with score 4', (await page.textContent('[data-testid=progress-text]')).includes('1 of 3') && (await page.textContent('[data-testid=row-video_game]')).includes('4'));
  await page.goto(`${BASE}/select`);
  check('completed card disabled', await page.locator('[data-testid=card-video_game]').isDisabled());

  // ---------- public results ----------
  await page.goto(`${BASE}/results`);
  await page.waitForSelector('[data-testid=results-charts], [data-testid=results-empty]', { timeout: 20000 });
  check('charts render from Firestore', await page.locator('[data-testid=results-charts]').count());
  check('public results hide names', !(await page.textContent('body')).includes('Foxtrot'));

  // ---------- duplicate name by another Google account ----------
  const dupName = await post(intruder, 'register', {
    firstName: 'Zztest',
    lastName: `Foxtrot${RUN.replace(/\d/g, '')}`,
    consent: { participation: true, quiet: true, guidelines: true }
  });
  check('same name from another account blocked', dupName.status === 409 && dupName.json.code === 'DUPLICATE_NAME');
  const notAdmin = await page.request.get(`${BASE}/api/admin/export?type=sessions`);
  check('non-admin: admin API → 403', notAdmin.status() === 403);
  const notAdminPage = await page.goto(`${BASE}/admin`);
  check('non-admin: /admin page → 403', notAdminPage.status() === 403);

  // ---------- admin ----------
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await adminCtx.addCookies([await cookieFor(`admin_${RUN}`, process.env.ADMIN_EMAIL, 'Admin Person')]);
  const ap = await adminCtx.newPage();
  ap.on('pageerror', (e) => errors.push(e.message));
  ap.on('dialog', (d) => d.accept());
  await ap.goto(`${BASE}/admin`);
  await ap.waitForSelector('text=Corsi experiment data');
  check('admin email recognised without password', true);
  await ap.click('role=tab[name=/Participants/]');
  check('admin sees participant', (await ap.textContent('body')).includes('Foxtrot'));
  const csv = await ap.request.get(`${BASE}/api/admin/export?type=trials`);
  check('CSV export', csv.status() === 200 && (await csv.text()).includes('Foxtrot'));

  // test mode from admin dashboard
  await ap.click('role=tab[name=/Export/]');
  await ap.click('[data-testid=start-test-run]');
  await ap.waitForURL('**/dashboard');
  check('test run starts without any code', await ap.locator('[data-testid=test-mode-banner]').count());
  await ap.click('text=Choose a break');
  await ap.click('[data-testid=card-youtube]');
  await ap.check('[data-testid=ack]');
  await ap.click('[data-testid=start-break]');
  await ap.waitForSelector('[data-testid=skip-break]');
  await ap.click('[data-testid=skip-break]');
  await ap.waitForSelector('[data-testid=begin-test]');
  check('test mode can skip the break', true);
  await ap.click('[data-testid=begin-test]');
  for (let i = 0; i < 2; i++) {
    await ap.waitForFunction(() => document.querySelector('[data-testid=corsi-grid]')?.getAttribute('data-phase') === 'respond', null, { timeout: 30000 });
    await ap.locator('.corsi-block').nth(0).click();
    await ap.locator('.corsi-block').nth(0).click();
  }
  await ap.waitForSelector('[data-testid=results]');
  check('test result marked not counted', (await ap.textContent('[data-testid=results]')).includes('not counted'));
  const pub = await (await ap.request.get(`${BASE}/api/results`)).json();
  check('test run excluded from public results', pub.sessions.every((r) => r.condition !== 'youtube'));
  await ap.click('[data-testid=redo-youtube]');
  await ap.waitForURL('**/dashboard');
  await ap.waitForTimeout(1200);
  check('test mode can redo a condition', (await ap.textContent('[data-testid=progress-text]')).includes('0 of 3'));
  await ap.click('text=Exit test mode');
  await ap.waitForURL('**/admin');

  // delete the e2e participant
  await ap.click('role=tab[name=/Participants/]');
  await ap.locator('tr', { hasText: 'Foxtrot' }).locator('[data-testid^=delete-participant-]').click();
  await ap.waitForFunction(() => !document.body.innerText.includes('Foxtrot'), null, { timeout: 15000 });
  check('admin can delete a participant', true);
  const gone = await post(page, 'state', {});
  check('deleted participant must register again', gone.status === 403);

  check('no client-side errors', errors.length === 0, errors.join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
