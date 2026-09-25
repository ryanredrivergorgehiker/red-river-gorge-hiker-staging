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
const PROVIDERS = new Set(['kygisserver.ky.gov', 'basemap.nationalmap.gov', 'elevation.nationalmap.gov', 'apps.fs.usda.gov', 'overpass.maprva.org', 'overpass.private.coffee', 'overpass-api.de', 'maps.mail.ru']);

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

const KENTUCKY_ROADS = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      LSt_Name: 'KY 715',
      St_Name: 'KY 715',
      RoadClass: 'State Route',
      SpeedLimit: 55,
      OneWay: 'N'
    },
    geometry: { type: 'LineString', coordinates: [
      [-83.6212, 37.8112],
      [-83.6208, 37.8103],
      [-83.62045, 37.8094],
      [-83.62005, 37.8085],
      [-83.61985, 37.8075]
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

async function installProviderStubs(page, providerRequests, slowPrimaryOverpass = false) {
  page.on('request', request => {
    const url = new URL(request.url());
    if (PROVIDERS.has(url.hostname)) providerRequests.push(request.url());
  });

  await page.route('https://kygisserver.ky.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('Ky_CountyLines_WGS84WM') && url.includes('/query?')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(COUNTIES) });
    }
    if (url.includes('Ky_911_Road_Centerlines_WGS84WM') && url.includes('/query?')) {
      return route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(KENTUCKY_ROADS) });
    }
    return route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route('https://basemap.nationalmap.gov/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );

  await page.route('https://elevation.nationalmap.gov/**', async route => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.pathname.includes('/3DEPElevation/ImageServer/getSamples')) return route.abort();
    let points = [];
    try {
      points = JSON.parse(requestUrl.searchParams.get('geometry') || '{}').points || [];
    } catch {}
    const samples = points.map((point, index) => ({
      location: { x: point[0], y: point[1], spatialReference: { wkid: 4326 } },
      value: 305 + index * 2.5
    }));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ samples })
    });
  });

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

  for (const host of [
    'https://overpass.maprva.org/**',
    'https://overpass.private.coffee/**',
    'https://overpass-api.de/**',
    'https://maps.mail.ru/**'
  ]) {
    await page.route(host, route => route.abort('failed'));
  }
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
  assert.strictEqual(await page.locator('.route-static-legend-grid .route-layer-static-row').count(), 5);
  assert((await page.locator('.route-static-legend-grid').textContent()).includes('County boundaries'));
  await page.locator('.route-layer-panel > summary').click();
  assert((await page.locator('.route-layer-panel').innerText()).includes('National Forest Wilderness'));
  const informalSwatchColors = await page.evaluate(() => {
    const node = document.querySelector('.swatch-informal');
    return {
      casing: getComputedStyle(node, '::before').borderTopColor,
      center: getComputedStyle(node, '::after').borderTopColor
    };
  });
  assert.notStrictEqual(informalSwatchColors.casing, informalSwatchColors.center, 'Informal trails should use a two-tone dashed treatment');
  assert(!/255, 79, 216/.test(informalSwatchColors.casing + informalSwatchColors.center), 'Informal trails must not reuse aerial Wilderness magenta');
  const networkSwatches = await page.evaluate(() => {
    const trail = document.querySelector('.swatch-usfs-trail');
    const road = document.querySelector('.swatch-usfs-road');
    const trailStyle = getComputedStyle(trail, '::before');
    const roadStyle = getComputedStyle(road, '::before');
    return {
      trailStyle: trailStyle.borderTopStyle,
      trailColor: trailStyle.borderTopColor,
      roadStyle: roadStyle.borderTopStyle,
      roadColor: roadStyle.borderTopColor
    };
  });
  assert.strictEqual(networkSwatches.trailStyle, 'dashed', 'Forest Service trail legend should be dashed');
  assert.strictEqual(networkSwatches.roadStyle, 'dashed', 'Forest Service road legend should be dashed');
  assert(/0, 200, 255/.test(networkSwatches.trailColor), 'Forest Service trail should retain cyan');
  assert(/255, 207, 51/.test(networkSwatches.roadColor), 'Forest Service road should retain yellow');
  await page.locator('.route-layer-panel > summary').click();
  assert.strictEqual(await page.getByText('Always shown', { exact: true }).count(), 0, 'County boundaries belong in the top symbol legend without an Always shown label');
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

  const utilityButtons = await page.locator('.route-map-utility-tools button').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
  }));
  for (let i = 1; i < utilityButtons.length; i += 1) {
    assert(Math.abs(utilityButtons[i].left - utilityButtons[i-1].right) <= 2, 'Top utilities should form one connected control bar');
  }
  const toolsBox = await page.locator('.route-map-tools-desktop').boundingBox();
  const statusBox = await page.locator('[data-map-status]').boundingBox();
  assert(toolsBox && statusBox && statusBox.y + statusBox.height <= toolsBox.y + 2, 'Bottom status should sit above Explore/Plan controls');

  assert.deepStrictEqual(pageErrors, []);
  await shot(page, 'desktop-route-detail-hiker-first');
  record('Route detail map, route card, markers, legend and exact artifacts', 'PASS');
  await context.close();
}

async function fullMap(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1300 } });
  await context.grantPermissions(['geolocation'], { origin: 'https://redrivergorgehiker.com:8443' });
  await context.setGeolocation({ latitude: 37.81886, longitude: -83.57903, accuracy: 18 });

  const page = await context.newPage();
  const providerRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installProviderStubs(page, providerRequests, true);

  let releaseInformalCache;
  const informalCacheGate = new Promise(resolve => { releaseInformalCache = resolve; });
  await page.route('**/data/map/osm-informal-trails.geojson', async route => {
    await informalCacheGate;
    await route.continue();
  });

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });

  // Search/Home/Layers remain usable while the planning trail graph loads, but
  // Explore and Plan must stay disabled until Community / Informal trails are ready.
  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-map-status]')?.textContent?.includes('Core Red River Gorge hiking view restored'),
    { timeout: 1500 }
  );
  const exploreButton = page.getByRole('button', { name: 'Explore', exact: true });
  const planOpenButton = page.locator('.route-map-tools-desktop').getByRole('button', { name: 'Plan', exact: true });
  assert.strictEqual(await exploreButton.isDisabled(), true, 'Explore must be disabled while informal trails are loading');
  assert.strictEqual(await planOpenButton.isDisabled(), true, 'Plan must be disabled while informal trails are loading');
  assert.strictEqual(await page.locator('[data-rrgh-route-map]').getAttribute('data-trail-planning-ready'), 'false');

  releaseInformalCache();
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-trail-planning-ready') === 'true',
    { timeout: 10000 }
  );
  assert.strictEqual(await exploreButton.isDisabled(), false, 'Explore must enable after trail data loads');
  assert.strictEqual(await planOpenButton.isDisabled(), false, 'Plan must enable after trail data loads');

  await exploreButton.click();
  assert(await page.locator('[data-map-sheet="explore"]').isVisible(), 'Explore must open after trails are ready');
  await exploreButton.click();
  assert(await page.locator('[data-map-sheet="explore"]').isHidden(), 'Explore must close on second click after trails are ready');
  await planOpenButton.click();
  assert(await page.locator('[data-map-sheet="plan"]').isVisible(), 'Plan must open after trails are ready');
  await planOpenButton.click();
  assert(await page.locator('[data-map-sheet="plan"]').isHidden(), 'Plan must close on second click after trails are ready');

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
  const beforeYouGo = page.locator('.route-map-context-strip').getByRole('link', { name: /Before you go: check closures/ });
  assert.strictEqual(await beforeYouGo.count(), 1);
  const beforeYouGoHref = await beforeYouGo.getAttribute('href');
  assert(beforeYouGoHref.endsWith('/search-and-rescue/#current-conditions'), 'Before-you-go link should target Current Conditions; href=' + beforeYouGoHref);
  assert(body.includes('How to read this map — 30-second guide'));
  assert(body.includes('Map data:'));

  assert.strictEqual(await page.locator('[data-map-layer]').count(), 10);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 9);
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  assert.strictEqual(await page.locator('[data-staging-copy-map-view]').count(), 0, 'Temporary exact-view copier should be removed after Home approval');
  assert.strictEqual(await page.locator('[data-map-layer="osm-informal-trails"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-wilderness"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-context-full-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.getByText('Wilderness full opacity (100%)', { exact: true }).count(), 0);
  assert.strictEqual(await page.locator('[data-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-special-management"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-land-units"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-opacity="usfs-trails"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-opacity="osm-informal-trails"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-opacity="usfs-roads"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-map-layer="ky-counties"]').count(), 0);
  assert.strictEqual(await page.locator('.leaflet-control-scale').count(), 1);

  const cacheData = await page.evaluate(async () => {
    const response = await fetch('/data/map/osm-informal-trails.geojson', { cache: 'no-cache' });
    if (!response.ok) throw new Error('OSM cache HTTP ' + response.status);
    return response.json();
  });
  assert(cacheData.features.length > 100, 'RRGH OSM cache should contain substantial community trail coverage');
  const [south, west, north, east] = cacheData.rrgh_cache.bbox;
  for (const feature of cacheData.features) {
    for (const [lon, lat] of feature.geometry.coordinates) {
      assert(lat >= south && lat <= north && lon >= west && lon <= east, 'Cached OSM geometry must remain inside the Gorge cache bounds');
    }
  }

  assert.strictEqual(await page.getByRole('button', { name: 'Zoom in', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Zoom out', exact: true }).count(), 1);

  for (const preset of ['Hiking','Terrain','Aerial']) {
    assert.strictEqual(await page.getByRole('button', { name: new RegExp('^' + preset) }).count(), 1, preset);
  }
  for (const status of ['Official','Mixed','Off-trail']) {
    assert.strictEqual(await page.getByLabel(status, { exact: true }).count(), 1, status);
  }

  assert.strictEqual(await page.locator('[data-map-layer="kytopo"]').isChecked(), false, 'Hiking should start with Kentucky Topo off');
  assert.strictEqual(await page.locator('[data-map-layer="usgs-topo"]').isChecked(), true, 'Hiking should start with USGS Topo on');
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), false, 'Hiking should start with Terrain relief off');
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').inputValue(), '100', 'Hiking should use full USGS Topo opacity');

  const utilityBox = await page.locator('.route-map-utility-tools').boundingBox();
  const scaleControl = page.locator('.leaflet-control-scale');
  const scaleBox = await scaleControl.boundingBox();
  assert(utilityBox && scaleBox, 'Map utility bar and scale should both render');
  assert(scaleBox.y >= utilityBox.y + utilityBox.height - 2, 'Adaptive map scale should sit beneath Search / My location / Home controls');
  const initialScaleText = (await scaleControl.innerText()).trim();
  const initialScaleWidth = (await scaleControl.boundingBox()).width;

  const safetyLink = page.getByRole('link', { name: /^Outdoor safety and location disclaimer/ });
  assert.strictEqual(await safetyLink.count(), 1, 'Every RouteMap should expose the outdoor safety/location disclaimer link');
  assert((await safetyLink.getAttribute('href')).endsWith('/copyright-and-terms/#outdoor-safety-location-disclaimer'));

  const startZoom = Number(await mapContainer.getAttribute('data-current-zoom'));
  assert.strictEqual(startZoom, 13, 'Core Gorge landing view should start at zoom 13');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.waitForFunction(
    expected => Number(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-current-zoom')) < expected,
    startZoom,
    { timeout: 3000 }
  );
  const zoomedOut = Number(await mapContainer.getAttribute('data-current-zoom'));
  assert(zoomedOut < startZoom, 'Desktop minus control must zoom out');
  await page.waitForTimeout(120);
  const zoomedOutScaleText = (await scaleControl.innerText()).trim();
  const zoomedOutScaleWidth = (await scaleControl.boundingBox()).width;
  assert(
    zoomedOutScaleText !== initialScaleText || Math.abs(zoomedOutScaleWidth - initialScaleWidth) > 1,
    'Adaptive map scale should change when zoom changes'
  );
  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 13, 'Home must restore the approved zoom 13 landing view even if the status message is asynchronously replaced');
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-rrgh-route-map]');
    return map?.getAttribute('data-map-center') && map?.getAttribute('data-map-north-west');
  }, { timeout: 3000 });
  const homeCenterValue = await mapContainer.getAttribute('data-map-center');
  const [homeCenterLat, homeCenterLng] = homeCenterValue.split(',').map(Number);
  assert(Math.abs(homeCenterLat - 37.8196836) <= 0.0000002, 'Home center latitude should match Ryan’s copied approved view; actual=' + homeCenterLat);
  assert(Math.abs(homeCenterLng - (-83.6396027)) <= 0.0000002, 'Home center longitude should match Ryan’s copied approved view; actual=' + homeCenterLng);
  const homeNorthWestValue = await mapContainer.getAttribute('data-map-north-west');
  const [homeNorthWestLat, homeNorthWestLng] = homeNorthWestValue.split(',').map(Number);

  await page.locator('[data-map-layer="usfs-wilderness"]').evaluate(input => {
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByRole('button', { name: /^Terrain/ }).click();
  assert.strictEqual(await page.locator('[data-map-layer="usfs-wilderness"]').isChecked(), true, 'Terrain preset should restore Wilderness');
  assert.strictEqual(await page.locator('[data-map-layer="kytopo"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="usgs-topo"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').inputValue(), '72');
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').inputValue(), '72');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').inputValue(), '72');
  for (let i = 0; i < 10; i += 1) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(150);
  assert((await page.locator('.leaflet-baseTopo-pane img.leaflet-tile').count()) > 0, 'Topo tiles should remain at close zoom above terrain relief');

  await page.locator('.route-layer-panel > summary').click();
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-informal-trail-source') === 'rrgh-cache',
    { timeout: 10000 }
  );
  assert((await page.locator('.leaflet-counties-pane canvas, .leaflet-counties-pane path').count()) > 0, 'County boundaries should always render above the basemap');
  assert(providerRequests.some(url => url.includes('EDW_Wilderness_01')));
  assert((await page.locator('.leaflet-wilderness-pane canvas, .leaflet-wilderness-pane path').count()) > 0);
  assert(!providerRequests.some(url => /overpass/i.test(url)), 'Normal informal-trail loading must use the RRGH cache, not live Overpass');
  assert.strictEqual(await mapContainer.getAttribute('data-informal-trail-source'), 'rrgh-cache');
  assert(Number(await mapContainer.getAttribute('data-informal-trail-count')) > 100, 'Cached community trail layer should contain substantial Gorge trail coverage');
  assert((await page.locator('.leaflet-informalTrails-pane canvas, .leaflet-informalTrails-pane path').count()) > 0);
  assert(Number(await mapContainer.getAttribute('data-planner-node-count')) > 1, 'Planner graph should include mapped trail/road network');
  assert(!(await page.locator('.route-layer-panel').innerText()).includes('Always shown'));
  assert((await page.locator('.route-static-legend-grid').innerText()).includes('County boundaries'));

  const aerialToggle = page.locator('[data-map-layer="kyaerial-phase3"]');
  const kyTopoToggle = page.locator('[data-map-layer="kytopo"]');
  const usgsTopoToggle = page.locator('[data-map-layer="usgs-topo"]');
  const lidarToggle = page.locator('[data-map-layer="ky-hillshade"]');

  await aerialToggle.check();
  assert.strictEqual(await aerialToggle.isChecked(), true);
  assert.strictEqual(await kyTopoToggle.isChecked(), false);
  assert.strictEqual(await usgsTopoToggle.isChecked(), false);
  assert.strictEqual(await lidarToggle.isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').isDisabled(), true);
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').isDisabled(), true);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true);
  assert.strictEqual(await page.locator('[data-route-map-shell]').getAttribute('data-aerial-active'), 'true');
  const aerialLegendColors = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector), '::before').borderColor;
    return {
      wilderness: color('.swatch-wilderness'),
      management: color('.swatch-management'),
      land: color('.swatch-land-unit')
    };
  });
  assert.notStrictEqual(aerialLegendColors.wilderness, aerialLegendColors.management);
  assert.notStrictEqual(aerialLegendColors.management, aerialLegendColors.land);

  await kyTopoToggle.check();
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').isDisabled(), false);
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').isDisabled(), false);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), false);
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Selecting Kentucky Topo must turn Aerial off');

  await aerialToggle.check();
  assert.strictEqual(await kyTopoToggle.isChecked(), false, 'Selecting Aerial must turn Kentucky Topo off');
  await usgsTopoToggle.check();
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Selecting USGS Topo must turn Aerial off');

  await page.getByRole('button', { name: /^Hiking/ }).click();
  assert.strictEqual(await kyTopoToggle.isChecked(), false, 'Hiking preset should turn Kentucky Topo off');
  assert.strictEqual(await usgsTopoToggle.isChecked(), true, 'Hiking preset should leave only USGS Topo on among base/terrain layers');
  assert.strictEqual(await lidarToggle.isChecked(), false, 'Hiking preset should turn Terrain relief off');
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Hiking preset should turn Aerial off');
  if ((await page.locator('.route-layer-panel').getAttribute('open')) !== null) {
    await page.locator('.route-layer-panel > summary').click();
  }
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null, 'Layers panel should be closed before map interaction UAT');

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
  assert(await page.locator('[data-map-sheet="explore"]').isVisible());
  assert((await page.locator('.route-explore-card').count()) >= 1);
  await page.locator('.route-explore-card').first().hover();
  await page.locator('[data-map-sheet="explore"] [data-sheet-close]').click();

  const box = await mapContainer.boundingBox();
  assert(box);
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.58);
  await page.waitForTimeout(80);
  assert(await page.locator('[data-coordinate-card]').isHidden(), 'Ordinary map clicks should not open technical coordinate details');
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.58, { button: 'right' });
  await page.waitForTimeout(80);
  assert(await page.locator('[data-coordinate-card]').isVisible(), 'Desktop right-click should open coordinates');
  assert(/-83\./.test(await page.locator('[data-coordinate-dd]').innerText()));
  assert((await page.locator('[data-coordinate-utm]').innerText()).includes('UTM'));
  const copyBox = await page.locator('[data-coordinate-copy]').boundingBox();
  const closeBox = await page.locator('[data-coordinate-close]').boundingBox();
  assert(copyBox && closeBox);
  assert(closeBox.x > copyBox.x + copyBox.width - 1, 'Coordinate × should sit to the right of Copy coordinates');
  assert(Math.abs((closeBox.y + closeBox.height / 2) - (copyBox.y + copyBox.height / 2)) <= 5, 'Coordinate actions should remain on one row');
  await page.locator('[data-coordinate-close]').click();
  assert(await page.locator('[data-coordinate-card]').isHidden(), 'Coordinate card × should dismiss the card');

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  assert(await page.locator('[data-map-sheet="plan"]').isVisible());
  await page.getByRole('button', { name: 'Measure distance', exact: true }).click();
  await mapContainer.click({ position: { x: box.width * 0.22, y: box.height * 0.26 } });
  await mapContainer.click({ position: { x: box.width * 0.31, y: box.height * 0.26 } });
  await page.waitForFunction(() => document.querySelector('[data-map-status]')?.textContent?.includes('Measured distance'), { timeout: 3000 });
  assert((await page.locator('.rrgh-planning-distance-label.is-measure-segment').count()) >= 1, 'Measure should put segment distance directly on the map');
  assert((await page.locator('[data-plan-stats-distance]').innerText()).trim() !== '—', 'Measure should show a live total distance');
  await page.waitForFunction(
    () => {
      const gain = document.querySelector('[data-plan-stats-gain]')?.textContent?.trim();
      const range = document.querySelector('[data-plan-stats-range]')?.textContent?.trim();
      return Boolean(gain && gain !== '—' && range && range !== '—');
    },
    { timeout: 5000 }
  );
  assert(providerRequests.some(url => url.includes('elevation.nationalmap.gov') && url.includes('/getSamples?')), 'Measure should request USGS 3DEP elevation samples');
  assert((await page.locator('.rrgh-planning-distance-label.is-measure-segment').first().innerText()).includes('ft'), 'Measure segment label should include elevation change after 3DEP returns');

  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  if (await page.locator('[data-map-sheet="plan"]').isHidden()) await planOpenButton.click();
  assert.strictEqual(await page.locator('[data-plan-pan-pad]').isHidden(), true);
  await page.getByRole('button', { name: 'Build trail route', exact: true }).click();
  const panPad = page.locator('[data-plan-pan-pad]');
  assert.strictEqual(await panPad.count(), 1);
  assert.strictEqual(await panPad.isVisible(), true);
  assert.strictEqual(await page.locator('[data-plan-pan]').count(), 0);
  assert.strictEqual(await page.getByText('✥ Resume route', { exact: true }).count(), 0);
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.strictEqual(await page.locator('[data-plan-pan-direction="' + direction + '"]').count(), 1);
  }

  const northWestBeforeArrowPan = await mapContainer.getAttribute('data-map-north-west');
  await page.getByRole('button', { name: 'Pan map right', exact: true }).click();
  await page.waitForFunction(
    before => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-north-west') !== before,
    northWestBeforeArrowPan,
    { timeout: 3000 }
  );
  assert.strictEqual(await page.getByRole('button', { name: 'Build trail route', exact: true }).getAttribute('aria-pressed'), 'true', 'Arrow panning must leave route building active');
  assert((await page.locator('[data-map-status]').innerText()).includes('Route building remains active'));

  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();

  assert.strictEqual(await page.getByText('Next segment', { exact: true }).count(), 0);
  assert.strictEqual(await page.getByRole('button', { name: 'Follow mapped trails & roads', exact: true }).count(), 0);
  assert.strictEqual(await page.getByRole('button', { name: 'Off-trail straight line', exact: true }).count(), 0);

  const homeBox = await mapContainer.boundingBox();
  assert(homeBox);
  const homeZoom = Number(await mapContainer.getAttribute('data-current-zoom'));
  assert.strictEqual(homeZoom, 13);

  // Planner click classification is the behavior under test below. Make popups
  // non-interactive for this section so a coordinate probe cannot accidentally
  // activate a route-card link and navigate away from the map.
  await page.addStyleTag({ content: [
    '.leaflet-popup-pane{pointer-events:none!important}',
    '.leaflet-tooltip-pane{pointer-events:none!important}',
    '.leaflet-roads-pane{pointer-events:none!important}',
    '.leaflet-trails-pane{pointer-events:none!important}',
    '.leaflet-informalTrails-pane{pointer-events:none!important}',
    '.leaflet-routes-pane{pointer-events:none!important}',
    '.leaflet-recreation-pane{pointer-events:none!important}',
    '.leaflet-routeStarts-pane{pointer-events:none!important}',
    '.leaflet-landmarks-pane{pointer-events:none!important}',
    '.leaflet-counties-pane{pointer-events:none!important}',
    '.leaflet-wilderness-pane{pointer-events:none!important}',
    '.leaflet-specialManagement-pane{pointer-events:none!important}',
    '.leaflet-landUnits-pane{pointer-events:none!important}',
    '.leaflet-trailLabels-pane{pointer-events:none!important}',
    '.leaflet-countyLabels-pane{pointer-events:none!important}'
  ].join('') });

  // Kentucky road-centerline planning geometry is intentionally not drawn as a new
  // overlay. Derive screen points from the approved Home NW anchor and prove that a
  // KY 715-like state-road centerline still participates in the route graph.
  const projectFromHomeNorthWest = (lat, lng) => {
    const scale = 256 * Math.pow(2, homeZoom);
    const project = (plat, plng) => {
      const sin = Math.sin(plat * Math.PI / 180);
      return {
        x: (plng + 180) / 360 * scale,
        y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
      };
    };
    const northWest = project(homeNorthWestLat, homeNorthWestLng);
    const point = project(lat, lng);
    return {
      x: homeBox.x + (point.x - northWest.x),
      y: homeBox.y + (point.y - northWest.y)
    };
  };

  const trailABase = projectFromHomeNorthWest(37.8103, -83.6208);
  const trailBBase = projectFromHomeNorthWest(37.8085, -83.62005);
  const snapOffsets = [
    [0,0],[3,0],[-3,0],[0,3],[0,-3],[4,4],[-4,-4],[4,-4],[-4,4],
    [6,0],[-6,0],[0,6],[0,-6]
  ];

  let trailA = null;
  let trailB = null;
  for (const [dx, dy] of snapOffsets) {
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const candidateA = { x: trailABase.x + dx, y: trailABase.y + dy };
    const candidateB = { x: trailBBase.x + dx, y: trailBBase.y + dy };
    const insideMap = point =>
      point.x >= homeBox.x + 4 && point.x <= homeBox.x + homeBox.width - 4
      && point.y >= homeBox.y + 4 && point.y <= homeBox.y + homeBox.height - 4;
    if (!insideMap(candidateA) || !insideMap(candidateB)) continue;
    await page.mouse.click(candidateA.x, candidateA.y);
    await page.keyboard.press('Escape');
    await page.mouse.click(candidateB.x, candidateB.y);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const currentPlannerUrl = page.url();
    assert(/\/routes\/map\/?(?:[#?].*)?$/.test(new URL(currentPlannerUrl).pathname + new URL(currentPlannerUrl).search + new URL(currentPlannerUrl).hash), 'Planner coordinate probes must remain on the map page; url=' + currentPlannerUrl);
    const statusLocator = page.locator('[data-map-status]');
    assert.strictEqual(await statusLocator.count(), 1, 'Map status should remain present during planner coordinate probes; url=' + currentPlannerUrl);
    const statusText = await statusLocator.innerText();
    if (statusText.includes('1 snapped segment')) {
      trailA = candidateA;
      trailB = candidateB;
      break;
    }
  }
  assert(trailA && trailB, 'Planner should snap a click pair along the stubbed KY 715 road-centerline geometry');
  assert(Number(await mapContainer.getAttribute('data-planning-road-feature-count')) >= 1, 'Kentucky road planning features should be indexed');
  assert(providerRequests.some(url => url.includes('Ky_911_Road_Centerlines_WGS84WM') && url.includes('/query?')), 'Planner should request Kentucky road centerlines');
  assert((await page.locator('.rrgh-planning-distance-label.is-plan-segment').count()) >= 1, 'Snapped road/trail planning should show segment distance on the map');
  assert((await page.locator('[data-plan-stats-distance]').innerText()).trim() !== '—', 'Planned route should show live total distance');
  await page.waitForFunction(
    () => {
      const gain = document.querySelector('[data-plan-stats-gain]')?.textContent?.trim();
      const loss = document.querySelector('[data-plan-stats-loss]')?.textContent?.trim();
      const range = document.querySelector('[data-plan-stats-range]')?.textContent?.trim();
      return Boolean(gain && gain !== '—' && loss && loss !== '—' && range && range !== '—');
    },
    { timeout: 5000 }
  );
  assert(providerRequests.some(url => url.includes('elevation.nationalmap.gov') && url.includes('/getSamples?')), 'Build trail route should request USGS 3DEP elevation samples');
  const initialPlanDistance = (await page.locator('[data-plan-stats-distance]').innerText()).trim();

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  const offTrailCandidates = [
    { x: homeBox.x + homeBox.width * 0.78, y: homeBox.y + homeBox.height * 0.22 },
    { x: homeBox.x + homeBox.width * 0.70, y: homeBox.y + homeBox.height * 0.70 },
    { x: homeBox.x + homeBox.width * 0.52, y: homeBox.y + homeBox.height * 0.20 },
    { x: homeBox.x + homeBox.width * 0.84, y: homeBox.y + homeBox.height * 0.52 },
    { x: homeBox.x + homeBox.width * 0.58, y: homeBox.y + homeBox.height * 0.66 },
    { x: homeBox.x + homeBox.width * 0.38, y: homeBox.y + homeBox.height * 0.22 }
  ];

  const plannerCounts = statusText => {
    const match = statusText.match(/(\d+) snapped segment\(s\), (\d+) off-trail segment\(s\)/);
    return match ? { snapped: Number(match[1]), offTrail: Number(match[2]) } : null;
  };

  let offTrail = null;
  for (const candidate of offTrailCandidates) {
    await page.mouse.click(candidate.x, candidate.y);
    await page.waitForTimeout(120);
    const plannerStatus = await page.locator('[data-map-status]').innerText();
    const counts = plannerCounts(plannerStatus);

    if (counts && counts.snapped >= 1 && counts.offTrail >= 1) {
      offTrail = candidate;
      break;
    }

    if (counts && counts.snapped + counts.offTrail > 1) {
      assert.strictEqual(await undo.isDisabled(), false, 'A snapped candidate should remain undoable while searching for a clear off-trail point');
      await undo.click();
      await page.waitForTimeout(80);
    }
  }
  assert(offTrail, 'Planner should classify at least one clear map area as off-trail while preserving the baseline snapped leg');
  const extendedPlanDistance = (await page.locator('[data-plan-stats-distance]').innerText()).trim();
  assert.notStrictEqual(extendedPlanDistance, initialPlanDistance, 'Planned distance should update when another point/segment is added');

  const planHitPaths = page.locator('.rrgh-plan-segment-hit');
  assert.strictEqual(await planHitPaths.count(), 2, 'Two planned legs should expose two rendered segment hit paths');

  const secondSegmentCenter = async () => {
    const count = await planHitPaths.count();
    assert(count >= 2, 'Expected a second rendered plan segment');
    const center = await planHitPaths.nth(1).evaluate(path => {
      const length = path.getTotalLength();
      const point = path.getPointAtLength(length / 2);
      const matrix = path.getScreenCTM();
      if (!matrix || !Number.isFinite(length) || length <= 0) return null;
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
    assert(center, 'Second planned segment should expose a usable SVG midpoint');
    return center;
  };

  // Prove the actual rendered second segment hit target works: right-click deletes,
  // then Undo restores the same off-trail leg.
  let segmentCenter = await secondSegmentCenter();
  await page.mouse.click(segmentCenter.x, segmentCenter.y, { button: 'right' });
  await page.waitForTimeout(120);
  let editStatus = await page.locator('[data-map-status]').innerText();
  assert(
    editStatus.includes('Planned segment deleted')
      || editStatus.includes('1 snapped segment(s), 0 off-trail segment(s)'),
    'Right-click should delete the selected off-trail leg; status=' + editStatus
  );
  await undo.click();
  await page.waitForTimeout(120);
  editStatus = await page.locator('[data-map-status]').innerText();
  assert(editStatus.includes('1 off-trail segment'), 'Undo should restore the deleted off-trail segment; status=' + editStatus);

  // Drag the restored second segment to the actual rendered start node of the
  // already-snapped first segment. Using the SVG path endpoint avoids projection
  // rounding and guarantees the drop target is a real planner graph node.
  const snappedNodeTarget = await planHitPaths.nth(0).evaluate(path => {
    const point = path.getPointAtLength(0);
    const matrix = path.getScreenCTM();
    if (!matrix) return null;
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
  assert(snappedNodeTarget, 'First snapped segment should expose a screen-space graph endpoint');

  segmentCenter = await secondSegmentCenter();
  await page.mouse.move(segmentCenter.x, segmentCenter.y);
  await page.mouse.down();
  await page.waitForTimeout(60);
  const dragStarted = await mapContainer.getAttribute('data-plan-drag-segment');
  assert.strictEqual(dragStarted, '1', 'Second segment drag should start on mouse down; data-plan-drag-segment=' + dragStarted);
  await page.mouse.move(snappedNodeTarget.x, snappedNodeTarget.y, { steps: 10 });
  await page.waitForTimeout(60);
  const dragStillActive = await mapContainer.getAttribute('data-plan-drag-segment');
  assert.strictEqual(dragStillActive, '1', 'Second segment drag should remain active while moving; data-plan-drag-segment=' + dragStillActive);
  const dragMoved = await mapContainer.getAttribute('data-plan-drag-moved');
  assert.strictEqual(dragMoved, 'true', 'Second segment drag should receive movement events; data-plan-drag-moved=' + dragMoved);
  const previewMode = await mapContainer.getAttribute('data-plan-drag-preview-mode');
  assert.strictEqual(previewMode, 'snap', 'Dragging to the mapped road target should preview as snapped; data-plan-drag-preview-mode=' + previewMode);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const dragEnded = await mapContainer.getAttribute('data-plan-drag-segment');
  assert.strictEqual(dragEnded, null, 'Second segment drag should end on mouse up; data-plan-drag-segment=' + dragEnded);
  editStatus = await page.locator('[data-map-status]').innerText();
  assert(editStatus.includes('2 snapped segment(s), 0 off-trail segment(s)'), 'Dragging an off-trail segment onto mapped network should resnap it solid; status=' + editStatus);

  // Drag that same rendered second segment clearly off network: it should become dashed/off-trail.
  // With the broader Kentucky road graph, a point that was off-network from the original
  // endpoint may be near a different road after the segment has been resnapped. Probe the
  // existing candidate set while the drag is active and accept only a planner-previewed
  // straight target.
  segmentCenter = await secondSegmentCenter();
  await page.mouse.move(segmentCenter.x, segmentCenter.y);
  await page.mouse.down();
  let straightDragTarget = null;
  for (const candidate of offTrailCandidates) {
    await page.mouse.move(candidate.x, candidate.y, { steps: 8 });
    await page.waitForTimeout(70);
    const candidatePreviewMode = await mapContainer.getAttribute('data-plan-drag-preview-mode');
    if (candidatePreviewMode === 'straight') {
      straightDragTarget = candidate;
      break;
    }
  }
  assert(straightDragTarget, 'Planner should expose at least one clearly off-network drag target');
  await page.mouse.up();
  await page.waitForTimeout(250);
  editStatus = await page.locator('[data-map-status]').innerText();
  assert(editStatus.includes('1 off-trail segment(s)'), 'Dragging a snapped segment clearly off network should make it dashed; status=' + editStatus);

  // Right-clicking the actual moved second segment deletes that leg.
  segmentCenter = await secondSegmentCenter();
  await page.mouse.click(segmentCenter.x, segmentCenter.y, { button: 'right' });
  await page.waitForFunction(() => document.querySelector('[data-map-status]')?.textContent?.includes('Planned segment deleted'), { timeout: 3000 });

  assert.strictEqual(await undo.isDisabled(), false);
  await undo.click();
  assert.strictEqual(await redo.isDisabled(), false);
  await redo.click();
  await undo.click();

  const exportGpx = page.getByRole('button', { name: 'Export GPX', exact: true });
  assert.strictEqual(await exportGpx.isDisabled(), false);
  const [download] = await Promise.all([page.waitForEvent('download'), exportGpx.click()]);
  assert(/^RRGH-planned-route-.*\.gpx$/.test(download.suggestedFilename()));

  // Share must create a stateful permalink, include a selected RRGH route,
  // preserve meaningful layer/filter state, and restore that exact view.
  const buildTrailButton = page.getByRole('button', { name: 'Build trail route', exact: true });
  if (await buildTrailButton.getAttribute('aria-pressed') === 'true') await buildTrailButton.click();
  if (await page.locator('[data-map-sheet="plan"]').isVisible()) await planOpenButton.click();
  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();

  await exploreButton.click();
  const skybridgeExplore = page.locator('[data-map-sheet="explore"]').getByRole('button', { name: /Skybridge Arch/ }).first();
  assert.strictEqual(await skybridgeExplore.count(), 1, 'Skybridge Arch should be selectable from Explore before sharing');
  await skybridgeExplore.click();

  await page.locator('[data-map-layer="usfs-special-management"]').evaluate(input => {
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await kyTopoToggle.evaluate(input => {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('[data-opacity="kytopo"]').evaluate(input => {
    input.value = '73';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  const shareButton = page.locator('.route-map-tools-desktop').getByRole('button', { name: 'Share', exact: true });
  assert.strictEqual(await shareButton.count(), 1, 'Desktop Share should sit with Explore and Plan');
  await shareButton.click();
  const sharePanel = page.locator('[data-map-sheet="share"]');
  assert(await sharePanel.isVisible(), 'Share fallback panel should open when native Web Share is unavailable');
  const sharedUrl = await sharePanel.locator('[data-share-url]').inputValue();
  const shared = new URL(sharedUrl);
  assert.strictEqual(shared.searchParams.get('rrghRoute'), 'RTE-0001');
  assert.strictEqual(shared.searchParams.get('rrghPreset'), 'custom', 'Manual layer changes should share as a custom preset');
  assert(shared.searchParams.get('rrghMap'), 'Shared link should include center and zoom');
  assert(shared.searchParams.get('rrghLayers')?.includes('usfs-special-management:0:'), 'Shared link should preserve disabled Special management');
  assert(shared.searchParams.get('rrghLayers')?.includes('kytopo:1:73'), 'Shared link should preserve Kentucky Topo opacity');
  assert(shared.searchParams.has('rrghTrips'));
  assert(shared.searchParams.has('rrghStatus'));
  assert.strictEqual(shared.searchParams.has('rrghLocation'), false, 'Share URL must not add a live-location parameter');

  const [shareLat, shareLng, shareZoom] = shared.searchParams.get('rrghMap').split(',').map(Number);
  const sharedResponse = await page.goto(sharedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(sharedResponse && sharedResponse.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-center')), { timeout: 10000 });
  await page.waitForTimeout(250);
  const restoredMap = page.locator('[data-rrgh-route-map]');
  const [restoredLat, restoredLng] = (await restoredMap.getAttribute('data-map-center')).split(',').map(Number);
  const restoredZoom = Number(await restoredMap.getAttribute('data-current-zoom'));
  const centerTolerance = 0.00002;
  assert(
    Math.abs(restoredLat - shareLat) <= centerTolerance,
    'Shared latitude should restore within about two meters; expected=' + shareLat + ' actual=' + restoredLat
  );
  assert(
    Math.abs(restoredLng - shareLng) <= centerTolerance,
    'Shared longitude should restore within about two meters; expected=' + shareLng + ' actual=' + restoredLng
  );
  assert.strictEqual(restoredZoom, shareZoom, 'Shared zoom should restore exactly');
  assert.strictEqual(await page.locator('[data-map-layer="usfs-special-management"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').inputValue(), '73');
  await page.waitForFunction(
    () => document.querySelector('.leaflet-popup-content')?.textContent?.includes('Skybridge Arch'),
    { timeout: 5000 }
  );
  record('Stateful map Share permalink and selected-route restore', 'PASS', { sharedUrl });

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

  for (const label of ['Search','Layers','Plan','Share']) {
    assert.strictEqual(await page.locator('.route-map-mobile-bar').getByRole('button', { name: label, exact: true }).count(), 1, label);
  }
  assert(await page.locator('.route-map-mobile-bar').isVisible());

  await page.locator('.route-map-mobile-bar').getByRole('button', { name: 'Layers', exact: true }).click();
  assert(await page.locator('.route-layer-panel').isVisible());
  assert(await page.locator('.route-layer-fine-tune > summary').isVisible());

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, 'Mobile horizontal overflow: ' + overflow);

  await page.locator('.route-layer-panel > summary').click();
  const map = page.locator('[data-rrgh-route-map]');
  const box = await map.boundingBox();
  assert(box);
  const coordinateTarget = {
    x: box.x + box.width * 0.62,
    y: box.y + box.height * 0.56
  };
  await page.evaluate(({ x, y }) => {
    const target = document.querySelector('[data-rrgh-route-map]');
    const touch = new Touch({ identifier: 7, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
    target.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch]
    }));
  }, coordinateTarget);
  await page.waitForTimeout(700);
  assert(await page.locator('[data-coordinate-card]').isVisible(), 'Mobile press-and-hold should open coordinates');
  await page.evaluate(({ x, y }) => {
    const target = document.querySelector('[data-rrgh-route-map]');
    const touch = new Touch({ identifier: 7, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
    target.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [touch]
    }));
  }, coordinateTarget);
  const mobileCopyBox = await page.locator('[data-coordinate-copy]').boundingBox();
  const mobileCloseBox = await page.locator('[data-coordinate-close]').boundingBox();
  assert(mobileCopyBox && mobileCloseBox);
  assert(mobileCloseBox.x > mobileCopyBox.x + mobileCopyBox.width - 1, 'Mobile coordinate × should sit to the right of Copy coordinates');
  assert(Math.abs((mobileCloseBox.y + mobileCloseBox.height / 2) - (mobileCopyBox.y + mobileCopyBox.height / 2)) <= 5, 'Mobile coordinate actions should remain on one row');
  await page.locator('[data-coordinate-close]').click();
  assert(await page.locator('[data-coordinate-card]').isHidden(), 'Mobile coordinate card should have a working × dismiss control');

  const before = Number(await map.getAttribute('data-current-zoom'));
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.waitForTimeout(350);
  const after = Number(await map.getAttribute('data-current-zoom'));
  assert(after > before, 'Mobile double tap should zoom in; before=' + before + ' after=' + after);

  assert.strictEqual(await page.locator('.route-map-desktop-zoom').count(), 2);
  assert.strictEqual(await page.locator('.route-map-desktop-zoom:visible').count(), 0);
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
    'RRGH-hosted cache derived from OpenStreetMap data',
    'Last updated: September 25, 2026',
    'Measure distance',
    'USGS 3D Elevation Program (3DEP)',
    'fixed Red River Gorge-area set of Kentucky 911 road-centerline geometry',
    'not generated from the visitor’s device location',
    'does not automatically send your device’s precise “My location” coordinates',
    'If you choose “My location,”',
    'does not intentionally transmit or store the precise device coordinates',
    'does not send the search text to a general-purpose external geocoding service'
  ]) assert(body.includes(expected), expected);

  response = await page.goto(MAIN + 'search-and-rescue/#current-conditions', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('#current-conditions', { timeout: 5000 });
  assert(await page.getByRole('heading', { name: 'Current conditions are part of the route', exact: true }).isVisible());
  assert.strictEqual(await page.locator('#current-conditions').count(), 1);

  response = await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  body = await page.locator('body').innerText();
  for (const expected of [
    'Outdoor Safety and Location Disclaimer',
    'GPS and device-location estimates can be inaccurate',
    'Property and parcel boundaries are not displayed',
    'Community / Informal Trails',
    'route planner may snap to displayed community/informal paths',
    'snap to mapped road-centerline geometry from USDA Forest Service and Kentucky public road datasets',
    'Open Database License (ODbL)'
  ]) assert(body.includes(expected), expected);

  response = await page.goto(MAIN + 'copyright-and-terms/#outdoor-safety-location-disclaimer', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // A hash-only navigation on the page already loaded above is a same-document
  // navigation, so Playwright may correctly return null instead of an HTTP response.
  assert(!response || response.ok());
  await page.waitForTimeout(250);
  assert.strictEqual(await page.locator('#outdoor-safety-location-disclaimer').count(), 1);
  assert.strictEqual(await page.locator('#outdoor-safety-location-disclaimer > h2').innerText(), 'Outdoor Safety and Location Disclaimer');
  const anchorBox = await page.locator('#outdoor-safety-location-disclaimer > h2').boundingBox();
  assert(anchorBox && anchorBox.y >= 90 && anchorBox.y <= 330, 'Disclaimer heading should land visibly below the sticky site header; y=' + (anchorBox && anchorBox.y));

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