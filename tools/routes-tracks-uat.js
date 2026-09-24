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
const PROVIDERS = new Set(['kygisserver.ky.gov', 'basemap.nationalmap.gov', 'apps.fs.usda.gov']);
const LIVE_SERVICES = [
  ['USDA Forest Service trails', 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublishWithDataStatus_01/MapServer/0?f=pjson', 'National Forest System Trails'],
  ['USDA Forest Service roads', 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer/0?f=pjson', 'National Forest System Roads'],
  ['Kentucky county boundaries', 'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CountyLines_WGS84WM/MapServer/0?f=pjson', 'County Lines']
];
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3JmAAAAAElFTkSuQmCC',
  'base64'
);

const TRAILS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { trail_name: 'Sky Bridge Trail', trail_no: '214', trail_class: '3' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-83.58262, 37.81765],
          [-83.58140, 37.81796],
          [-83.58010, 37.81832],
          [-83.57903, 37.81886],
          [-83.57750, 37.81910],
          [-83.57688, 37.81915]
        ]
      }
    },
    {
      type: 'Feature',
      properties: { trail_name: 'Connector Trail', trail_no: '214A', trail_class: '3' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-83.57903, 37.81886],
          [-83.57960, 37.81866],
          [-83.58121, 37.81843],
          [-83.58261, 37.81754]
        ]
      }
    }
  ]
};

const ROADS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Sky Bridge Road', id: '10', route_status: 'OPEN' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-83.5890, 37.8145],
          [-83.5850, 37.8160],
          [-83.5828, 37.8175]
        ]
      }
    }
  ]
};

const COUNTIES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { NAME: 'Powell', ABBREVTN: 'POW' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-83.90, 37.70],
          [-83.50, 37.70],
          [-83.50, 38.00],
          [-83.90, 38.00],
          [-83.90, 37.70]
        ]]
      }
    }
  ]
};

fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];

function record(name, status, details = {}) {
  results.push({ name, status, ...details });
  console.log('[' + status + '] ' + name, JSON.stringify(details));
}

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

async function preparedContext(browser, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  await setCookie(context, SHARED, 'declined');
  await setCookie(context, REGION, 'us');
  return context;
}

async function installProviderStubs(page, providerRequests) {
  page.on('request', request => {
    const url = new URL(request.url());
    if (PROVIDERS.has(url.hostname) || url.hostname === 'elevation.nationalmap.gov') {
      providerRequests.push(request.url());
    }
  });

  await page.route('https://kygisserver.ky.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('Ky_CountyLines_WGS84WM') && url.includes('/query?')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/geo+json',
        body: JSON.stringify(COUNTIES)
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG });
  });

  await page.route('https://basemap.nationalmap.gov/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );

  await page.route('https://apps.fs.usda.gov/**', async route => {
    const url = route.request().url();
    if (url.includes('EDW_TrailNFSPublishWithDataStatus_01')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(TRAILS) });
      return;
    }
    if (url.includes('EDW_RoadBasic_01')) {
      await route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(ROADS) });
      return;
    }
    await route.abort();
  });
}

async function probeLiveServices() {
  const details = [];
  for (const [label, url, expectedName] of LIVE_SERVICES) {
    const response = await fetch(url, {
      headers: { Origin: 'https://redrivergorgehiker.com' },
      signal: AbortSignal.timeout(20000)
    });
    assert(response.ok, label + ' metadata HTTP ' + response.status);
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    const allowOrigin = response.headers.get('access-control-allow-origin');
    const payload = await response.json();
    assert.strictEqual(payload.name, expectedName, label + ' identity');
    assert(String(payload.capabilities || '').includes('Query'), label + ' must support Query');
    assert(/geojson/i.test(String(payload.supportedQueryFormats || '')), label + ' must support GeoJSON');
    assert.strictEqual(setCookies.length, 0, label + ' metadata response unexpectedly set cookies');
    assert(allowOrigin === '*' || allowOrigin === 'https://redrivergorgehiker.com', label + ' browser CORS not authorized: ' + allowOrigin);
    details.push({ label, name: payload.name, capabilities: payload.capabilities, queryFormats: payload.supportedQueryFormats, allowOrigin });
  }
  record('Live public GIS service metadata and browser-use capability', 'PASS', { services: details });
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

async function routeDetailAndMap(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  const providerRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/skybridge-arch/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  assert(response && response.ok());

  const body = await page.locator('body').innerText();
  for (const expected of [
    'Skybridge Arch',
    '0.78 mi',
    'Mostly official trail',
    'Route information is not a safety or access guarantee.',
    'Landmarks & viewpoints',
    'Turnaround Overlook',
    'Download GPX',
    'Current land-manager resources'
  ]) assert(body.includes(expected), expected);

  for (const forbidden of [
    'Publication Ready',
    'Lane 19',
    'Approved public waypoints',
    'Approved waypoints',
    'Current Lane 19-approved route package'
  ]) assert(!body.includes(forbidden), 'Internal/admin wording leaked to public UI: ' + forbidden);

  assert(!/drive\.google\.com|RAW Gaia|PROPOSED|eagle.?nest/i.test(body));
  assert.strictEqual(await page.locator('.route-waypoint-list li').count(), 2);

  const gpxHref = await page.getByRole('link', { name: 'Download GPX', exact: true }).getAttribute('href');
  assert(gpxHref);
  const gpxBytes = await fetchBytes(page, new URL(gpxHref, MAIN).href);
  assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(gpxBytes)).digest('hex'), GPX_SHA);
  const geoBytes = await fetchBytes(page, MAIN + 'data/routes/skybridge-arch-v1.geojson');
  assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(geoBytes)).digest('hex'), GEO_SHA);

  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-map-tool="plan"]');
    return button && !button.disabled;
  }, { timeout: 10000 });

  assert.strictEqual(await page.getByRole('button', { name: 'Load interactive map', exact: true }).count(), 0);
  const layerPanel = page.locator('.route-layer-panel');
  for (const label of [
    'Kentucky Topo',
    'Aerial imagery',
    'USGS Topo',
    'LiDAR hillshade',
    'Forest Service trails',
    'Forest Service roads',
    'County boundaries',
    'Hikes & routes',
    'Landmarks & viewpoints'
  ]) {
    assert.strictEqual(await layerPanel.getByText(label, { exact: true }).count(), 1, label);
  }

  for (const preset of ['Simple', 'Advanced', 'Aerial']) {
    assert.strictEqual(await page.getByRole('button', { name: new RegExp('^' + preset), exact: false }).count(), 1, preset);
  }

  for (const tripType of ['Day hikes', 'Backpacking', 'Multi-day']) {
    assert.strictEqual(await page.getByLabel(tripType, { exact: true }).count(), 1, tripType);
  }

  const initialUrls = providerRequests.join('\n');
  assert(initialUrls.includes('Ky_KyTopo_Map_Series_WGS84WM'));
  assert(initialUrls.includes('Ky_MultiDirectional_Hillshade_WGS84WM'));
  assert(initialUrls.includes('EDW_TrailNFSPublishWithDataStatus_01'));
  assert(initialUrls.includes('EDW_RoadBasic_01'));
  assert(initialUrls.includes('Ky_CountyLines_WGS84WM'));
  assert(!providerRequests.some(url => url.includes('elevation.nationalmap.gov')));
  assert(!providerRequests.some(url => /gaia|caltopo|parcel/i.test(url)));

  assert.strictEqual(await page.locator('.route-waypoint-icon').count(), 2);

  if (!(await layerPanel.getAttribute('open'))) {
    await layerPanel.locator('summary').click();
  }

  const aerial = page.locator('[data-map-layer="kyaerial-phase3"]');
  const hillshade = page.locator('[data-map-layer="ky-hillshade"]');
  await aerial.check();
  await page.waitForTimeout(150);
  assert(providerRequests.some(url => url.includes('Ky_Imagery_Phase3_3IN_WGS84WM')));
  assert.strictEqual(await hillshade.isChecked(), false, 'Aerial should turn LiDAR hillshade off.');

  await hillshade.check();
  await page.waitForTimeout(150);
  assert.strictEqual(await aerial.isChecked(), false, 'LiDAR hillshade should turn aerial imagery off.');

  const usgs = page.locator('[data-map-layer="usgs-topo"]');
  await usgs.check();
  await page.waitForTimeout(150);
  assert(providerRequests.some(url => url.includes('basemap.nationalmap.gov/arcgis/rest/services/USGSTopo')));

  const hillshadeOpacity = page.locator('[data-opacity="ky-hillshade"]');
  await hillshadeOpacity.fill('55');
  const renderedOpacity = await page.locator('.leaflet-hillshade-pane .leaflet-layer').first().evaluate(element => getComputedStyle(element).opacity);
  assert(Math.abs(Number(renderedOpacity) - 0.55) < 0.02, 'Hillshade opacity did not update: ' + renderedOpacity);

  await page.getByRole('button', { name: 'Straight-line measure', exact: true }).click();
  const mapBox = await page.locator('[data-rrgh-route-map]').boundingBox();
  assert(mapBox);
  await page.mouse.click(mapBox.x + mapBox.width * 0.34, mapBox.y + mapBox.height * 0.56);
  await page.mouse.click(mapBox.x + mapBox.width * 0.46, mapBox.y + mapBox.height * 0.56);
  await page.waitForTimeout(100);
  let status = await page.locator('[data-map-status]').innerText();
  assert(/^Straight-line distance:/.test(status));
  assert(/mi|ft/.test(status));

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Plan on trails', exact: true }).click();
  await page.mouse.click(mapBox.x + mapBox.width * 0.49, mapBox.y + mapBox.height * 0.50);
  await page.mouse.click(mapBox.x + mapBox.width * 0.56, mapBox.y + mapBox.height * 0.50);
  await page.waitForTimeout(150);
  status = await page.locator('[data-map-status]').innerText();
  assert(/Trail-following plan|Trail plan: start snapped/.test(status), status);
  const savePlan = page.getByRole('button', { name: 'Save plan (.gpx)', exact: true });
  assert.strictEqual(await savePlan.isDisabled(), false, 'Save plan should enable after a connected trail plan exists.');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    savePlan.click()
  ]);
  assert(/^RRGH-planned-route-.*\.gpx$/.test(download.suggestedFilename()), download.suggestedFilename());

  const routePathCountBefore = await page.locator('.leaflet-routes-pane path').count();
  assert(routePathCountBefore > 0, 'Expected at least one RRGH route path before trip filtering.');
  await page.getByLabel('Day hikes', { exact: true }).uncheck();
  await page.waitForTimeout(100);
  assert.strictEqual(await page.locator('.leaflet-routes-pane path').count(), 0, 'Day-hike filter should hide Skybridge Arch.');
  await page.getByLabel('Day hikes', { exact: true }).check();
  await page.waitForTimeout(100);
  assert((await page.locator('.leaflet-routes-pane path').count()) > 0, 'Day-hike filter should restore Skybridge Arch.');

  await page.getByRole('button', { name: /^Advanced/ }).click();
  assert.strictEqual(await page.locator('[data-map-layer="usgs-topo"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="kyaerial-phase3"]').isChecked(), false);
  assert.strictEqual(await page.locator('[data-opacity="ky-hillshade"]').inputValue(), '58');

  await page.getByRole('button', { name: /^Aerial/ }).click();
  assert.strictEqual(await page.locator('[data-map-layer="kyaerial-phase3"]').isChecked(), true);
  assert.strictEqual(await page.locator('[data-map-layer="ky-hillshade"]').isChecked(), false);

  const headerZ = await page.locator('.site-header').evaluate(element => Number(getComputedStyle(element).zIndex));
  assert(headerZ >= 4000, 'Header must outrank Leaflet panes/controls; z-index=' + headerZ);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, 'Desktop horizontal overflow: ' + overflow);
  assert.deepStrictEqual(pageErrors, []);

  const providerCookies = (await context.cookies()).filter(cookie => PROVIDERS.has(cookie.domain.replace(/^\./, '')));
  assert.strictEqual(providerCookies.length, 0);

  await shot(page, 'desktop-skybridge-map-redesign');
  record('Route detail map is immediate, layered, blendable, measurable, trail-snappable and free of admin UI language', 'PASS', {
    providerRequestCount: providerRequests.length,
    headerZ,
    mapStatus: status,
    gpxSha256: GPX_SHA,
    geojsonSha256: GEO_SHA
  });

  await context.close();
}

async function fullMapAndHeader(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const providerRequests = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installProviderStubs(page, providerRequests);

  const response = await page.goto(MAIN + 'routes/map/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-map-tool="plan"]');
    return button && !button.disabled;
  }, { timeout: 10000 });

  const heading = await page.locator('h1').innerText();
  assert.strictEqual(heading, 'Interactive Hikes & Routes Map');
  const body = await page.locator('body').innerText();
  assert(body.includes('Filter RRGH routes by trip type'));
  assert(body.includes('measure direct point-to-point distance'));
  assert(body.includes('save it as GPX'));
  assert(!body.includes('Only Lane 19-approved'));
  assert(!body.includes('Parcel/private-property boundaries are not enabled.'));

  const layers = page.locator('[data-map-layer]');
  assert.strictEqual(await layers.count(), 9);
  assert.strictEqual(await page.locator('[data-opacity]').count(), 9);

  const explore = page.locator('.desktop-nav .nav-details-explore');
  await explore.evaluate(element => { element.open = true; });
  const panel = explore.locator('.nav-panel-explore');
  await panel.waitFor({ state: 'visible', timeout: 5000 });
  assert(await panel.isVisible());
  const panelBox = await panel.boundingBox();
  assert(panelBox);
  const panelTopmostIsHeader = await page.evaluate(({ x, y }) => {
    const top = document.elementFromPoint(x, y);
    return Boolean(top && top.closest('.site-header'));
  }, { x: panelBox.x + Math.min(40, panelBox.width / 2), y: panelBox.y + Math.min(40, panelBox.height / 2) });
  assert(panelTopmostIsHeader, 'Header navigation panel was visually covered by map/Leaflet content.');

  assert(providerRequests.some(url => url.includes('EDW_TrailNFSPublishWithDataStatus_01')));
  assert(providerRequests.some(url => url.includes('EDW_RoadBasic_01')));
  assert(providerRequests.some(url => url.includes('Ky_CountyLines_WGS84WM')));
  assert.deepStrictEqual(pageErrors, []);

  await shot(page, 'desktop-full-map-redesign');
  record('Full map layer stack, trail/road/county context and header stacking', 'PASS', {
    providerRequestCount: providerRequests.length
  });

  await context.close();
}

async function mobile(browser) {
  const context = await preparedContext(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const providerRequests = [];
  await installProviderStubs(page, providerRequests);

  for (const route of ['routes/', 'routes/skybridge-arch/', 'routes/map/', 'guides/kentucky-lidar/']) {
    const response = await page.goto(MAIN + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(response && response.ok(), route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 2, 'Mobile horizontal overflow on ' + route + ': ' + overflow);
  }

  await page.goto(MAIN + 'routes/skybridge-arch/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  assert.strictEqual(await page.locator('.route-layer-panel').getAttribute('open'), null);
  assert.strictEqual(await page.getByRole('button', { name: 'Measure', exact: true }).count(), 1);
  assert.strictEqual(await page.getByRole('button', { name: 'Plan on trails', exact: true }).count(), 1);
  await shot(page, 'mobile-skybridge-map-redesign');

  record('Mobile map is contained, immediately usable and horizontally clean', 'PASS', {
    providerRequestCount: providerRequests.length
  });
  await context.close();
}

async function legalAndPrivacy(browser) {
  const context = await preparedContext(browser, { viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  let response = await page.goto(MAIN + 'privacy/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  let body = await page.locator('body').innerText();
  assert(body.includes('Interactive Maps and Map-Data Services'));
  assert(body.includes('default map layers begin loading immediately'));
  assert(body.includes('Kentucky Division of Geographic Information / KyFromAbove'));
  assert(body.includes('USDA Forest Service Enterprise Data Warehouse'));

  response = await page.goto(MAIN + 'copyright-and-terms/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert(response && response.ok());
  body = await page.locator('body').innerText();
  assert(body.includes('GPX Download License'));
  assert(body.includes('Property, Boundaries, and Access'));
  assert(body.includes('Map, Data, and Third-Party Sources'));

  record('Legal and Privacy copy matches immediate layered map behavior', 'PASS');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1']
  });

  let failure = null;
  try {
    await probeLiveServices();
    await routeDetailAndMap(browser);
    await fullMapAndHeader(browser);
    await mobile(browser);
    await legalAndPrivacy(browser);
  } catch (error) {
    failure = error;
    record('Routes & Tracks UAT fatal assertion', 'FAIL', {
      error: String(error),
      stack: error && error.stack ? error.stack : null
    });
  } finally {
    await browser.close();
    fs.writeFileSync(
      path.join(EVIDENCE, 'routes-tracks-uat-results.json'),
      JSON.stringify({ sourceRef: process.env.SOURCE_REF || null, results }, null, 2)
    );
  }

  if (failure) process.exit(1);
})();
