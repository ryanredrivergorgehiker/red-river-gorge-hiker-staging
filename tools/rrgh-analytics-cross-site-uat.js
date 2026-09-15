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
  const decodedRegion = decodeURIComponent(region.value).toLowerCase();
  await page.goto(MAIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const main = await mainState(page);
  assert.strictEqual(main.country, decodedRegion, 'main site did not consume Store country cookie');
  assert.strictEqual(main.countrySource, 'first-party-country-cookie', `main country source was ${main.countrySource}`);
  await screenshot(page, 'country-bridge');
  record('Store country-only state is consumed by main site', 'PASS', { regionCookieRaw: region.value, regionCountry: decodedRegion, main });
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

async function visibleControlSummary(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a,button,input,select')).map((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    const text = ((el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || el.getAttribute('title') || '')).trim().replace(/\s+/g, ' ').slice(0, 160);
    return {
      tag: el.tagName,
      text,
      href: el instanceof HTMLAnchorElement ? el.href : null,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      visible,
    };
  }).filter((x) => x.visible && /cart|checkout|continue|payment|billing|add|quantity|greeting|card/i.test(`${x.text} ${x.href || ''} ${x.name || ''}`)).slice(0, 150));
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
  record('Store home and featured product browsing remain normal under branded hostname', 'PASS', { productHref });

  const purchaseUrl = `${STORE_URL}featured/double-rainbow-at-eagles-point-ryan-d-lewis.html?product=greeting-card`;
  const purchaseResponse = await page.goto(purchaseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(purchaseResponse && purchaseResponse.ok(), `Approved greeting-card product page returned ${purchaseResponse ? purchaseResponse.status() : 'no response'}`);
  await page.waitForTimeout(1000);
  await screenshot(page, 'store-purchase-product');

  const addCandidates = [
    page.getByRole('button', { name: /add to (shopping )?cart/i }).first(),
    page.locator('input[type="submit" i][value*="add" i][value*="cart" i]:visible').first(),
    page.locator('input[type="button" i][value*="add" i][value*="cart" i]:visible').first(),
    page.getByRole('link', { name: /add to (shopping )?cart/i }).first(),
  ];
  let addControl = null;
  for (const candidate of addCandidates) {
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      addControl = candidate;
      break;
    }
  }
  if (!addControl) {
    const controls = await visibleControlSummary(page);
    throw new Error(`Could not find visible Add to Cart control on approved greeting-card product. Relevant controls: ${JSON.stringify(controls)}`);
  }
  await addControl.click({ timeout: 15000 });
  await page.waitForTimeout(1500);

  const cartResponse = await page.goto(`${STORE_URL}shoppingcart.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(cartResponse && cartResponse.ok(), `Cart returned ${cartResponse ? cartResponse.status() : 'no response'}`);
  assert(new URL(page.url()).hostname === 'store.redrivergorgehiker.com', 'Cart left branded Store hostname');
  const cartText = await page.locator('body').innerText();
  assert(!/you do not have any products in your shopping cart/i.test(cartText), 'Cart was still empty after Add to Cart');
  assert(!/\$0\.00\b/.test(cartText.slice(0, 2500)), 'Cart total remained $0.00 after Add to Cart');
  await screenshot(page, 'store-cart-nonempty');
  record('Native Store Cart accepts an approved product and retains nonempty cart state', 'PASS', { cartUrl: page.url() });

  const checkoutCandidates = [
    page.getByRole('button', { name: /checkout/i }).first(),
    page.getByRole('link', { name: /checkout/i }).first(),
    page.locator('input[type="submit" i][value*="checkout" i]:visible').first(),
    page.locator('input[type="button" i][value*="checkout" i]:visible').first(),
  ];
  let checkoutControl = null;
  for (const candidate of checkoutCandidates) {
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      checkoutControl = candidate;
      break;
    }
  }
  if (!checkoutControl) {
    const controls = await visibleControlSummary(page);
    throw new Error(`Nonempty Cart did not expose a visible Checkout control. Relevant controls: ${JSON.stringify(controls)}`);
  }

  await checkoutControl.click({ timeout: 15000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(750);
  const checkoutText = await page.locator('body').innerText();
  const checkoutUrl = page.url();
  const checkoutReached = /checkout|payment|billing|shipping|credit card|paypal/i.test(`${checkoutUrl} ${checkoutText.slice(0, 10000)}`);
  assert(checkoutReached, `Checkout control did not reach a recognizable checkout stage: ${checkoutUrl}`);
  await screenshot(page, 'store-checkout-stage');
  record('Checkout begins normally from nonempty native Cart without completing an order', 'PASS', { checkoutUrl, pageSignals: checkoutText.slice(0, 1200).replace(/\s+/g, ' ') });
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
