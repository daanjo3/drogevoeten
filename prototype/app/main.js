// Presentation layer (web). Reads the koppelvlak (data/build/*) and calls open services live per address.
// Model: one answer (four sentences + timeline), everything else behind accordions and map presets.
import { $, $$, esc, nf, signed, km, getJSON, koppelvlak, buildJSON, buildFile, PDOK, svc, geocode, gfi, rasterVal,
         heightAt, liwoAt, boardAt, nearbyPumps, pumpName, inGeom, inBbox, flood1953, distToLineKm } from './lib/core.js';
import { buildTimeline, renderTimeline, SW_DELTA } from './timeline.js';
import { MapView } from './mapview.js';

const STATUS = { nu: 'werkt nu mee', vroeger: 'werkte vroeger', onbekend: 'onbekend', nvt: 'geen werktuig' };
const trace = [];
const log = (what, uri) => { trace.push([what, uri]); };
let db, view, files, runId = 0;

// ---------- theme ----------
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('dv-theme', t); } catch {}
  if (view) { view.own.monuments && view.map.removeLayer(view.own.monuments); view.setTheme(view.theme); }
});

// ---------- geometry for the pump-off example ----------
const rings = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const projm = lat0 => { const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574; return ([lon, lat]) => [lon * kx, lat * ky]; };
function areaM2(g, lat0) { const P = projm(lat0); let a = 0;
  for (const poly of rings(g)) poly.forEach((ring, i) => { let s = 0; const r = ring.map(P); for (let k = 0; k < r.length - 1; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; a += (i ? -1 : 1) * Math.abs(s) / 2; });
  return a; }
function distToEdgeM(pt, g, lat0) { const P = projm(lat0), p = P(pt); let best = Infinity;
  for (const poly of rings(g)) for (const ring of poly) { const r = ring.map(P);
    for (let k = 0; k < r.length - 1; k++) { const [ax, ay] = r[k], [bx, by] = r[k + 1], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l)) : 0; best = Math.min(best, Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)); } }
  return best; }
function bboxOf(g) { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; for (const poly of rings(g)) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }

// Drainage area (IMWA afvoer-/bemalingsgebied, else peilgebied) and the pumps that drain it.
async function drainage(lat, lon) {
  const bb = [lon - 0.0002, lat - 0.0002, lon + 0.0002, lat + 0.0002];
  const [afv, peil] = await Promise.allSettled([getJSON(PDOK.imwa('afvoergebiedaanvoergebied', bb, 20)), getJSON(PDOK.imwa('peilgebied', bb, 20))]);
  log('Afvoer- en bemalingsgebied (IMWA)', PDOK.imwa('afvoergebiedaanvoergebied', bb, 20));
  const pick = (res, kind, ok) => (res.status === 'fulfilled' ? res.value.features : [])
    .filter(f => f.geometry && inGeom(lon, lat, f.geometry) && (!ok || ok.includes(f.properties.typeafvoeraanvoergebied ?? null)))
    .map(f => ({ f, kind, area: areaM2(f.geometry, lat) })).sort((a, b) => a.area - b.area)[0];
  const area = pick(afv, 'afvoergebied', ['Bemalingsgebied', 'Afwateringsgebied', null]) || pick(peil, 'peilgebied');
  if (!area) return null;
  const g = area.f.geometry, b = bboxOf(g);
  const gem = await getJSON(PDOK.imwa('gemaal', [b[0] - 0.002, b[1] - 0.002, b[2] + 0.002, b[3] + 0.002], 1000)).catch(() => ({ features: [] }));
  log('Gemalen in en rond dit gebied (IMWA)', PDOK.imwa('gemaal', b, 1000));
  const pumps = gem.features.filter(f => f.geometry?.type === 'Point').map(f => {
    const pt = f.geometry.coordinates, inside = inGeom(pt[0], pt[1], g);
    return { f, p: f.properties, inside, edge: inside ? 0 : distToEdgeM(pt, g, lat) };
  }).filter(x => (x.inside || x.edge <= 100) && x.p.functiegemaal !== 'Aanvoeren').sort((a, b) => (b.p.maximalecapaciteit || 0) - (a.p.maximalecapaciteit || 0));
  const counts = x => x.p.maximalecapaciteit && (x.inside || x.edge <= 15) && ['Afvoeren', 'Af- en Aanvoeren'].includes(x.p.functiegemaal);
  return { ...area, A: area.area, main: pumps.filter(counts), other: pumps.filter(x => !counts(x)), counts };
}

// ---------- the answer ----------
const fact = (sentence, why) => `<li class="fact"><details><summary><span>${sentence}</span></summary><div class="why">${why}</div></details></li>`;
const skeleton = n => Array.from({ length: n }, () => '<li class="fact"><div class="skeleton"></div></li>').join('');

function heightFact(h, url) {
  if (h == null) return fact('Hoe hoog je voordeur ligt, konden we hier niet vinden.', `AHN gaf op dit punt geen waarde (bijvoorbeeld water of een gebouw zonder maaiveldpunt). <a href="${esc(url || '#')}">bevraging</a>`);
  const s = h < 0 ? `Je voordeur ligt <b class="below">${nf(-h, 1)} m onder</b> zeeniveau (NAP).` : `Je voordeur ligt <b>${nf(h, 1)} m boven</b> zeeniveau (NAP).`;
  return fact(s, `Maaiveldhoogte uit het Actueel Hoogtebestand Nederland (AHN, raster van 0,5 m): ${signed(h)} m NAP. NAP is ongeveer het gemiddelde zeeniveau. Op een dijk of in een kuil kan je drempel afwijken. ${h < 0 ? 'Zonder dijken en gemalen stond deze plek onder water.' : ''} <a href="${esc(url)}" target="_blank" rel="noopener">bevraging (PDOK)</a>`);
}
function pumpFact(dr, near, board) {
  const ws = board?.board?.label || board?.label;
  if (dr?.main?.length) {
    const names = dr.main.slice(0, 2).map(x => `<b>${esc(pumpName(x.p))}</b>`).join(' en ');
    const kind = dr.kind === 'peilgebied' ? 'peilgebied' : 'afwateringsgebied';
    return fact(`${names} ${dr.main.length > 1 ? 'pompen' : 'pompt'} het water uit jouw ${kind} weg${ws ? `, in opdracht van <b>${esc(ws)}</b>` : ''}.`,
      `Je adres ligt in ${kind} ${esc(dr.f.properties.naam || dr.f.properties.code || '')} (${nf(dr.A / 1e6, 1)} km²). Daarin of op de rand staan ${dr.main.length} gemalen met functie "afvoeren" en een opgegeven capaciteit. Bron: waterschapsregister IMWA (PDOK). Dat een gemaal in het gebied staat, is onze afleiding: het register legt de relatie gemaal ↔ gebied niet vast.`);
  }
  const p = near?.list?.[0];
  if (p) return fact(`Het dichtstbijzijnde gemaal is <b>${esc(pumpName(p.p))}</b>${ws ? ` van <b>${esc(ws)}</b>` : ''}, op ${nf(p.d, 1)} km.`,
    `Voor dit adres levert het waterschap geen afwateringsgebied als open data, dus weten we niet zeker welk gemaal jouw straat bemaalt. Bron: waterschapsregister IMWA (PDOK)${p.uri ? `, <a href="${esc(p.uri)}" target="_blank" rel="noopener">dit gemaal</a>` : ''}.`);
  return fact(`Binnen 3 km staat geen gemaal in het waterschapsregister${ws ? `; het water valt onder <b>${esc(ws)}</b>` : ''}.`, 'Je woont hoog, of het water loopt hier via een gemaal verder weg. Bron: waterschapsregister IMWA (PDOK).');
}
function historyFact(tl, a) {
  const h = tl.history;
  const d = h.find(i => i.kind === 'droogmaking'), p = h.find(i => i.kind === 'indijking'), m = h.find(i => i.kind === 'molens' && /binnen 1 km/.test(i.title));
  const why = 'Uit de open kaarten van droogmakerijen (RCE Landschapsatlas) en polders (Provincie Zeeland), punt-in-vlak op je adres. Details in de tijdlijn hieronder.';
  if (d) return fact(`Deze plek is <b>drooggemaakt${d.precision === 'voor' ? ' vóór 1550' : ` in ${esc(d.yearText)}`}</b>: ${esc(d.title.replace('Drooggemaakt: ', ''))}. Hier lag eerst water.`, why);
  if (p) return fact(`Deze plek werd <b>ingedijkt ${/^\d{3,4}$/.test(p.yearText || '') ? 'in ' : /eeuw/.test(p.yearText || '') ? 'in de ' : ''}${esc((p.yearText || '').replace(/^\p{Lu}/u, c => c.toLowerCase()))}</b> (${esc(p.title.replace('Ingedijkt: ', ''))}).`, why);
  if (m) return fact(`Hier maalden vroeger <b>${esc(m.title.replace(' binnen 1 km', ''))}</b>; ze zijn allemaal verdwenen.`, 'Uit de RCE Landschapsatlas (verdwenen molens, afkomstig uit de Molendatabase), binnen 1 km van je adres. Wanneer deze plek is ingepolderd, staat niet in de open kaarten die we gebruiken.');
  return fact('Hoe deze plek droog werd, staat niet in de open kaarten die we gebruiken.', why);
}
function riskFact(depths, url) {
  const got = depths.filter(d => d.v !== undefined);
  if (!got.length) return fact('Het overstromingsmodel (LIWO) kon niet worden bevraagd.', 'Probeer het later opnieuw; de dienst van LIWO reageerde niet.');
  const worst = got.reduce((a, b) => (b.v || 0) > (a.v || 0) ? b : a);
  if (!worst.v || worst.v <= 0.02) return fact('Bij een dijkdoorbraak blijft het hier volgens LIWO <b>droog</b>.', `LIWO toont op dit punt in geen van de vijf kansklassen water. Het raster is 5 tot 100 m grof. <a href="${esc(url)}" target="_blank" rel="noopener">bevraging</a>`);
  const likely = got.find(d => d.v > 0.02);
  return fact(`Bij een dijkdoorbraak kan het water hier <b>${nf(worst.v, 1)} m hoog</b> komen.`,
    `Modeluitkomst van LIWO (Rijkswaterstaat/Deltares): de grootste waterdiepte in de kansklasse "${esc(worst.name)}" (${esc(worst.probability)}).${likely && likely !== worst ? ` Al in de klasse "${esc(likely.name)}" (${esc(likely.probability)}) is het ${nf(likely.v, 1)} m.` : ''} Geen voorspelling; het raster is 5 tot 100 m grof. Alle klassen staan onder "Overstroming in detail".`);
}

// ---------- callout ----------
function callout(ctx) {
  const { gift, zeeland, a, flood } = ctx;
  if (gift?.exact) {
    const g = gift.exact;
    return `<div class="callout">${g.photo ? `<img src="${esc(g.photo)}" alt="Foto van de woning (Provincie Zeeland)" loading="lazy">` : '<span></span>'}<div>
      <p><b>Je huis is een geschenk uit ${esc(g.country)}.</b></p><p>Na de watersnoodramp van 1953 schonken landen woningen aan getroffen dorpen. Deze staat in de inventarisatie van de Provincie Zeeland (datering ${esc(g.dated || 'onbekend')}${g.recognisable ? `, herkenbaarheid: ${esc(g.recognisable.toLowerCase())}` : ''}).</p>
      <p class="small"><a href="${esc(g.source)}" target="_blank" rel="noopener">bron</a> · gekoppeld op BAG-adres</p></div></div>`;
  }
  if (zeeland) {
    const near = zeeland.dikes.map(d => ({ d, dist: ctx.distToLine(d.geometry) })).filter(x => x.dist <= 0.08 && (x.d.begin || x.d.indicative)).sort((x, y) => (x.d.begin || x.d.indicative) - (y.d.begin || y.d.indicative))[0];
    const in1560 = inBbox(a.lon, a.lat, [3.5888, 51.4755, 3.6901, 51.5251]);
    if (near) return `<div class="callout"><span></span><div><p><b>Je staat ${nf(Math.max(10, Math.round(near.dist * 1000 / 10) * 10))} m van ${esc(near.d.name || 'een oude dijk')}</b>, aangelegd ${near.d.begin && near.d.end && near.d.end !== near.d.begin ? `tussen ${near.d.begin} en ${near.d.end}` : `in ${near.d.begin || near.d.indicative}`}.</p>
      ${in1560 ? '<p><button type="button" class="link" id="go1560">Bekijk deze plek op de kaart van 1560</button></p>' : ''}</div></div>`;
  }
  if (flood.inside) return `<div class="callout"><span></span><div><p><b>In 1953 liep deze plek onder.</b> Volgens de inundatiekaart van de Provincie Noord-Brabant.</p></div></div>`;
  return '';
}

// ---------- accordions ----------
function evidenceList(st) {
  return `<ul class="ev">${st.evidence.map(e => `<li class="e-${esc(e.status)}"><b>${esc(e.source)}</b>${e.date ? ` (bijgewerkt ${esc(e.date)})` : ''}${e.status === 'hint' ? ' · <i>niet bevestigd</i>' : ''}: <q>${esc(e.quote)}</q> ${e.uri ? `<a href="${esc(e.uri)}" target="_blank" rel="noopener">bron</a>` : ''}</li>`).join('') || '<li>Geen enkele bron zegt iets over het huidige gebruik.</li>'}</ul>`;
}
function monCard(m) {
  const st = m.status;
  return `<div class="mon">${m.image ? `<img loading="lazy" alt="" src="${esc(m.image.replace(/^http:/, 'https:') + '?width=160')}">` : '<div class="ph"></div>'}
    <div><b>${esc(m.name)}</b> <span class="muted">· ${esc(m.place || '')} · ${nf(m.d, 1)} km</span><br>
      <span class="st st-${esc(st.status)}">${esc(STATUS[st.status])}</span> <span class="muted small">${esc(st.label)}</span>
      <details class="why-src"><summary>Waarom? Bronnen</summary>${evidenceList(st)}
        <p class="small"><a href="${esc(m.register)}" target="_blank" rel="noopener">Monumentenregister</a> · <a href="${esc(m.wikidata)}" target="_blank" rel="noopener">Wikidata</a>${m.molendatabase ? ` · <a href="${esc(m.molendatabase)}" target="_blank" rel="noopener">Molendatabase</a>` : ''}${m.inServiceAs ? ` · <a href="${esc(m.inServiceAs['@id'])}" target="_blank" rel="noopener">waterschapsregister</a>` : ''}</p></details></div></div>`;
}
function renderHeritage(lat, lon) {
  const near = db.monuments.map(m => ({ ...m, d: km(lat, lon, m.lat, m.lon) })).sort((a, b) => a.d - b.d);
  const within = near.filter(m => m.d <= 10), c = { nu: 0, vroeger: 0, onbekend: 0, nvt: 0 }; within.forEach(m => c[m.status.status]++);
  near.slice(0, 6).forEach(m => log(`Monument ${m.monumentNumber} (RCE) = ${m.wikidata?.split('/').pop()} (Wikidata)`, m['@id']));
  $('#heritage').innerHTML = `<p>Binnen 10 km: <b>${c.nu}</b> werken nu mee, <b>${c.vroeger}</b> werkten vroeger, <b>${c.onbekend}</b> onbekend, <b>${c.nvt}</b> geen werktuig.</p>
    <p class="muted small"><b>Werkt nu mee</b>: verzet vandaag water voor de afwatering (actueel waterschapsregister of Molendatabase), ook molens die op vrijwillige basis bijmalen. <b>Werkte vroeger</b>: buiten bedrijf, museum, of draait alleen rond zonder polderwater te verzetten.</p>
    <div class="chips" role="group" aria-label="Filter">${['alle', 'nu', 'vroeger', 'onbekend', 'nvt'].map(k => `<button type="button" data-filter="${k}" aria-pressed="${k === 'alle'}">${k === 'alle' ? 'alle' : esc(STATUS[k])}</button>`).join('')}</div>
    <div id="mons">${near.slice(0, 8).map(monCard).join('')}</div>`;
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => {
    $$('[data-filter]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const k = b.dataset.filter, list = k === 'alle' ? near : near.filter(m => m.status.status === k);
    $('#mons').innerHTML = list.slice(0, 8).map(monCard).join('') || '<p class="muted">Geen monumenten in deze groep.</p>';
  }));
}

function renderSim(dr, lat, lon) {
  const el = $('#sim');
  if (!dr) { el.innerHTML = '<p>Voor dit adres levert het waterschap geen afvoer-, bemalings- of peilgebied als open data. Zonder dat gebied weten we niet op welke oppervlakte de regen valt, dus rekenen we hier niets uit.</p>'; return; }
  view.showArea(dr.f.geometry);
  const p = dr.f.properties, A = dr.A;
  const row = x => `<label><input type="checkbox" data-cap="${x.p.maximalecapaciteit || 0}" ${dr.counts(x) ? 'checked' : ''} ${x.p.maximalecapaciteit ? '' : 'disabled'}>
    ${esc(pumpName(x.p))} · ${x.p.maximalecapaciteit ? `${nf(x.p.maximalecapaciteit, 1)} m³/min` : 'capaciteit niet opgegeven'} · ${esc(x.p.functiegemaal || 'functie onbekend')}${x.inside || x.edge <= 15 ? '' : ` · ${nf(x.edge)} m buiten de rand`}</label>`;
  const rs = db.rainStations.map(s => ({ ...s, d: km(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d)[0];
  el.innerHTML = `<p>Een <b>rekenvoorbeeld</b>, geen voorspelling of model. Alleen echte getallen: de oppervlakte van het gebied, de pompcapaciteit uit het waterschapsregister en gemeten regen van het KNMI.</p>
    <p>Dit adres ligt in ${dr.kind === 'peilgebied' ? 'peilgebied' : 'afwateringsgebied'} <b>${esc(p.naam || p.code || 'zonder naam')}</b> (${esc(p.waterbeheerder)}), <b>${nf(A / 1e6, 2)} km²</b> (oranje gestippeld op de kaart).</p>
    <h3>Gemalen (vink uit = zet uit)</h3><div class="pumps">${dr.main.map(row).join('') || '<p class="muted">Geen gemaal gevonden dat water uit dit gebied afvoert en een capaciteit heeft opgegeven.</p>'}
      ${dr.other.length ? `<details><summary class="small">${dr.other.length} andere gemalen, standaard niet meegeteld</summary><p class="muted small">Onderbemalingen verplaatsen water binnen het gebied; gemalen net buiten de rand horen vaak bij de buurpolder.</p>${dr.other.map(row).join('')}</details>` : ''}</div>
    <h3>Hoeveel regen?</h3>
    ${rs ? `<label><input type="radio" name="rain" value="${rs.wettestDay.mm}" checked> natste dag ooit in ${esc(rs.name)}: <b>${nf(rs.wettestDay.mm, 1)} mm</b> (${esc(rs.wettestDay.date)})</label><br>
      <label><input type="radio" name="rain" value="${rs.wettestDayLastYear.mm}"> natste dag van het afgelopen jaar: <b>${nf(rs.wettestDayLastYear.mm, 1)} mm</b> (${esc(rs.wettestDayLastYear.date)})</label><br>` : ''}
    <label><input type="radio" name="rain" value="own" ${rs ? '' : 'checked'}> eigen keuze: <input type="range" id="ownmm" min="5" max="150" step="5" value="30" aria-label="Regen in millimeter" style="width:120px;vertical-align:middle"> <span id="ownmmv">30</span> mm</label>
    ${rs ? `<p class="muted small">KNMI-station ${esc(rs.name)} (${nf(rs.d, 0)} km), dagsommen ${esc(rs.since)} t/m ${esc(rs.until)}. <a href="${esc(rs.source)}" target="_blank" rel="noopener">bron</a></p>` : ''}
    <div class="simres" id="simres"></div>
    <details><summary><b>Aannames en wat we bewust niet uitrekenen</b></summary><div class="assume"><ul>
      <li>De regen valt gelijkmatig; er verdampt of zakt niets weg (dan valt het mee). Kwel rekenen we niet mee (dan valt het tegen).</li>
      <li>Standaard tellen alleen gemalen met functie "afvoeren" in het gebied of op de rand (tot 15 m), op volle capaciteit (<code>maximalecapaciteit</code>, m³/min).</li>
      <li><b>We rekenen niet uit hoe hoog het water in jouw straat komt.</b> Daarvoor zijn streefpeil, open water, bodem en een hydrologisch model nodig; het peil staat niet in de open data.</li>
      <li>Echte modeluitkomsten staan op de kaart onder "Risico" (LIWO) en onder "Alle kaartlagen".</li></ul></div></details>`;
  const calc = () => {
    const sel = el.querySelector('input[name=rain]:checked');
    const mm = !sel || sel.value === 'own' ? +$('#ownmm').value : +sel.value;
    $('#ownmmv').textContent = $('#ownmm').value;
    const Q = [...el.querySelectorAll('.pumps input:checked')].reduce((s, i) => s + (+i.dataset.cap), 0);
    const V = mm / 1000 * A, mmDay = Q * 1440 / A * 1000, hours = Q ? V / Q / 60 : Infinity;
    $('#simres').innerHTML = `Er valt <b>${nf(mm, 1)} mm</b> op ${nf(A / 1e6, 2)} km²: <b>${nf(V)} m³</b> water.<br>` + (Q
      ? `De gemalen pompen samen <b>${nf(Q, 1)} m³/min</b>, dat is ${nf(mmDay, 1)} mm per dag over dit gebied. Wegpompen duurt ongeveer <b>${hours < 48 ? nf(hours, 1) + ' uur' : nf(hours / 24, 1) + ' dagen'}</b>.${mm > mmDay ? '<br><span class="muted">Er valt meer dan de gemalen in een dag aankunnen; het water staat tijdelijk hoger in sloten en vaarten.</span>' : ''}`
      : `<span class="below"><b>Alle gemalen staan uit.</b> Dan blijft deze ${nf(V)} m³ liggen: gemiddeld ${nf(mm, 1)} mm over alles, in sloten en laagtes meer. Hoe hoog in jouw straat rekenen we bewust niet uit.</span>`);
  };
  el.addEventListener('change', calc); $('#ownmm').addEventListener('input', calc); calc();
}

function renderFlood(depths, zee, inZ, f53) {
  const S = svc(db, 'liwo'), max = Math.max(0, ...depths.map(d => d.v || 0));
  const g = f53.gauge;
  $('#flood').innerHTML = `<p class="muted">LIWO (Rijkswaterstaat/Deltares): de grootste waterdiepte op dit punt over alle doorgerekende overstromingen in een kansklasse. Over dijkdoorbraken, niet over een uitgevallen gemaal. Raster 5 tot 100 m.</p>
    <div class="depthfig">${depthFigure(max)}<table><tr><th>Kansklasse</th><th>Max. diepte</th></tr>
      ${[...depths].reverse().map(d => `<tr><td>${esc(d.name)}<div class="muted small">${esc(d.probability)}</div></td><td>${d.v === undefined ? 'niet opgehaald' : d.v == null || d.v <= 0.02 ? 'geen water' : `<b>${nf(d.v, 2)} m</b>`}</td></tr>`).join('')}</table></div>
    ${inZ ? `<p>Bij een extreme bui van <b>90 mm in één uur</b> staat hier volgens de Provincie Zeeland ${zee == null || zee < 0.01 ? '<b>geen water op straat</b>' : `<b>${nf(zee * 100, 0)} cm</b> water`}.</p>` : ''}
    <h3>En in 1953?</h3>
    ${f53.inside ? `<p>Deze plek liep in 1953 onder volgens de inundatiekaart van de Provincie Noord-Brabant. Hoe diep staat niet in die kaart.</p>` : `<p>We vonden geen open inundatiekaart van 1953 die deze plek dekt (alleen voor Noord-Brabant). Daarom tonen we geen waterlijn voor 1953.</p>`}
    ${g ? `<p class="muted small">Ter vergelijking, gemeten op zee: bij ${esc(g.name)} stond het water op 1 februari 1953 op <b>NAP +${nf(g.level_m, 2)} m</b> (${esc(g.time.slice(11, 16))} uur; aflezing om de ${g.intervalMinutes} minuten van het registratieblad, status "${esc(g.status)}"; de echte top kan ertussen liggen). Bron: Rijkswaterstaat WaterWebservices.</p>` : ''}
    <p class="small"><a href="${esc(S.viewer)}" target="_blank" rel="noopener">Bekijk in LIWO</a> · <a href="${esc(S.documentation)}" target="_blank" rel="noopener">methode (Deltares, 2025)</a></p>`;
}
function depthFigure(d) {
  const H = 4, px = 160 / H, w = Math.min(d, H);
  return `<svg width="90" height="170" viewBox="0 0 90 170" role="img" aria-label="Waterlijn: ${nf(d, 2)} meter naast een persoon van 1,80 m en een deur van 2,10 m" style="color:var(--ink);flex:none">
    <rect x="50" y="${165 - 2.1 * px}" width="30" height="${2.1 * px}" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="22" cy="${165 - 1.68 * px}" r="${0.12 * px}" fill="currentColor"/><line x1="22" y1="${165 - 1.56 * px}" x2="22" y2="${165 - 0.85 * px}" stroke="currentColor" stroke-width="3"/>
    <line x1="22" y1="${165 - 0.85 * px}" x2="14" y2="165" stroke="currentColor" stroke-width="3"/><line x1="22" y1="${165 - 0.85 * px}" x2="30" y2="165" stroke="currentColor" stroke-width="3"/>
    <line x1="10" y1="${165 - 1.3 * px}" x2="34" y2="${165 - 1.3 * px}" stroke="currentColor" stroke-width="3"/>
    <rect x="0" y="${165 - w * px}" width="90" height="${w * px}" fill="var(--water)" opacity=".45"/><line x1="0" y1="165" x2="90" y2="165" stroke="currentColor"/>
    <text x="45" y="${Math.max(12, 160 - w * px)}" font-size="11" text-anchor="middle" fill="currentColor">${d > 0.02 ? nf(d, 2) + ' m' : 'geen water'}</text></svg>`;
}
function renderBoard(b) {
  const walk = (t, o = []) => { for (const n of t) { o.push(n.qid); walk(n.children, o); } return o; };
  const board = b?.board;
  if (!board) { $('#board').innerHTML = `<p class="muted">Waterschap niet gevonden.</p>`; return; }
  const anc = walk(board.ancestry).map(q => db.waterBoards[q]).filter(Boolean);
  const oldest = anc.filter(x => x.inception).sort((x, y) => x.inception - y.inception).slice(0, 4);
  const y0 = 1200, y1 = 2030, bins = Array(42).fill(0);
  anc.forEach(x => { if (x.dissolved) { const i = Math.floor((x.dissolved - y0) / (y1 - y0) * bins.length); if (i >= 0 && i < bins.length) bins[i]++; } });
  const mx = Math.max(1, ...bins);
  $('#board').innerHTML = `<p><b>${esc(board.label)}</b> beheert het water hier (officiële waterschapsgrens, PDOK). Op Wikidata zijn <b>${anc.length}</b> oudere waterschappen in dit waterschap opgegaan${board.inception ? `; huidige vorm sinds ${esc(board.inception)}` : ''}.</p>
    ${anc.length ? `<div class="bars" title="Opheffingen door fusie">${bins.map(x => `<div style="height:${x / mx * 100}%"></div>`).join('')}</div><div class="axis"><span>${y0}</span><span>opheffingen door fusie</span><span>${y1}</span></div>` : ''}
    ${oldest.length ? `<p class="muted small">Oudste: ${oldest.map(x => `<a href="http://www.wikidata.org/entity/${esc(x.qid)}" target="_blank" rel="noopener">${esc(x.label)}</a> (${esc(x.inception)})`).join(', ')}</p>` : ''}
    ${anc.length < 10 ? '<p class="muted small"><b>Gat in de data:</b> de geschiedenis van dit waterschap staat nauwelijks in linked data; de voorgangers zitten in lokale archieven.</p>' : ''}`;
}
function renderLD() {
  const f = n => `<a href="${esc(buildFile(n))}">${esc(n)}</a>`;
  $('#ld').innerHTML = `<p>Elke uitspraak hierboven komt uit een open bron. Hieronder de bevragingen voor dit adres en wat we teruggeven aan het erfgoednetwerk (alles ter review vóór upload).</p>
    <ul class="downloads">
      <li>${f('droge-voeten.jsonld')}: het koppelvlak dat deze app leest</li>
      <li>${f('linkset-v3.ttl')}: nieuwe links (monument ↔ molen- en gemaalrecords, verdwenen molen ↔ Wikidata, polder ↔ Wikidata, geschenkwoning ↔ BAG)</li>
      <li>${f('events.ttl')}: "Hoe werd dit droog?" als dataset (schema:Event met prov:wasDerivedFrom)</li>
      <li>${f('wikidata_P571_polders.qs')} en ${f('wikidata_P571_P576_molens.qs')}: Wikidata-voorstellen met bronvermelding</li>
      <li>${f('linkset.ttl')}, ${f('status.ttl')}, ${f('wikidata_P5817_suggestions.qs')}: uit ronde 2</li>
      <li>${f('dataset-description.jsonld')}: beschrijving voor het NDE Datasetregister</li></ul>
    <h3>Bevragingen voor dit adres</h3><pre class="trace">${trace.map(([w, u]) => `${esc(w)}\n  ${esc(u)}`).join('\n')}</pre>`;
}

// ---------- main lookup ----------
async function run(q) {
  const my = ++runId;
  trace.length = 0;
  $('#intro').hidden = true; $('#result').hidden = false;
  $('#status').className = 'status'; $('#status').textContent = 'Adres opzoeken…';
  $('#facts').innerHTML = skeleton(4); $('#callout').innerHTML = ''; $('#addr').textContent = q;
  $('#timeline').innerHTML = '<li class="loading">Tijdlijn opbouwen…</li>';
  for (const id of ['heritage', 'sim', 'flood', 'board', 'ld']) $('#' + id).innerHTML = '<p class="loading">Laden…</p>';
  setTimeout(() => view.map.invalidateSize(), 50);

  const a = await geocode(q);
  if (my !== runId) return;
  if (!a) { $('#status').className = 'status error'; $('#status').textContent = `Adres "${q}" niet gevonden. Probeer straat, huisnummer en plaats.`; $('#facts').innerHTML = ''; $('#timeline').innerHTML = ''; return; }
  log('Adres (BAG via PDOK Locatieserver)', a.uri);
  $('#addr').textContent = a.label; $('#status').textContent = '';
  { const sp = new URLSearchParams(location.search); sp.set('q', a.label); history.replaceState(null, '', '?' + sp.toString().replace(/\+/g, '%20')); }
  $('#q').value = a.label;
  $('#arlink').href = `ar.html?lat=${a.lat.toFixed(6)}&lon=${a.lon.toFixed(6)}&q=${encodeURIComponent(a.label)}`;

  const z90 = svc(db, 'zeeland90'), inZ = inBbox(a.lon, a.lat, z90.bbox);
  const [hR, bR, nR, lR, zR, dR, areasR, ptsR, zldR] = await Promise.allSettled([
    heightAt(db, a.lat, a.lon), boardAt(db, a.lat, a.lon), nearbyPumps(a.lat, a.lon), liwoAt(db, a.lat, a.lon),
    inZ ? gfi(z90, z90.layer, a.lat, a.lon) : Promise.reject(new Error('buiten Zeeland')), drainage(a.lat, a.lon),
    files.areas, files.points, (inZ || inBbox(a.lon, a.lat, SW_DELTA)) ? files.zeeland : Promise.resolve(null)]);
  if (my !== runId) return;
  const val = r => r.status === 'fulfilled' ? r.value : null;
  const h = val(hR), b = val(bR), near = val(nR), depths = val(lR) || [], dr = val(dR), areas = val(areasR), pts = val(ptsR), zld = val(zldR);
  if (h) log('Maaiveldhoogte (AHN)', h.url);
  if (b) { log('Waterschap op dit punt (PDOK, punt-in-vlak)', b.url); if (b.qid) log('Waterschap (Wikidata)', 'http://www.wikidata.org/entity/' + b.qid); }
  if (near) log('Gemalen van nu in de buurt (IMWA)', near.url);
  if (depths[4]?.url) log('Overstromingsdiepte (LIWO, 5 kansklassen)', depths[4].url);
  const zee = zR.status === 'fulfilled' ? rasterVal(zR.value.f) : null;
  if (zR.status === 'fulfilled') log('Waterdiepte bij 90 mm/uur (Provincie Zeeland)', zR.value.url);

  view.setAddress(a, b?.feature?.geometry);
  const f53 = flood1953(db, a.lat, a.lon);
  // gift house: exact match on the BAG address id, else gift houses within 500 m
  let gift = null;
  if (zld) {
    const exact = zld.giftHouses.find(g => g.bag && a.nummeraanduiding && g.bag.nummeraanduiding === a.nummeraanduiding);
    gift = { exact, near: zld.giftHouses.map(g => ({ g, d: km(a.lat, a.lon, g.lat, g.lon) })).filter(x => x.d <= 0.5) };
    log('Provincie Zeeland: dijken, verdronken dorpen, geschenkwoningen (koppelvlak)', buildFile('zeeland.json'));
  }
  if (areas) log('Polders, droogmakerijen, ruilverkavelingen (koppelvlak, punt-in-vlak)', buildFile('history-areas.json'));
  if (pts) log('Molens en gemalen door de tijd (koppelvlak)', buildFile('history-points.json'));

  const pumpSentence = dr?.main?.length ? `${dr.main.slice(0, 2).map(x => pumpName(x.p)).join(' en ')} ${dr.main.length > 1 ? 'pompen' : 'pompt'} het water hier weg`
    : near?.list?.[0] ? `Dichtstbijzijnde gemaal: ${pumpName(near.list[0].p)} (${nf(near.list[0].d, 1)} km)` : 'Geen gemaal binnen 3 km';
  const ws = b?.board?.label || b?.label;
  const worst = depths.filter(d => d.v > 0.02).sort((x, y) => y.v - x.v)[0];
  const today = { title: `Vandaag: ${pumpSentence}`, detail: `${ws ? `Waterschap: ${esc(ws)}. ` : ''}Bron: waterschapsregister IMWA en waterschapsgrenzen (PDOK).` };
  const risk = { title: worst ? `Risico: bij een dijkdoorbraak tot ${nf(worst.v, 1)} m water` : 'Risico: volgens LIWO geen water bij een dijkdoorbraak',
    detail: worst ? `LIWO, kansklasse "${esc(worst.name)}" (${esc(worst.probability)}). <a href="${esc(`ar.html?lat=${a.lat.toFixed(6)}&lon=${a.lon.toFixed(6)}&q=${encodeURIComponent(a.label)}`)}">Bekijk deze hoogte in je kamer</a>` : 'LIWO, alle vijf kansklassen.' };
  const ctx = { lat: a.lat, lon: a.lon, a, areas, points: pts, zeeland: zld, flood: f53, gift, today, risk,
    distToLine: g => distToLineKm(a.lat, a.lon, g) };

  let tl = { history: [], tail: [today, risk].map((x, i) => ({ ...x, [i ? 'risk' : 'now']: true })) };
  if (areas && pts) { try { tl = buildTimeline(ctx); } catch (e) { console.error(e); } }
  $('#facts').innerHTML = heightFact(h?.value ?? null, h?.url) + pumpFact(dr, near, b) + historyFact(tl, a) + riskFact(depths, depths[4]?.url);
  $('#callout').innerHTML = callout(ctx);
  $('#go1560')?.addEventListener('click', () => { $('#mapbox').open = true; view.setTheme('zeeland'); $('#mapbox').scrollIntoView({ behavior: 'smooth' }); });
  if (areas && pts) renderTimeline(tl, $('#timeline'), $('#tl-more'));
  else $('#timeline').innerHTML = '<li class="tl unknown"><div class="yr">?</div><div>De historische kaarten konden niet worden geladen. Probeer het later opnieuw.</div></li>';
  $('#timeline').addEventListener('click', async e => {
    const btn = e.target.closest('[data-dike]'); if (!btn) return;
    btn.textContent = 'Ophalen…';
    try { const p = (await getJSON(btn.dataset.dike)).features[0].properties;
      btn.outerHTML = `<span>${esc((p.bijzonderh_uitg || 'Geen beschrijving.').replace(/\*$/, ''))}${p.bron_data_uitg ? ` <i>Literatuur: ${esc(p.bron_data_uitg)}</i>` : ''}</span>`;
    } catch { btn.textContent = 'Beschrijving niet beschikbaar'; }
  });

  renderHeritage(a.lat, a.lon);
  renderSim(dr, a.lat, a.lon);
  renderFlood(depths, zee, inZ, f53);
  renderBoard(b);
  renderLD();
  if (view.theme === 'tijd' || view.theme === 'zeeland') view.setTheme(view.theme);
}

// ---------- wiring ----------
let sugT;
$('#q').addEventListener('input', e => {
  clearTimeout(sugT); const v = e.target.value; if (v.length < 4) return;
  sugT = setTimeout(async () => { try { const r = await getJSON(PDOK.suggest(v)); $('#sugg').innerHTML = r.response.docs.map(d => `<option value="${esc(d.weergavenaam)}">`).join(''); } catch {} }, 250);
});
const go = q => run(q).catch(err => { $('#status').className = 'status error'; $('#status').textContent = 'Er ging iets mis: ' + err.message; });
$('#f').addEventListener('submit', e => { e.preventDefault(); if ($('#q').value.trim()) go($('#q').value.trim()); });
$$('[data-q]').forEach(x => x.addEventListener('click', () => { $('#q').value = x.dataset.q; go(x.dataset.q); }));

(async () => {
  $('#status').textContent = 'Gegevens laden…';
  db = await koppelvlak();
  log('Koppelvlak (JSON-LD)', buildFile('droge-voeten.jsonld'));
  files = { areas: buildJSON('history-areas.json'), points: buildJSON('history-points.json'), zeeland: buildJSON('zeeland.json') };
  files.areas.catch(() => {}); files.points.catch(() => {}); files.zeeland.catch(() => {});
  $('#mapbox').open = matchMedia('(min-width: 980px)').matches;
  view = new MapView(db, files);
  $('#status').textContent = '';
  const sp = new URLSearchParams(location.search), qp = sp.get('q');
  const yr = parseInt(sp.get('jaar')); if (yr >= 1600 && yr <= 2026) view.year = yr;
  if (['nu', 'tijd', 'risico', 'zeeland'].includes(sp.get('kaart'))) { $('#mapbox').open = true; view.setTheme(sp.get('kaart')); }
  if (qp) { $('#q').value = qp; go(qp); }
})().catch(err => { $('#status').className = 'status error'; $('#status').textContent = 'De gegevens konden niet laden: ' + err.message; });
