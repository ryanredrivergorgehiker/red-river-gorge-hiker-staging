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

async function homeHeroActions(browser) {
  const desktopContext = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const desktop = await desktopContext.newPage();
  await desktop.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const desktopHero = desktop.locator('.home-hero');
  assert.strictEqual((await desktopHero.locator('.sar-hero-commitment').innerText()).trim(), 'Stories, gear, and original photography from the Red River Gorge.');
  const desktopActions = desktopHero.locator('.sar-hero-actions .sar-button');
  assert.strictEqual(await desktopActions.count(), 3);
  const desktopTexts = (await desktopActions.allTextContents()).map(x => x.trim());
  assert.deepStrictEqual(desktopTexts, ['Explore the Gorge', 'Explore Art', 'Shop']);
  assert((await desktopActions.nth(0).getAttribute('href')).endsWith('/explore/'));
  assert((await desktopActions.nth(1).getAttribute('href')).endsWith('/photography/'));
  assert((await desktopActions.nth(2).getAttribute('href')).endsWith('/gear/'));
  assert((await desktopActions.nth(1).getAttribute('class')).includes('sar-button-light'));
  assert((await desktopActions.nth(2).getAttribute('class')).includes('sar-button-light'));
  const desktopBoxes = await Promise.all([0,1,2].map(i => desktopActions.nth(i).boundingBox()));
  assert(desktopBoxes.every(Boolean));
  const desktopY = desktopBoxes.map(box => Math.round(box.y));
  assert(Math.max(...desktopY) - Math.min(...desktopY) <= 2, `Desktop hero actions wrapped: ${desktopY.join(',')}`);
  assert.strictEqual((await desktopHero.locator('.home-sar-link').innerText()).trim(), 'Proudly supporting Wolfe County Search & Rescue →');
  await shot(desktop, 'desktop-home-hero-three-actions');
  await desktopContext.close();

  const mobileContext = await preparedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const mobileHero = mobile.locator('.home-hero');
  const mobileActions = mobileHero.locator('.sar-hero-actions .sar-button');
  assert.strictEqual(await mobileActions.count(), 3);
  const mobileBoxes = await Promise.all([0,1,2].map(i => mobileActions.nth(i).boundingBox()));
  assert(mobileBoxes.every(Boolean));
  const widths = mobileBoxes.map(box => box.width);
  const heights = mobileBoxes.map(box => box.height);
  assert(widths.every(width => Math.abs(width - 208) <= 2), `Mobile button width changed: ${widths.join(',')}`);
  assert(Math.max(...widths) - Math.min(...widths) <= 1, `Mobile button widths differ: ${widths.join(',')}`);
  assert(heights.every(height => height <= 42), `Mobile buttons are too tall: ${heights.join(',')}`);
  assert(mobileBoxes[1].y > mobileBoxes[0].y && mobileBoxes[2].y > mobileBoxes[1].y, 'Mobile hero actions are not vertically stacked');
  assert((await mobileActions.nth(1).getAttribute('class')).includes('sar-button-light'));
  assert((await mobileActions.nth(2).getAttribute('class')).includes('sar-button-light'));
  assert.strictEqual((await mobileHero.locator('.home-sar-link').innerText()).trim(), 'Proudly supporting Wolfe County Search & Rescue →');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, `Mobile homepage horizontal overflow: ${overflow}`);
  await shot(mobile, 'mobile-home-hero-three-actions');
  record('Homepage hero short copy, three desktop actions, preserved mobile width and shorter stacked buttons', 'PASS', { widths, heights, desktopY });
  await mobileContext.close();
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

  const shopMenu = page.locator('.desktop-nav .nav-details-shop');
  await shopMenu.locator(':scope > summary').hover();
  await page.waitForTimeout(120);
  assert.strictEqual(await shopMenu.getByText('Kids T-Shirts', { exact: true }).count(), 0);
  assert.strictEqual(await shopMenu.getByText('Toddler T-Shirts', { exact: true }).count(), 0);
  assert.strictEqual(await shopMenu.getByText('Baby One-Pieces', { exact: true }).count(), 0);
  assert.strictEqual(await shopMenu.getByText("Kid's T-Shirts", { exact: true }).count(), 0);

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

  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const desktopExploreMenu = page.locator('.desktop-nav .nav-details-explore');
  await desktopExploreMenu.locator(':scope > summary').hover();
  await page.waitForTimeout(120);
  const camping = desktopExploreMenu.locator('.nav-explore-section').filter({ hasText: 'Camping' }).first();
  const guide = camping.getByRole('link', { name: '2026 DBNF Dispersed Camping Guide Download', exact: true });
  assert.strictEqual(await guide.count(), 1);
  assert((await guide.getAttribute('href')).endsWith('/downloads/red-river-gorge-hiker-2026-dbnf-dispersed-camping-guide.pdf'));
  assert.strictEqual(await guide.getAttribute('download'), '');
  assert.strictEqual(await camping.getByRole('link', { name: 'Download Guide', exact: true }).count(), 0);

  const photoSlugs = [
    'double-rainbow-at-eagles-point-buttress',
    'winter-at-red-byrd-arch',
    'sunrise-at-eagles-nest',
    'dog-fork-falls-in-winter',
    'ice-at-west-of-copperas-pillar',
    'splatter-falls'
  ];
  const expectedDescriptions = {
    'double-rainbow-at-eagles-point-buttress': 'A brilliant double rainbow breaks over the Red River Gorge from Eagle’s Point Buttress after a heavy summer storm, spanning the landscape as the storm clears.',
    'sunrise-at-eagles-nest': 'A vivid winter sunrise illuminates the horizon beside the sandstone hueco known as Eagle’s Nest, photographed from a campsite that provided a better view of the morning sky.',
    'dog-fork-falls-in-winter': 'Snow, flowing water, and long icicles surround Dog Fork Falls during the final weeks of winter in the Clifty Wilderness.',
    'splatter-falls': 'A remote four-drop cascade descends through layered sandstone before splattering into an amber pool. Ryan documented and named the waterfall during an off-trail exploration.'
  };
  for (const slug of photoSlugs) {
    await page.goto(MAIN + 'photographs/' + slug + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const credit = page.locator('.photo-copyright-credit');
    assert.strictEqual((await credit.innerText()).trim(), 'Photograph © Ryan D. Lewis. All rights reserved.', slug);
    if (expectedDescriptions[slug]) {
      assert.strictEqual((await page.locator('.photo-page > .lede').innerText()).trim(), expectedDescriptions[slug], slug);
    }
    const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(t => JSON.parse(t));
    const photoSchema = schemas.find(s => s['@type'] === 'VisualArtwork');
    assert(photoSchema && photoSchema.creator.name === 'Ryan D. Lewis', slug);
    assert(photoSchema.copyrightHolder.name === 'Ryan D. Lewis', slug);
  }

  await page.goto(MAIN + 'search-and-rescue/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.sarDataSource === 'live', null, { timeout: 15000 });
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.sarDataSource), 'live');
  const sar = await page.locator('body').innerText();
  const sarLower = sar.toLowerCase();
  assert(sar.includes('RRGH SAR Commitment'));
  assert(sarLower.includes('rrgh annual base commitment'));
  assert(sarLower.includes('rrgh profit allocation generated'));
  assert(sarLower.includes('total current-year rrgh commitment'));
  assert(sarLower.includes('rrgh actually transferred'));
  assert(sarLower.includes('total outstanding commitment'));
  assert(sarLower.includes('commitment fulfilled: 0.0%'));
  assert(!sar.includes('SAR Match-O-Meter'));
  assert(!sar.includes('RRGH Match:'));
  assert(!sar.includes('milestone, not a cap'));
  assert(sar.includes('Red River Gorge Hiker, LLC maintains two separate commitments to Wolfe County Search & Rescue: at least $500 each calendar year, plus 20% of positive Red River Gorge Hiker business profit.'));
  assert(sar.includes('Before the current RRGH business-support program, Ryan D. Lewis personally contributed $500 to Wolfe County Search & Rescue in 2025.'));
  assert(sar.includes('That historical personal support remains separate from Red River Gorge Hiker, LLC support.'));
  assert(sar.includes('Neither commitment offsets nor satisfies the other.'));
  assert(!sar.includes('Neither commitment offsets or satisfies the other.'));
  assert(sar.includes('Last updated September 19, 2026.'));
  assert(!sar.includes('2026-09-19T14:39:00-04:00'));
  assert(sar.includes('WCSART is the search-and-rescue organization supported by Red River Gorge Hiker through RRGH’s two separate Company commitments: at least $500 each calendar year plus 20% of positive business profit.'));
  const fullMeterLabel = await page.locator('[data-sar-meter-variant="full"]').getAttribute('aria-label');
  assert(fullMeterLabel && fullMeterLabel.includes('0.0% fulfilled. View Search and Rescue resources.'));
  assert(sar.includes('RRGH transferred: $0 / $500'));
  assert(sar.includes('WOLFE COUNTY'));
  assert(sar.includes('POWELL COUNTY'));
  assert(sar.includes('MENIFEE COUNTY'));
  assert(sar.includes('LEE COUNTY'));
  assert(sar.includes('Powell County Search & Rescue serves the Powell County side of the Gorge and works alongside other local and regional responders when mutual aid is needed.'));
  assert(sar.includes('Search-and-rescue incidents in Menifee County may involve local emergency services, neighboring SAR teams, Kentucky State Police, and other mutual-aid resources depending on the location and situation.'));
  assert(sar.includes('Lee County emergency-management and public-safety resources may respond locally and work with neighboring teams and other mutual-aid partners when incidents require additional support.'));
  assert(!sar.includes('legitimate Gorge-area rescue resource'));
  assert(!sar.includes('RRGH does not claim'));
  assert(!sar.includes('identifies an Emergency Management Director'));
  assert.strictEqual(await page.getByRole('link', { name: 'Visit Powell County SAR ↗', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('link', { name: 'Menifee County Contacts ↗', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('link', { name: 'Lee County Emergency Management ↗', exact: true }).count(), 1);

  const liveValues = await page.locator('#sar-match-details .sar-stat strong').allTextContents();
  assert(liveValues.includes('$500'));
  assert(liveValues.filter(v => v === '$0').length >= 2);
  await shot(page, 'desktop-sar-leg-dec-0027-live-feed');

  await page.goto(MAIN + 'about/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const about = await page.locator('body').innerText();
  assert(about.includes('It began with one hiker spending a lot of time exploring the Gorge, but it was never meant to stop there.'));
  assert(about.includes('The exploration came first. The photographs came from being out there.'));
  assert(about.includes('Red River Gorge Hiker, LLC maintains two separate commitments to Wolfe County Search & Rescue: at least $500 each calendar year, plus 20% of positive Red River Gorge Hiker business profit.'));
  assert(!about.includes('makes direct contributions to Wolfe County Search & Rescue'));

  await page.goto(MAIN + 'explore/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const exploreBody = await page.locator('body').innerText();
  assert(exploreBody.includes('Take the Gorge with you'));
  assert(exploreBody.includes('Explore photography and gear inspired by the same places, or see how Red River Gorge Hiker supports Wolfe County Search & Rescue.'));

  await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const terms = await page.locator('body').innerText();
  assert(terms.includes('RRGH maintains a minimum $500 annual Company commitment and separately allocates 20% of positive Red River Gorge Hiker business profit.'));
  assert(terms.includes('neither offsets nor satisfies the other'));
  assert(!terms.includes('neither offsets or satisfies the other'));
  assert(terms.includes('The formation and operation of Red River Gorge Hiker, LLC do not transfer ownership of those photograph copyrights to the LLC.'));
  assert(terms.includes('Historical personal support by Ryan D. Lewis remains separate from Company support.'));
  assert(terms.includes('No formal partnership, sponsorship, endorsement, agency relationship, promotional arrangement, or commercial relationship'));
  assert(terms.includes("Direct charitable donations do not pass through Red River Gorge Hiker, LLC or Ryan D. Lewis"));

  await page.goto(MAIN + 'shipping-and-returns/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const shipping = await page.locator('body').innerText();
  assert(shipping.includes('order-specific questions, including delivery, damage, returns, refunds, and transaction questions, should be directed'));
  assert(shipping.includes('Info@RedRiverGorgeHiker.com'));
  assert(!shipping.includes('Ryan@RedRiverGorgeHiker.com'));

  await page.goto(MAIN + 'stories/lilis-leap/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let storyBody = await page.locator('body').innerText();
  assert(storyBody.includes('working my way down an approximately 20-foot wall'));
  await page.goto(MAIN + 'stories/the-day-the-gorge-took-13-hours/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  storyBody = await page.locator('body').innerText();
  assert(storyBody.includes('Between Frenchburg and Hemlock Lodge lay the Red River Gorge—and 31.87 miles of walking.'));
  await page.goto(MAIN + 'stories/the-fletcher-ridge-hunt/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  storyBody = await page.locator('body').innerText();
  assert(storyBody.includes('bring it into a modern record in which it had not previously appeared'));
  assert(storyBody.includes('My records date the discovery and documentation to the February 3–6, 2023 trip'));

  await page.goto(MAIN + 'contact/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(await page.locator('a[href="mailto:Info@RedRiverGorgeHiker.com"]').count() > 0);

  record('Copy-corrected photography/stories, navigation, shipping contact, live LEG-DEC-0027 SAR feed, accessibility/date, About/Explore/Terms', 'PASS', { liveValues, fullMeterLabel });
  await context.close();
}

async function gearTemporaryRetirement(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const response = await page.goto(MAIN + 'gear/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  const cards = page.locator('.merch-card');
  assert.strictEqual(await cards.count(), 15);

  const activeSlugs = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-product')));
  for (const held of ['youth-tshirt', 'kids-tshirt', 'toddler-tshirt', 'baby-one-piece']) {
    assert(!activeSlugs.includes(held), `temporarily retired slug still active: ${held}`);
    const heldResponse = await page.goto(MAIN + `gear/${held}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(heldResponse && heldResponse.status() === 404, `expected retired route 404 for ${held}, got ${heldResponse && heldResponse.status()}`);
  }

  const survivorResponse = await page.goto(MAIN + 'gear/long-sleeve-tshirt/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(survivorResponse && survivorResponse.ok());
  assert((await page.locator('body').innerText()).includes('Long-Sleeve T-Shirt'));

  await page.goto(MAIN + 'gear/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const storeLinks = page.locator('a.merch-button[data-store-item-type="gear"]');
  assert.strictEqual(await storeLinks.count(), 15);
  const destinations = await storeLinks.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert(destinations.every(href => href && href.startsWith('https://store.redrivergorgehiker.com/')));
  for (const survivor of ['double-rainbow-eagles-point-buttress-greeting-card', 'tshirt-chest-logo', 'long-sleeve-tshirt', 'mens-tank-top', 'greeting-cards']) {
    assert(activeSlugs.includes(survivor), `expected surviving Gear slug missing: ${survivor}`);
  }

  await shot(page, 'desktop-gear-15-active-children-retired');
  record('15 active Gear products, children apparel absent, retired routes 404, surviving Store handoffs intact', 'PASS', { activeSlugs, storeLinkCount: destinations.length });
  await context.close();
}

async function exploreVisual(browser) {
  for (const spec of [
    ['desktop', { viewport: { width: 1440, height: 1000 } }],
    ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true }]
  ]) {
    const context = await preparedContext(browser, spec[1]);
    const page = await context.newPage();
    for (const route of ['explore/','about/','search-and-rescue/','copyright-and-terms/','contact/']) {
      await page.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 2, `${spec[0]} horizontal overflow on ${route}: ${overflow}`);
    }
    await page.goto(MAIN + 'explore/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.strictEqual(await page.locator('.explore-card').count(), 8);
    await shot(page, `${spec[0]}-explore-hub`);
    await page.goto(MAIN + 'search-and-rescue/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await shot(page, `${spec[0]}-sar-leg-dec-0027`);
    await context.close();
  }
  record('Desktop/mobile Explore, About, SAR, Terms and Contact visual/overflow smoke', 'PASS');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'] });
  let failure = null;
  try {
    await homeHeroActions(browser);
    await desktopExplore(browser);
    await gearTemporaryRetirement(browser);
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
