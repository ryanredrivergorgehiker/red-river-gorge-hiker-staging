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
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3JmAAAAAElFTkSuQmCC',
  'base64'
);
const TRAILS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { trail_name: 'Sky Bridge Trail', trail_no: '214' },
    geometry: { type: 'LineString', coordinates: [
      [-83.58262, 37.81765], [-83.58010, 37.81832], [-83.57903, 37.81886], [-83.57688, 37.81915]
    ] }
  }]
};
const ROADS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Sky Bridge Road', id: '10' },
    geometry: { type: 'LineString', coordinates: [
      [-83.589, 37.8145], [-83.585, 37.816], [-83.5828, 37.8175]
    ] }
  }]
};
const KENTUCKY_ROADS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { LSt_Name: 'KY 715', St_Name: 'KY 715', RoadClass: 'State Route', SpeedLimit: 55, OneWay: 'N' },
    geometry: { type: 'LineString', coordinates: [
      [-83.6212, 37.8112], [-83.6208, 37.8103], [-83.62045, 37.8094], [-83.62005, 37.8085], [-83.61985, 37.8075]
    ] }
  }]
};

const COUNTIES = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { NAME: 'Powell' }, geometry: { type: 'Polygon', coordinates: [[[-83.92,37.72],[-83.55,37.72],[-83.55,38.02],[-83.92,38.02],[-83.92,37.72]]] } },
    { type: 'Feature', properties: { NAME: 'Menifee' }, geometry: { type: 'Polygon', coordinates: [[[-83.61,37.78],[-83.31,37.78],[-83.31,38.05],[-83.61,38.05],[-83.61,37.78]]] } },
    { type: 'Feature', properties: { NAME: 'Wolfe' }, geometry: { type: 'Polygon', coordinates: [[[-83.76,37.53],[-83.43,37.53],[-83.43,37.83],[-83.76,37.83],[-83.76,37.53]]] } },
    { type: 'Feature', properties: { NAME: 'Lee' }, geometry: { type: 'Polygon', coordinates: [[[-83.70,37.45],[-83.39,37.45],[-83.39,37.75],[-83.70,37.75],[-83.70,37.45]]] } }
  ]
};

const RECREATION = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { site_name: 'Sky Bridge Trailhead', public_site_name: 'Sky Bridge Trailhead', site_type: 'TRAILHEAD', seasonal_operational_status: 'OPEN' },
    geometry: { type: 'Point', coordinates: [-83.5827, 37.8176] }
  }]
};

const OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [{
    type: 'way',
    id: 123456,
    tags: { highway: 'path', informal: 'yes', name: 'Community Path', trail_visibility: 'intermediate' },
    geometry: [
      { lat: 37.8181, lon: -83.5834 },
      { lat: 37.8185, lon: -83.5828 },
      { lat: 37.8189, lon: -83.5821 }
    ]
  }]
};

fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];

const sha256 = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const record = (name, status, details = {}) => {
  results.push({ name, status, ...details });
  console.log('[' + status + '] ' + name, JSON.stringify(details));
};

async function setCookie(context, name, value) {
  await context.addCookies([{
    name,
    value,
    domain: '.redrivergorgehiker.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax'
  }]);
}

async function contextFor(browser, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  return context;
}

async function installStubs(page) {
  await page.route('https://kygisserver.ky.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('Ky_CountyLines_WGS84WM') && url.includes('/query?')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(COUNTIES) });
    } else if (url.includes('Ky_911_Road_Centerlines_WGS84WM') && url.includes('/query?')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(KENTUCKY_ROADS) });
    } else {
      await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
    }
  });
  await page.route('https://basemap.nationalmap.gov/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
  await page.route('https://apps.fs.usda.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('EDW_TrailNFSPublishWithDataStatus_01')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(TRAILS) });
    } else if (url.includes('EDW_RoadBasic_01')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(ROADS) });
    } else if (url.includes('EDW_RecInfraRecreationSites_02')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(RECREATION) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) });
    }
  });
  await page.route('https://overpass.private.coffee/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OSM) })
  );
  await page.route('https://overpass-api.de/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OSM) })
  );
  await page.route('https://maps.mail.ru/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OSM) })
  );
}

async function fetchBytes(page, url) {
  const values = await page.evaluate(async u => {
    const response = await fetch(u);
    if (!response.ok) throw new Error(u + ': HTTP ' + response.status);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, url);
  return Uint8Array.from(values);
}

async function fetchText(page, url) {
  return page.evaluate(async u => {
    const response = await fetch(u);
    if (!response.ok) throw new Error(u + ': HTTP ' + response.status);
    return response.text();
  }, url);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, name + '.png'), fullPage: true });
}

async function routeLibrary(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const response = await page.goto(MAIN + 'routes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert.strictEqual(await page.locator('[data-route-card]').count(), 1);
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');
  assert.strictEqual(await page.getByRole('link', { name: 'Skybridge Arch', exact: true }).count(), 1);

  const pageText = await page.locator('body').innerText();
  assert(pageText.includes('Field-tested routes'));
  assert(!pageText.includes('Class A'));
  assert(!pageText.includes('publication process'));
  assert(!pageText.includes('Lane 19'));

  const search = page.locator('[data-route-search]');
  await search.fill('nothing-here');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  assert(await page.locator('[data-route-empty]').isVisible());
  await search.fill('Skybridge');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  const trip = page.locator('[data-route-trip]');
  await trip.selectOption('backpacking');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  await trip.selectOption('day-hike');
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  await shot(page, 'desktop-route-library');
  record('Route library public copy and filters', 'PASS');
  await context.close();
}

async function routeArtifactsAndContent(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await installStubs(page);

  const response = await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  assert((await page.locator('link[rel="canonical"]').getAttribute('href') || '').endsWith('/routes/skybridge-arch/'));

  const body = await page.locator('body').innerText();
  for (const expected of [
    'Skybridge Arch',
    '0.78 mi',
    'Mostly official trail',
    'Moderate',
    'Straightforward official-trail navigation',
    'Route information is not a safety or access guarantee.',
    'Sky Bridge Picnic Area',
    'Ryan reports no water on the route.',
    'Landmarks & viewpoints',
    'Turnaround Overlook',
    'Download GPX',
    'Current land-manager resources',
    'Map & route data sources'
  ]) assert(body.includes(expected), expected);

  for (const forbidden of [
    'Approved public waypoints',
    'Publication Ready',
    'Class A',
    'Lane 19',
    'Approved route shape',
    'Approved web geometry',
    'SHA-256'
  ]) assert(!body.includes(forbidden), forbidden);

  assert(!/drive\.google\.com|RAW Gaia|PROPOSED|eagle.?nest/i.test(body));
  assert.strictEqual(await page.locator('.route-waypoint-list li').count(), 2);

  const gpxHref = await page.getByRole('link', { name: 'Download GPX', exact: true }).getAttribute('href');
  assert(gpxHref);
  const gpxBytes = await fetchBytes(page, new URL(gpxHref, MAIN).href);
  assert.strictEqual(sha256(gpxBytes), GPX_SHA);

  const geoBytes = await fetchBytes(page, MAIN + 'data/routes/skybridge-arch-v1.geojson');
  assert.strictEqual(sha256(geoBytes), GEO_SHA);
  const geo = JSON.parse(Buffer.from(geoBytes).toString('utf8'));
  assert.strictEqual(geo.features.filter(feature => feature.geometry.type === 'LineString').length, 1);
  assert.strictEqual(geo.features.filter(feature => feature.geometry.type === 'Point').length, 2);

  const elevation = JSON.parse(await fetchText(page, MAIN + 'data/routes/skybridge-arch.elevation.json'));
  assert.strictEqual(elevation.routeId, 'RTE-0001');
  assert.strictEqual(elevation.sampleCount, 100);
  assert.strictEqual(elevation.points.length, 100);
  assert.strictEqual(elevation.source.id, 'usgs-3dep-bare-earth-dem');
  assert(elevation.stats.maxElevationFt > elevation.stats.minElevationFt);

  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(text => JSON.parse(text));
  assert(schemas.some(schema => schema['@type'] === 'BreadcrumbList'));
  const dataset = schemas.find(schema => schema['@type'] === 'Dataset');
  assert(dataset && dataset.distribution && dataset.distribution['@type'] === 'DataDownload');
  assert(dataset.distribution.contentUrl.endsWith('/downloads/routes/Skybridge_Arch_APPROVED_v1.gpx'));
  assert(dataset.license.endsWith('/copyright-and-terms/#gpx-download-license'));

  const osmCache = JSON.parse(await fetchText(page, MAIN + 'data/map/osm-informal-trails.geojson'));
  assert.strictEqual(osmCache.type, 'FeatureCollection');
  assert(osmCache.features.length > 100, 'OSM cache should contain substantial community trail coverage');
  assert(osmCache.features.every(feature => {
    const coords = feature.geometry && feature.geometry.coordinates;
    if (!Array.isArray(coords) || !coords.length) return false;
    const [lon, lat] = coords[0];
    return lat >= 37.3 && lat <= 38.2 && lon >= -84.1 && lon <= -83.1;
  }), 'OSM cache should contain Kentucky-area geometry only');

  const sitemapIndex = await fetchText(page, MAIN + 'sitemap-index.xml');
  assert(sitemapIndex.includes('sitemap-0.xml'));
  const sitemap = await fetchText(page, MAIN + 'sitemap-0.xml');
  for (const route of ['/routes/', '/routes/skybridge-arch/', '/routes/map/', '/guides/kentucky-lidar/']) {
    assert(sitemap.includes(route), route);
  }

  await shot(page, 'desktop-route-artifacts');
  record('Route content, exact public artifacts, elevation and SEO/schema', 'PASS', {
    gpxSha256: GPX_SHA,
    geojsonSha256: GEO_SHA,
    elevationSamples: elevation.sampleCount,
    elevationStats: elevation.stats
  });

  await context.close();
}

async function mapControlsAndAccessibility(browser) {
  const context = await contextFor(browser, { viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installStubs(page);

  await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-map-tool="plan"]');
    return button && !button.disabled;
  }, { timeout: 10000 });

  assert.strictEqual(await page.locator('[data-map-layer]').count(), 17);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 16);
  assert.strictEqual(await page.locator('[data-map-layer="sunrise-sunset-potential"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="sunrise-sunset-potential"]').inputValue(), '68');
  for (const id of ['sun-cal-ridge-skeleton','sun-cal-crest','sun-cal-overlook','sun-cal-open-ground','sun-cal-sunrise-pass','sun-cal-sunset-pass']) {
    assert.strictEqual(await page.locator('[data-map-layer="' + id + '"]').isChecked(), false, id + ' should be off by default');
  }
  assert.strictEqual(await page.locator('[data-context-full-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.locator('[data-plan-pan]').count(), 0);
  assert.strictEqual(await page.locator('[data-plan-pan-pad]').count(), 1);
  assert.strictEqual(await page.locator('[data-plan-pan-direction]').count(), 4);
  assert.strictEqual(await page.locator('[data-staging-copy-map-view]').count(), 0);
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  assert.strictEqual(await page.getByRole('button', { name: 'Explore', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Plan', exact: true }).count(), 1);
  assert.strictEqual(await page.locator('[data-map-tool="measure"]').count(), 1);
  assert.strictEqual(await page.locator('[data-map-tool="plan"]').count(), 1);
  assert.strictEqual(await page.locator('[data-map-tool="save"]').count(), 1);
  assert.strictEqual(await page.locator('[data-plan-action="undo"]').count(), 1);
  assert.strictEqual(await page.locator('[data-plan-action="redo"]').count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Search map', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Show my location', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Reset map view', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Load interactive map', exact: true }).count(), 0);

  const arch = page.locator('.leaflet-marker-icon[title="Skybridge Arch"]');
  const overlook = page.locator('.leaflet-marker-icon[title="Turnaround Overlook"]');
  assert.strictEqual(await arch.count(), 1);
  assert.strictEqual(await overlook.count(), 1);
  assert.strictEqual(await arch.getAttribute('tabindex'), '0');
  assert.strictEqual(await overlook.getAttribute('tabindex'), '0');

  await page.locator('.route-layer-panel > summary').click();
  await page.locator('[data-map-layer="kyaerial-phase3"]').check();
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), false, 'Aerial should turn LiDAR hillshade off.');
  await page.locator('.route-layer-fine-tune > summary', { hasText: 'Fine tune layers' }).click();
  await page.locator('[data-opacity="kyaerial-phase3"]').fill('42');
  const aerialOpacity = await page.locator('.leaflet-baseAerial-pane .leaflet-layer').first().evaluate(element => getComputedStyle(element).opacity);
  assert(Math.abs(Number(aerialOpacity) - 0.42) < 0.02);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, 'Desktop map horizontal overflow: ' + overflow);
  assert.deepStrictEqual(pageErrors, []);

  await shot(page, 'desktop-map-controls');
  record('Map controls, layer opacity and accessible landmarks', 'PASS', { aerialOpacity });
  await context.close();
}

async function legalExploreAndMobile(browser) {
  const context = await contextFor(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.goto(MAIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const explore = page.locator('.desktop-nav .nav-details-explore');
  await explore.locator(':scope > summary').hover();
  assert.strictEqual(await explore.getByRole('link', { name: 'RRGH Hikes & Routes', exact: true }).count(), 1);
  assert.strictEqual(await explore.getByRole('link', { name: 'RRGH Interactive Map', exact: true }).count(), 1);
  assert.strictEqual(await explore.getByRole('link', { name: 'Kentucky LiDAR Guide', exact: true }).count(), 1);

  await page.goto(MAIN + 'privacy/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let body = await page.locator('body').innerText();
  assert(body.includes('Interactive Maps and Map-Data Services'));
  assert(body.includes('default map layers begin loading immediately'));
  assert(body.includes('USDA Forest Service Enterprise Data Warehouse'));
  assert(body.includes('RRGH-hosted cache derived from OpenStreetMap data'));
  assert(body.includes('If you choose “My location,”'));

  await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  body = await page.locator('body').innerText();
  for (const expected of [
    'Routes, Maps, GPS Tracks, and Location Information',
    'Outdoor and Backcountry Risk; User Responsibility',
    'Property, Boundaries, and Access',
    'GPX Download License',
    'Map, Data, and Third-Party Sources',
    'Community / Informal Trails',
    'Property and parcel boundaries are not displayed'
  ]) assert(body.includes(expected), expected);

  await page.goto(MAIN + 'guides/kentucky-lidar/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  body = await page.locator('body').innerText();
  assert(body.includes('Kentucky LiDAR & Custom Map Sources'));
  assert(body.includes('Gaia GPS'));
  assert(body.includes('CalTopo'));

  await context.close();

  const mobile = await contextFor(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mobile.newPage();
  await installStubs(mp);
  for (const route of ['routes/', 'routes/skybridge-arch/', 'routes/map/', 'privacy/', 'copyright-and-terms/']) {
    const response = await mp.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), route);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 2, 'Mobile horizontal overflow on ' + route + ': ' + overflow);
  }
  await mp.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mp.waitForSelector('.leaflet-container', { timeout: 10000 });
  await shot(mp, 'mobile-full-map');

  record('Explore integration, Legal/Privacy and mobile responsiveness', 'PASS');
  await mobile.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1']
  });

  let failure = null;
  try {
    await routeLibrary(browser);
    await routeArtifactsAndContent(browser);
    await mapControlsAndAccessibility(browser);
    await legalExploreAndMobile(browser);
  } catch (error) {
    failure = error;
    record('Routes UAT fatal assertion', 'FAIL', {
      error: String(error),
      stack: error && error.stack ? error.stack : null
    });
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(EVIDENCE, 'routes-uat-results.json'),
      JSON.stringify({ sourceRef: process.env.SOURCE_REF || null, generatedAt: new Date().toISOString(), results }, null, 2)
    );
  }

  if (failure) process.exit(1);
})();
