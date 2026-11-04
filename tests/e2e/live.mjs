// End-to-end test of the deployed site with a real browser.
// Usage: BASE_URL=https://... FIRST=Zztest LAST=Alpha MODE=fast|real node tests/e2e/live.mjs
//   MODE=fast  – waits for the break to end by reloading periodically (the
//                researcher may shorten a *test* session in the database).
//   MODE=real  – keeps the page open for the genuine 15 minutes, no reloads.
// Optional: ADMIN_EMAIL / ADMIN_PASSWORD to exercise the admin dashboard.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL;
const FIRST = process.env.FIRST ?? 'Zztest';
const LAST = process.env.LAST ?? 'Alpha';
const MODE = process.env.MODE ?? 'fast';
const OUT = process.env.OUT ?? `/tmp/e2e-${LAST}`;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 55 });
const post = async (page, action, body) => {
  const r = await page.request.post(`${BASE}/api/participant/${action}`, { data: body });
  return { status: r.status(), json: await r.json().catch(() => ({})) };
};
const clockToSec = (t) => {
  const [m, s] = t.trim().split(':').map(Number);
  return m * 60 + s;
};

async function playTest(page, { correctUntil = 4 }) {
  // Plays the Corsi test: answers correctly while length <= correctUntil, then wrong.
  const trials = [];
  for (let guard = 0; guard < 40; guard++) {
    if (await page.locator('[data-testid=results]').count()) break;
    const meta = page.locator('[data-testid=trial-meta]');
    await page.waitForFunction(
      () => {
        const g = document.querySelector('[data-testid=corsi-grid]');
        return (g && g.getAttribute('data-phase') === 'watch') || document.querySelector('[data-testid=results]');
      },
      null,
      { timeout: 30000 }
    );
    if (await page.locator('[data-testid=results]').count()) break;
    // Record the sequence by observing which block lights, in order.
    const seen = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const order = [];
          let last = null;
          const t0 = performance.now();
          const id = setInterval(() => {
            const g = document.querySelector('[data-testid=corsi-grid]');
            const lit = document.querySelector('.corsi-block[data-lit=true]');
            const b = lit ? Number(lit.getAttribute('data-block')) : null;
            if (b !== null && b !== last) order.push({ b, t: performance.now() - t0 });
            last = b;
            if (g && g.getAttribute('data-phase') === 'respond') {
              clearInterval(id);
              resolve(order);
            }
          }, 20);
        })
    );
    const seq = seen.map((s) => s.b);
    const metaText = await meta.textContent();
    const len = Number(/· (\d+) blocks/.exec(metaText)?.[1]);
    const gaps = seen.slice(1).map((s, i) => Math.round(s.t - seen[i].t));
    let answer = seq;
    if (len > correctUntil) answer = [...seq].reverse(); // deliberately wrong
    trials.push({ len, seq, answer, gaps, metaText });
    for (const b of answer) {
      await page.locator(`.corsi-block[data-block="${b}"]`).click();
      await page.waitForTimeout(120);
    }
    await page.waitForFunction(
      () => {
        const g = document.querySelector('[data-testid=corsi-grid]');
        return !g || g.getAttribute('data-phase') === 'feedback' || document.querySelector('[data-testid=results]');
      },
      null,
      { timeout: 15000 }
    );
    const status = await page.locator('[data-testid=status]').textContent().catch(() => '');
    trials[trials.length - 1].feedback = status;
  }
  return trials;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // ---------- Landing & registration ----------
  await page.goto(BASE);
  check('landing title', (await page.textContent('h1'))?.includes('The Corsi Block-Tapping Experiment'));
  await page.click('text=Start Experiment');
  await page.waitForURL('**/register');
  check('start button → registration', page.url().endsWith('/register'));
  await page.click('button[type=submit]');
  check('first name required', await page.locator('text=First name is required.').count());
  check('last name required', await page.locator('text=Last name is required.').count());
  await page.fill('#first', '   ');
  await page.fill('#last', LAST);
  await page.click('button[type=submit]');
  check('blank (spaces) first name rejected', await page.locator('text=First name is required.').count());
  const blankApi = await post(page, 'register', {
    firstName: '  ',
    lastName: LAST,
    consent: { participation: true, quiet: true, guidelines: true }
  });
  check('server rejects blank name', blankApi.status === 400, JSON.stringify(blankApi.json));
  const noConsent = await post(page, 'register', { firstName: FIRST, lastName: LAST, consent: { participation: true } });
  check('server rejects missing consent', noConsent.status === 400 && noConsent.json.code === 'CONSENT_REQUIRED');

  await page.fill('#first', FIRST);
  await page.fill('#last', LAST);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Experiment agreement');
  const submit = page.locator('button:has-text("I agree")');
  check('consent: button disabled until all checked', await submit.isDisabled());
  await page.locator('label:has-text("Agreement 1")').click();
  await page.locator('label:has-text("Agreement 2")').click();
  check('consent: still disabled with 2 of 3', await submit.isDisabled());
  await page.locator('label:has-text("Agreement 3")').click();
  await shot(page, '01-consent');
  await submit.click();
  await page.waitForSelector('[data-testid=access-code]');
  const code = (await page.textContent('[data-testid=access-code]')).trim();
  check('registration saved, access code shown', /^[A-Z2-9]{6}$/.test(code), code);
  const dup = await post(page, 'check-name', { firstName: FIRST.toLowerCase(), lastName: LAST.toUpperCase() });
  check('duplicate name detected (case-insensitive)', dup.json.available === false);
  const dupReg = await post(page, 'register', {
    firstName: FIRST,
    lastName: LAST,
    consent: { participation: true, quiet: true, guidelines: true }
  });
  check('duplicate registration blocked server-side', dupReg.status === 409 && dupReg.json.code === 'DUPLICATE_NAME');

  await page.click('text=Continue to my dashboard');
  await page.waitForURL('**/dashboard');
  check('dashboard 0 of 3', (await page.textContent('[data-testid=progress-text]')).includes('0 of 3'));
  await shot(page, '02-dashboard');

  // ---------- Break selection ----------
  await page.click('text=Choose a break');
  await page.waitForURL('**/select');
  for (const c of ['video_game', 'youtube', 'no_screen'])
    check(`card ${c} shown`, await page.locator(`[data-testid=card-${c}]`).isVisible());
  await page.click('[data-testid=card-video_game]');
  check('start disabled until acknowledged', await page.locator('[data-testid=start-break]').isDisabled());
  await page.check('[data-testid=ack]');
  await shot(page, '03-select');
  const tClick = Date.now();
  await page.click('[data-testid=start-break]');
  await page.waitForURL('**/session/**');
  const sessionId = page.url().split('/session/')[1];
  fs.writeFileSync(`${OUT}/session.txt`, sessionId);
  console.log('SESSION_ID', sessionId);

  // ---------- Timer ----------
  await page.waitForSelector('[data-testid=timer]');
  await page.waitForTimeout(1200);
  const t1 = clockToSec(await page.textContent('[data-testid=timer]'));
  check('timer starts at 15:00', t1 >= 897 && t1 <= 900, `${t1}s at ${Date.now() - tClick}ms`);
  check('break title shown', (await page.textContent('[data-testid=break-title]')).includes('Video Game Break'));
  await page.waitForTimeout(3000);
  const t2 = clockToSec(await page.textContent('[data-testid=timer]'));
  check('timer counts down each second', t1 - t2 >= 2 && t1 - t2 <= 4, `${t1}→${t2}`);
  const w = await page.$eval('[data-testid=progress]', (e) => parseFloat(e.style.width));
  check('progress bar reflects remaining time', w > 98 && w < 100, `${w}%`);
  await shot(page, '04-timer');

  // background tab simulation: hide document, wait, show
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t3 = clockToSec(await page.textContent('[data-testid=timer]'));
  check('timer correct after tab hidden', t2 - t3 >= 4 && t2 - t3 <= 6, `${t2}→${t3}`);

  await page.reload();
  await page.waitForSelector('[data-testid=timer]');
  await page.waitForTimeout(1200);
  const t4 = clockToSec(await page.textContent('[data-testid=timer]'));
  check('timer resumes after refresh (no reset)', t4 < t3 && t4 > t3 - 8, `${t3}→${t4}`);

  // cannot skip / start early / start another condition
  const early = await post(page, 'next-trial', { sessionId });
  check('test cannot start early (API)', early.status === 409 && early.json.code === 'BREAK_NOT_FINISHED');
  const earlyC = await post(page, 'complete-break', { sessionId });
  check('break cannot be completed early (API)', earlyC.status === 409);
  const other = await post(page, 'start-break', { condition: 'youtube' });
  check('cannot start second condition during break', other.status === 409 && other.json.code === 'SESSION_IN_PROGRESS');
  const again = await post(page, 'start-break', { condition: 'video_game' });
  check('cannot restart/reset same break', again.status === 409 && again.json.code === 'CONDITION_ALREADY_DONE');
  check('no skip button present', (await page.locator('button:has-text("Skip")').count()) === 0);

  // second browser (new context) resumes with access code and sees the same running timer
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/register`);
  await p2.click('text=Returning participant');
  await p2.fill('#first', FIRST);
  await p2.fill('#last', LAST);
  await p2.fill('#code', code);
  await p2.click('button[type=submit]');
  await p2.waitForURL('**/dashboard');
  check('resume on another device with access code', (await p2.textContent('body')).includes('Resume break timer'));
  await p2.click('text=Resume break timer');
  await p2.waitForSelector('[data-testid=timer]');
  await p2.waitForTimeout(1200);
  const tPhone = clockToSec(await p2.textContent('[data-testid=timer]'));
  const tDesk = clockToSec(await page.textContent('[data-testid=timer]'));
  check('second device shows same remaining time', Math.abs(tPhone - tDesk) <= 2, `${tDesk} vs ${tPhone}`);
  const sw = await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('mobile timer layout has no horizontal scroll', sw <= 0);
  await p2.screenshot({ path: `${OUT}/05-timer-phone.jpg`, type: 'jpeg', quality: 55 });
  await ctx2.close();

  // ---------- Wait for break end ----------
  const waitStart = Date.now();
  if (MODE === 'real') {
    await page.waitForSelector('[data-testid=break-finished]', { timeout: 17 * 60 * 1000 });
  } else {
    while (!(await page.locator('[data-testid=break-finished], [data-testid=begin-test]').count())) {
      if (Date.now() - waitStart > 20 * 60 * 1000) throw new Error('break never finished');
      await page.waitForTimeout(8000);
      const s = await post(page, 'session', { sessionId });
      if (new Date(s.json.session.break_ends_at).getTime() < Date.now() + 5000) {
        await page.reload();
        await page.waitForTimeout(3000);
      }
    }
  }
  check('break finished message shown', await page.locator('[data-testid=break-finished]').count() || MODE !== 'real');
  if (await page.locator('[data-testid=break-finished]').count()) await shot(page, '06-break-finished');
  await page.waitForSelector('[data-testid=begin-test]', { timeout: 15000 });
  check('auto-transition to Corsi test screen', true, `${Math.round((Date.now() - waitStart) / 1000)}s waited`);
  const afterBreak = await post(page, 'session', { sessionId });
  const sb = afterBreak.json.session;
  check('break completion timestamp saved', Boolean(sb.break_completed_at), sb.break_completed_at);
  check('actual break ≥ 900 s', Number(sb.actual_break_seconds) >= 900, String(sb.actual_break_seconds));
  await shot(page, '07-test-intro');

  // ---------- Corsi test ----------
  await page.click('[data-testid=begin-test]');
  await page.waitForSelector('[data-testid=corsi-surface]');
  check('nine blocks displayed', (await page.locator('.corsi-block').count()) === 9);
  const trials = await playTest(page, { correctUntil: 4 });
  console.log(JSON.stringify(trials));
  check(
    'sequence lengths 2,3,4,5,5',
    JSON.stringify(trials.map((t) => t.len)) === '[2,3,4,5,5]',
    trials.map((t) => t.len).join(',')
  );
  check('observed sequences have the announced length', trials.every((t) => t.seq.length === t.len));
  check('no repeated block in a sequence', trials.every((t) => new Set(t.seq).size === t.seq.length));
  const allGaps = trials.flatMap((t) => t.gaps);
  check(
    'consistent timing ≈1500 ms between block onsets',
    allGaps.every((g) => g > 1350 && g < 1700),
    `${Math.min(...allGaps)}–${Math.max(...allGaps)} ms`
  );
  check('correct answers recognised', trials.slice(0, 3).every((t) => /Correct/.test(t.feedback)));
  check('incorrect answers recognised', trials.slice(3).every((t) => /Incorrect/.test(t.feedback)));

  await page.waitForSelector('[data-testid=results]', { timeout: 20000 });
  await page.waitForTimeout(1600); // let the score count-up animation finish
  const span = (await page.textContent('[data-testid=final-span]')).trim();
  check('stopping rule: ended after 2 misses at length 5', trials.length === 5);
  check('final Corsi span = 4', span === '4', span);
  const body = await page.textContent('[data-testid=results]');
  check('results show name & condition', body.includes(`${FIRST} ${LAST}`) && body.includes('Video Game Break'));
  check('results show accuracy 60%', body.includes('60.0%'));
  await shot(page, '08-results');

  // ---------- Persistence & duplicates ----------
  await page.reload();
  await page.waitForSelector('[data-testid=results]');
  await page.waitForTimeout(1600);
  check('results survive refresh', (await page.textContent('[data-testid=final-span]')).trim() === '4');
  const dupSubmit = await post(page, 'submit-trial', { sessionId, response: [0, 1], responseTimeMs: 500 });
  check('duplicate submission blocked', dupSubmit.status === 409, dupSubmit.json.code);
  const redo = await post(page, 'next-trial', { sessionId });
  check('cannot redo completed test', redo.status === 409 && redo.json.code === 'TEST_ALREADY_COMPLETED');
  const restart = await post(page, 'start-break', { condition: 'video_game' });
  check('cannot repeat completed condition', restart.status === 409 && restart.json.code === 'CONDITION_ALREADY_DONE');

  await page.click('[data-testid=back-dashboard]');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(1500);
  check('dashboard updated to 1 of 3', (await page.textContent('[data-testid=progress-text]')).includes('1 of 3'));
  check('dashboard shows score 4', (await page.textContent('[data-testid=row-video_game]')).includes('4'));
  await page.goto(`${BASE}/select`);
  check('completed card disabled', await page.locator('[data-testid=card-video_game]').isDisabled());
  check('completed card shows COMPLETED', (await page.textContent('[data-testid=card-video_game]')).includes('COMPLETED'));
  await shot(page, '09-select-completed');

  // ---------- Public results ----------
  await page.goto(`${BASE}/results`);
  await page.waitForSelector('[data-testid=results-charts], [data-testid=results-empty]', { timeout: 20000 });
  check('results charts render from database', await page.locator('[data-testid=results-charts]').count());
  check('public results hide real names', !(await page.textContent('body')).includes(LAST));
  await page.waitForTimeout(800);
  await shot(page, '10-results-page');

  // ---------- Admin protection ----------
  const anonExport = await page.request.get(`${BASE}/api/admin/export?type=sessions`);
  check('participant cannot use admin export', anonExport.status() === 401 || anonExport.status() === 403, String(anonExport.status()));
  await page.goto(`${BASE}/admin`);
  check('admin redirects to login', page.url().includes('/admin/login'));

  if (process.env.ADMIN_EMAIL) {
    await page.fill('#email', process.env.ADMIN_EMAIL);
    await page.fill('#password', 'wrong-password-123');
    await page.click('button:has-text("Sign in")');
    await page.waitForSelector('text=Invalid email or password.');
    check('admin wrong password rejected', true);
    await page.fill('#password', process.env.ADMIN_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(/\/admin$/, { timeout: 20000 });
    await page.waitForSelector('text=Corsi experiment data');
    check('admin login works', true);
    await page.click(`role=tab[name=/Participants/]`);
    check('admin sees participant name', (await page.textContent('body')).includes(`${FIRST} ${LAST}`));
    await page.click(`tr:has-text("${FIRST} ${LAST}") >> text=View`);
    await page.click('button:has-text("Video Game")');
    check('admin trial-by-trial view', (await page.locator('text=Trial-by-trial results').count()) > 0);
    await shot(page, '11-admin');
    const csv = await page.request.get(`${BASE}/api/admin/export?type=trials`);
    const csvText = await csv.text();
    check('CSV export works', csv.status() === 200 && csvText.startsWith('trial_id') && csvText.includes(LAST), `${csvText.split('\n').length - 2} rows`);
  }

  check('no client-side errors', pageErrors.length === 0, pageErrors.join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
