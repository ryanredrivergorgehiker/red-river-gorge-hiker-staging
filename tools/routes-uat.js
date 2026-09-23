const { chromium } = require('playwright');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const EVIDENCE = path.resolve('routes-uat-evidence');
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const GPX_SHA = '2469c85ebaddd3e701ba6dc8eea3664d90a0667dcd86f2aab43ae1445986830d';
const GEO_SHA = '123fdb57e1142299f86c714367cc466b70f18fa90cfbaabb92b0d9ced157dc66';
const PROVIDERS = ['kygisserver.ky.gov', 'basemap.nationalmap.gov'];
fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];

const sha256 = (bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const record = (name, status, details = {}) => {
  results.push({ name, status, ...details });
  console.log(`[${status}] ${name}`, JSON.stringify(details));
};
async function setCookie(context, name, value) {
  await context.addCookies([{ name, value, domain: '.redrivergorgehiker.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax' }]);
}
async function contextFor(browser, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  return context;
}
async function fetchBytes(page, url) {
  const values = await page.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), url);
  return Uint8Array.from(values);
}
async function fetchText(page, url) {
  return page.evaluate(async (u) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
    return r.text();
  }, url);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function routeLibrary(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const response = await page.goto(MAIN + 'routes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert.strictEqual(await page.locator('[data-route-card]').count(), 1);
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');
  assert.strictEqual(await page.getByRole('link', { name: 'Skybridge Arch', exact: true }).count(), 1);

  const search = page.locator('[data-route-search]');
  await search.fill('does-not-exist');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  assert.strictEqual(await page.locator('[data-route-empty]').isVisible(), true);
  await search.fill('Skybridge');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  const trip = page.locator('[data-route-trip]');
  await trip.selectOption('backpacking');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  await trip.selectOption('day-hike');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  const status = page.locator('[data-route-status]');
  await status.selectOption('off-trail');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  await status.selectOption('official');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  await shot(page, 'desktop-route-library');
  record('Route library static content and search/filter behavior', 'PASS');
  await context.close();
}

async function routePageAndArtifacts(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const response = await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert((await page.locator('link[rel="canonical"]').getAttribute('href') || '').endsWith('/routes/skybridge-arch/'));

  const body = await page.locator('body').innerText();
  for (const text of [
    'Skybridge Arch',
    '0.78 mi',
    'Mostly official trail',
    'Moderate',
    'Straightforward official-trail navigation',
    'Route information is not a safety or access guarantee.',
    'Sky Bridge Picnic Area',
    'Ryan reports no water on the route.',
    'Approved public waypoints',
    'Turnaround Overlook',
    'Download GPX',
    'Current land-manager resources'
  ]) assert(body.includes(text), text);

  assert(!/drive\.google\.com|RAW Gaia|PROPOSED|eagle.?nest/i.test(body));
  assert.strictEqual(await page.locator('.route-waypoint-list li').count(), 2);
  assert.strictEqual(await page.getByText('Skybridge Arch', { exact: true }).count() >= 1, true);
  assert.strictEqual(await page.getByText('Turnaround Overlook', { exact: true }).count() >= 1, true);

  const gpxHref = await page.getByRole('link', { name: 'Download GPX', exact: true }).getAttribute('href');
  assert(gpxHref);
  const gpxBytes = await fetchBytes(page, new URL(gpxHref, MAIN).href);
  assert.strictEqual(sha256(gpxBytes), GPX_SHA);

  const geoBytes = await fetchBytes(page, MAIN + 'data/routes/skybridge-arch-v1.geojson');
  assert.strictEqual(sha256(geoBytes), GEO_SHA);
  const geo = JSON.parse(Buffer.from(geoBytes).toString('utf8'));
  assert.strictEqual(geo.features.filter(f => f.geometry.type === 'LineString').length, 1);
  const waypointFeatures = geo.features.filter(f => f.geometry.type === 'Point');
  assert.deepStrictEqual(
    waypointFeatures.map(f => [f.properties.waypointId, f.properties.name, f.geometry.coordinates]),
    [
      ['WP-0001', 'Skybridge Arch', [-83.57903, 37.81886]],
      ['WP-0002', 'Turnaround Overlook', [-83.57684, 37.81913]]
    ]
  );

  const elevation = JSON.parse(await fetchText(page, MAIN + 'data/routes/skybridge-arch.elevation.json'));
  assert.strictEqual(elevation.routeId, 'RTE-0001');
  assert.strictEqual(elevation.sampleCount, 100);
  assert.strictEqual(elevation.source.id, 'usgs-3dep-bare-earth-dem');
  assert(elevation.stats.ascentFt >= 0 && elevation.stats.descentFt >= 0);
  assert(elevation.stats.maxElevationFt > elevation.stats.minElevationFt);
  assert(!body.includes('Not supplied in approved package') || body.includes('Duration'));

  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(t => JSON.parse(t));
  assert(schemas.some(s => s['@type'] === 'BreadcrumbList'));
  const dataset = schemas.find(s => s['@type'] === 'Dataset');
  assert(dataset && dataset.distribution && dataset.distribution['@type'] === 'DataDownload');

  const terms = await fetchText(page, MAIN + 'copyright-and-terms/');
  assert(terms.includes('GPX Download License'));
  assert(terms.includes('personal, noncommercial'));
  const privacy = await fetchText(page, MAIN + 'privacy/');
  assert(privacy.includes('Interactive Maps and Map-Data Services'));
  assert(privacy.includes('Third-party map-service requests are separate from RRGH Analytics'));

  const sitemapIndex = await fetchText(page, MAIN + 'sitemap-index.xml');
  assert(sitemapIndex.includes('sitemap-0.xml'));
  const sitemap = await fetchText(page, MAIN + 'sitemap-0.xml');
  assert(sitemap.includes('/routes/'));
  assert(sitemap.includes('/routes/skybridge-arch/'));
  assert(sitemap.includes('/routes/map/'));
  assert(sitemap.includes('/guides/kentucky-lidar/'));

  await shot(page, 'desktop-skybridge-route-page');
  record('Skybridge route page, legal controls, SEO/schema, approved GPX/GeoJSON/elevation artifacts', 'PASS', {
    gpxSha256: GPX_SHA,
    geojsonSha256: GEO_SHA,
    elevationStats: elevation.stats,
    elevationSamples: elevation.sampleCount
  });
  await context.close();
}

async function mapNetworkAndAccessibility(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const providerRequests = [];
  const providerResponses = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (PROVIDERS.includes(url.hostname) || url.hostname === 'elevation.nationalmap.gov') {
      providerRequests.push({ url: request.url(), host: url.hostname, referer: request.headers()['referer'] || null });
    }
  });
  page.on('response', async response => {
    const url = new URL(response.url());
    if (PROVIDERS.includes(url.hostname) || url.hostname === 'elevation.nationalmap.gov') {
      const headers = response.headers();
      providerResponses.push({ url: response.url(), host: url.hostname, status: response.status(), setCookie: headers['set-cookie'] || null });
    }
  });

  await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  assert.strictEqual(providerRequests.length, 0, 'External map provider request occurred before Load interactive map');

  await page.getByRole('button', { name: 'Load interactive map', exact: true }).click();
  await page.waitForTimeout(2500);
  assert(providerRequests.some(r => r.host === 'kygisserver.ky.gov'));
  assert(!providerRequests.some(r => r.host === 'elevation.nationalmap.gov'), 'Elevation provider must not be browser-loaded');

  const shell = page.locator('.route-map-shell').first();
  await shell.locator('[data-base-map]').selectOption('kyaerial-phase3');
  await page.waitForTimeout(1000);
  await shell.locator('[data-overlay="ky-hillshade"]').check();
  await page.waitForTimeout(1000);
  await shell.locator('[data-base-map]').selectOption('usgs-topo');
  await page.waitForTimeout(1800);
  assert(providerRequests.some(r => r.host === 'basemap.nationalmap.gov'));

  const unauthorized = providerRequests.filter(r => !PROVIDERS.includes(r.host));
  assert.strictEqual(unauthorized.length, 0);
  assert(providerRequests.every(r => !/gaia|caltopo|parcel/i.test(r.url)));
  assert(providerResponses.every(r => !r.setCookie), 'Approved map provider response set a cookie during UAT');
  const providerCookies = (await context.cookies()).filter(c => PROVIDERS.includes(c.domain.replace(/^\./, '')));
  assert.strictEqual(providerCookies.length, 0);

  await page.evaluate(() => {
    const map = document.querySelector('[data-rrgh-route-map]');
    if (map) map.focus();
  });
  const archMarker = page.locator('.leaflet-marker-icon[title="Skybridge Arch"]');
  const overlookMarker = page.locator('.leaflet-marker-icon[title="Turnaround Overlook"]');
  assert.strictEqual(await archMarker.count(), 1);
  assert.strictEqual(await overlookMarker.count(), 1);
  assert.strictEqual(await archMarker.getAttribute('tabindex'), '0');
  assert.strictEqual(await overlookMarker.getAttribute('tabindex'), '0');

  const sourceText = await shell.locator('.route-map-sources').textContent();
  assert(sourceText.includes('Kentucky Topo / KyTopo'));
  assert(sourceText.includes('Parcel / Private Property'));
  assert(sourceText.includes('Disabled'));

  await shot(page, 'desktop-skybridge-interactive-map');
  record('Map deliberate-load privacy boundary, exact provider network, no provider cookies, accessible approved waypoint markers', 'PASS', {
    providerRequestCount: providerRequests.length,
    providers: [...new Set(providerRequests.map(r => r.host))],
    requestExamples: providerRequests.slice(0, 8),
    responseExamples: providerResponses.slice(0, 8)
  });
  await context.close();
}

async function fullMapAndMobile(browser) {
  const desktop = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await desktop.newPage();
  await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (const label of ['Simple', 'Terrain', 'Route Planning', 'Land & Access', 'All Layers']) {
    assert.strictEqual(await page.getByRole('button', { name: label, exact: true }).count(), 1);
  }
  for (const label of ['Day hikes', 'Backpacking', 'Multi-day', 'Official / on-trail', 'Mixed', 'Selected off-trail']) {
    assert.strictEqual(await page.getByLabel(label, { exact: true }).count(), 1);
  }
  assert((await page.locator('body').innerText()).includes('Parcel/private-property boundaries are not enabled.'));
  await page.getByRole('button', { name: 'Load interactive map', exact: true }).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await page.getByRole('button', { name: 'Route Planning', exact: true }).click();
  await page.getByRole('button', { name: 'Land & Access', exact: true }).click();
  await page.getByRole('button', { name: 'All Layers', exact: true }).click();
  await shot(page, 'desktop-full-routes-map');
  await desktop.close();

  const mobile = await contextFor(browser, { viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mobile.newPage();
  for (const route of ['routes/', 'routes/skybridge-arch/', 'routes/map/', 'guides/kentucky-lidar/', 'privacy/', 'copyright-and-terms/']) {
    const response = await mp.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), route);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 2, `mobile horizontal overflow on ${route}: ${overflow}`);
  }
  await mp.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await shot(mp, 'mobile-skybridge-route');
  record('Full map preset/filter smoke and mobile no-horizontal-overflow', 'PASS');
  await mobile.close();
}

async function exploreIntegration(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const menu = page.locator('.desktop-nav .nav-details-explore');
  await menu.locator(':scope > summary').hover();
  assert.strictEqual(await menu.getByRole('link', { name: 'RRGH Hikes & Routes', exact: true }).count(), 1);
  assert.strictEqual(await menu.getByRole('link', { name: 'RRGH Interactive Map', exact: true }).count(), 1);
  assert.strictEqual(await menu.getByRole('link', { name: 'Kentucky LiDAR Guide', exact: true }).count(), 1);

  await page.goto(MAIN + 'guides/kentucky-lidar/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const guide = await page.locator('body').innerText();
  assert(guide.includes('Kentucky LiDAR & Custom Map Sources'));
  assert(guide.includes('Gaia GPS'));
  assert(guide.includes('CalTopo'));
  assert(guide.includes('Last reviewed: September 23, 2026'));
  record('Explore navigation and LiDAR guide integration', 'PASS');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1']
  });
  let failure = null;
  try {
    await routeLibrary(browser);
    await routePageAndArtifacts(browser);
    await mapNetworkAndAccessibility(browser);
    await fullMapAndMobile(browser);
    await exploreIntegration(browser);
  } catch (error) {
    failure = error;
    record('Routes UAT fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(EVIDENCE, 'routes-uat-results.json'), JSON.stringify({
      sourceRef: process.env.SOURCE_REF || null,
      generatedAt: new Date().toISOString(),
      results
    }, null, 2));
  }
  if (failure) process.exit(1);
})();
