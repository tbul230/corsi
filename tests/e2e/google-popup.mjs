// Checks the real "Sign in with Google" button on the live site: Firebase initialises,
// the domain is authorised, and the popup reaches Google's account chooser for this project.
// (Completing a Google login needs a real person, so the test stops at Google's page.)
//   BASE_URL=https://corsitest.vercel.app node tests/e2e/google-popup.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL;
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let failed = 0;
const check = (n, ok, d = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
};

for (const path of ['/register', '/admin/login']) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 15000 }),
    page.click('[data-testid=google-signin]')
  ]);
  await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
  await popup.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => {});
  const url = popup.url();
  check(`${path}: popup reaches Google sign-in`, /accounts\.google\.com/.test(url), url.slice(0, 90));
  const u = new URL(url);
  const flat = decodeURIComponent(u.search + u.hash);
  check(`${path}: request is for corsitask`, /corsitask/.test(flat) || /786124568852/.test(flat));
  await popup.waitForSelector('input[type=email]', { timeout: 20000 }).catch(() => {});
  const body = (await popup.evaluate(() => document.body.innerText).catch(() => '')) ?? '';
  const isError = /Error 4\d\d|redirect_uri_mismatch|Access blocked|invalid_client|unauthorized_client/i.test(body);
  const isChooser = /Email or phone|Choose an account/i.test(body) && /corsitask/i.test(body);
  check(`${path}: Google account chooser for corsitask (no OAuth error)`, isChooser && !isError, body.slice(0, 90).replace(/\s+/g, ' '));
  await popup.close();
  await page.waitForTimeout(500);
  const alert = await page.locator('[role=alert]').textContent().catch(() => null);
  check(`${path}: closing the popup shows a friendly message`, !alert || /cancelled|blocked/i.test(alert), alert ?? '(none)');
}
const domainErr = errors.find((e) => /unauthorized-domain|auth\/|invalid-api-key/i.test(e));
check('no Firebase auth config errors in the console', !domainErr, domainErr ?? '');
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
