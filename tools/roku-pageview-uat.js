const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const ROKU_LOADER = 'https://cdn.ravm.tv/ust/dist/rkp.loader.js';
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const EVIDENCE = path.resolve('roku-uat-evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });

const results = [];
function record(name, status, details = {}) {
  const row = { name, status, ...details };
  results.push(row);
  console.log(`[${status}] ${name}`, JSON.stringify(details));
}
function isRoku(url) {
  try { return new URL(url).hostname.endsWith('ravm.tv'); } catch { return false; }
}
function captureRequests(page) {
  const requests = [];
  page.on('request', (req) => {
    if (!isRoku(req.url())) return;
    requests.push({
      url: req.url(),
      method: req.method(),
      postData: req.postData() || '',
      referer: req.headers()['referer'] || '',
    });
  });
  return requests;
}
async function setCookie(context, name, value) {
  await context.addCookies([{
    name, value, domain: '.redrivergorgehiker.com', path: '/',
    secure: true, httpOnly: false, sameSite: 'Lax',
  }]);
}
async function state(page) {
  const button = page.locator('[data-rrgh-analytics-toggle]').first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-rrgh-analytics-toggle]');
    const source = el && el.getAttribute('data-effective-source');
    return Boolean(source && source !== 'initializing');
  }, { timeout: 30000 });
  return {
    text: (await button.textContent() || '').trim(),
    source: await button.getAttribute('data-effective-source'),
    rokuLoaded: await page.evaluate(() => window.rrghAnalyticsRokuLoaded === true),
  };
}
async function stubRokuLoader(page) {
  await page.route(ROKU_LOADER, (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '/* RRGH Roku UAT loader stub: queue intentionally preserved */',
  }));
}
async function blockNonRokuMeasurement(page) {
  await page.route('**/*', (route) => {
    let host = '';
    try { host = new URL(route.request().url()).hostname.toLowerCase(); } catch {}
    const blocked = host === 'www.googletagmanager.com'
      || host.endsWith('.google-analytics.com')
      || host === 'google-analytics.com'
      || host === 's.pinimg.com'
      || host.endsWith('.pinterest.com')
      || host === 'pinterest.com';
    if (blocked) return route.abort();
    return route.continue();
  });
}
async function rokuQueue(page) {
  return page.evaluate(() => {
    const q = window.rkp && Array.isArray(window.rkp.queue) ? window.rkp.queue : [];
    return q.map((entry) => Array.from(entry).slice(0, 2));
  });
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function explicitOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  const requests = captureRequests(page);
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const first = await state(page);
  assert(/Off$/i.test(first.text));
  assert.strictEqual(first.source, 'explicit-declined');
  assert.strictEqual(first.rokuLoaded, false);
  assert.strictEqual(requests.length, 0);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const second = await state(page);
  assert(/Off$/i.test(second.text));
  assert.strictEqual(requests.length, 0);
  record('Explicit Off persists and produces zero Roku loader/event requests', 'PASS', { first, second });
  await context.close();
}

async function effectiveOn(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, SHARED, 'allowed');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  const requests = captureRequests(page);
  await stubRokuLoader(page);
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const s = await state(page);
  const queue = await rokuQueue(page);
  assert(/On$/i.test(s.text));
  assert.strictEqual(s.source, 'explicit-allowed');
  assert.strictEqual(requests.filter((r) => r.url === ROKU_LOADER).length, 1);
  assert.strictEqual(queue.filter((x) => x[0] === 'init' && x[1] === 'PaccInUJusF8').length, 1);
  assert.strictEqual(queue.filter((x) => x[0] === 'event' && x[1] === 'PAGE_VIEW').length, 1);
  record('Effective On loads Roku base once and queues exactly one PAGE_VIEW', 'PASS', { state: s, queue, requests });
  await context.close();
}

async function gpcOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true });
  });
  await setCookie(context, SHARED, 'allowed');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  const requests = captureRequests(page);
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const s = await state(page);
  assert(/Off$/i.test(s.text));
  assert.strictEqual(s.source, 'privacy-signal');
  assert.strictEqual(requests.length, 0);
  record('GPC/privacy signal prevents Roku measurement', 'PASS', { state: s });
  await context.close();
}

async function consentRequiredOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, REGION, 'gb');
  const page = await context.newPage();
  const requests = captureRequests(page);
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const s = await state(page);
  assert(/Off$/i.test(s.text));
  assert.strictEqual(s.source, 'consent-required');
  assert.strictEqual(requests.length, 0);
  record('Consent-required pre-permission path prevents Roku measurement', 'PASS', { state: s, note: 'Chromium control path with first-party gb country signal; not live UK-network proof.' });
  await context.close();
}

async function regionalFailureOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const requests = captureRequests(page);
  await page.route('https://one.one.one.one/cdn-cgi/trace', (route) => route.abort());
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const s = await state(page);
  assert(/Off$/i.test(s.text));
  assert.strictEqual(s.source, 'regional-error');
  assert.strictEqual(requests.length, 0);
  record('Unresolved regional lookup fails closed with zero Roku requests', 'PASS', { state: s });
  await context.close();
}

async function withdrawal(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, SHARED, 'allowed');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  const requests = captureRequests(page);
  await stubRokuLoader(page);
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const before = await state(page);
  assert(/On$/i.test(before.text));
  assert.strictEqual(requests.filter((r) => r.url === ROKU_LOADER).length, 1);
  await Promise.allSettled([
    page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
    page.locator('[data-rrgh-analytics-toggle]').first().click(),
  ]);
  const after = await state(page);
  assert(/Off$/i.test(after.text));
  assert.strictEqual(after.source, 'explicit-declined');
  assert.strictEqual(requests.filter((r) => r.url === ROKU_LOADER).length, 1, 'Roku loader reloaded after withdrawal');
  const cookies = await context.cookies();
  const choice = cookies.find((c) => c.name === SHARED);
  assert(choice && choice.value === 'declined');
  record('Withdrawal On→Off reloads into persisted Off and stops subsequent Roku loading', 'PASS', { before, after, rokuRequests: requests.length });
  await context.close();
}

async function qrAndGaAttribution(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, SHARED, 'allowed');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  await stubRokuLoader(page);
  await page.route('**/pinimg.com/**', (route) => route.abort());
  await page.route('**/pinterest.com/**', (route) => route.abort());
  const gaCollects = [];
  await page.route('**/g/collect*', async (route) => {
    gaCollects.push(route.request().url());
    await route.fulfill({ status: 204, body: '' });
  });
  const url = MAIN + '?utm_source=roku&utm_medium=qr&utm_campaign=roku_commercial';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await state(page);
  await page.waitForTimeout(3000);
  const current = new URL(page.url());
  assert.strictEqual(current.searchParams.get('utm_source'), 'roku');
  assert.strictEqual(current.searchParams.get('utm_medium'), 'qr');
  assert.strictEqual(current.searchParams.get('utm_campaign'), 'roku_commercial');
  let attributed = false;
  for (const raw of gaCollects) {
    const u = new URL(raw);
    const dl = u.searchParams.get('dl') || '';
    if (dl.includes('utm_source=roku') && dl.includes('utm_medium=qr') && dl.includes('utm_campaign=roku_commercial')) attributed = true;
  }
  assert(attributed, `GA4 collect did not preserve Roku QR UTM landing URL: ${JSON.stringify(gaCollects)}`);
  record('Roku QR UTMs remain intact and GA4 page-view attribution carries the landing URL when Analytics is On', 'PASS', { pageUrl: page.url(), gaCollectCount: gaCollects.length });
  await context.close();
}

async function liveRokuNetworkAndStorage(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  // Establish the existing site's own first-party storage baseline with RRGH Analytics Off.
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  const page = await context.newPage();
  await blockNonRokuMeasurement(page);
  const requests = captureRequests(page);
  const externalRequests = [];
  page.on('request', (req) => {
    let host = '';
    try { host = new URL(req.url()).hostname.toLowerCase(); } catch {}
    if (!host || host === 'redrivergorgehiker.com') return;
    externalRequests.push({
      url: req.url(),
      method: req.method(),
      postData: req.postData() || '',
      referer: req.headers()['referer'] || '',
    });
  });
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const offState = await state(page);
  assert(/Off$/i.test(offState.text));
  assert.strictEqual(requests.length, 0, 'Roku requested anything while establishing Off baseline');
  // Let ordinary asynchronous site initialization settle before taking the storage baseline.
  await page.waitForTimeout(6000);

  const beforeCookies = await context.cookies();
  const beforeLocal = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

  // Enable only the shared RRGH measurement choice, then reload the same page/context.
  await setCookie(context, SHARED, 'allowed');
  requests.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const s = await state(page);
  assert(/On$/i.test(s.text));
  await page.waitForTimeout(6000);

  const afterCookies = await context.cookies();
  const afterLocal = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  assert.strictEqual(requests.filter((r) => r.url === ROKU_LOADER).length, 1, 'live Roku loader request count was not one');
  assert(requests.length >= 2, `Expected loader plus Roku event network activity; saw ${JSON.stringify(requests)}`);

  const firstPartyBefore = new Set(beforeCookies.filter((c) => /(^|\\.)redrivergorgehiker\\.com$/.test(c.domain)).map((c) => c.name));
  const newFirstParty = afterCookies.filter((c) => /(^|\\.)redrivergorgehiker\\.com$/.test(c.domain) && !firstPartyBefore.has(c.name));
  assert.deepStrictEqual(newFirstParty.map((c) => c.name), [], `Roku live smoke created unexpected first-party cookie(s): ${JSON.stringify(newFirstParty)}`);

  const newLocalKeys = Object.keys(afterLocal).filter((k) => !(k in beforeLocal));
  assert.deepStrictEqual(newLocalKeys, [], `Roku live smoke created unexpected first-party localStorage key(s): ${JSON.stringify(newLocalKeys)}`);

  const rokuDomainCookies = afterCookies
    .filter((c) => c.domain === 'ravm.tv' || c.domain.endsWith('.ravm.tv'))
    .map((c) => ({ name: c.name, domain: c.domain, path: c.path, sameSite: c.sameSite, secure: c.secure, httpOnly: c.httpOnly }));

  const networkText = requests.map((r) => [r.url, r.postData, r.referer].join('\\n')).join('\\n');
  const piiPatterns = [
    /Ryan@RedRiverGorgeHiker\\.com/i,
    /mailto:/i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i,
    /(?:phone|telephone|payment|card_number|postal_address|street_address)=/i,
  ];
  for (const pattern of piiPatterns) assert(!pattern.test(networkText), `PII-like value found in Roku network evidence: ${pattern}`);
  const forbiddenEvents = /(?:PURCHASE|LEAD|SIGNUP|ADD_TO_CART|CHECKOUT|REVENUE)/i;
  assert(!forbiddenEvents.test(networkText), 'Forbidden Roku commerce/lead event appeared in network evidence');

  await screenshot(page, 'live-roku-network-smoke');
  record('Live Roku network/storage smoke', 'PASS', {
    offBaseline: offState,
    state: s,
    requestCount: requests.length,
    requests,
    externalRequests,
    newFirstPartyCookies: newFirstParty.map((c) => ({ name: c.name, domain: c.domain })),
    newFirstPartyLocalStorageKeys: newLocalKeys,
    rokuDomainCookies,
    note: 'GA4 and Pinterest were blocked; storage delta is measured against the same site/context after an Analytics-Off baseline. Roku-domain cookies are reported separately; no new RRGH-domain cookie/localStorage is permitted.',
  });
  await context.close();
}

async function mobileDesktopSmoke(browser) {
  for (const mode of ['desktop', 'mobile']) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      ...(mode === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true } : { viewport: { width: 1440, height: 900 } }),
    });
    await setCookie(context, SHARED, 'declined');
    await setCookie(context, REGION, 'us');
    const page = await context.newPage();
    await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const s = await state(page);
    assert(/Off$/i.test(s.text));
    assert(await page.locator('header').count() > 0);
    const photography = page.locator('a[href*="photography"]').first();
    assert(await photography.count() > 0);
    record(`Normal ${mode} navigation shell remains present with Analytics Off`, 'PASS', { state: s });
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'],
  });
  let failure = null;
  try {
    await explicitOff(browser);
    await effectiveOn(browser);
    await gpcOff(browser);
    await consentRequiredOff(browser);
    await regionalFailureOff(browser);
    await withdrawal(browser);
    await qrAndGaAttribution(browser);
    await liveRokuNetworkAndStorage(browser);
    await mobileDesktopSmoke(browser);
  } catch (error) {
    failure = error;
    record('Roku UAT fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(EVIDENCE, 'roku-uat-results.json'), JSON.stringify(results, null, 2));
  }
  if (failure) process.exit(1);
})();
