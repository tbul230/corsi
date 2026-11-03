// E2E: admin test mode (skip break, redo, not counted) + admin deletion.
// Usage: BASE_URL=... ADMIN_CODE=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/e2e/testmode.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const post = async (page, action, body) => {
  const r = await page.request.post(`${BASE}/api/participant/${action}`, { data: body });
  return { status: r.status(), json: await r.json().catch(() => ({})) };
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // wrong code
  await page.goto(`${BASE}/test-mode`);
  await page.fill('#code', 'not-the-code');
  await page.click('[data-testid=enter-test-mode]');
  await page.waitForSelector('text=That admin code is not correct.');
  check('wrong admin code rejected', true);
  check('admin code not present in page source', !(await page.content()).includes(process.env.ADMIN_CODE));

  // right code → dashboard without registration
  await page.fill('#code', process.env.ADMIN_CODE);
  await page.click('[data-testid=enter-test-mode]');
  await page.waitForURL('**/dashboard');
  check('test mode bypasses registration', await page.locator('[data-testid=test-mode-banner]').count());
  const name = (await page.textContent('h1')).trim();
  check('test participant created', /^Admin Test \d+$/.test(name), name);

  // start + skip break
  await page.click('text=Choose a break');
  await page.click('[data-testid=card-youtube]');
  await page.check('[data-testid=ack]');
  await page.click('[data-testid=start-break]');
  await page.waitForURL('**/session/**');
  const sessionId = page.url().split('/session/')[1];
  await page.waitForSelector('[data-testid=skip-break]');
  await page.click('[data-testid=skip-break]');
  await page.waitForSelector('[data-testid=begin-test]', { timeout: 10000 });
  check('skip break goes straight to the test', true);
  await page.click('[data-testid=begin-test]');
  await page.waitForSelector('[data-testid=corsi-surface]');
  // two wrong answers at length 2
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(() => document.querySelector('[data-testid=corsi-grid]')?.getAttribute('data-phase') === 'respond', null, { timeout: 30000 });
    const seqLen = 2;
    for (let k = 0; k < seqLen; k++) {
      await page.locator('.corsi-block').nth(0).click(); // [0,0] is always wrong (no repeats)
    }
  }
  await page.waitForSelector('[data-testid=results]', { timeout: 30000 });
  check('test-mode result shown', (await page.textContent('[data-testid=results]')).includes('not counted'));
  const s = await post(page, 'session', { sessionId });
  check('session flagged is_test + break_skipped', s.json.session.is_test && s.json.session.break_skipped);

  // not counted publicly
  const pub = await (await page.request.get(`${BASE}/api/results`)).json();
  check('test run excluded from public results', !pub.sessions.some((r) => r.completed_at === s.json.session.test_completed_at));

  // redo
  await page.click('[data-testid=redo-youtube]');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(500);
  check('redo resets the condition', (await page.textContent('[data-testid=progress-text]')).includes('0 of 3'));
  const again = await post(page, 'start-break', { condition: 'youtube' });
  check('condition can be started again after redo', again.status === 200);
  await post(page, 'skip-break', { sessionId: again.json.session.id });

  // a real participant cannot skip
  const real = await browser.newContext();
  const rp = await real.newPage();
  await rp.goto(BASE);
  const reg = await post(rp, 'register', {
    firstName: 'Zztest',
    lastName: 'Charlie',
    consent: { participation: true, quiet: true, guidelines: true }
  });
  const rs = await post(rp, 'start-break', { condition: 'no_screen' });
  const skip = await post(rp, 'skip-break', { sessionId: rs.json.session.id });
  check('real participant cannot skip break', skip.status === 403 && skip.json.code === 'TEST_MODE_ONLY', String(reg.status));
  const reset = await post(rp, 'reset-condition', { condition: 'no_screen' });
  check('real participant cannot redo', reset.status === 403);

  // admin: test runs hidden by default, delete works
  const ap = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  ap.on('dialog', (d) => d.accept());
  await ap.goto(`${BASE}/admin/login`);
  await ap.fill('#email', process.env.ADMIN_EMAIL);
  await ap.fill('#password', process.env.ADMIN_PASSWORD);
  await ap.click('button:has-text("Sign in")');
  await ap.waitForSelector('text=Corsi experiment data', { timeout: 20000 });
  await ap.click('role=tab[name=/Participants/]');
  check('test runs hidden from admin data by default', !(await ap.textContent('body')).includes(name));
  await ap.check('[data-testid=include-test]');
  check('test runs visible when toggled on', (await ap.textContent('body')).includes(name));

  // delete the real test participant Charlie
  const row = ap.locator('tr', { hasText: 'Zztest Charlie' });
  await row.locator('[data-testid^=delete-participant-]').click();
  await ap.waitForFunction(() => !document.body.textContent.includes('Zztest Charlie'), null, { timeout: 15000 });
  check('admin can delete a participant', true);
  const gone = await post(rp, 'state', {});
  check('deleted participant can no longer sign in', gone.status === 401);
  await ap.click('role=tab[name=/Deletion log/]');
  check('deletion recorded in deletion log', (await ap.textContent('body')).includes('Zztest Charlie'));

  // participants cannot call admin delete RPC (anon)
  const anon = await rp.request.post(`${BASE}/api/admin/export?type=sessions`);
  check('participants have no admin access', anon.status() >= 400);

  check('no client-side errors', errors.length === 0, errors.join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
