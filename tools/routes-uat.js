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
const TIGER_LOCAL_ROADS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { OID: '110206092934', OBJECTID: 71001, NAME: 'Cliffty School Rd', BASENAME: 'Cliffty School', MTFCC: 'S1400' },
    geometry: { type: 'LineString', coordinates: [
      [-83.534169, 37.818022], [-83.5395192, 37.8220013], [-83.5412758, 37.8220356], [-83.5415103, 37.8219694], [-83.5434416, 37.8218673]
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

async function installStubs(page, tigerMode = 'stub') {
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
  await page.route('https://tigerweb.geo.census.gov/**', async route => {
    const url = route.request().url();
    if (!url.includes('TIGERweb/tigerWMS_PhysicalFeatures/MapServer/5/query?')) return route.abort();
    if (tigerMode === 'fail') return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(TIGER_LOCAL_ROADS) });
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

  const dayHike = page.locator('[data-route-category-filter="day-hike"]');
  const backpacking = page.locator('[data-route-category-filter="backpacking"]');
  const offTrail = page.locator('[data-route-category-filter="off-trail"]');
  assert.strictEqual(await page.locator('[data-route-category-filter]').count(), 3);
  assert.strictEqual(await page.getByText('Multi-day', { exact: true }).count(), 0);
  assert.strictEqual(await page.getByText('Official / on-trail', { exact: true }).count(), 0);
  assert.strictEqual(await page.getByText('Mixed', { exact: true }).count(), 0);

  await dayHike.uncheck();
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  await dayHike.check();
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');

  await backpacking.uncheck();
  await offTrail.uncheck();
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '1 route');
  await dayHike.uncheck();
  assert.strictEqual((await page.locator('[data-route-count]').innerText()).trim(), '0 routes');
  await dayHike.check();
  await offTrail.check();
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
    'Day hike',
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

  assert.strictEqual(await page.locator('[data-map-layer]').count(), 14);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 13);
  assert.strictEqual(await page.locator('[data-context-full-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.locator('[data-map-layer="kgs-oil-gas-wells"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="kgs-oil-gas-wells"]').isDisabled(), true);
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
  assert.strictEqual(await page.locator('[data-map-layer="pinch-lidar-sun-pilot"]').count(), 0, 'Historical pilot must be removed from public layer UI');
  assert.strictEqual(await page.getByText('Sunrise / Sunset Potential', { exact: true }).count() >= 1, true);
  assert.strictEqual(await page.getByText('Sunrise Potential', { exact: true }).count(), 1);
  assert.strictEqual(await page.getByText('Sunset Potential', { exact: true }).count(), 1);
  assert.strictEqual((await page.locator('.route-layer-panel').innerText()).includes('Potential does not guarantee standing room'), false);
  await page.locator('.route-layer-fine-tune > summary').click();
  assert.strictEqual(await page.locator('[data-fine-tune-layer]').count(), 13);
  assert.strictEqual(await page.locator('[data-fine-tune-layer="rrg-lidar-sun"]').count(), 1);
  assert.strictEqual(await page.locator('[data-opacity="rrg-lidar-sun"]').count(), 1);
  assert.strictEqual(await page.locator('[data-fine-tune-layer="rrg-lidar-sunrise"]').count(), 0);
  assert.strictEqual(await page.locator('[data-fine-tune-layer="rrg-lidar-sunset"]').count(), 0);
  const reliefFineToggle = page.locator('[data-fine-tune-layer="ky-hillshade"]');
  assert.strictEqual(await reliefFineToggle.isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true);
  await reliefFineToggle.check();
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), false);
  assert(Number(await page.locator('[data-opacity="ky-hillshade"]').inputValue()) >= 75);
  await reliefFineToggle.uncheck();
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true);
  const leafOnAerial = page.locator('[data-map-layer="kyaerial-phase3"]');
  const leafOffAerial = page.locator('[data-map-layer="kyaerial-phase2-leafoff"]');
  await leafOnAerial.check();
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), false, 'Leaf-on aerial should turn LiDAR hillshade off.');
  assert.strictEqual(await leafOffAerial.isChecked(), false);
  await leafOffAerial.check();
  assert.strictEqual(await leafOffAerial.isChecked(), true);
  assert.strictEqual(await leafOnAerial.isChecked(), false, 'Leaf-off aerial must exclude Leaf-on aerial');
  await leafOnAerial.check();
  assert.strictEqual(await leafOffAerial.isChecked(), false, 'Leaf-on aerial must exclude Leaf-off aerial');
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


async function tigerLocalRoadLabelAndSnapAcceptance(browser) {
  const context = await contextFor(browser, { viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await installStubs(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  const target = MAIN + 'routes/map/?rrghMap=37.8221290,-83.5413910,15';
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-rrgh-route-map]');
    return map?.getAttribute('data-local-road-load-state') === 'loaded'
      && Number(map?.getAttribute('data-local-road-label-count') || 0) > 0
      && Number(map?.getAttribute('data-local-road-planning-feature-count') || 0) > 0
      && map?.getAttribute('data-trail-planning-ready') === 'true';
  }, { timeout: 12000 });

  const map = page.locator('[data-rrgh-route-map]');
  assert.strictEqual(await map.getAttribute('data-local-road-tiger-clifty-found'), 'true');
  assert(Number(await map.getAttribute('data-local-road-label-count')) > 0, 'Named TIGER local roads should receive close-zoom labels');
  assert(Number(await map.getAttribute('data-local-road-planning-feature-count')) > 0, 'Loaded local-road geometry should be indexed into the planner');

  const roadLabels = await page.locator('.rrgh-local-road-label').allTextContents();
  assert(roadLabels.some(text => /Cliffty School Rd/i.test(text)), 'Cliffty School Rd label should be visible: ' + JSON.stringify(roadLabels));

  const planOpen = page.locator('.route-map-tools').getByRole('button', { name: 'Plan', exact: true });
  await planOpen.click();
  const planPanel = page.locator('[data-map-sheet="plan"]');
  const build = planPanel.getByRole('button', { name: 'Build trail route', exact: true });
  await build.click();

  const mapCanvas = page.locator('.leaflet-container');
  const box = await mapCanvas.boundingBox();
  assert(box);
  const zoom = 15;
  const scale = 256 * (2 ** zoom);
  const project = (lat, lng) => {
    const sin = Math.sin(lat * Math.PI / 180);
    return {
      x: ((lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    };
  };
  const center = project(37.8221290, -83.5413910);
  const mapPosition = (lat, lng) => {
    const point = project(lat, lng);
    return {
      x: box.width / 2 + (point.x - center.x),
      y: box.height / 2 + (point.y - center.y)
    };
  };
  // Two exact coordinates on the deterministic TIGER fixture. Using map
  // projection rather than broad viewport percentages proves the planner is
  // snapping to this road instead of merely landing near some other network.
  const roadPointA = mapPosition(37.8220356, -83.5412758);
  const roadPointB = mapPosition(37.8220013, -83.5395192);
  await mapCanvas.click({ position: roadPointA });
  await page.waitForTimeout(120);
  await mapCanvas.click({ position: roadPointB });
  await page.waitForTimeout(300);

  const status = await page.locator('[data-map-status]').innerText();
  assert(status.includes('1 snapped segment(s), 0 off-trail segment(s)'), 'Local-road planner clicks should snap along TIGER geometry; status=' + status);
  assert.deepStrictEqual(pageErrors, []);

  await shot(page, 'tiger-local-road-label-and-snap');
  record('TIGER Local / other roads labels and route snapping', 'PASS', {
    labelCount: Number(await map.getAttribute('data-local-road-label-count')),
    planningFeatureCount: Number(await map.getAttribute('data-local-road-planning-feature-count')),
    status
  });
  await context.close();
}


async function cachedOsmLocalRoadAcceptance(browser) {
  const context = await contextFor(browser, { viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await installStubs(page, 'fail');
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  const target = MAIN + 'routes/map/?rrghMap=37.8221290,-83.5413910,15';
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-local-road-load-state') === 'loaded',
    { timeout: 10000 }
  );

  const map = page.locator('[data-rrgh-route-map]');
  assert.strictEqual(
    await map.getAttribute('data-local-road-osm-clifty-found'),
    'true',
    'The RRGH-hosted OSM road cache must supply Clifty/Cliffty School Road at the owner acceptance location'
  );
  assert(Number(await map.getAttribute('data-local-road-osm-feature-count')) > 0, 'OSM Local / other roads should render cached viewport geometry');
  assert.strictEqual(
    await map.getAttribute('data-local-road-tiger-feature-count'),
    '0',
    'This acceptance check intentionally fails TIGERweb so the broader cached OSM fallback is proved independently'
  );
  const status = (await page.locator('[data-local-roads-status]').textContent()) || '';
  assert.strictEqual(await map.getAttribute('data-local-road-osm-mode'), 'fallback');
  assert(status.includes('cached OpenStreetMap fallback road context'), status);
  assert(status.includes('does not establish public access, maintenance, legal travel, or current drivability'), status);
  assert.deepStrictEqual(pageErrors, []);

  await shot(page, 'cached-osm-local-road-clifty-acceptance');
  record('Cached OSM Local / other roads covers Clifty owner acceptance location', 'PASS', {
    osmFeatureCount: Number(await map.getAttribute('data-local-road-osm-feature-count'))
  });
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


async function liveLocalRoadSourceAudit() {
  const target = { lat: 37.822129, lon: -83.541391 };
  const bbox = { south: 37.815, west: -83.550, north: 37.829, east: -83.532 };

  const toXY = (lat, lon) => {
    const lat0 = target.lat * Math.PI / 180;
    return {
      x: (lon - target.lon) * 111320 * Math.cos(lat0),
      y: (lat - target.lat) * 110540
    };
  };
  const segmentDistance = (a, b) => {
    const p = { x: 0, y: 0 };
    const aa = toXY(a[1], a[0]);
    const bb = toXY(b[1], b[0]);
    const vx = bb.x - aa.x;
    const vy = bb.y - aa.y;
    const denom = vx * vx + vy * vy;
    const t = denom ? Math.max(0, Math.min(1, (-(aa.x * vx + aa.y * vy)) / denom)) : 0;
    const x = aa.x + t * vx;
    const y = aa.y + t * vy;
    return Math.hypot(x - p.x, y - p.y);
  };
  const lineDistance = coords => {
    if (!Array.isArray(coords) || coords.length === 0) return Infinity;
    if (typeof coords[0]?.[0] === 'number') {
      if (coords.length === 1) {
        const p = toXY(coords[0][1], coords[0][0]);
        return Math.hypot(p.x, p.y);
      }
      let best = Infinity;
      for (let i = 1; i < coords.length; i += 1) best = Math.min(best, segmentDistance(coords[i - 1], coords[i]));
      return best;
    }
    return Math.min(...coords.map(lineDistance));
  };
  const geoDistance = feature => lineDistance(feature?.geometry?.coordinates || []);

  const arcgis = async (service, outFields) => {
    const url = new URL(service + '/query');
    url.search = new URLSearchParams({
      where: '1=1',
      geometry: JSON.stringify({
        xmin: bbox.west, ymin: bbox.south, xmax: bbox.east, ymax: bbox.north,
        spatialReference: { wkid: 4326 }
      }),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields,
      returnGeometry: 'true',
      returnZ: 'false',
      returnM: 'false',
      outSR: '4326',
      f: 'geojson'
    }).toString();
    const response = await fetch(url, { headers: { 'user-agent': 'RRGH-UAT/1.0' } });
    assert(response.ok, service + ' HTTP ' + response.status);
    const data = await response.json();
    assert(!data?.error, service + ': ' + JSON.stringify(data?.error));
    return { url: url.toString(), data };
  };

  const summarizeArcgis = (data, nameFields) => {
    const features = Array.isArray(data?.features) ? data.features : [];
    return features
      .map(feature => ({
        distance_m: Math.round(geoDistance(feature)),
        name: nameFields.map(field => feature?.properties?.[field]).find(Boolean) || null,
        properties: feature?.properties || null,
        geometry_type: feature?.geometry?.type || null
      }))
      .sort((a, b) => a.distance_m - b.distance_m);
  };

  const tigerService = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_PhysicalFeatures/MapServer/5';
  const cartobaseService = 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Cartobase_WGS84WM/MapServer/12';
  const road911Service = 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_911_Road_Centerlines_WGS84WM/MapServer/0';

  const tiger = await arcgis(tigerService, 'OID,OBJECTID,NAME,BASENAME,MTFCC');
  const cartobase = await arcgis(cartobaseService, '*');
  const road911 = await arcgis(road911Service, '*');
  const tigerNearest = summarizeArcgis(tiger.data, ['NAME', 'BASENAME']).slice(0, 20);
  const knownTigerOids = new Set(['110206092766','110206092933','110206092934','110206092773']);
  const tigerClifty = tigerNearest.filter(item =>
    knownTigerOids.has(String(item?.properties?.OID || ''))
    || /(?:old\s+)?clif{1,2}ty\s+school/i.test(String(item.name || ''))
  );
  assert(tigerClifty.length >= 1, 'Live TIGERweb must return Clifty/Cliffty School Road at the owner acceptance area');
  const cartobaseNearest = summarizeArcgis(cartobase.data, ['RD_NAME', 'NAME', 'ROADNAME']).slice(0, 20);
  const road911Nearest = summarizeArcgis(road911.data, ['LSt_Name', 'St_Name', 'FULLNAME', 'ROADNAME']).slice(0, 20);

  const overpassQuery = `[out:json][timeout:30];way["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out tags geom;`;
  const overpassEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.maprva.org/api/interpreter'
  ];
  let osm = null;
  let osmEndpoint = null;
  const osmErrors = [];
  for (const endpoint of overpassEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'RRGH-UAT/1.0'
        },
        body: new URLSearchParams({ data: overpassQuery }).toString()
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data?.elements)) throw new Error('invalid Overpass response');
      osm = data;
      osmEndpoint = endpoint;
      break;
    } catch (error) {
      osmErrors.push({ endpoint, error: String(error) });
    }
  }
  if (!osm) {
    // Normal Local / other roads use the committed RRGH-hosted OSM cache, not
    // live Overpass. A simultaneous public Overpass outage should be recorded
    // but must not block the exact-source browser checks or the deterministic
    // cached-OSM acceptance test below.
    record('Live Overpass source audit unavailable', 'WARN', { errors: osmErrors });
    osm = { elements: [] };
  }

  const osmWays = osm.elements
    .filter(element => element?.type === 'way' && Array.isArray(element.geometry))
    .map(element => {
      const coords = element.geometry
        .filter(point => point && Number.isFinite(point.lon) && Number.isFinite(point.lat))
        .map(point => [point.lon, point.lat]);
      return {
        id: element.id,
        distance_m: Math.round(lineDistance(coords)),
        highway: element.tags?.highway || null,
        name: element.tags?.name || element.tags?.['official_name'] || element.tags?.['alt_name'] || null,
        surface: element.tags?.surface || null,
        tracktype: element.tags?.tracktype || null,
        service: element.tags?.service || null,
        access: element.tags?.access || null,
        motor_vehicle: element.tags?.motor_vehicle || null,
        foot: element.tags?.foot || null,
        tags: element.tags || {}
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);

  const osmRoadTrackCandidates = osmWays.filter(way =>
    ['track', 'service', 'unclassified', 'residential', 'road', 'living_street'].includes(way.highway)
  );

  const audit = {
    generatedAt: new Date().toISOString(),
    target,
    bbox,
    tigerweb: {
      service: tigerService,
      feature_count: Array.isArray(tiger.data?.features) ? tiger.data.features.length : 0,
      nearest: tigerNearest,
      clifty_named: tigerClifty
    },
    cartobase: {
      service: cartobaseService,
      feature_count: Array.isArray(cartobase.data?.features) ? cartobase.data.features.length : 0,
      nearest: cartobaseNearest,
      clifty_named: cartobaseNearest.filter(item => /clifty\s+school/i.test(String(item.name || '')))
    },
    kentucky_911: {
      service: road911Service,
      feature_count: Array.isArray(road911.data?.features) ? road911.data.features.length : 0,
      nearest: road911Nearest,
      clifty_named: road911Nearest.filter(item => /clifty\s+school/i.test(String(item.name || '')))
    },
    openstreetmap: {
      endpoint: osmEndpoint,
      endpoint_errors: osmErrors,
      way_count: osmWays.length,
      nearest_highways: osmWays.slice(0, 30),
      road_track_candidates: osmRoadTrackCandidates.slice(0, 30),
      track_service_candidates: osmRoadTrackCandidates.filter(way => ['track', 'service'].includes(way.highway)).slice(0, 30)
    }
  };

  fs.writeFileSync(path.join(EVIDENCE, 'local-road-source-audit.json'), JSON.stringify(audit, null, 2));
  record('Live Local / other roads source coverage audit', 'PASS', {
    tigerFeatures: audit.tigerweb.feature_count,
    tigerNearest: tigerNearest[0] || null,
    tigerClifty: tigerClifty.slice(0, 5),
    cartobaseFeatures: audit.cartobase.feature_count,
    cartobaseNearest: cartobaseNearest[0] || null,
    road911Features: audit.kentucky_911.feature_count,
    road911Nearest: road911Nearest[0] || null,
    osmWays: audit.openstreetmap.way_count,
    osmNearest: audit.openstreetmap.nearest_highways[0] || null,
    osmTrackService: audit.openstreetmap.track_service_candidates.slice(0, 5)
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1']
  });

  let failure = null;
  try {
    await liveLocalRoadSourceAudit();
    await routeLibrary(browser);
    await routeArtifactsAndContent(browser);
    await mapControlsAndAccessibility(browser);
    await tigerLocalRoadLabelAndSnapAcceptance(browser);
    await cachedOsmLocalRoadAcceptance(browser);
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
