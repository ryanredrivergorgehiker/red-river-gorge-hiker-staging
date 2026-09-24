const { chromium } = require('playwright');
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const EVIDENCE = path.resolve('routes-tracks-uat-evidence');
const SHARED = 'rrgh-analytics-consent-v1';
const REGION = 'rrgh-region-country-v1';
const GPX_SHA = '2469c85ebaddd3e701ba6dc8eea3664d90a0667dcd86f2aab43ae1445986830d';
const GEO_SHA = '123fdb57e1142299f86c714367cc466b70f18fa90cfbaabb92b0d9ced157dc66';
const PROVIDERS = new Set(['kygisserver.ky.gov', 'basemap.nationalmap.gov', 'apps.fs.usda.gov', 'overpass-api.de']);

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3JmAAAAAElFTkSuQmCC',
  'base64'
);

const TRAILS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { trail_name: 'Sky Bridge Trail', trail_no: '214', trail_class: '3', attributesubset: 'NFS Trail' },
      geometry: { type: 'LineString', coordinates: [
        [-83.58262, 37.81765], [-83.58140, 37.81796], [-83.58010, 37.81832],
        [-83.57903, 37.81886], [-83.57750, 37.81910], [-83.57688, 37.81915]
      ] }
    },
    {
      type: 'Feature',
      properties: { trail_name: 'Connector Trail', trail_no: '214A', trail_class: '3', attributesubset: 'NFS Trail' },
      geometry: { type: 'LineString', coordinates: [
        [-83.57903, 37.81886], [-83.57960, 37.81866], [-83.58121, 37.81843], [-83.58261, 37.81754]
      ] }
    }
  ]
};

const ROADS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Sky Bridge Road', id: '10', route_status: 'OPEN', oper_maint_level: '3' },
    geometry: { type: 'LineString', coordinates: [
      [-83.5890, 37.8145], [-83.5850, 37.8160], [-83.5828, 37.8175]
    ] }
  }]
};

const COUNTIES = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { NAME: 'Powell', ABBREVTN: 'POW' }, geometry: { type: 'Polygon', coordinates: [[[-83.92,37.72],[-83.55,37.72],[-83.55,38.02],[-83.92,38.02],[-83.92,37.72]]] } },
    { type: 'Feature', properties: { NAME: 'Menifee', ABBREVTN: 'MEN' }, geometry: { type: 'Polygon', coordinates: [[[-83.61,37.78],[-83.31,37.78],[-83.31,38.05],[-83.61,38.05],[-83.61,37.78]]] } },
    { type: 'Feature', properties: { NAME: 'Wolfe', ABBREVTN: 'WOL' }, geometry: { type: 'Polygon', coordinates: [[[-83.76,37.53],[-83.43,37.53],[-83.43,37.83],[-83.76,37.83],[-83.76,37.53]]] } },
    { type: 'Feature', properties: { NAME: 'Lee', ABBREVTN: 'LEE' }, geometry: { type: 'Polygon', coordinates: [[[-83.70,37.45],[-83.39,37.45],[-83.39,37.75],[-83.70,37.75],[-83.70,37.45]]] } }
  ]
};

const RECREATION = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      site_name: 'Sky Bridge Trailhead',
      public_site_name: 'Sky Bridge Trailhead',
      site_type: 'TRAILHEAD',
      seasonal_operational_status: 'OPEN',
      usda_portal_url: 'https://www.fs.usda.gov/'
    },
    geometry: { type: 'Point', coordinates: [-83.5827, 37.8176] }
  }]
};

const WILDERNESS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { wildernessname: 'Clifty Wilderness', boundarystatus: 'Designated', gis_acres: 12000 },
    geometry: { type: 'Polygon', coordinates: [[[-83.70,37.72],[-83.53,37.72],[-83.53,37.88],[-83.70,37.88],[-83.70,37.72]]] }
  }]
};

const SPECIAL = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { casename: 'Red River Gorge', areaname: 'Red River Gorge Geological Area', areatype: 'Geological Area', boundarystatus: 'Established' },
    geometry: { type: 'Polygon', coordinates: [[[-83.75,37.72],[-83.48,37.72],[-83.48,37.93],[-83.75,37.93],[-83.75,37.72]]] }
  }]
};

const LAND_UNITS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { nfslandunitname: 'Daniel Boone National Forest', nfslandunittype: 'National Forest' },
    geometry: { type: 'Polygon', coordinates: [[[-83.90,37.55],[-83.30,37.55],[-83.30,38.02],[-83.90,38.02],[-83.90,37.55]]] }
  }]
};

const OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [{
    type: 'way',
    id: 123456,
    tags: { highway: 'path', informal: 'yes', name: 'Community Path', trail_visibility: 'intermediate', access: 'discouraged' },
    geometry: [
      { lat: 37.8181, lon: -83.5834 },
      { lat: 37.8185, lon: -83.5828 },
      { lat: 37.8189, lon: -83.5821 }
    ]
  }]
};

fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, ...details });
  console.log('[' + status + '] ' + name, JSON.stringify(details));
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

async function installProviderStubs(page, providerRequests) {
  page.on('request', request => {
    const url = new URL(request.url());
    if (PROVIDERS.has(url.hostname)) providerRequests.push(request.url());
  });

  await page.route('https://kygisserver.ky.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('Ky_CountyLines_WGS84WM') && url.includes('/query?')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(COUNTIES) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route('https://basemap.nationalmap.gov/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );

  await page.route('https://apps.fs.usda.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('EDW_TrailNFSPublishWithDataStatus_01')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(TRAILS) });
    }
    if (url.includes('EDW_RoadBasic_01')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(ROADS) });
    }
    if (url.includes('EDW_RecInfraRecreationSites_02')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(RECREATION) });
    }
    if (url.includes('EDW_Wilderness_01')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(WILDERNESS) });
    }
    if (url.includes('EDW_SpecialInterestManagementArea_01')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(SPECIAL) });
    }
    if (url.includes('EDW_NFSLandUnit_01')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(LAND_UNITS) });
    }
    return route.abort();
  });

  await page.route('https://overpass-api.de/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(OSM) })
  );
}

async function fetchBytes(page, url) {
  const values = await page.evaluate(async target => {
    const response = await fetch(target);
    if (!response.ok) throw new Error(target + ': HTTP ' + response.status);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, url);
  return Uint8Array.from(values);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, name + '.png'), fullPage: true });
}

async function routeDetail(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  const providerRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-planner-node-count') || 0) > 1, { timeout: 10000 });

  const body = await page.locator('body').innerText();
  for (const expected of ['Skybridge Arch','0.78 mi','Mostly official trail','Landmarks & viewpoints','Turnaround Overlook','Download GPX']) {
    assert(body.includes(expected), expected);
  }
  for (const forbidden of ['Publication Ready','Lane 19','Approved waypoints']) {
    assert(!body.includes(forbidden), forbidden);
  }

  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  for (const swatch of ['swatch-route','swatch-usfs-trail','swatch-usfs-road','swatch-county','swatch-landmark','swatch-start','swatch-trailhead','swatch-informal']) {
    assert.strictEqual(await page.locator('.' + swatch).count(), 1, swatch);
  }
  assert.strictEqual(await page.locator('.route-waypoint-icon').count(), 2);
  assert((await page.locator('.route-start-icon').count()) >= 1);
  assert((await page.locator('.route-parking-icon').count()) >= 1);
  assert((await page.locator('.route-trailhead-icon').count()) >= 1);

  await page.getByRole('button', { name: 'Search map', exact: true }).click();
  await page.locator('[data-map-search]').fill('Skybridge Arch');
  const routeResult = page.locator('.route-search-result').first();
  await routeResult.click();
  await page.waitForSelector('.leaflet-popup-content');
  const popup = await page.locator('.leaflet-popup-content').innerText();
  assert(popup.includes('Skybridge Arch'));
  assert(popup.includes('0.78 mi'));
  assert(popup.includes('Moderate'));
  assert(popup.includes('Mostly official trail'));
  assert(popup.includes('View route guide'));
  assert(popup.includes('Download GPX'));

  const gpxHref = await page.getByRole('link', { name: 'Download GPX', exact: true }).first().getAttribute('href');
  assert(gpxHref);
  const gpxBytes = await fetchBytes(page, new URL(gpxHref, MAIN).href);
  assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(gpxBytes)).digest('hex'), GPX_SHA);
  const geoBytes = await fetchBytes(page, MAIN + 'data/routes/skybridge-arch-v1.geojson');
  assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(geoBytes)).digest('hex'), GEO_SHA);

  assert.deepStrictEqual(pageErrors, []);
  await shot(page, 'desktop-route-detail-hiker-first');
  record('Route detail map, route card, markers, legend and exact artifacts', 'PASS');
  await context.close();
}

async function fullMap(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['geolocation'], { origin: 'https://redrivergorgehiker.com:8443' });
  await context.setGeolocation({ latitude: 37.81886, longitude: -83.57903, accuracy: 18 });

  const page = await context.newPage();
  const providerRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-rrgh-route-map]');
    return map?.getAttribute('data-gorge-county-count') === '4'
      && Number(map?.getAttribute('data-planner-node-count') || 0) > 1
      && Number(map?.getAttribute('data-recreation-site-count') || 0) > 0
      && Boolean(map?.getAttribute('data-current-zoom'));
  }, { timeout: 10000 });

  const mapContainer = page.locator('[data-rrgh-route-map]');
  const body = await page.locator('body').innerText();
  assert(body.includes('Property boundaries are not shown; this map does not establish legal access.'));
  assert(body.includes('Before you go: check closures, road access & conditions'));
  assert(body.includes('How to read this map — 30-second guide'));
  assert(body.includes('Map data:'));

  assert.strictEqual(await page.locator('[data-map-layer]').count(), 15);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 15);
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  assert.strictEqual(await page.locator('[data-map-layer="ky-counties"]').isChecked(), false);
  assert.strictEqual(await page.locator('.leaflet-control-scale').count(), 1);
  assert.strictEqual(await page.locator('.leaflet-control-zoom-in').count(), 1);
  assert.strictEqual(await page.locator('.leaflet-control-zoom-out').count(), 1);

  for (const preset of ['Hiking','Terrain','Aerial']) {
    assert.strictEqual(await page.getByRole('button', { name: new RegExp('^' + preset) }).count(), 1, preset);
  }
  for (const status of ['Official','Mixed','Off-trail']) {
    assert.strictEqual(await page.getByLabel(status, { exact: true }).count(), 1, status);
  }

  const startZoom = Number(await mapContainer.getAttribute('data-current-zoom'));
  await page.locator('.leaflet-control-zoom-out').click({ force: true });
  await page.waitForFunction(
    expected => Number(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-current-zoom')) < expected,
    startZoom,
    { timeout: 3000 }
  );
  const zoomedOut = Number(await mapContainer.getAttribute('data-current-zoom'));
  assert(zoomedOut < startZoom, 'Desktop minus control must zoom out');
  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  assert((await page.locator('[data-map-status]').innerText()).includes('overview restored'));

  await page.getByRole('button', { name: /^Terrain/ }).click();
  assert.strictEqual(await page.locator('[data-map-layer="kytopo"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').inputValue(), '70');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').inputValue(), '45');
  for (let i = 0; i < 10; i += 1) await page.locator('.leaflet-control-zoom-in').click({ force: true });
  await page.waitForTimeout(150);
  assert((await page.locator('.leaflet-baseTopo-pane img.leaflet-tile').count()) > 0, 'Topo tiles should remain at close zoom above terrain relief');

  await page.locator('.route-layer-panel > summary').click();
  await page.locator('[data-map-layer="ky-counties"]').check();
  await page.waitForTimeout(100);
  assert((await page.locator('.leaflet-counties-pane path').count()) > 0, 'County boundary toggle should render boundaries');
  await page.locator('[data-map-layer="usfs-wilderness"]').check();
  await page.waitForTimeout(100);
  assert(providerRequests.some(url => url.includes('EDW_Wilderness_01')));
  assert((await page.locator('.leaflet-wilderness-pane path').count()) > 0);

  const plannerBefore = await mapContainer.getAttribute('data-planner-node-count');
  assert(!providerRequests.some(url => url.includes('overpass-api.de')), 'Informal trails must not load before opt-in');
  await page.locator('[data-map-layer="osm-informal-trails"]').check();
  await page.waitForTimeout(120);
  assert(providerRequests.some(url => url.includes('overpass-api.de')));
  assert((await page.locator('.leaflet-informalTrails-pane path').count()) > 0);
  assert.strictEqual(await mapContainer.getAttribute('data-planner-node-count'), plannerBefore, 'Informal trails must not enter route-planner graph');

  await page.getByRole('button', { name: 'Search map', exact: true }).click();
  await page.locator('[data-map-search]').fill('Trail 214');
  assert((await page.locator('.route-search-result').count()) > 0);
  await page.locator('.route-search-result').first().click();
  const trailPopup = await page.locator('.leaflet-popup-content').innerText();
  assert(/Sky Bridge Trail|Trail 214/.test(trailPopup));
  assert(trailPopup.includes('USDA Forest Service'));

  await page.getByRole('button', { name: 'Show my location', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-map-status]')?.textContent?.includes('Device location shown'), { timeout: 10000 });

  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const box = await mapContainer.boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.58);
  await page.waitForTimeout(80);
  assert(await page.locator('[data-coordinate-card]').isVisible());
  assert(/-83\./.test(await page.locator('[data-coordinate-dd]').innerText()));
  assert((await page.locator('[data-coordinate-utm]').innerText()).includes('UTM'));

  await page.getByRole('button', { name: 'Measure distance', exact: true }).first().click();
  await page.mouse.click(box.x + box.width * 0.40, box.y + box.height * 0.48);
  await page.mouse.click(box.x + box.width * 0.46, box.y + box.height * 0.48);
  await page.waitForTimeout(80);
  assert((await page.locator('[data-map-status]').innerText()).includes('Measured distance'));

  await page.getByRole('button', { name: 'Build trail route', exact: true }).first().click();
  await page.mouse.click(box.x + box.width * 0.50, box.y + box.height * 0.50);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.50);
  await page.waitForTimeout(120);
  const planStatus = await page.locator('[data-map-status]').innerText();
  assert(/Trail-following route|start snapped/.test(planStatus), planStatus);

  const exportGpx = page.getByRole('button', { name: 'Export GPX', exact: true });
  if (!(await exportGpx.isDisabled())) {
    const [download] = await Promise.all([page.waitForEvent('download'), exportGpx.click()]);
    assert(/^RRGH-planned-route-.*\.gpx$/.test(download.suggestedFilename()));
  }

  assert.deepStrictEqual(pageErrors, []);
  await shot(page, 'desktop-full-map-hiker-first');
  record('Full map hiker-first controls, zoom, sources, optional informal trails, search, location and planning', 'PASS', {
    providerRequestCount: providerRequests.length,
    startZoom,
    zoomedOut
  });
  await context.close();
}

async function mobile(browser) {
  const context = await preparedContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const providerRequests = [];
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-current-zoom')), { timeout: 10000 });

  for (const label of ['Search','Layers','Plan']) {
    assert.strictEqual(await page.locator('.route-map-mobile-bar').getByRole('button', { name: label, exact: true }).count(), 1, label);
  }
  assert(await page.locator('.route-map-mobile-bar').isVisible());

  await page.locator('.route-map-mobile-bar').getByRole('button', { name: 'Layers', exact: true }).click();
  assert(await page.locator('.route-layer-panel').isVisible());
  assert(await page.getByText('Fine tune layers', { exact: true }).isVisible());

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, 'Mobile horizontal overflow: ' + overflow);

  await page.locator('.route-layer-panel > summary').click();
  const map = page.locator('[data-rrgh-route-map]');
  const box = await map.boundingBox();
  assert(box);
  const before = Number(await map.getAttribute('data-current-zoom'));
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.waitForTimeout(350);
  const after = Number(await map.getAttribute('data-current-zoom'));
  assert(after > before, 'Mobile double tap should zoom in; before=' + before + ' after=' + after);

  assert.strictEqual(await page.locator('.leaflet-control-zoom-in').count(), 1);
  assert.strictEqual(await page.locator('.leaflet-control-zoom-out').count(), 1);
  await shot(page, 'mobile-full-map-hiker-first');
  record('Mobile map controls and double-tap zoom', 'PASS', { before, after });
  await context.close();
}

async function legal(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let response = await page.goto(MAIN + 'privacy/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  let body = await page.locator('body').innerText();
  for (const expected of [
    'Interactive Maps and Map-Data Services',
    'Community / Informal Trails',
    'public Overpass API',
    'If you choose “My location,”',
    'does not intentionally transmit or store the precise device coordinates',
    'does not send the search text to a general-purpose external geocoding service'
  ]) assert(body.includes(expected), expected);

  response = await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  body = await page.locator('body').innerText();
  for (const expected of [
    'GPS and device-location estimates can be inaccurate',
    'Property and parcel boundaries are not displayed',
    'Community / Informal Trails',
    'Open Database License (ODbL)'
  ]) assert(body.includes(expected), expected);

  record('Map geolocation, OSM and legal-access disclosures', 'PASS');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1'] });
  let failure = null;
  try {
    await routeDetail(browser);
    await fullMap(browser);
    await mobile(browser);
    await legal(browser);
  } catch (error) {
    failure = error;
    record('Routes & Tracks UAT fatal assertion', 'FAIL', { error: String(error), stack: error && error.stack ? error.stack : null });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(EVIDENCE, 'routes-tracks-uat-results.json'), JSON.stringify({ sourceRef: process.env.SOURCE_REF || null, results }, null, 2));
  }
  if (failure) process.exit(1);
})();