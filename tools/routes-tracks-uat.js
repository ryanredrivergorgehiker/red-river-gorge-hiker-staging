const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const EVIDENCE = path.resolve('routes-tracks-uat-evidence');
const TILE_HOSTS = new Set(['kygisserver.ky.gov', 'basemap.nationalmap.gov']);
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3JmAAAAAElFTkSuQmCC', 'base64');
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
async function installTileStubs(page, providerRequests) {
  page.on('request', request => {
    const url = new URL(request.url());
    if (TILE_HOSTS.has(url.hostname)) providerRequests.push(request.url());
  });
  await page.route('https://kygisserver.ky.gov/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }));
  await page.route('https://basemap.nationalmap.gov/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }));
}
async function sha256Hex(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${target}`);
    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
  }, url);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function routeLibraryAndDetail(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const providerRequests = [];
  await installTileStubs(page, providerRequests);

  let response = await page.goto(MAIN + 'routes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert((await page.locator('link[rel="canonical"]').getAttribute('href') || '').endsWith('/routes/'));
  assert.strictEqual(await page.locator('[data-route-card]').count(), 1);
  assert.strictEqual((await page.locator('[data-route-card] h2').innerText()).trim(), 'Skybridge Arch');
  assert((await page.locator('body').innerText()).includes('0.78 mi'));
  assert.strictEqual(providerRequests.length, 0, 'Route library must not issue map-provider requests.');

  response = await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert((await page.locator('link[rel="canonical"]').getAttribute('href') || '').endsWith('/routes/skybridge-arch/'));
  const body = await page.locator('body').innerText();
  assert(body.includes('Skybridge Arch'));
  assert(body.includes('Class A'));
  assert(body.includes('Publication Ready'));
  assert(body.includes('0.78 mi'));
  assert(body.includes('Mostly official trail'));
  assert(body.includes('Route information is not a safety or access guarantee.'));
  assert(body.includes('Skybridge Arch (Landmark)'));
  assert(body.includes('Turnaround Overlook (Viewpoint)'));
  assert(body.includes('No overnight camping at the Sky Bridge picnic/parking area'));
  assert(body.includes('No external map tiles are requested until you load the interactive map.'));
  assert.strictEqual(providerRequests.length, 0, 'Route detail must not issue map-provider requests before activation.');

  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(text => JSON.parse(text));
  const dataset = schemas.find(schema => schema['@type'] === 'Dataset');
  assert(dataset, 'Dataset structured data missing.');
  assert(dataset.distribution && dataset.distribution['@type'] === 'DataDownload');
  assert(dataset.distribution.contentUrl.endsWith('/downloads/routes/Skybridge_Arch_APPROVED_v1.gpx'));
  assert(dataset.license.endsWith('/copyright-and-terms/#gpx-download-license'));

  const gpx = page.getByRole('link', { name: 'Download GPX', exact: true });
  assert.strictEqual(await gpx.count(), 1);
  const gpxHref = await gpx.getAttribute('href');
  assert(gpxHref && gpxHref.endsWith('/downloads/routes/Skybridge_Arch_APPROVED_v1.gpx'));
  assert.strictEqual(await gpx.getAttribute('download'), 'Skybridge_Arch_APPROVED_v1.gpx');

  const gpxHash = await sha256Hex(page, MAIN + 'downloads/routes/Skybridge_Arch_APPROVED_v1.gpx');
  const geoHash = await sha256Hex(page, MAIN + 'data/routes/skybridge-arch-v1.geojson');
  assert.strictEqual(gpxHash, '2469c85ebaddd3e701ba6dc8eea3664d90a0667dcd86f2aab43ae1445986830d');
  assert.strictEqual(geoHash, '123fdb57e1142299f86c714367cc466b70f18fa90cfbaabb92b0d9ced157dc66');

  const elevation = await page.evaluate(async () => {
    const response = await fetch('/data/routes/skybridge-arch.elevation.json');
    if (!response.ok) throw new Error(`elevation HTTP ${response.status}`);
    return response.json();
  });
  assert.strictEqual(elevation.routeId, 'RTE-0001');
  assert.strictEqual(elevation.source.id, 'usgs-3dep-bare-earth-dem');
  assert.strictEqual(elevation.sampleCount, 100);
  assert.strictEqual(elevation.points.length, 100);
  assert(elevation.stats.maxElevationFt > elevation.stats.minElevationFt);
  assert((await page.locator('.elevation-profile figcaption').innerText()).includes('Build-time sampling only'));

  await page.getByRole('button', { name: 'Load interactive map', exact: true }).click();
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForTimeout(800);
  assert(providerRequests.length > 0, 'Map activation must request an approved browser map source.');
  assert(providerRequests.every(url => TILE_HOSTS.has(new URL(url).hostname)));
  assert.strictEqual(await page.locator('.route-waypoint-icon').count(), 2);
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await page.waitForTimeout(300);
  assert(providerRequests.some(url => url.includes('Ky_MultiDirectional_Hillshade_WGS84WM')));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, `Desktop route detail horizontal overflow: ${overflow}`);
  await shot(page, 'desktop-skybridge-route-map-elevation');

  record('Skybridge route detail, exact artifacts, structured data, elevation, delayed map-provider requests and approved waypoints', 'PASS', {
    gpxHash,
    geoHash,
    providerRequestCount: providerRequests.length,
    elevationStats: elevation.stats
  });
  await context.close();
}

async function fullMapAndFilters(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const providerRequests = [];
  await installTileStubs(page, providerRequests);
  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert.strictEqual(providerRequests.length, 0);
  for (const name of ['Simple', 'Terrain', 'Route Planning', 'Land & Access', 'All Layers']) {
    assert.strictEqual(await page.getByRole('button', { name, exact: true }).count(), 1);
  }
  for (const name of ['Day hikes', 'Backpacking', 'Multi-day', 'Official / on-trail', 'Mixed', 'Selected off-trail']) {
    assert.strictEqual(await page.getByText(name, { exact: true }).count(), 1);
  }
  await page.getByRole('button', { name: 'Load interactive map', exact: true }).click();
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForTimeout(700);
  assert(providerRequests.length > 0);
  await page.getByRole('button', { name: 'Land & Access', exact: true }).click();
  await page.waitForTimeout(400);
  assert(providerRequests.some(url => url.includes('basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/')));
  const sources = await page.locator('.route-map-sources').innerText();
  assert(sources.includes('Parcel / Private Property'));
  assert(sources.includes('Disabled. No authorized source is approved under LEG-DEC-0028.'));
  assert(sources.includes('USFS Trails / Roads / MVUM / Wilderness / NFS Land Units'));
  await shot(page, 'desktop-full-routes-map');
  record('Full map presets, route filters, approved USGS/Kentucky browser sources and disabled parcel source', 'PASS', { providerRequestCount: providerRequests.length });
  await context.close();
}

async function legalGuideAndPublicData(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let response = await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  let text = await page.locator('body').innerText();
  for (const phrase of [
    'Routes, Maps, GPS Tracks, and Location Information',
    'Outdoor and Backcountry Risk; User Responsibility',
    'Conditions, Closures, and Navigation',
    'Property, Boundaries, and Access',
    'Off-Trail and Unmaintained Routes',
    'GPX Download License',
    'Map, Data, and Third-Party Sources'
  ]) assert(text.includes(phrase), phrase);

  response = await page.goto(MAIN + 'privacy/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  text = await page.locator('body').innerText();
  assert(text.includes('Last updated: September 23, 2026'));
  assert(text.includes('Interactive Maps and Map-Data Services'));
  assert(text.includes('Third-party map-service requests are separate from RRGH Analytics.'));

  response = await page.goto(MAIN + 'guides/kentucky-lidar/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  text = await page.locator('body').innerText();
  assert(text.includes('Kentucky LiDAR & Custom Map Sources'));
  assert(text.includes('Gaia GPS'));
  assert(text.includes('CalTopo'));
  assert(text.includes('does not publish or redistribute Gaia proprietary/Premium overlays'));

  const data = await page.evaluate(async () => {
    const response = await fetch('/data/routes/index.json');
    if (!response.ok) throw new Error(`route data HTTP ${response.status}`);
    return response.json();
  });
  assert.strictEqual(data.length, 1);
  assert.strictEqual(data[0].routeId, 'RTE-0001');
  assert.strictEqual(data[0].slug, 'skybridge-arch');
  assert.strictEqual(data[0].waypointCount, 2);
  assert.strictEqual(data[0].gpxUrl, '/downloads/routes/Skybridge_Arch_APPROVED_v1.gpx');

  record('Routes Legal/Privacy addenda, LiDAR guide and public route-data endpoint', 'PASS');
  await context.close();
}

async function mobileSmoke(browser) {
  const context = await preparedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const providerRequests = [];
  await installTileStubs(page, providerRequests);
  for (const route of ['routes/', 'routes/skybridge-arch/', 'routes/map/', 'guides/kentucky-lidar/']) {
    const response = await page.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 2, `Mobile horizontal overflow on ${route}: ${overflow}`);
  }
  assert.strictEqual(providerRequests.length, 0, 'Mobile pages must not contact map providers without activation.');
  await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await shot(page, 'mobile-skybridge-route');
  record('Mobile route/library/map/guide responsive smoke and no pre-activation provider requests', 'PASS');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'] });
  let failure = null;
  try {
    await routeLibraryAndDetail(browser);
    await fullMapAndFilters(browser);
    await legalGuideAndPublicData(browser);
    await mobileSmoke(browser);
  } catch (error) {
    failure = error;
    record('Routes & Tracks UAT fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(EVIDENCE, 'routes-tracks-uat-results.json'), JSON.stringify(results, null, 2));
  }
  if (failure) process.exit(1);
})();
