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
const PROVIDERS = new Set(['kygisserver.ky.gov', 'kyraster.ky.gov', 'basemap.nationalmap.gov', 'elevation.nationalmap.gov', 'apps.fs.usda.gov', 'overpass.maprva.org', 'overpass.private.coffee', 'overpass-api.de', 'maps.mail.ru']);

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

  await page.route('https://kyraster.ky.gov/**', async route => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (!requestUrl.pathname.includes('/ImageServer/getSamples')) return route.abort();
    let geometryRaw = requestUrl.searchParams.get('geometry');
    if (request.method() === 'POST') {
      geometryRaw = new URLSearchParams(request.postData() || '').get('geometry');
    }
    let points = [];
    try {
      points = JSON.parse(geometryRaw || '{}').points || [];
    } catch {}
    const samples = points.map((point, index) => ({
      location: { x: point[0], y: point[1], spatialReference: { wkid: 4326 } },
      value: index === 0 ? 300 : 300 + Math.max(0, Math.sin(index * 0.17)) * 4
    }));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ samples })
    });
  });

  await page.route('https://elevation.nationalmap.gov/**', async route => {
    const requestUrl = new URL(route.request().url());
    if (!requestUrl.pathname.includes('/3DEPElevation/ImageServer/getSamples')) return route.abort();
    let geometryRaw = requestUrl.searchParams.get('geometry');
    if (route.request().method() === 'POST') {
      geometryRaw = new URLSearchParams(route.request().postData() || '').get('geometry');
    }
    let points = [];
    try {
      points = JSON.parse(geometryRaw || '{}').points || [];
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
    const trailCasing = getComputedStyle(trail, '::before');
    const trailCenter = getComputedStyle(trail, '::after');
    const roadCasing = getComputedStyle(road, '::before');
    const roadCenter = getComputedStyle(road, '::after');
    return {
      trailCasingStyle: trailCasing.borderTopStyle,
      trailCasingColor: trailCasing.borderTopColor,
      trailCasingWidth: trailCasing.borderTopWidth,
      trailCenterStyle: trailCenter.borderTopStyle,
      trailCenterColor: trailCenter.borderTopColor,
      trailCenterWidth: trailCenter.borderTopWidth,
      roadCasingStyle: roadCasing.borderTopStyle,
      roadCasingColor: roadCasing.borderTopColor,
      roadCasingWidth: roadCasing.borderTopWidth,
      roadCenterStyle: roadCenter.borderTopStyle,
      roadCenterColor: roadCenter.borderTopColor,
      roadCenterWidth: roadCenter.borderTopWidth
    };
  });
  assert.strictEqual(networkSwatches.trailCasingStyle, 'dashed', 'Forest Service trail casing should be dashed');
  assert.strictEqual(networkSwatches.trailCenterStyle, 'dashed', 'Forest Service trail center should be dashed');
  assert.strictEqual(networkSwatches.roadCasingStyle, 'dashed', 'Forest Service road casing should be dashed');
  assert.strictEqual(networkSwatches.roadCenterStyle, 'dashed', 'Forest Service road center should be dashed');
  assert(/34, 49, 58/.test(networkSwatches.trailCasingColor), 'Forest Service trail should use the shared dark network casing');
  assert(/34, 49, 58/.test(networkSwatches.roadCasingColor), 'Forest Service road should use the shared dark network casing');
  assert(/0, 200, 255/.test(networkSwatches.trailCenterColor), 'Forest Service trail should retain cyan');
  assert(/255, 207, 51/.test(networkSwatches.roadCenterColor), 'Forest Service road should retain yellow');
  assert(parseFloat(networkSwatches.trailCasingWidth) > parseFloat(networkSwatches.trailCenterWidth), 'Trail casing must be wider than its colored center');
  assert(parseFloat(networkSwatches.roadCasingWidth) > parseFloat(networkSwatches.roadCenterWidth), 'Road casing must be wider than its colored center');

  assert.strictEqual(await page.locator('.leaflet-trails-pane canvas').count() >= 1, true, 'Forest Service trails should render in the dedicated trail canvas pane');
  assert.strictEqual(await page.locator('.leaflet-roads-pane canvas').count() >= 1, true, 'Forest Service roads should render in the dedicated road canvas pane');
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
  assert(popup.includes('Day hike'));
  assert(!popup.includes('Multi-day'));
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
  const stageBox = await page.locator('.route-map-stage').boundingBox();
  const statusBox = await page.locator('[data-map-status]').boundingBox();
  assert(stageBox && statusBox, 'Map stage and desktop instructions must both render');
  assert(statusBox.y >= stageBox.y + stageBox.height - 2, 'Desktop instructions must sit below the map rather than overlaying map content');
  assert(Math.abs(statusBox.x - stageBox.x) <= 2 && Math.abs(statusBox.width - stageBox.width) <= 4, 'Desktop instructions must span the map width');

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

  let releaseRouteGeometry;
  const routeGeometryGate = new Promise(resolve => { releaseRouteGeometry = resolve; });
  await page.route('**/data/routes/skybridge-arch-v1.geojson', async route => {
    await routeGeometryGate;
    await route.continue();
  });

  let releaseInformalCache;
  const informalCacheGate = new Promise(resolve => { releaseInformalCache = resolve; });
  await page.route('**/data/map/osm-informal-trails.geojson', async route => {
    await informalCacheGate;
    await route.continue();
  });

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });

  // Feature-specific readiness: everything begins disabled while route geometry is gated.
  const mapContainer = page.locator('[data-rrgh-route-map]');
  const searchButton = page.locator('.route-map-utility-tools').getByRole('button', { name: 'Search map', exact: true });
  const exploreButton = page.locator('.route-map-tools-desktop').getByRole('button', { name: 'Explore', exact: true });
  const planOpenButton = page.locator('.route-map-tools-desktop').getByRole('button', { name: 'Plan', exact: true });
  const shareButtonReady = page.locator('.route-map-tools-desktop').getByRole('button', { name: 'Share', exact: true });
  const homeButton = page.getByRole('button', { name: 'Reset map view', exact: true }).first();
  assert.strictEqual(await searchButton.isDisabled(), true, 'Search must begin disabled before route geometry is ready');
  assert.strictEqual(await exploreButton.isDisabled(), true, 'Explore must begin disabled before route geometry is ready');
  assert.strictEqual(await planOpenButton.isDisabled(), true, 'Plan must begin disabled before core map context is ready');
  assert.strictEqual(await shareButtonReady.isDisabled(), true, 'Share must begin disabled before initial map state is restored');
  assert.strictEqual(await homeButton.isDisabled(), true, 'Home must begin disabled before core map context is ready');
  assert.strictEqual(await page.locator('[data-map-preset]').evaluateAll(nodes => nodes.every(node => node.disabled)), true, 'Map View presets must begin disabled');
  assert.strictEqual(await page.locator('[data-route-category-filter]').evaluateAll(nodes => nodes.every(node => node.disabled)), true, 'Route filters must begin disabled');

  releaseRouteGeometry();
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-route-data-ready') === 'true',
    { timeout: 10000 }
  );
  assert.strictEqual(await searchButton.isDisabled(), true, 'Search must remain disabled until core map context is ready');
  assert.strictEqual(await exploreButton.isDisabled(), true, 'Explore must remain disabled until core map context is ready');
  assert.strictEqual(await page.locator('[data-route-category-filter]').evaluateAll(nodes => nodes.every(node => !node.disabled)), true, 'Route filters may unlock with route geometry');

  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-core-ready') === 'true'
      && document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-share-ready') === 'true',
    { timeout: 10000 }
  );
  assert.strictEqual(await homeButton.isDisabled(), false, 'Home must unlock with core map context');
  assert.strictEqual(await searchButton.isDisabled(), false, 'Search must unlock only when core map context is ready');
  assert.strictEqual(await exploreButton.isDisabled(), false, 'Explore must unlock only when core map context is ready');
  assert.strictEqual(await planOpenButton.isDisabled(), false, 'Plan panel must unlock with core map context');
  assert.strictEqual(await shareButtonReady.isDisabled(), false, 'Share must unlock after initial map state restoration');
  assert.strictEqual(await page.locator('[data-map-preset]').evaluateAll(nodes => nodes.every(node => !node.disabled)), true, 'Map View presets must unlock with core context');

  // Geographic orientation labels: transparent gray typography, no badges.
  // Desktop Home shows full stacked names; zooming out eventually becomes broad initials.
  // One zoom in from Home becomes near initials; detailed zoom eventually hides them.
  await page.waitForTimeout(120);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 13, 'Desktop Home zoom should remain 13');
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'full');
  assert.strictEqual(await page.locator('.rrgh-area-label.is-full').count(), 3);
  const desktopFullLabels = page.locator('.rrgh-area-label.is-full .rrgh-area-label-text');
  const desktopFullHtml = await desktopFullLabels.evaluateAll(nodes => nodes.map(node => node.innerHTML));
  assert.deepStrictEqual(desktopFullHtml, ['NATURAL<br>BRIDGE', 'RED<br>RIVER<br>GORGE', 'CLIFTY<br>WILDERNESS']);
  const fullStyles = await desktopFullLabels.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    const hostStyle = getComputedStyle(node.closest('.rrgh-area-label'));
    return {
      background: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      fontStyle: style.fontStyle,
      fontWeight: Number(style.fontWeight),
      color: style.color,
      hostBackground: hostStyle.backgroundColor
    };
  }));
  for (const style of fullStyles) {
    assert(style.background === 'rgba(0, 0, 0, 0)' || style.background === 'transparent', 'Area labels must have no block background: ' + style.background);
    assert.strictEqual(style.borderTopWidth, '0px', 'Area labels must have no visible border');
    assert.strictEqual(style.fontStyle, 'italic', 'Area labels must be italicized');
    assert(style.fontWeight >= 700, 'Area labels must be bold');
    assert(style.color.startsWith('rgba('), 'Area labels should be translucent gray typography: ' + style.color);
    const alpha = Number(style.color.match(/rgba\([^)]*,\s*([0-9.]+)\)$/)?.[1] ?? 1);
    assert(alpha >= 0.7, 'Home-view area labels must be visibly darker than the prior candidate; color=' + style.color);
    assert(style.hostBackground === 'rgba(0, 0, 0, 0)' || style.hostBackground === 'transparent', 'Leaflet label host must be transparent');
  }
  const desktopFullBoxes = await page.locator('.rrgh-area-label.is-full').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect();
    return { x:r.x, y:r.y, width:r.width, height:r.height };
  }));
  assert.strictEqual(desktopFullBoxes.length, 3);
  assert(desktopFullBoxes[1].y >= desktopFullBoxes[2].y + 45, 'RED RIVER GORGE should sit substantially lower than CLIFTY WILDERNESS at desktop Home');

  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 12);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'full', 'One desktop zoom out should keep full labels');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 11);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'full', 'Two desktop zooms out should still keep full labels');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 10);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'initials-broad');
  let desktopInitials = (await page.locator('.leaflet-areaLabels-pane').innerText()).split(/\s+/).filter(Boolean);
  for (const label of ['NB', 'RRG', 'CW']) assert(desktopInitials.includes(label), label);

  await homeButton.click();
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 14);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'initials-near');
  desktopInitials = (await page.locator('.leaflet-areaLabels-pane').innerText()).split(/\s+/).filter(Boolean);
  for (const label of ['NB', 'RRG', 'CW']) assert(desktopInitials.includes(label), label);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 15);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'initials-near');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForTimeout(100);
  assert.strictEqual(Number(await mapContainer.getAttribute('data-current-zoom')), 16);
  assert.strictEqual(await mapContainer.getAttribute('data-area-label-mode'), 'hidden');
  assert.strictEqual(await page.locator('.rrgh-area-label').count(), 0, 'Area labels must disappear at detailed desktop zoom');
  await homeButton.click();
  await page.waitForTimeout(120);

  await exploreButton.click();
  assert(await page.locator('[data-map-sheet="explore"]').isVisible(), 'Explore must open as soon as RRGH route data is ready');
  await exploreButton.click();
  assert(await page.locator('[data-map-sheet="explore"]').isHidden(), 'Explore must close on second click');

  await planOpenButton.click();
  const planPanel = page.locator('[data-map-sheet="plan"]');
  assert(await planPanel.isVisible(), 'Plan panel must open before the optional informal-trail graph finishes');
  assert.strictEqual(await planPanel.getByRole('button', { name: 'Measure distance', exact: true }).isDisabled(), false, 'Measure must be ready with core map context');
  assert.strictEqual(await planPanel.getByRole('button', { name: 'Build trail route', exact: true }).isDisabled(), true, 'Build trail route must remain disabled until planning graph is ready');
  assert((await planPanel.locator('[data-plan-help]').innerText()).includes('Choose a planning tool.'));
  assert.strictEqual(await planPanel.getByRole('button', { name: 'Undo', exact: true }).locator('svg').count(), 1, 'Undo must use an icon');
  assert.strictEqual(await planPanel.getByRole('button', { name: 'Redo', exact: true }).locator('svg').count(), 1, 'Redo must use an icon');
  await planPanel.getByRole('button', { name: 'Measure distance', exact: true }).click();
  assert((await planPanel.locator('[data-plan-help]').innerText()).includes('Click or tap points to measure straight-line distance.'));
  await planPanel.getByRole('button', { name: 'Measure distance', exact: true }).click();
  await planOpenButton.click();

  assert.strictEqual(await mapContainer.getAttribute('data-trail-planning-ready'), 'false');
  releaseInformalCache();
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-trail-planning-ready') === 'true',
    { timeout: 10000 }
  );
  await planOpenButton.click();
  const buildTrailReadyButton = planPanel.getByRole('button', { name: 'Build trail route', exact: true });
  assert.strictEqual(await buildTrailReadyButton.isDisabled(), false, 'Build trail route must unlock when the graph is ready');
  await buildTrailReadyButton.click();
  const buildHelp = await planPanel.locator('[data-plan-help]').innerText();
  assert(buildHelp.includes('snap to the network'));
  assert(buildHelp.includes('Drag a planned segment to adjust or resnap it.'));
  assert(buildHelp.includes('Right-click or press and hold'));

  const planMinimize = planPanel.getByRole('button', { name: 'Minimize planning controls', exact: true });
  assert.strictEqual(await planMinimize.count(), 1, 'Active planning panel must offer Minimize, not Close');
  await planMinimize.click();
  assert(await planPanel.isVisible(), 'Minimizing Build trail route must keep the planning panel visible');
  assert.strictEqual(await planPanel.getAttribute('data-minimized'), 'true');
  assert(await planPanel.locator('[data-plan-live-stats]').isVisible(), 'Minimized planning panel must keep live totals visible');
  assert.strictEqual(await planPanel.locator('.route-plan-mode-buttons').isHidden(), true, 'Minimized panel should hide setup controls');

  const minimizeMapBox = await mapContainer.boundingBox();
  assert(minimizeMapBox);
  await mapContainer.click({ position: { x: minimizeMapBox.width * 0.44, y: minimizeMapBox.height * 0.45 } });
  await mapContainer.click({ position: { x: minimizeMapBox.width * 0.54, y: minimizeMapBox.height * 0.46 } });
  await page.waitForFunction(
    () => {
      const distance = document.querySelector('[data-plan-stats-distance]')?.textContent?.trim();
      return Boolean(distance && distance !== '—' && distance !== '0 ft');
    },
    { timeout: 5000 }
  );
  assert.strictEqual(await planPanel.getAttribute('data-minimized'), 'true', 'Live route pinning must not force the minimized panel open');
  assert((await planPanel.locator('[data-plan-stats-distance]').innerText()).trim() !== '—');

  await planPanel.getByRole('button', { name: 'Expand planning controls', exact: true }).click();
  assert.strictEqual(await planPanel.getAttribute('data-minimized'), null, 'Plan panel should restore from minimized state');
  assert(await planPanel.locator('.route-plan-mode-buttons').isVisible());
  await planPanel.getByRole('button', { name: 'Clear', exact: true }).click();
  await buildTrailReadyButton.click();
  await planOpenButton.click();

  await page.waitForFunction(() => {
    const map = document.querySelector('[data-rrgh-route-map]');
    return map?.getAttribute('data-gorge-county-count') === '4'
      && Number(map?.getAttribute('data-planner-node-count') || 0) > 1
      && Number(map?.getAttribute('data-recreation-site-count') || 0) > 0
      && Boolean(map?.getAttribute('data-current-zoom'));
  }, { timeout: 10000 });

  const body = await page.locator('body').innerText();
  assert(body.includes('Property boundaries are not shown; this map does not establish legal access.'));
  assert(body.includes('Before you go: check closures, road access & conditions'));
  const beforeYouGo = page.locator('.route-map-context-strip').getByRole('link', { name: /Before you go: check closures/ });
  assert.strictEqual(await beforeYouGo.count(), 1);
  const beforeYouGoHref = await beforeYouGo.getAttribute('href');
  assert(beforeYouGoHref.endsWith('/search-and-rescue/#current-conditions'), 'Before-you-go link should target Current Conditions; href=' + beforeYouGoHref);
  assert(body.includes('How to read this map — 30-second guide'));
  assert(body.includes('Map data:'));

  assert.strictEqual(await page.locator('[data-map-layer]').count(), 12);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 11);
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  assert.strictEqual(await page.locator('[data-staging-copy-map-view]').count(), 0, 'Temporary exact-view copier should be removed after Home approval');
  assert.strictEqual(await page.locator('[data-map-layer="osm-informal-trails"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-wilderness"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-context-full-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.getByText('Wilderness full opacity (100%)', { exact: true }).count(), 0);
  assert.strictEqual(await page.locator('[data-opacity="usfs-wilderness"]').count(), 0);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-special-management"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="usfs-land-units"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="rrg-lidar-sun"]').isChecked(), false, 'Gorge LiDAR expansion must be off by default');
  assert.strictEqual(await page.locator('[data-opacity="rrg-lidar-sun"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-opacity="usfs-trails"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-opacity="osm-informal-trails"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-opacity="usfs-roads"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-fine-tune-layer]').count(), 11);
  assert.strictEqual(await page.locator('[data-fine-tune-layer="usgs-topo"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-fine-tune-layer="ky-hillshade"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true);
  await page.locator('.route-layer-panel > summary').click();
  await page.locator('.route-layer-fine-tune > summary').click();
  const reliefFineToggle = page.locator('[data-fine-tune-layer="ky-hillshade"]');
  await reliefFineToggle.check();
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), true, 'Fine-tune checkbox must enable matching main layer');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), false, 'Enabled fine-tune layer must enable its opacity slider');
  assert(Number(await page.locator('[data-opacity="ky-hillshade"]').inputValue()) >= 75, 'Turning Terrain relief on must clamp opacity to at least 75%');
  await page.locator('[data-map-layer="ky-hillshade"]').uncheck();
  assert.strictEqual(await reliefFineToggle.isChecked(), false, 'Main layer checkbox must sync back to fine-tune checkbox');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true, 'Disabled main layer must disable fine-tune opacity');
  await page.locator('.route-layer-fine-tune > summary').click();
  await page.locator('.route-layer-panel > summary').click();
  assert.strictEqual(await page.locator('[data-map-layer="ky-counties"]').count(), 0);
  assert.strictEqual(await page.locator('.leaflet-control-scale').count(), 1);

  // Four Map View presets, including terrain-aware Sunlight.
  assert.strictEqual(await page.locator('[data-map-preset]').count(), 4);
  const sunlightPreset = page.locator('[data-map-preset="sunlight"]');
  const sunlightTeaser = (await sunlightPreset.locator('[data-sunlight-preset-times]').innerText()).trim();
  assert(/^Today · Sunrise .+ · Sunset .+$/.test(sunlightTeaser), 'Sunlight teaser should show today sunrise/sunset; text=' + sunlightTeaser);
  assert(!sunlightTeaser.includes('calculating'), 'Sunlight teaser must be populated before use');
  await sunlightPreset.click();
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').inputValue(), '25');
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').inputValue(), '75');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').inputValue(), '100');
  assert.strictEqual(await page.locator('[data-map-layer="rrg-lidar-sun"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-sun-kind-toggle="sunrise"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-sun-kind-toggle="sunset"]').isChecked(), true);
  assert.strictEqual(await page.locator('.route-map-stage').getAttribute('data-sunlight-mode'), 'true');

  const sunlightMapBox = await mapContainer.boundingBox();
  assert(sunlightMapBox);
  await page.mouse.click(sunlightMapBox.x + sunlightMapBox.width * 0.58, sunlightMapBox.y + sunlightMapBox.height * 0.46, { button: 'right' });
  const coordinateCard = page.locator('[data-coordinate-card]');
  assert(await coordinateCard.isVisible(), 'Map Point card must open in Sunlight mode');
  const coordinateToolbar = coordinateCard.locator('.route-coordinate-toolbar');
  const copyCoordinatesButton = coordinateToolbar.getByRole('button', { name: 'Copy coordinates', exact: true });
  const closeCoordinatesButton = coordinateToolbar.getByRole('button', { name: 'Close coordinates', exact: true });
  const mapPointHeading = coordinateToolbar.locator('.route-coordinate-heading');
  const coordinateTitle = coordinateToolbar.locator('.route-coordinate-title');
  assert.strictEqual(await copyCoordinatesButton.locator('span').count(), 2, 'Copy coordinates must be a two-line button');
  assert.deepStrictEqual(await copyCoordinatesButton.locator('span').evaluateAll(nodes => nodes.map(node => node.textContent.trim())), ['Copy', 'coordinates']);
  const [toolbarBox, mapPointCopyBox, mapPointHeadingBox, mapPointCloseBox, coordinateTitleBox] = await Promise.all([
    coordinateToolbar.boundingBox(), copyCoordinatesButton.boundingBox(), mapPointHeading.boundingBox(),
    closeCoordinatesButton.boundingBox(), coordinateTitle.boundingBox()
  ]);
  assert(toolbarBox && mapPointCopyBox && mapPointHeadingBox && mapPointCloseBox && coordinateTitleBox);
  assert(mapPointCopyBox.height >= 52 && mapPointCopyBox.width >= 68 && mapPointCopyBox.width <= 84, 'Copy coordinates should be a prominent near-square/tall control');
  assert(mapPointHeadingBox.x >= mapPointCopyBox.x + mapPointCopyBox.width + 2, 'The Map Point information block must sit to the right of Copy coordinates');
  assert(mapPointCloseBox.x + mapPointCloseBox.width >= toolbarBox.x + toolbarBox.width - 6, 'Close must remain isolated at the upper-right');
  const titleText = (await coordinateTitle.innerText()).replace(/\s+/g, ' ').trim();
  assert(/^Map point — Elevation /i.test(titleText), 'Map Point title must place elevation on the same line after an em dash; text=' + titleText);

  assert.strictEqual(await coordinateCard.locator('.route-map-point-symbol').count(), 1, 'Map Point card must show the same selected-point legend symbol');
  assert.strictEqual(await page.locator('.route-map-point-icon .route-map-point-symbol').count(), 1, 'Selected point must remain unmistakable on the map');
  const [cardPointSymbolBox, mapPointSymbolBox] = await Promise.all([
    coordinateCard.locator('.route-map-point-symbol').boundingBox(),
    page.locator('.route-map-point-icon .route-map-point-symbol').boundingBox()
  ]);
  assert(cardPointSymbolBox && mapPointSymbolBox);
  assert(cardPointSymbolBox.width <= 18 && cardPointSymbolBox.height <= 18, 'Map Point card symbol must be deliberately small');
  assert(mapPointSymbolBox.width <= 20 && mapPointSymbolBox.height <= 20, 'Selected map marker must be small rather than visually dominant');
  assert.strictEqual(await mapContainer.getAttribute('data-coordinate-point-visible'), 'true');
  await page.waitForTimeout(350);
  assert.strictEqual(await mapContainer.getAttribute('data-coordinate-point-auto-pan'), 'true', 'Selecting a point away from the safe view should auto-pan it clear of the card');
  const [selectedPointBox, coordinateCardBox] = await Promise.all([
    page.locator('.route-map-point-icon').boundingBox(),
    coordinateCard.boundingBox()
  ]);
  assert(selectedPointBox && coordinateCardBox);
  const overlapsCard = selectedPointBox.x < coordinateCardBox.x + coordinateCardBox.width
    && selectedPointBox.x + selectedPointBox.width > coordinateCardBox.x
    && selectedPointBox.y < coordinateCardBox.y + coordinateCardBox.height
    && selectedPointBox.y + selectedPointBox.height > coordinateCardBox.y;
  assert.strictEqual(overlapsCard, false, 'Auto-pan must keep the selected map point visible outside the Map Point card');

  const todayPanel = coordinateCard.locator('[data-coordinate-sun-today]');
  assert(/sunlight today/i.test(await todayPanel.innerText()));
  for (const label of ['Sunrise', 'First direct sun', 'Last direct sun', 'Sunset']) assert((await todayPanel.innerText()).includes(label), label);
  const [todayBox, toolbarBoxAfterOpen, todayTitleBox, todaySunriseBox] = await Promise.all([
    todayPanel.boundingBox(),
    coordinateToolbar.boundingBox(),
    todayPanel.locator('strong').first().boundingBox(),
    todayPanel.locator('span').first().boundingBox()
  ]);
  assert(todayBox && toolbarBoxAfterOpen && todayTitleBox && todaySunriseBox && todayBox.y >= toolbarBoxAfterOpen.y + toolbarBoxAfterOpen.height - 2, 'Sunlight Today must sit below the Map Point header instead of occupying the upper-right');
  assert(todaySunriseBox.x >= todayTitleBox.x + todayTitleBox.width + 8, 'Sunlight Today needs visible breathing room before Sunrise');
  assert.strictEqual(await coordinateCard.locator('[data-coordinate-sun-details]').getAttribute('open'), '');
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-sunlight-terrain-ready') === 'true',
    { timeout: 10000 }
  );

  const elevationText = (await coordinateCard.locator('[data-coordinate-elevation]').innerText()).trim();
  assert(/^Elevation [\d,]+ ft · [\d,]+ m$/.test(elevationText), 'Every Map Point should show resolved elevation; text=' + elevationText);
  for (const selector of ['[data-coordinate-sunrise-today]','[data-coordinate-first-direct-today]','[data-coordinate-last-direct-today]','[data-coordinate-sunset-today]']) {
    const value = (await coordinateCard.locator(selector).innerText()).trim();
    assert(value && value !== 'Calculating…' && value !== 'Unavailable', selector + ' must resolve; value=' + value);
  }

  assert.strictEqual(await coordinateCard.locator('.route-coordinate-sun-table tbody tr').count(), 10, 'Map Point must show the next 10 days');
  const sunlightHeaderModel = await coordinateCard.locator('.route-coordinate-sun-table thead th').evaluateAll(nodes => nodes.map(node => ({
    label: node.getAttribute('aria-label') || node.textContent.trim(),
    stack: Array.from(node.querySelectorAll('.route-sun-header-stack > span')).map(line => line.textContent.trim())
  })));
  assert.deepStrictEqual(sunlightHeaderModel.map(item => item.label), ['Date', 'Sunrise', 'First direct sun', 'Last direct sun', 'Sunset']);
  assert.deepStrictEqual(sunlightHeaderModel[2].stack, ['First', 'direct', 'sun']);
  assert.deepStrictEqual(sunlightHeaderModel[3].stack, ['Last', 'direct', 'sun']);
  assert(/today/i.test(await coordinateCard.locator('.route-coordinate-sun-table tbody tr').first().locator('th').innerText()), 'First sunlight row must explicitly identify Today');
  const sunTable = coordinateCard.locator('.route-coordinate-sun-table');
  const [sunTableBox, expandedCardBox, firstDirectHeaderBox, lastDirectHeaderBox] = await Promise.all([
    sunTable.boundingBox(),
    coordinateCard.boundingBox(),
    sunTable.locator('thead th').nth(2).boundingBox(),
    sunTable.locator('thead th').nth(3).boundingBox()
  ]);
  assert(sunTableBox && expandedCardBox && firstDirectHeaderBox && lastDirectHeaderBox);
  assert(sunTableBox.width <= expandedCardBox.width, 'Expanded 10-day table must remain inside the Map Point card');
  assert(expandedCardBox.width <= 520, 'Desktop Map Point card should stay compact; width=' + expandedCardBox.width);
  assert(sunTableBox.width <= 485, 'Desktop sunlight table should size to its content instead of stretching wide; width=' + sunTableBox.width);
  assert(firstDirectHeaderBox.width <= 80 && lastDirectHeaderBox.width <= 80, 'Direct-sun columns should stay narrow after three-line headings');

  await coordinateCard.locator('[data-coordinate-sun-details] > summary').click();
  assert.strictEqual(await coordinateCard.locator('[data-coordinate-sun-details]').getAttribute('open'), null, 'Next 10 days may be collapsed independently');
  const collapsedToday = await todayPanel.innerText();
  assert(collapsedToday.includes('First direct sun') && collapsedToday.includes('Last direct sun'), 'Today stack must remain visible while the 10-day table is collapsed');
  const collapsedCardBox = await coordinateCard.boundingBox();
  assert(collapsedCardBox && collapsedCardBox.width <= 500, 'Collapsed Map Point card should be genuinely compact');
  assert(collapsedCardBox.width <= expandedCardBox.width + 2, 'Collapsing the 10-day table must not make the Map Point card wider');

  const sunlightCardText = await coordinateCard.innerText();
  assert(sunlightCardText.includes('Terrain / elevation source: Kentucky KyFromAbove Phase 2 Bare Earth DEM.'));
  assert(sunlightCardText.includes('trees, cliffs/overhangs, clouds and local obstructions'));
  assert(providerRequests.some(url => new URL(url).hostname === 'kyraster.ky.gov'), 'Terrain-aware Sunlight should query the Kentucky bare-earth elevation service');
  await coordinateCard.locator('[data-coordinate-close]').click();
  assert.strictEqual(await page.locator('.route-map-point-icon').count(), 0, 'Closing Map Point should remove the selected-point marker');
  assert.strictEqual(await mapContainer.getAttribute('data-coordinate-point-visible'), null);
  await page.locator('[data-map-preset="hiking"]').click();

  const cacheData = await page.evaluate(async () => {
    const response = await fetch('/data/map/osm-informal-trails.geojson', { cache: 'no-cache' });
    if (!response.ok) throw new Error('OSM cache HTTP ' + response.status);
    return response.json();
  });
  assert(cacheData.features.length > 100, 'RRGH OSM cache should contain substantial community trail coverage');

  const gorgeManifest = await page.evaluate(async () => {
    const response = await fetch('/data/map/rrg-lidar-sun-manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Gorge LiDAR manifest HTTP ' + response.status);
    return response.json();
  });
  assert.strictEqual(gorgeManifest.version, 'lidar-only-home-extent-v2');
  assert.strictEqual(gorgeManifest.minimumElevationFeet, 1100);
  assert.strictEqual(gorgeManifest.sectors.length, 30);
  assert.deepStrictEqual(gorgeManifest.boundsWgs84, [-83.745, 37.73, -83.475, 37.93]);
  assert.strictEqual(gorgeManifest.sectorGrid.ring, 1);
  assert(gorgeManifest.counts.features > 50000, 'Sunrise / Sunset Potential should contain substantial generated terrain geometry');
  assert.strictEqual(gorgeManifest.generationInputs.usesAerial, false);
  assert.strictEqual(gorgeManifest.generationInputs.usesCanopy, false);
  assert.strictEqual(gorgeManifest.generationInputs.usesTrails, false);
  assert.strictEqual(gorgeManifest.generationInputs.usesMarkedReviewPoints, false);
  const sampleSector = await page.evaluate(async (file) => {
    const response = await fetch('/' + file, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Gorge LiDAR sector HTTP ' + response.status);
    return response.json();
  }, gorgeManifest.sectors.find(sector => sector.features > 1000).file);
  assert(sampleSector.features.some(feature => feature.properties?.hard === true), 'Gorge LiDAR sector must preserve hard cliff-lip geometry');
  assert(sampleSector.features.some(feature => feature.properties?.hard === false), 'Gorge LiDAR sector must preserve inward gradient geometry');

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
  for (const category of ['Day hikes','Backpacking','Off-trail']) {
    assert.strictEqual(await page.getByLabel(category, { exact: true }).count(), 1, category);
  }
  assert.strictEqual(await page.getByLabel('Multi-day', { exact: true }).count(), 0);
  assert.strictEqual(await page.getByLabel('Official', { exact: true }).count(), 0);
  assert.strictEqual(await page.getByLabel('Mixed', { exact: true }).count(), 0);

  const dayHikeFilter = page.locator('[data-route-category-filter="day-hike"]');
  const backpackingFilter = page.locator('[data-route-category-filter="backpacking"]');
  const offTrailFilter = page.locator('[data-route-category-filter="off-trail"]');
  assert.strictEqual(await dayHikeFilter.isChecked(), true);
  assert.strictEqual(await backpackingFilter.isChecked(), true);
  assert.strictEqual(await offTrailFilter.isChecked(), true);
  await dayHikeFilter.uncheck();
  await page.waitForFunction(() => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-route-count') === '0');
  await dayHikeFilter.check();
  await page.waitForFunction(() => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-route-count') === '1');
  await backpackingFilter.uncheck();
  await offTrailFilter.uncheck();
  assert.strictEqual(await dayHikeFilter.isChecked(), true);
  assert.strictEqual(await backpackingFilter.isChecked(), false);
  assert.strictEqual(await offTrailFilter.isChecked(), false);

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
  assert.strictEqual(await mapContainer.getAttribute('data-home-view'), 'detail', 'Desktop Home should retain the accepted detail start');
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
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').inputValue(), '25');
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').inputValue(), '75');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').inputValue(), '100');
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

  const gorgeToggle = page.locator('[data-map-layer="rrg-lidar-sun"]');
  const sunriseToggle = page.locator('[data-sun-kind-toggle="sunrise"]');
  const sunsetToggle = page.locator('[data-sun-kind-toggle="sunset"]');
  const sunFineToggle = page.locator('[data-fine-tune-layer="rrg-lidar-sun"]');
  assert.strictEqual(await sunriseToggle.isChecked(), false);
  assert.strictEqual(await sunsetToggle.isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="rrg-lidar-sun"]').isDisabled(), true);
  assert(!(await page.locator('.route-layer-panel').innerText()).includes('Potential does not guarantee standing room'));

  await sunriseToggle.check();
  assert.strictEqual(await gorgeToggle.isChecked(), true, 'Sunrise alone must keep the combined master active');
  assert.strictEqual(await gorgeToggle.evaluate(el => el.indeterminate), true, 'Combined master must be indeterminate with Sunrise only');
  assert.strictEqual(await sunFineToggle.evaluate(el => el.indeterminate), true, 'Combined Fine tune toggle must mirror partial sunrise/sunset state');
  assert.strictEqual(await page.locator('[data-opacity="rrg-lidar-sun"]').isDisabled(), false);

  await sunsetToggle.check();
  assert.strictEqual(await gorgeToggle.evaluate(el => el.indeterminate), false);
  assert.strictEqual(await sunFineToggle.evaluate(el => el.indeterminate), false);

  await sunriseToggle.uncheck();
  assert.strictEqual(await sunsetToggle.isChecked(), true);
  assert.strictEqual(await gorgeToggle.evaluate(el => el.indeterminate), true);

  await gorgeToggle.uncheck();
  assert.strictEqual(await sunriseToggle.isChecked(), false, 'Combined master off must turn Sunrise off');
  assert.strictEqual(await sunsetToggle.isChecked(), false, 'Combined master off must turn Sunset off');
  assert.strictEqual(await page.locator('[data-opacity="rrg-lidar-sun"]').isDisabled(), true);

  await gorgeToggle.check();
  assert.strictEqual(await sunriseToggle.isChecked(), true, 'Combined master on must turn Sunrise on');
  assert.strictEqual(await sunsetToggle.isChecked(), true, 'Combined master on must turn Sunset on');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-rrg-lidar-sun-loaded-sectors')) > 0
      && Number(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-rrg-lidar-sun-feature-count')) > 0,
    { timeout: 20000 }
  );
  assert.strictEqual(await mapContainer.getAttribute('data-rrg-lidar-sun-load-error'), null, 'Gorge LiDAR sectors should load without error');
  assert((await page.locator('.leaflet-lidarSun-pane canvas, .leaflet-lidarSun-pane path').count()) > 0, 'Enabled Sunrise / Sunset Potential should render in the LiDAR pane');
  assert((await page.locator('.route-layer-panel').innerText()).includes('Sunrise / Sunset Potential'));
  await gorgeToggle.uncheck();

  const aerialToggle = page.locator('[data-map-layer="kyaerial-phase3"]');
  const leafOffAerialToggle = page.locator('[data-map-layer="kyaerial-phase2-leafoff"]');
  const kyTopoToggle = page.locator('[data-map-layer="kytopo"]');
  const usgsTopoToggle = page.locator('[data-map-layer="usgs-topo"]');
  const lidarToggle = page.locator('[data-map-layer="ky-hillshade"]');

  assert.strictEqual(await aerialToggle.isChecked(), false);
  assert.strictEqual(await leafOffAerialToggle.isChecked(), false);
  await aerialToggle.check();
  assert.strictEqual(await aerialToggle.isChecked(), true);
  assert.strictEqual(await leafOffAerialToggle.isChecked(), false, 'Leaf-on must exclude Leaf-off');
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

  await leafOffAerialToggle.check();
  assert.strictEqual(await leafOffAerialToggle.isChecked(), true, 'Leaf-off aerial must turn on');
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Leaf-off aerial must turn Leaf-on aerial off');
  assert.strictEqual(await kyTopoToggle.isChecked(), false);
  assert.strictEqual(await usgsTopoToggle.isChecked(), false);
  assert.strictEqual(await lidarToggle.isChecked(), false);
  await page.waitForTimeout(250);
  assert(providerRequests.some(url => url.includes('Ky_Imagery_Phase2_6IN_WGS84WM')), 'Leaf-off aerial must request the verified Phase 2 6-inch service');

  await kyTopoToggle.check();
  assert.strictEqual(await page.locator('[data-opacity="kytopo"]').isDisabled(), false, 'Enabled Kentucky Topo must enable its opacity');
  assert.strictEqual(await page.locator('[data-opacity="usgs-topo"]').isDisabled(), true, 'USGS Topo opacity must stay disabled while that layer is off');
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').isDisabled(), true, 'Terrain relief opacity must stay disabled while that layer is off');
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Selecting Kentucky Topo must keep Leaf-on aerial off');
  assert.strictEqual(await leafOffAerialToggle.isChecked(), false, 'Selecting Kentucky Topo must turn Leaf-off aerial off');

  await aerialToggle.check();
  assert.strictEqual(await kyTopoToggle.isChecked(), false, 'Selecting Leaf-on aerial must turn Kentucky Topo off');
  await usgsTopoToggle.check();
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Selecting USGS Topo must turn Leaf-on aerial off');
  assert.strictEqual(await leafOffAerialToggle.isChecked(), false, 'Selecting USGS Topo must keep Leaf-off aerial off');

  await page.getByRole('button', { name: /^Hiking/ }).click();
  assert.strictEqual(await kyTopoToggle.isChecked(), false, 'Hiking preset should turn Kentucky Topo off');
  assert.strictEqual(await usgsTopoToggle.isChecked(), true, 'Hiking preset should leave only USGS Topo on among base/terrain layers');
  assert.strictEqual(await lidarToggle.isChecked(), false, 'Hiking preset should turn Terrain relief off');
  assert.strictEqual(await aerialToggle.isChecked(), false, 'Hiking preset should turn Leaf-on aerial off');
  assert.strictEqual(await leafOffAerialToggle.isChecked(), false, 'Hiking preset should turn Leaf-off aerial off');
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
  const headingBox = await page.locator('.route-coordinate-heading').boundingBox();
  const closeBox = await page.locator('[data-coordinate-close]').boundingBox();
  const coordinateCardBox2 = await page.locator('[data-coordinate-card]').boundingBox();
  assert(copyBox && headingBox && closeBox && coordinateCardBox2);
  assert(headingBox.x >= copyBox.x + copyBox.width + 2, 'Map Point information must sit to the right of Copy coordinates');
  assert(closeBox.x + closeBox.width >= coordinateCardBox2.x + coordinateCardBox2.width - 8, 'Coordinate × should remain isolated at the card upper-right');
  assert(closeBox.y <= copyBox.y + 12, 'Coordinate × should align to the top edge rather than consuming a separate action row');
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
  await page.waitForFunction(() => Boolean(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-north-west')), { timeout: 3000 });
  const planningNorthWestValue = await mapContainer.getAttribute('data-map-north-west');
  const [planningNorthWestLat, planningNorthWestLng] = planningNorthWestValue.split(',').map(Number);

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
    const northWest = project(planningNorthWestLat, planningNorthWestLng);
    const point = project(lat, lng);
    return {
      x: point.x - northWest.x,
      y: point.y - northWest.y
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
      point.x >= 4 && point.x <= homeBox.width - 4
      && point.y >= 4 && point.y <= homeBox.height - 4;
    if (!insideMap(candidateA) || !insideMap(candidateB)) continue;
    await mapContainer.click({ position: candidateA });
    await page.keyboard.press('Escape');
    await mapContainer.click({ position: candidateB });
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
    { x: homeBox.width * 0.78, y: homeBox.height * 0.22 },
    { x: homeBox.width * 0.70, y: homeBox.height * 0.70 },
    { x: homeBox.width * 0.52, y: homeBox.height * 0.20 },
    { x: homeBox.width * 0.84, y: homeBox.height * 0.52 },
    { x: homeBox.width * 0.58, y: homeBox.height * 0.66 },
    { x: homeBox.width * 0.38, y: homeBox.height * 0.22 }
  ];

  const plannerCounts = statusText => {
    const match = statusText.match(/(\d+) snapped segment\(s\), (\d+) off-trail segment\(s\)/);
    return match ? { snapped: Number(match[1]), offTrail: Number(match[2]) } : null;
  };

  let offTrail = null;
  for (const candidate of offTrailCandidates) {
    await mapContainer.click({ position: candidate });
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

  // Off-trail creation was already proven above using an actual planner click,
  // including rendered dashed geometry plus delete/undo. The Home viewport can
  // legitimately be dense enough that every sampled drag target remains within
  // the 90 m snapping tolerance, so do not require a second off-network point in
  // this same viewport. The drag contract here is resnapping an existing
  // off-trail leg onto mapped network, which was just verified.

  // The earlier off-trail leg already proved right-click delete + Undo.
  // Here, prove the drag/resnap action participates cleanly in history:
  // Undo restores the off-trail state and Redo restores the snapped state.
  assert.strictEqual(await undo.isDisabled(), false);
  await undo.hover();
  const undoTooltip = await undo.evaluate(element => getComputedStyle(element, '::after').content);
  assert(undoTooltip.includes('Undo'), 'Enabled Undo icon should expose a hover tooltip');
  await undo.click();
  await page.waitForTimeout(150);
  editStatus = await page.locator('[data-map-status]').innerText();
  assert(editStatus.includes('1 off-trail segment'), 'Undo should restore the pre-resnap off-trail state; status=' + editStatus);
  assert.strictEqual(await redo.isDisabled(), false);
  await redo.click();
  await page.waitForTimeout(150);
  editStatus = await page.locator('[data-map-status]').innerText();
  assert(editStatus.includes('2 snapped segment(s), 0 off-trail segment(s)'), 'Redo should restore the resnapped state; status=' + editStatus);

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

  await backpackingFilter.uncheck();
  await offTrailFilter.check();
  assert.strictEqual(await dayHikeFilter.isChecked(), true);
  assert.strictEqual(await backpackingFilter.isChecked(), false);
  assert.strictEqual(await offTrailFilter.isChecked(), true);

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
  assert.strictEqual(shared.searchParams.get('rrghCategories'), 'day-hike,off-trail');
  assert.strictEqual(shared.searchParams.has('rrghTrips'), false);
  assert.strictEqual(shared.searchParams.has('rrghStatus'), false);
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
  assert.strictEqual(await page.locator('[data-route-category-filter="day-hike"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-route-category-filter="backpacking"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-route-category-filter="off-trail"]').isChecked(), true);
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
  const cdp = await context.newCDPSession(page);
  const providerRequests = [];
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-current-zoom')), { timeout: 10000 });

  const mobileTopbar = page.locator('.route-map-mobile-topbar');
  assert.strictEqual(await mobileTopbar.locator('[data-map-action="locate"]').count(), 1, 'My location');
  assert.strictEqual((await mobileTopbar.locator('[data-map-action="locate"]').innerText()).trim(), 'My location');
  assert.strictEqual(await mobileTopbar.locator('[data-map-action="home"]').count(), 1, 'Home');
  assert.strictEqual((await mobileTopbar.locator('[data-map-action="home"]').innerText()).trim(), 'Home');
  assert.strictEqual(await mobileTopbar.locator('[data-sheet-open="layers"]').count(), 1, 'Layers');
  assert.strictEqual((await mobileTopbar.locator('[data-sheet-open="layers"]').innerText()).trim(), 'Layers');
  for (const label of ['Search','Explore','Plan','Share']) {
    assert.strictEqual(await page.locator('.route-map-mobile-bar').getByRole('button', { name: label, exact: true }).count(), 1, label);
  }
  assert(await page.locator('.route-map-mobile-topbar').isVisible());
  assert(await page.locator('.route-map-mobile-bar').isVisible());
  assert(await page.locator('[data-map-mobile-status]').isVisible());

  const map = page.locator('[data-rrgh-route-map]');
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-core-ready') === 'true',
    { timeout: 10000 }
  );
  await page.waitForTimeout(120);
  const mobileStartZoom = Number(await map.getAttribute('data-current-zoom'));
  assert.strictEqual(await map.getAttribute('data-home-view'), 'gorge-overview', 'Mobile Home/start must use the Gorge overview');
  assert.strictEqual(mobileStartZoom, 11, 'Mobile Home/start must stay at the requested 5 km / 3 mi view');
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'full');
  assert.strictEqual(await page.locator('.rrgh-area-label.is-full').count(), 3, 'Mobile Home should show the three full stacked area names');
  const mobileFullHtml = await page.locator('.rrgh-area-label.is-full .rrgh-area-label-text').evaluateAll(nodes => nodes.map(node => node.innerHTML));
  assert.deepStrictEqual(mobileFullHtml, ['NATURAL<br>BRIDGE', 'RED<br>RIVER<br>GORGE', 'CLIFTY<br>WILDERNESS']);
  const [mobileMapHomeBox, mobileFullBoxes] = await Promise.all([
    map.boundingBox(),
    page.locator('.rrgh-area-label.is-full').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect();
      return { x:r.x, right:r.right, y:r.y, bottom:r.bottom };
    }))
  ]);
  assert(mobileMapHomeBox);
  for (const box of mobileFullBoxes) {
    assert(box.x >= mobileMapHomeBox.x - 1, 'Mobile Home area label must not clip off the left edge');
    assert(box.right <= mobileMapHomeBox.x + mobileMapHomeBox.width + 1, 'Mobile Home area label must not clip off the right edge');
  }

  const scaleTextsAtHome = await page.locator('.leaflet-control-scale-line').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
  assert(scaleTextsAtHome.includes('5 km'), 'Mobile Home metric scale should be 5 km; got ' + scaleTextsAtHome.join(' / '));
  assert(scaleTextsAtHome.includes('3 mi'), 'Mobile Home imperial scale should be 3 mi; got ' + scaleTextsAtHome.join(' / '));

  await page.locator('[data-map-preset="sunlight"]').click();
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const mobileMapPointBox = await map.boundingBox();
  const mobileViewport = page.viewportSize();
  assert(mobileMapPointBox && mobileViewport);
  const visibleMapTop = Math.max(0, mobileMapPointBox.y);
  const visibleMapBottom = Math.min(mobileViewport.height, mobileMapPointBox.y + mobileMapPointBox.height);
  assert(visibleMapBottom - visibleMapTop >= 120, 'Mobile map must have a substantial visible touch target');
  const holdPoint = {
    x: mobileMapPointBox.x + mobileMapPointBox.width * 0.52,
    y: visibleMapTop + (visibleMapBottom - visibleMapTop) * 0.44,
    radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1, id: 7
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [holdPoint] });
  await page.waitForTimeout(650);
  const mobileCoordinateCard = page.locator('[data-coordinate-card]');
  assert(await mobileCoordinateCard.isVisible(), 'A real mobile touch hold must open the Map Point card');
  assert.strictEqual(await page.evaluate(() => window.getSelection()?.toString() || ''), '', 'Mobile long hold must not select map text');
  const mapSelectionStyle = await map.evaluate(element => ({
    userSelect: getComputedStyle(element).userSelect,
    webkitUserSelect: getComputedStyle(element).webkitUserSelect
  }));
  assert.strictEqual(mapSelectionStyle.userSelect, 'none', 'Map must suppress text selection during touch hold');
  assert.strictEqual(mapSelectionStyle.webkitUserSelect, 'none', 'Map must suppress WebKit text selection during touch hold');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(
    () => document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-sunlight-terrain-ready') === 'true',
    { timeout: 10000 }
  );
  const mobileHeaderModel = await mobileCoordinateCard.locator('.route-coordinate-sun-table thead th').evaluateAll(nodes => nodes.map(node => ({
    label: node.getAttribute('aria-label') || node.textContent.trim(),
    stack: Array.from(node.querySelectorAll('.route-sun-header-stack > span')).map(line => line.textContent.trim())
  })));
  assert.deepStrictEqual(mobileHeaderModel.map(item => item.label), ['Date', 'Sunrise', 'First direct sun', 'Last direct sun', 'Sunset']);
  assert.deepStrictEqual(mobileHeaderModel[2].stack, ['First', 'direct', 'sun']);
  assert.deepStrictEqual(mobileHeaderModel[3].stack, ['Last', 'direct', 'sun']);
  const mobileTodayLayout = await mobileCoordinateCard.locator('[data-coordinate-sun-today]').evaluate(node => {
    const title = node.querySelector(':scope > strong').getBoundingClientRect();
    const metrics = Array.from(node.querySelectorAll(':scope > span')).map(span => {
      const r = span.getBoundingClientRect();
      return { x:r.x, y:r.y, width:r.width, height:r.height };
    });
    return { title:{x:title.x,y:title.y,width:title.width,height:title.height}, metrics };
  });
  assert.strictEqual(mobileTodayLayout.metrics.length, 4);
  assert(Math.abs(mobileTodayLayout.metrics[0].y - mobileTodayLayout.metrics[1].y) <= 3, 'Mobile Today row one must contain Sunrise and First direct sun');
  assert(Math.abs(mobileTodayLayout.metrics[2].y - mobileTodayLayout.metrics[3].y) <= 3, 'Mobile Today row two must contain Last direct sun and Sunset');
  assert(mobileTodayLayout.metrics[2].y >= mobileTodayLayout.metrics[0].y + 18, 'Mobile Today metrics need two clearly separated rows');
  const [mobileCardBox, mobileTableBox, mobileHeaderBoxes] = await Promise.all([
    mobileCoordinateCard.boundingBox(),
    mobileCoordinateCard.locator('.route-coordinate-sun-table').boundingBox(),
    mobileCoordinateCard.locator('.route-coordinate-sun-table thead th').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect();
      return { width:r.width, height:r.height, wordBreak:getComputedStyle(node).wordBreak };
    }))
  ]);
  assert(mobileCardBox && mobileTableBox);
  assert(mobileCardBox.width <= 380, 'Mobile Map Point card must stay inside the 390px viewport; width=' + mobileCardBox.width);
  assert(mobileTableBox.width <= mobileCardBox.width - 8, 'Mobile sunlight table must fit comfortably inside the Map Point card');
  assert(mobileHeaderBoxes[2].height >= 24 && mobileHeaderBoxes[2].height <= 42, 'First direct sun should be a deliberate three-line header');
  assert(mobileHeaderBoxes[3].height >= 24 && mobileHeaderBoxes[3].height <= 42, 'Last direct sun should be a deliberate three-line header');
  for (const header of mobileHeaderBoxes) assert(header.wordBreak !== 'break-all', 'Mobile sunlight headers must never break individual words');
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(mobileOverflow <= 2, 'Mobile Map Point must not create horizontal page overflow: ' + mobileOverflow);
  assert(/today/i.test(await mobileCoordinateCard.locator('.route-coordinate-sun-table tbody tr').first().locator('th').innerText()));
  await mobileCoordinateCard.locator('[data-coordinate-close]').click();
  await page.locator('[data-map-preset="hiking"]').click();
  await mobileTopbar.locator('[data-map-action="home"]').click();
  await page.waitForTimeout(150);

  await page.locator('[data-map-action="zoom-in"]').first().evaluate(button => button.click());
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 12);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'initials-near', 'One mobile zoom in from Home must become acronyms');
  let areaLabelText = await page.locator('.leaflet-areaLabels-pane').innerText();
  for (const label of ['NB', 'RRG', 'CW']) assert(areaLabelText.split(/\s+/).includes(label), label);

  await page.locator('[data-map-action="zoom-in"]').first().evaluate(button => button.click());
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 13);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'initials-near');
  await page.locator('[data-map-action="zoom-in"]').first().evaluate(button => button.click());
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 14);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'hidden');
  assert.strictEqual(await page.locator('.rrgh-area-label').count(), 0, 'Mobile area labels must disappear at detailed zoom');

  await mobileTopbar.locator('[data-map-action="home"]').click();
  await page.waitForTimeout(150);
  await page.locator('[data-map-action="zoom-out"]').first().evaluate(button => button.click());
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 10);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'full', 'One mobile zoom out should retain full names');
  await page.locator('[data-map-action="zoom-out"]').first().evaluate(button => button.click());
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 9);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'initials-broad', 'Broader mobile view should use acronyms');
  areaLabelText = await page.locator('.leaflet-areaLabels-pane').innerText();
  for (const label of ['NB', 'RRG', 'CW']) assert(areaLabelText.split(/\s+/).includes(label), label);
  await mobileTopbar.locator('[data-map-action="home"]').click();
  await page.waitForTimeout(150);
  assert.strictEqual(Number(await map.getAttribute('data-current-zoom')), 11);
  assert.strictEqual(await map.getAttribute('data-area-label-mode'), 'full');

  const mobilePresets = page.locator('[data-map-preset]');
  assert.strictEqual(await mobilePresets.count(), 4);
  const presetBoxes = await mobilePresets.evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  assert(Math.abs(presetBoxes[0].y - presetBoxes[1].y) <= 2, 'First two mobile Map View buttons should share row one');
  assert(Math.abs(presetBoxes[2].y - presetBoxes[3].y) <= 2, 'Aerial and Sunlight should share row two');
  assert(presetBoxes[2].y > presetBoxes[0].y + 10, 'Mobile Map View should render as a 2x2 grid');
  const mobileSunlightTeaser = await page.locator('[data-map-preset="sunlight"] [data-sunlight-preset-times]').innerText();
  assert(mobileSunlightTeaser.includes('Sunrise') && mobileSunlightTeaser.includes('Sunset'));

  let box = await map.boundingBox();
  const topbarBox = await page.locator('.route-map-mobile-topbar').boundingBox();
  const mobileStatusBox = await page.locator('[data-map-mobile-status]').boundingBox();
  const mobileBarBox = await page.locator('.route-map-mobile-bar').boundingBox();
  assert(box && topbarBox && mobileStatusBox && mobileBarBox);
  assert(topbarBox.y + topbarBox.height <= box.y + 2, 'Mobile My location/Home/Layers controls should sit above the map');
  assert(mobileStatusBox.y >= box.y + box.height - 2, 'Mobile instructions should sit below the map instead of overlaying it');
  assert(mobileBarBox.y >= mobileStatusBox.y + mobileStatusBox.height - 2, 'Search/Explore/Plan/Share should sit below the mobile instructions');
  assert(box.height >= 0.6 * 844, 'Mobile map should occupy most of the viewport; height=' + box.height);

  await mobileTopbar.locator('[data-sheet-open="layers"]').click();
  assert(await page.locator('.route-layer-panel').isVisible());
  assert(await page.locator('.route-layer-fine-tune > summary').isVisible());
  const layerSummary = page.locator('.route-layer-panel > summary');
  const stickyBefore = await layerSummary.boundingBox();
  await page.locator('.route-layer-panel').evaluate(panel => { panel.scrollTop = Math.min(300, panel.scrollHeight - panel.clientHeight); });
  await page.waitForTimeout(80);
  const stickyAfter = await layerSummary.boundingBox();
  assert(stickyBefore && stickyAfter);
  assert(Math.abs(stickyAfter.y - stickyBefore.y) <= 2, 'Layers header should remain fixed while the panel body scrolls');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, 'Mobile horizontal overflow: ' + overflow);

  await layerSummary.click();
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  box = await map.boundingBox();
  assert(box);

  const mobileScale = page.locator('.leaflet-control-scale');
  const scaleBox = await mobileScale.boundingBox();
  assert(scaleBox, 'Mobile scale must be visible');
  const scaleOffsetX = scaleBox.x - box.x;
  const scaleOffsetY = scaleBox.y - box.y;
  assert(scaleOffsetX >= 0 && scaleOffsetX <= 24, 'Mobile scale should sit in the map upper-left corner; x offset=' + scaleOffsetX);
  assert(scaleOffsetY >= 0 && scaleOffsetY <= 24, 'Mobile scale should sit in the map upper-left corner; y offset=' + scaleOffsetY);

  await page.waitForFunction(() => Boolean(document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-map-center')), { timeout: 3000 });
  // The broad mobile Home extent can already be constrained at the county max-bounds edge.
  // Zoom in once before exercising free vertical panning so this tests gesture ownership,
  // not whether the overview has spare room to move inside its legal map bounds.
  await page.locator('[data-map-action="zoom-in"]').first().evaluate(button => button.click());
  await page.waitForTimeout(180);
  const centerBeforeVerticalPan = await map.getAttribute('data-map-center');
  const scrollBeforeVerticalPan = await page.evaluate(() => window.scrollY);
  const panX = box.x + box.width * 0.52;
  const panStartY = box.y + box.height * 0.42;
  const touchPoint = (y) => ({ x: panX, y, radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1, id: 11 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(panStartY)] });
  for (const delta of [22, 44, 66, 88, 110]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(panStartY + delta)] });
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  const centerAfterVerticalPan = await map.getAttribute('data-map-center');
  const scrollAfterVerticalPan = await page.evaluate(() => window.scrollY);
  assert.notStrictEqual(centerAfterVerticalPan, centerBeforeVerticalPan, 'A vertical touch drag inside the mobile map must pan the map');
  assert(Math.abs(scrollAfterVerticalPan - scrollBeforeVerticalPan) <= 3, 'A vertical touch drag inside the mobile map must not drag the page; before=' + scrollBeforeVerticalPan + ' after=' + scrollAfterVerticalPan);

  const leftScrollGutter = page.locator('[data-map-scroll-gutter="left"]');
  const rightScrollGutter = page.locator('[data-map-scroll-gutter="right"]');
  assert(await leftScrollGutter.isVisible(), 'Left mobile page-scroll gutter must be visible');
  assert(await rightScrollGutter.isVisible(), 'Right mobile page-scroll gutter must be visible');
  const leftGutterBox = await leftScrollGutter.boundingBox();
  const rightGutterBox = await rightScrollGutter.boundingBox();
  assert(leftGutterBox && rightGutterBox);
  assert(leftGutterBox.width >= 22 && leftGutterBox.width <= 26, 'Left scroll gutter should remain about 24px wide; width=' + leftGutterBox.width);
  assert(rightGutterBox.width >= 22 && rightGutterBox.width <= 26, 'Right scroll gutter should remain about 24px wide; width=' + rightGutterBox.width);

  const centerBeforeGutterScroll = await map.getAttribute('data-map-center');
  const scrollBeforeGutterScroll = await page.evaluate(() => window.scrollY);
  const gutterX = leftGutterBox.x + leftGutterBox.width * 0.5;
  const gutterStartY = Math.min(leftGutterBox.y + leftGutterBox.height * 0.68, 720);
  const gutterTouchPoint = (y) => ({ x: gutterX, y, radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1, id: 12 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gutterTouchPoint(gutterStartY)] });
  for (const delta of [18, 36, 54, 72, 90, 108]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [gutterTouchPoint(gutterStartY - delta)] });
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
  const centerAfterGutterScroll = await map.getAttribute('data-map-center');
  const scrollAfterGutterScroll = await page.evaluate(() => window.scrollY);
  assert.strictEqual(centerAfterGutterScroll, centerBeforeGutterScroll, 'Dragging a mobile side gutter must not pan the map');
  assert(scrollAfterGutterScroll > scrollBeforeGutterScroll + 20, 'Dragging a mobile side gutter should scroll the page; before=' + scrollBeforeGutterScroll + ' after=' + scrollAfterGutterScroll);

  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  box = await map.boundingBox();
  assert(box);
  const coordinateViewport = page.viewportSize();
  assert(coordinateViewport);
  const coordinateVisibleTop = Math.max(0, box.y);
  const coordinateVisibleBottom = Math.min(coordinateViewport.height, box.y + box.height);
  assert(coordinateVisibleBottom - coordinateVisibleTop >= 120, 'Map must be visibly on-screen before long-hold coordinate UAT');
  const coordinateTarget = {
    x: box.x + box.width * 0.62,
    y: coordinateVisibleTop + (coordinateVisibleBottom - coordinateVisibleTop) * 0.56
  };
  const coordinateHoldPoint = {
    x: coordinateTarget.x, y: coordinateTarget.y,
    radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1, id: 17
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [coordinateHoldPoint] });
  await page.waitForTimeout(650);
  assert(await page.locator('[data-coordinate-card]').isVisible(), 'Real mobile press-and-hold should open coordinates');
  assert.strictEqual(await page.evaluate(() => window.getSelection()?.toString() || ''), '', 'Real mobile press-and-hold must not highlight map text');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mobileCopyBox = await page.locator('[data-coordinate-copy]').boundingBox();
  const mobileCloseBox = await page.locator('[data-coordinate-close]').boundingBox();
  assert(mobileCopyBox && mobileCloseBox);
  assert(mobileCloseBox.x > mobileCopyBox.x + mobileCopyBox.width - 1, 'Mobile coordinate × should sit to the right of Copy coordinates');
  assert(Math.abs(mobileCloseBox.y - mobileCopyBox.y) <= 12, 'Mobile Copy and Close controls should share the same top row');
  assert(mobileCopyBox.height > mobileCloseBox.height + 10, 'Copy coordinates should remain the taller, more prominent control');
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
  await page.waitForTimeout(450);
  assert(await page.getByText('Plan before you go', { exact: true }).isVisible());
  assert(await page.getByRole('heading', { name: 'Current conditions are part of the route', exact: true }).isVisible());
  assert.strictEqual(await page.locator('#current-conditions').count(), 1);
  assert.strictEqual(await page.evaluate(() => window.location.hash), '#current-conditions');
  const conditionsBox = await page.locator('#current-conditions').boundingBox();
  const conditionsHeadingBox = await page.getByRole('heading', { name: 'Current conditions are part of the route', exact: true }).boundingBox();
  const educationHeadingBox = await page.getByRole('heading', { name: 'Make yourself easier to help', exact: true }).boundingBox();
  assert(conditionsBox && conditionsHeadingBox && educationHeadingBox);
  assert(conditionsBox.y >= 100 && conditionsBox.y <= 300, 'Current Conditions section should land below the persistent page chrome; y=' + conditionsBox.y);
  assert(conditionsHeadingBox.y < page.viewportSize().height * 0.55, 'Current Conditions heading should be visibly in the upper half of the viewport');
  assert(educationHeadingBox.y > conditionsHeadingBox.y + 250, 'Search & Rescue Education must remain below the Current Conditions landing target');

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