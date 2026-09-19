const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const EVIDENCE = path.resolve('brand-explore-uat-evidence');
fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, ...details });
  console.log(`[${status}] ${name}`, JSON.stringify(details));
}
async function setCookie(context, name, value) {
  await context.addCookies([{ name, value, domain: '.redrivergorgehiker.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }]);
}
async function preparedContext(browser, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  return context;
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function desktopExplore(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const menu = page.locator('.desktop-nav .nav-details-explore');
  const trigger = menu.locator(':scope > summary');
  await trigger.hover();
  await page.waitForTimeout(120);
  assert.strictEqual(await menu.getAttribute('open') !== null, true);

  const panel = menu.locator('.nav-panel-explore');
  const sections = panel.locator('.nav-explore-section');
  assert.strictEqual(await sections.count(), 8);
  assert.strictEqual(await panel.locator('.nav-explore-title').count(), 0);

  const stories = sections.filter({ hasText: 'Stories' }).first();
  const storyLinks = stories.locator('a');
  assert.strictEqual(await storyLinks.count(), 6);
  assert((await storyLinks.first().getAttribute('href')).includes('/stories/lilis-leap/'));
  assert.strictEqual(await stories.getByText('View All Stories', { exact: true }).count(), 0);

  const sarSection = sections.filter({ hasText: 'Search & Rescue' }).first();
  assert.strictEqual(await sarSection.locator('a[href*="kyem.ky.gov"]').count(), 0);
  assert(await sarSection.locator('a[href="https://www.pocosar.org/"]').count() === 1);

  const landforms = sections.filter({ hasText: 'Landforms' }).first();
  const ext = landforms.locator('a[href="https://redrivergorgearches.com/"]');
  assert.strictEqual(await ext.getAttribute('target'), '_blank');
  assert((await ext.getAttribute('rel') || '').includes('noopener'));
  assert((await ext.getAttribute('rel') || '').includes('noreferrer'));

  await page.keyboard.press('Escape');
  assert.strictEqual(await menu.getAttribute('open'), null);

  await trigger.focus();
  await page.keyboard.press('Enter');
  assert.strictEqual(await menu.getAttribute('open') !== null, true);
  await storyLinks.first().focus();
  assert.strictEqual(await storyLinks.first().isVisible(), true);
  await page.keyboard.press('Escape');
  assert.strictEqual(await menu.getAttribute('open'), null);

  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.locator('main').click({ position: { x: 20, y: 20 } });
  assert.strictEqual(await menu.getAttribute('open'), null);

  await shot(page, 'desktop-home-explore-wide-grid');
  record('Desktop Explore wide section grid, keyboard, Escape and outside-click behavior', 'PASS');
  await context.close();
}

async function mobileExplore(browser) {
  const context = await preparedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const menu = page.locator('.mobile-primary-nav .nav-details-explore');
  await menu.locator(':scope > summary').click();
  assert.strictEqual(await menu.getAttribute('open') !== null, true);
  const panel = menu.locator('.nav-panel-explore');
  const box = await panel.boundingBox();
  assert(box && box.x >= -1 && box.x + box.width <= 391);
  assert.strictEqual(await panel.locator('.nav-explore-section').count(), 8);
  const columns = await panel.locator('.nav-explore-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length);
  assert.strictEqual(columns, 2);
  await shot(page, 'mobile-explore-section-grid');
  record('Mobile Explore two-column section grid without horizontal clipping', 'PASS', { panel: box, columns });
  await context.close();
}

async function routeAndMetadata(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const routes = [
    'explore/',
    'stories/lilis-leap/',
    'stories/the-day-the-gorge-took-13-hours/',
    'stories/the-blank-places-on-the-map/',
    'stories/the-fletcher-ridge-hunt/',
    'stories/granddaddys-arch/',
    'stories/walking-home/'
  ];
  for (const route of routes) {
    const response = await page.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), route);
    assert((await page.locator('link[rel="canonical"]').getAttribute('href') || '').endsWith('/' + route));
  }

  await page.goto(MAIN + 'stories/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('**/explore/#stories', { timeout: 10000 });

  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.strictEqual(await page.title(), 'Red River Gorge Hiker | Explore the Gorge, Art & Gear');
  assert.strictEqual(
    await page.locator('meta[name="description"]').getAttribute('content'),
    "Explore Kentucky's Red River Gorge with stories, maps, landforms, trails, camping, safety and search-and-rescue resources, plus photography, art and gear."
  );
  assert.strictEqual(await page.locator('meta[property="og:title"]').getAttribute('content'), 'Red River Gorge Hiker | Explore the Gorge, Art & Gear');
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
  const parsed = schemas.map(text => JSON.parse(text));
  assert(parsed.some(s => s['@type'] === 'WebSite' && s.name === 'Red River Gorge Hiker'));
  assert(parsed.some(s => s['@type'] === 'WebPage'));

  await page.goto(MAIN + 'exploring-the-gorge/#lilis-leap', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('**/stories/lilis-leap/', { timeout: 10000 });
  record('Explore/story routes, retired Stories hub, canonicals, legacy compatibility and homepage SEO/schema', 'PASS', { routes });
  await context.close();
}

async function brandCreatorAndSar(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(MAIN + 'photography/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(!(await page.locator('body').innerText()).includes('Photography by Ryan D. Lewis'));

  await page.goto(MAIN + 'photographs/splatter-falls/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const body = await page.locator('body').innerText();
  assert(!body.includes('Photography by Ryan D. Lewis'));
  assert(!body.includes('Story by Ryan D. Lewis'));
  assert(body.includes('Ryan discovered Splatter Falls on April 13, 2024'));
  assert(!body.includes('I discovered Splatter Falls on April 13, 2024'));
  for (const label of ['Creator','Copyright holder','Medium','Creator role','Story author']) {
    assert(await page.locator('dt', { hasText: label }).count() >= 1);
  }
  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(t => JSON.parse(t));
  const photoSchema = schemas.find(s => s['@type'] === 'VisualArtwork');
  assert(photoSchema && photoSchema.creator.name === 'Ryan D. Lewis');
  assert(photoSchema.copyrightHolder.name === 'Ryan D. Lewis');
  assert(await page.locator('a[href^="https://store.redrivergorgehiker.com/"]').count() > 0);

  await page.goto(MAIN + 'stories/lilis-leap/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const storyParagraphCount = await page.locator('.story-longform > p').count();
  assert(storyParagraphCount >= 5 && storyParagraphCount <= 10);
  const storyBody = await page.locator('body').innerText();
  assert(!storyBody.includes('Related photograph'));
  assert(!storyBody.includes('All stories'));

  const footer = page.locator('footer');
  assert((await footer.innerText()).includes('© Red River Gorge Hiker, LLC. All rights reserved.'));
  assert(!(await footer.innerText()).includes('Photographs © Ryan D. Lewis'));

  await page.goto(MAIN + 'contact/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(await page.locator('a[href="mailto:Info@RedRiverGorgeHiker.com"]').count() > 0);
  await page.goto(MAIN + 'photography-use-and-permissions/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert((await page.locator('body').innerText()).includes('applicable copyright holder or authorized rights representative'));
  await page.goto(MAIN + 'about/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const about = await page.locator('body').innerText();
  assert(about.includes('The goal is not to make one person the center of the story.'));
  assert(!about.includes("Ryan's story"));

  await page.goto(MAIN + 'search-and-rescue/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const sar = await page.locator('body').innerText();
  assert(sar.includes('Search & Rescue Across the Greater Red River Gorge'));
  for (const county of ['Wolfe County','Powell County','Menifee County','Lee County']) assert(sar.includes(county));
  assert(!sar.includes('Ryan'));
  assert(!sar.includes('Kentucky Emergency Management Search & Rescue'));
  assert(sar.includes('RRGH annual commitment'));
  assert(sar.includes('20% of RRGH business profit is allocated to Wolfe County Search & Rescue.'));
  assert(await page.locator('.sar-regional-resource-grid .sar-resource-card').count() === 4);
  assert(await page.locator('main a[href="https://www.pocosar.org/"][target="_blank"]').count() === 1);
  assert(await page.locator('main a[href*="kyem.ky.gov"]').count() === 0);
  await shot(page, 'desktop-sar-regional-four-card-grid');

  record('Photography cleanup, paragraph reflow, creator metadata, brand-first About/contact and cleaned Gorge SAR context', 'PASS', { storyParagraphCount });
  await context.close();
}

async function exploreVisual(browser) {
  for (const spec of [
    ['desktop', { viewport: { width: 1440, height: 1000 } }],
    ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true }]
  ]) {
    const context = await preparedContext(browser, spec[1]);
    const page = await context.newPage();
    await page.goto(MAIN + 'explore/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.strictEqual(await page.locator('.explore-card').count(), 8);
    await shot(page, `${spec[0]}-explore-hub`);
    await context.close();
  }
  record('Desktop/mobile Explore hub visual smoke', 'PASS');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'] });
  let failure = null;
  try {
    await desktopExplore(browser);
    await mobileExplore(browser);
    await routeAndMetadata(browser);
    await brandCreatorAndSar(browser);
    await exploreVisual(browser);
  } catch (error) {
    failure = error;
    record('Brand/Explore UAT fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(EVIDENCE, 'brand-explore-uat-results.json'), JSON.stringify(results, null, 2));
  }
  if (failure) process.exit(1);
})();
