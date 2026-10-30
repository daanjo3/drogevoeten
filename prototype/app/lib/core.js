// Shared data access for the presentation layers (main app and AR page).
// Reads the koppelvlak (data/build/*) and calls open, CORS-enabled services live per address.
// All URLs are relative: the app runs under /v3/droge-voeten/ behind a gateway.

export const BUILD = new URLSearchParams(location.search).get('data') || '../data/build/droge-voeten.jsonld';
export const buildFile = name => new URL(name, new URL(BUILD, location.href)).href;

export const PDOK = {
  geocode: q => `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fq=type:adres&q=${encodeURIComponent(q)}`,
  suggest: q => `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?rows=6&fq=type:adres&q=${encodeURIComponent(q)}`,
  reverse: (lat, lon) => `https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=${lat}&lon=${lon}&rows=1&fq=type:adres`,
  imwa: (coll, bbox, limit = 50) => `https://api.pdok.nl/hwh/waterschappen-${coll === 'gemaal' ? 'kunstwerken-imwa/ogc/v2' : 'waterbeheergebieden-imwa/ogc/v1'}/collections/${coll}/items?f=json&limit=${limit}&bbox=${bbox.join(',')}`,
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nf = (x, d = 0) => Number(x).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d);

export async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} bij ${url.split('?')[0]}`);
  return r.json();
}

let _db;
export async function koppelvlak() { return _db ??= getJSON(BUILD); }
const _files = {};
export function buildJSON(name) { return _files[name] ??= getJSON(buildFile(name)); }

export const svc = (db, id) => db.services.find(s => s.id === id);

// ---------- geometry (lon/lat) ----------
export function km(a, b, c, d) { const p = Math.PI / 180, x = (d - b) * p * Math.cos((a + c) * p / 2); return 6371 * Math.hypot(x, (c - a) * p); }
const polys = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function inRing(x, y, ring) {
  let c = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i], [xk, yk] = ring[k];
    if ((yi > y) !== (yk > y) && x < (xk - xi) * (y - yi) / (yk - yi) + xi) c = !c;
  }
  return c;
}
export function inGeom(lon, lat, g) { return polys(g).some(p => inRing(lon, lat, p[0]) && !p.slice(1).some(h => inRing(lon, lat, h))); }
export const inBbox = (lon, lat, b, pad = 0) => lon >= b[0] - pad && lon <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad;
export function areasAt(areas, lon, lat) { return areas.filter(a => inBbox(lon, lat, a.bbox) && inGeom(lon, lat, a.geometry)); }
export function distToLineKm(lat, lon, g) {
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.574;
  let best = Infinity;
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const ax = (l[i][0] - lon) * kx, ay = (l[i][1] - lat) * ky, bx = (l[i + 1][0] - lon) * kx, by = (l[i + 1][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

// ---------- address ----------
export async function geocode(q) {
  const d = (await getJSON(PDOK.geocode(q))).response.docs[0];
  if (!d) return null;
  const [lon, lat] = d.centroide_ll.match(/[-\d.]+/g).map(Number);
  return { label: d.weergavenaam, lat, lon, nummeraanduiding: d.nummeraanduiding_id, verblijfsobject: d.adresseerbaarobject_id,
           uri: d.nummeraanduiding_id ? `https://bag.basisregistraties.overheid.nl/bag/id/nummeraanduiding/${d.nummeraanduiding_id}` : PDOK.geocode(q),
           municipality: d.gemeentenaam, province: d.provincienaam, place: d.woonplaatsnaam };
}

// ---------- WMS GetFeatureInfo at a point (WMS 1.3.0, EPSG:4326 axis order lat,lon) ----------
export function gfiUrl(s, layer, lat, lon) {
  const d = 0.00005;
  return `${s.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}&STYLES=&CRS=EPSG:4326&BBOX=${lat - d},${lon - d},${lat + d},${lon + d}&WIDTH=3&HEIGHT=3&I=1&J=1&INFO_FORMAT=application/json`;
}
export async function gfi(s, layer, lat, lon) { const url = gfiUrl(s, layer, lat, lon); const r = await getJSON(url); return { url, f: r.features?.[0] }; }
export const rasterVal = f => { const v = f?.properties?.GRAY_INDEX ?? f?.properties?.value_list; const n = parseFloat(v); return isNaN(n) || n < -100 ? null : n; };

export async function heightAt(db, lat, lon) {
  const s = svc(db, 'ahn'); const r = await gfi(s, s.layer, lat, lon);
  return { value: rasterVal(r.f), url: r.url };
}
export async function liwoAt(db, lat, lon) {
  const s = svc(db, 'liwo');
  const res = await Promise.allSettled(s.variants.map(v => gfi(s, v.layer, lat, lon)));
  return res.map((r, i) => ({ ...s.variants[i], v: r.status === 'fulfilled' ? rasterVal(r.value.f) : undefined, url: r.value?.url }));
}
export async function boardAt(db, lat, lon) {
  const s = svc(db, 'waterschappen'); const r = await gfi(s, s.layer, lat, lon);
  const label = r.f?.properties?.name; const qid = label && db.waterBoardLabelToQid[label];
  return { feature: r.f, url: r.url, label, qid, board: qid && db.currentWaterBoards[qid] };
}
export async function nearbyPumps(lat, lon) {
  const bb = [lon - 0.04, lat - 0.03, lon + 0.04, lat + 0.03];
  const url = PDOK.imwa('gemaal', bb, 200);
  const g = await getJSON(url);
  const list = g.features.filter(f => f.geometry?.type === 'Point')
    .map(f => ({ f, p: f.properties, d: km(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]),
                 uri: f.links?.find(l => l.rel === 'self')?.href })).sort((a, b) => a.d - b.d);
  return { url, list };
}
export const pumpName = p => (p.naam && p.naam !== 'NVT' ? p.naam : p.code || 'gemaal zonder naam');

// ---------- 1953 ----------
// Only where an open inundation map covers the point (koppelvlak v3.flood1953.areas) do we offer a 1953 water level.
// The level is the highest measured sea level at the nearest tide gauge: an explicit simplification.
export function flood1953(db, lat, lon) {
  const f = db.v3?.flood1953 || {}; const areas = f.areas || [];
  const hit = areasAt(areas, lon, lat)[0];
  const gauges = (db.v3?.tideGauges1953 || []).map(g => ({ ...g, d: km(lat, lon, g.lat, g.lon) })).sort((a, b) => a.d - b.d);
  return { inside: !!hit, area: hit, gauge: gauges[0], gauges, note: f.note };
}

// ---------- LIWO helper text ----------
export const liwoChance = v => v ? `${v.name} (${v.probability})` : '';
