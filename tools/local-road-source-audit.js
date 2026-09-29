const assert = require('assert');

const target = { lat: 37.822129, lon: -83.541391 };
const bbox = { south: 37.815, west: -83.550, north: 37.829, east: -83.532 };
const broadBbox = { south: 37.79, west: -83.60, north: 37.86, east: -83.48 };

function toXY(lat, lon) {
  const lat0 = target.lat * Math.PI / 180;
  return {
    x: (lon - target.lon) * 111320 * Math.cos(lat0),
    y: (lat - target.lat) * 110540
  };
}
function segmentDistance(a, b) {
  const aa = toXY(a[1], a[0]);
  const bb = toXY(b[1], b[0]);
  const vx = bb.x - aa.x;
  const vy = bb.y - aa.y;
  const denom = vx * vx + vy * vy;
  const t = denom ? Math.max(0, Math.min(1, (-(aa.x * vx + aa.y * vy)) / denom)) : 0;
  return Math.hypot(aa.x + t * vx, aa.y + t * vy);
}
function lineDistance(coords) {
  if (!Array.isArray(coords) || !coords.length) return Infinity;
  if (typeof coords[0]?.[0] === 'number') {
    if (coords.length === 1) {
      const p = toXY(coords[0][1], coords[0][0]);
      return Math.hypot(p.x, p.y);
    }
    let best = Infinity;
    for (let i=1;i<coords.length;i++) best = Math.min(best, segmentDistance(coords[i-1], coords[i]));
    return best;
  }
  return Math.min(...coords.map(lineDistance));
}
function featureDistance(feature) {
  return lineDistance(feature?.geometry?.coordinates || []);
}
async function arcgis(service) {
  const u = new URL(service + '/query');
  u.search = new URLSearchParams({
    where:'1=1',
    geometry:JSON.stringify({xmin:bbox.west,ymin:bbox.south,xmax:bbox.east,ymax:bbox.north,spatialReference:{wkid:4326}}),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:'*',
    returnGeometry:'true',
    returnZ:'false',
    returnM:'false',
    outSR:'4326',
    f:'geojson'
  }).toString();
  const r = await fetch(u,{headers:{'user-agent':'RRGH-source-audit/1.0'}});
  assert(r.ok, service+' HTTP '+r.status);
  const data = await r.json();
  assert(!data?.error, JSON.stringify(data?.error));
  return data;
}
function summarize(data, nameFields) {
  return (data.features || []).map(f=>({
    distance_m:Math.round(featureDistance(f)),
    name:nameFields.map(k=>f?.properties?.[k]).find(Boolean)||null,
    properties:f.properties||{},
    geometry_type:f?.geometry?.type||null
  })).sort((a,b)=>a.distance_m-b.distance_m);
}
async function overpass(box) {
  const q='[out:json][timeout:30];way["highway"]('+box.south+','+box.west+','+box.north+','+box.east+');out tags geom;';
  const endpoints=[
    'https://overpass.maprva.org/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  const errors=[];
  for (const endpoint of endpoints) {
    try {
      const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','user-agent':'RRGH-source-audit/1.0'},body:new URLSearchParams({data:q}).toString()});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data=await r.json();
      if(!Array.isArray(data?.elements)) throw new Error('invalid response');
      return {endpoint,data,errors};
    } catch(e) { errors.push({endpoint,error:String(e)}); }
  }
  throw new Error('All Overpass endpoints failed '+JSON.stringify(errors));
}
function summarizeOsm(data) {
  return data.elements.filter(e=>e?.type==='way'&&Array.isArray(e.geometry)).map(e=>({
    id:e.id,
    distance_m:Math.round(lineDistance(e.geometry.map(p=>[p.lon,p.lat]))),
    highway:e.tags?.highway||null,
    name:e.tags?.name||e.tags?.official_name||e.tags?.alt_name||null,
    surface:e.tags?.surface||null,
    tracktype:e.tags?.tracktype||null,
    service:e.tags?.service||null,
    access:e.tags?.access||null,
    motor_vehicle:e.tags?.motor_vehicle||null,
    foot:e.tags?.foot||null,
    tags:e.tags||{}
  })).sort((a,b)=>a.distance_m-b.distance_m);
}

(async()=>{
  const sources=[
    ['kentucky_cartobase_local','https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Cartobase_WGS84WM/MapServer/12',['RD_NAME','NAME','ROADNAME']],
    ['kentucky_911','https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_911_Road_Centerlines_WGS84WM/MapServer/0',['LSt_Name','St_Name','FULLNAME','ROADNAME']],
    ['usgs_local_roads','https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/32',['NAME','FULLNAME','FULL_NAME','PRIME_NAME']],
    ['usgs_4wd_roads','https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/35',['NAME','FULLNAME','FULL_NAME','PRIME_NAME']],
    ['usgs_closed_roads','https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/36',['NAME','FULLNAME','FULL_NAME','PRIME_NAME']],
    ['usgs_trails','https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer/37',['NAME','FULLNAME','FULL_NAME','PRIME_NAME','TRAIL_NAME']],
    ['usfs_roads','https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer/0',['name','NAME','route_name','route_id']]
  ];
  const result={generated_at:new Date().toISOString(),target,bbox,sources:{}};
  for(const [key,url,names] of sources){
    const data=await arcgis(url);
    const nearest=summarize(data,names);
    result.sources[key]={feature_count:(data.features||[]).length,nearest:nearest.slice(0,15)};
  }
  const osmSmall=await overpass(bbox);
  const osmBroad=await overpass(broadBbox);
  const smallWays=summarizeOsm(osmSmall.data);
  const broadWays=summarizeOsm(osmBroad.data);
  result.openstreetmap={
    small_endpoint:osmSmall.endpoint,
    small_way_count:smallWays.length,
    small_nearest:smallWays.slice(0,30),
    small_track_service:smallWays.filter(w=>['track','service'].includes(w.highway)).slice(0,30),
    broad_endpoint:osmBroad.endpoint,
    broad_way_count:broadWays.length,
    broad_nearest_to_target:broadWays.slice(0,30),
    broad_track_service_nearest:broadWays.filter(w=>['track','service'].includes(w.highway)).slice(0,30)
  };
  console.log('RRGH_LOCAL_ROAD_SOURCE_AUDIT='+JSON.stringify(result));
})().catch(e=>{console.error(e);process.exit(1);});
