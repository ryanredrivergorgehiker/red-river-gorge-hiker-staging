const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MAIN = 'https://redrivergorgehiker.com:8443/';
const EVIDENCE = path.resolve('places-uat-evidence');
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3JmAAAAAElFTkSuQmCC','base64');
fs.mkdirSync(EVIDENCE,{recursive:true});

async function installStubs(page){
  await page.route('https://**', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'redrivergorgehiker.com') return route.continue();
    if (/\.(?:png|jpg|jpeg|webp)(?:\?|$)/i.test(url.pathname) || url.pathname.includes('/tile/')) {
      return route.fulfill({status:200,contentType:'image/png',body:TRANSPARENT_PNG});
    }
    if (url.hostname.includes('google') || url.hostname.includes('pinimg') || url.hostname.includes('ravm') || url.hostname.includes('w55c')) {
      return route.abort();
    }
    return route.fulfill({status:200,contentType:'application/geo+json',body:JSON.stringify({type:'FeatureCollection',features:[]})});
  });
}
async function waitReady(page){
  await page.waitForSelector('.leaflet-container',{timeout:15000});
  await page.waitForFunction(() => {
    const m=document.querySelector('[data-rrgh-route-map]');
    return m?.getAttribute('data-map-load-progress')==='100'
      && m?.getAttribute('data-place-poi-count')==='29';
  },{timeout:20000});
}
async function snap(page,name){await page.screenshot({path:path.join(EVIDENCE,name+'.png'),fullPage:true});}
async function counts(page){
  const map=page.locator('[data-rrgh-route-map]');
  return {
    total:Number(await map.getAttribute('data-place-poi-count')),
    visible:Number(await map.getAttribute('data-visible-place-poi-count')),
    around:Number(await map.getAttribute('data-around-place-count')),
    hiker:Number(await map.getAttribute('data-hiker-service-place-count')),
    dual:Number(await map.getAttribute('data-dual-place-count')),
    presence:Number(await map.getAttribute('data-rrgh-presence-count')),
    dom:await page.locator('.rrgh-place-marker-host').count(),
    presenceDom:await page.locator('.rrgh-place-marker.is-presence').count(),
    waypoints:await page.locator('.route-waypoint-icon').count()
  };
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP redrivergorgehiker.com 127.0.0.1']});
  try{
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    await installStubs(page);
    let response=await page.goto(MAIN+'routes/map/',{waitUntil:'domcontentloaded',timeout:60000});
    assert(response&&response.ok());
    await waitReady(page);

    const around=page.locator('[data-map-layer="around-the-gorge"]');
    const hiker=page.locator('[data-map-layer="hiker-services"]');
    assert.strictEqual(await page.getByText('LOCAL AMENITIES',{exact:true}).count(),1);
    assert.strictEqual(await around.count(),1);
    assert.strictEqual(await hiker.count(),1);
    assert.strictEqual(await around.isChecked(),true);
    assert.strictEqual(await hiker.isChecked(),true);

    let c=await counts(page);
    assert.deepStrictEqual({total:c.total,visible:c.visible,around:c.around,hiker:c.hiker,dual:c.dual,presence:c.presence,dom:c.dom,presenceDom:c.presenceDom},
      {total:29,visible:29,around:23,hiker:10,dual:4,presence:3,dom:29,presenceDom:3});
    assert(c.waypoints>=3,'Route waypoints must remain a separate marker class');

    for(const name of ['Red River Rockhouse','Hungry Hiker Bar & Grill','Red River Gorge Earth Shop']){
      assert.strictEqual(await page.locator('.rrgh-place-marker-host[title="'+name+'"]').count(),1,name);
    }
    assert.strictEqual(await page.locator('.rrgh-place-presence-badge').count(),3,'Exactly three RRGH Presence badges must render');
    for(const name of ['Red River Rockhouse','Hungry Hiker Bar & Grill','Red River Gorge Earth Shop']){
      const host=page.locator('.rrgh-place-marker-host[title="'+name+'"]');
      assert.strictEqual(await host.locator('.rrgh-place-presence-badge').innerText(),'RRGH',name+' must carry the explicit RRGH badge');
    }
    const aroundOnly=page.locator('.rrgh-place-marker-host[title="Miguel’s Pizza"] .rrgh-place-marker');
    const hikerOnly=page.locator('.rrgh-place-marker-host[title="Park N Save"] .rrgh-place-marker');
    assert(await aroundOnly.evaluate(el=>el.classList.contains('is-around')&&!el.classList.contains('is-hiker')));
    assert(await hikerOnly.evaluate(el=>el.classList.contains('is-hiker')&&!el.classList.contains('is-around')));
    const aroundStyle=await aroundOnly.evaluate(el=>({radius:getComputedStyle(el).borderRadius,transform:getComputedStyle(el).transform}));
    const hikerStyle=await hikerOnly.evaluate(el=>({radius:getComputedStyle(el).borderRadius,transform:getComputedStyle(el).transform}));
    assert.notStrictEqual(aroundStyle.transform,'none','Around the Gorge marker must use its non-circular diamond transform');
    assert.strictEqual(hikerStyle.radius,'4px','Hiker Services marker must remain a visibly square/rounded-square symbol');
    assert.notStrictEqual(aroundStyle.radius,hikerStyle.radius,'Around the Gorge and Hiker Services must not share the same marker shape');
    for(const alias of ['Torrent Falls Climbing Adventure','Trails End Liquor Store','The Brick','Shell']){
      assert.strictEqual(await page.locator('.rrgh-place-marker-host[title="'+alias+'"]').count(),0,alias);
    }

    const layersSummary = page.locator('[data-map-sheet="layers"] > summary');
    await layersSummary.click();
    assert.strictEqual(await page.getByText('RRGH Presence',{exact:true}).count(),1,'Layers legend must include one compact non-toggle RRGH Presence key');
    const amenityGrid=await page.locator('.route-layer-group-amenities .route-layer-toggle-row').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns);
    assert(!amenityGrid.includes('36px'),'Local Amenities legend must not retain the old oversized swatch column');
    await around.uncheck();
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='10');
    assert.strictEqual(await page.locator('.rrgh-place-marker-host').count(),10);
    await hiker.uncheck();
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='0');
    await around.check();
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='23');
    assert.strictEqual(await page.locator('.rrgh-place-marker-host').count(),23);
    await hiker.check();
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='29');
    await layersSummary.click();

    await page.locator('[data-map-preset="terrain"]').click();
    assert.strictEqual(await around.isChecked(),false);
    assert.strictEqual(await hiker.isChecked(),false);
    await layersSummary.click();
    await around.check();
    assert.strictEqual(await around.isChecked(),true);
    await layersSummary.click();
    assert.strictEqual(await page.locator('[data-map-preset][aria-pressed="true"]').count(),0,'Manual layer change after preset must produce custom state');

    await page.locator('[data-map-preset="aerial"]').click();
    assert.strictEqual(await around.isChecked(),false);
    assert.strictEqual(await hiker.isChecked(),false);
    await layersSummary.click();
    await hiker.check();
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='10');
    await layersSummary.click();

    await page.locator('[data-map-preset="sunlight"]').click();
    assert.strictEqual(await around.isChecked(),false);
    assert.strictEqual(await hiker.isChecked(),false);

    await page.locator('[data-map-preset="hiking"]').click();
    assert.strictEqual(await around.isChecked(),true);
    assert.strictEqual(await hiker.isChecked(),true);
    await page.waitForFunction(()=>document.querySelector('[data-rrgh-route-map]')?.getAttribute('data-visible-place-poi-count')==='29');

    assert.strictEqual(await page.locator('[data-rrgh-route-map]').getAttribute('data-usfs-trail-source'),'rrgh-cache');
    assert(Number(await page.locator('[data-rrgh-route-map]').getAttribute('data-trail-feature-count'))>=10,'Forest Service trail cache must render features');
    assert.strictEqual(await page.locator('.leaflet-trails-pane canvas').count()>=1,true,'Forest Service trails must render on load');

    await page.locator('.rrgh-place-marker-host[title="Red River Rockhouse"]').evaluate(el=>el.click());
    const rockhousePopup=await page.locator('.leaflet-popup-content').innerText();
    assert(rockhousePopup.includes('RRGH Presence'));
    assert(rockhousePopup.includes('photography is displayed and available for purchase here'));
    assert(!/partner/i.test(rockhousePopup));

    await snap(page,'desktop-local-amenities');

    await page.setViewportSize({width:390,height:844});
    await page.goto(MAIN+'routes/map/',{waitUntil:'domcontentloaded',timeout:60000});
    await waitReady(page);
    assert.strictEqual(await page.locator('[data-map-layer="around-the-gorge"]').isChecked(),true);
    assert.strictEqual(await page.locator('[data-map-layer="hiker-services"]').isChecked(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert(overflow<=2,'Mobile Places map horizontal overflow: '+overflow);
    await snap(page,'mobile-local-amenities');

    const names=JSON.parse(await page.locator('[data-rrgh-route-map]').getAttribute('data-places'));
    assert.strictEqual(names.length,29);
    assert.strictEqual(names.filter(p=>p.aroundTheGorge&&p.hikerServices).length,4);
    assert.strictEqual(names.filter(p=>p.rrghPresence).length,3);
    assert.strictEqual(names.find(p=>p.placeId==='PLC-010').nearbyRouteContext,'Motherlode area');
    const sky=names.find(p=>p.placeId==='PLC-004');
    const go=names.find(p=>p.placeId==='PLC-024');
    const park=names.find(p=>p.placeId==='PLC-025');
    assert.deepStrictEqual([sky.latitude,sky.longitude],[37.7634,-83.6126],'Sky Bridge Station corrected coordinate');
    assert.deepStrictEqual([go.latitude,go.longitude],[37.7982345,-83.7046152],'Go Time rechecked coordinate');
    assert.deepStrictEqual([park.latitude,park.longitude],[37.7982107,-83.7026222],'Park N Save corrected coordinate');

    fs.writeFileSync(path.join(EVIDENCE,'places-uat-results.json'),JSON.stringify({status:'PASS',counts:await counts(page)},null,2));
    console.log('[PASS] Places-specific UAT: canonical counts, independent layers, preset defaults, single POIs, RRGH Presence, mobile, and Forest Service trail load');
    await context.close();
  }catch(error){
    console.error('[FAIL] Places-specific UAT',error);
    process.exitCode=1;
  }finally{
    await browser.close();
  }
})();
