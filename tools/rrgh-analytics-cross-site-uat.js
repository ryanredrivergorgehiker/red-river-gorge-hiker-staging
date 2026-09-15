const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MAIN_URL = 'https://redrivergorgehiker.com:8443/';
const STORE_URL = 'https://store.redrivergorgehiker.com/';
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const evidenceDir = path.resolve('uat-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const results = [];
function record(name, status, details = {}) {
  const item = { name, status, ...details };
  results.push(item);
  console.log(`[${status}] ${name}`, JSON.stringify(details));
}

async function screenshot(page, name) {
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function cookie(context, name) {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === name) || null;
}

async function mainState(page) {
  const button = page.locator('[data-rrgh-analytics-toggle]').first();
  await button.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-rrgh-analytics-toggle]');
    return el && !/initializing/i.test(el.getAttribute('data-effective-source') || '');
  }, { timeout: 30000 }).catch(() => {});
  return {
    text: (await button.textContent() || '').trim(),
    source: await page.evaluate(() => window.rrghAnalyticsEffectiveSource || null),
    country: await page.evaluate(() => window.rrghAutomaticCountry || null),
    countrySource: await page.evaluate(() => window.rrghAutomaticCountrySource || null),
  };
}

async function storeState(page) {
  const toggle = page.locator('#rrghAnalyticsToggle');
  await toggle.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(500);
  return {
    text: (await toggle.textContent() || '').trim(),
    effectiveOn: await page.evaluate(() => Boolean(window.rrghGaEffectiveOn)),
    country: await page.evaluate(() => window.rrghAutomaticCountry || null),
  };
}

async function ensureMainExplicit(page, target) {
  let state = await mainState(page);
  if (target === 'declined') {
    if (/Off$/i.test(state.text)) {
      await page.locator('[data-rrgh-analytics-toggle]').first().click();
      await page.waitForFunction(() => /On$/i.test(document.querySelector('[data-rrgh-analytics-toggle]')?.textContent || ''), { timeout: 30000 });
    }
    await Promise.allSettled([
      page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
      page.locator('[data-rrgh-analytics-toggle]').first().click(),
    ]);
    await page.locator('[data-rrgh-analytics-toggle]').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => /Off$/i.test(document.querySelector('[data-rrgh-analytics-toggle]')?.textContent || ''), { timeout: 30000 });
  } else {
    if (/On$/i.test(state.text)) {
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 15000 }),
        page.locator('[data-rrgh-analytics-toggle]').first().click(),
      ]);
      await page.locator('[data-rrgh-analytics-toggle]').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForFunction(() => /Off$/i.test(document.querySelector('[data-rrgh-analytics-toggle]')?.textContent || ''), { timeout: 30000 });
    }
    await page.locator('[data-rrgh-analytics-toggle]').first().click();
    await page.waitForFunction(() => /On$/i.test(document.querySelector('[data-rrgh-analytics-toggle]')?.textContent || ''), { timeout: 30000 });
  }
  return mainState(page);
}

async function ensureStoreExplicit(page, target) {
  let state = await storeState(page);
  const toggle = page.locator('#rrghAnalyticsToggle');
  if (target === 'declined') {
    if (/Off$/i.test(state.text)) {
      await toggle.click();
      await page.waitForFunction(() => /On$/i.test(document.querySelector('#rrghAnalyticsToggle')?.textContent || ''), { timeout: 30000 });
    }
    await Promise.allSettled([
      page.waitForLoadState('domcontentloaded', { timeout: 20000 }),
      toggle.click(),
    ]);
    await page.locator('#rrghAnalyticsToggle').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => /Off$/i.test(document.querySelector('#rrghAnalyticsToggle')?.textContent || ''), { timeout: 30000 });
  } else {
    if (/On$/i.test(state.text)) {
      await Promise.allSettled([
        page.waitForLoadState('domcontentloaded', { timeout: 20000 }),
        toggle.click(),
      ]);
      await page.locator('#rrghAnalyticsToggle').waitFor({ state: 'visible', timeout: 60000 });
      await page.waitForFunction(() => /Off$/i.test(document.querySelector('#rrghAnalyticsToggle')?.textContent || ''), { timeout: 30000 });
    }
    await page.locator('#rrghAnalyticsToggle').click();
    await page.waitForFunction(() => /On$/i.test(document.querySelector('#rrghAnalyticsToggle')?.textContent || ''), { timeout: 30000 });
  }
  return storeState(page);
}

async function setCookie(context, name, value) {
  await context.addCookies([{
    name,
    value,
    domain: '.redrivergorgehiker.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
  }]);
}

async function scenarioMainToStoreOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await ensureMainExplicit(page, 'declined');
  const saved = await cookie(context, SHARED);
  assert(saved && saved.value === 'declined', 'main site did not persist shared declined cookie');
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const store = await storeState(page);
  assert(/Off$/i.test(store.text), `Store did not recognize main-site Off choice: ${store.text}`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const storeReload = await storeState(page);
  assert(/Off$/i.test(storeReload.text), 'Store Off did not persist after reload');
  await screenshot(page, 'main-to-store-off');
  record('Main explicit Off is recognized and persists on Store', 'PASS', { main, store: storeReload, cookie: saved.value });
  await context.close();
}

async function scenarioStoreToMainOn(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const store = await ensureStoreExplicit(page, 'allowed');
  const saved = await cookie(context, SHARED);
  assert(saved && saved.value === 'allowed', 'Store did not persist shared allowed cookie');
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert(/On$/i.test(main.text), `Main site did not recognize Store On choice: ${main.text}`);
  assert.strictEqual(main.source, 'explicit-allowed', `Main site source was ${main.source}, expected explicit-allowed`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const mainReload = await mainState(page);
  assert(/On$/i.test(mainReload.text), 'Main On did not persist after reload');
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const storeReload = await storeState(page);
  assert(/On$/i.test(storeReload.text), 'Store On did not persist after round trip');
  await screenshot(page, 'store-to-main-on');
  record('Store explicit On is recognized and persists on main site', 'PASS', { store, main: mainReload, cookie: saved.value });
  await context.close();
}

async function scenarioCountryBridge(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await storeState(page);
  let region = null;
  for (let i = 0; i < 30; i++) {
    region = await cookie(context, REGION);
    if (region) break;
    await page.waitForTimeout(500);
  }
  assert(region && region.value, 'Store did not publish shared country cookie');
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert.strictEqual(main.country, region.value.toLowerCase(), 'main site did not consume Store country cookie');
  assert.strictEqual(main.countrySource, 'first-party-country-cookie', `main country source was ${main.countrySource}`);
  await screenshot(page, 'country-bridge');
  record('Store country-only state is consumed by main site', 'PASS', { regionCookie: region.value, main });
  await context.close();
}

async function scenarioGpcForcesOff(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true });
    } catch {}
  });
  await setCookie(context, SHARED, 'allowed');
  const page = await context.newPage();
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert(/Off$/i.test(main.text), 'GPC did not force main site Off');
  assert.strictEqual(main.source, 'privacy-signal', `main source was ${main.source}, expected privacy-signal`);
  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const store = await storeState(page);
  assert(/Off$/i.test(store.text), 'GPC did not force Store Off');
  await screenshot(page, 'gpc-forces-off');
  record('GPC/privacy signal forces Off on main and Store', 'PASS', { main, store });
  await context.close();
}

async function scenarioConsentRequired(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await setCookie(context, REGION, 'gb');
  const page = await context.newPage();
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert(/Off$/i.test(main.text), 'GB country signal did not fail closed Off');
  assert.strictEqual(main.source, 'consent-required', `main source was ${main.source}, expected consent-required`);
  record('Consent-required region browser path fails closed Off', 'PASS', { main, note: 'Real Chromium with injected first-party GB country signal; not a live UK-network test.' });
  await context.close();
}

async function scenarioUnresolvedFailsClosed(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.route('https://one.one.one.one/cdn-cgi/trace', (route) => route.abort());
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert(/Off$/i.test(main.text), 'unresolved country did not fail closed Off');
  assert.strictEqual(main.source, 'regional-error', `main source was ${main.source}, expected regional-error`);
  record('Unresolved country lookup fails closed Off', 'PASS', { main });
  await context.close();
}

async function scenarioStoreBrowsing(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const response = await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok(), `Store home returned ${response ? response.status() : 'no response'}`);
  await page.locator('#rrghAnalyticsToggle').waitFor({ state: 'visible', timeout: 60000 });

  const productHref = await page.locator('a[href*="/featured/"]').evaluateAll((links) => {
    const visible = links.find((a) => a instanceof HTMLAnchorElement && a.href.includes('/featured/'));
    return visible ? visible.href : null;
  });
  assert(productHref, 'No Store product link was discoverable');

  const productResponse = await page.goto(productHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(productResponse && productResponse.ok(), `Product page returned ${productResponse ? productResponse.status() : 'no response'}`);
  assert(new URL(page.url()).hostname === 'store.redrivergorgehiker.com', 'Product browsing left branded Store hostname');
  await screenshot(page, 'store-product-page');

  const cartResponse = await page.goto(`${STORE_URL}shoppingcart.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(cartResponse && cartResponse.ok(), `Cart returned ${cartResponse ? cartResponse.status() : 'no response'}`);
  assert(new URL(page.url()).hostname === 'store.redrivergorgehiker.com', 'Cart left branded Store hostname');

  const productUi = await page.evaluate(() => Array.from(document.querySelectorAll('a,button,input')).map((el) => ({
    tag: el.tagName,
    text: ((el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || '')).trim().replace(/\s+/g, ' ').slice(0, 120),
    href: el instanceof HTMLAnchorElement ? el.href : null,
    type: el.getAttribute('type'),
  })).filter((x) => /cart|checkout|continue|payment|shop/i.test(`${x.text} ${x.href || ''}`)).slice(0, 100));

  await screenshot(page, 'store-cart');
  record('Store home, product link, product page, and Cart load under branded hostname', 'PASS', { productHref, cartUrl: page.url(), relevantCartControls: productUi });

  // Checkout is intentionally probed without completing a purchase. If the live cart is empty,
  // document the browser-level cart PASS and expose the discovered controls for follow-up rather than fabricating an order.
  const checkoutLink = page.locator('a[href*="checkout"], button:has-text("Checkout"), input[value*="Checkout" i]').first();
  if (await checkoutLink.count()) {
    try {
      await checkoutLink.click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      const body = (await page.locator('body').innerText()).slice(0, 5000);
      const paymentStage = /payment|credit card|paypal|billing/i.test(body);
      record('Checkout navigation reached a payment/billing stage without order completion', paymentStage ? 'PASS' : 'PARTIAL', { url: page.url(), paymentStage });
      await screenshot(page, 'store-checkout-stage');
    } catch (error) {
      record('Checkout navigation from current cart', 'PARTIAL', { reason: String(error) });
    }
  } else {
    record('Checkout navigation from current cart', 'PARTIAL', { reason: 'Fresh automated browser cart was empty; no checkout control available without selecting/purchasing a product. No order was created.' });
  }
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'],
  });
  let failure = null;
  try {
    await scenarioMainToStoreOff(browser);
    await scenarioStoreToMainOn(browser);
    await scenarioCountryBridge(browser);
    await scenarioGpcForcesOff(browser);
    await scenarioConsentRequired(browser);
    await scenarioUnresolvedFailsClosed(browser);
    await scenarioStoreBrowsing(browser);
  } catch (error) {
    failure = error;
    record('UAT harness fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(evidenceDir, 'uat-results.json'), JSON.stringify(results, null, 2));
  }
  if (failure) process.exit(1);
})();
