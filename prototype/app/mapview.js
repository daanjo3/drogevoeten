// Map with four calm presets ("Nu", "Tijdreis", "Risico", "Zeeland") instead of one long list of layers.
// "Alle kaartlagen" still offers every layer. The time slider draws ~21k mills and pumping stations on one canvas.
import { $, $$, esc, nf, getJSON, inBbox, svc } from './lib/core.js';

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const STATUS = { nu: 'werkt nu mee', vroeger: 'werkte vroeger', onbekend: 'onbekend', nvt: 'geen werktuig' };
const NOW = 2026, START = 1600;
const MIDDELBURG = [51.4996, 3.6136];

export class MapView {
  constructor(db, { areas, points, zeeland }) {
    this.db = db; this.areasP = areas; this.pointsP = points; this.zeelandP = zeeland;
    this.wms = {}; this.own = {}; this.theme = 'nu'; this.year = NOW; this.addr = null;
    this.map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([52.2, 5.3], 7);
    this.map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer(svc(db, 'achtergrond').url, { maxZoom: 19, attribution: 'Achtergrond: Kadaster / PDOK' }).addTo(this.map);
    for (const s of db.services.filter(s => !s.base)) {
      this.wms[s.id] = L.tileLayer.wms(s.url, { layers: s.layer, styles: s.style || '', format: 'image/png', transparent: true, version: '1.3.0',
        opacity: s.opacity ?? 0.85, attribution: esc(s.publisher), maxZoom: 19 });
    }
    this.own.monuments = L.layerGroup(db.monuments.map(m => L.circleMarker([m.lat, m.lon], { radius: 5, weight: 1, color: '#fff', fillOpacity: .95,
      fillColor: css('--st-' + m.status.status) })
      .bindPopup(`<b>${esc(m.name)}</b><br>${esc(STATUS[m.status.status])}: ${esc(m.status.label)}<br><a href="${esc(m.register)}" target="_blank" rel="noopener">Monumentenregister</a>`)));
    this.buildLayerPanel();
    $$('.themes button').forEach(b => b.addEventListener('click', () => this.setTheme(b.dataset.theme)));
    $('#mapbox').addEventListener('toggle', () => setTimeout(() => this.map.invalidateSize(), 50));
    this.setTheme('nu');
  }

  // ---------- presets ----------
  async setTheme(t) {
    this.theme = t;
    $$('.themes button').forEach(b => b.setAttribute('aria-selected', b.dataset.theme === t));
    const want = { nu: ['waterschappen', 'gemalen', 'monuments'], tijd: ['time', 'areasTime'], risico: ['liwo'],
                   zeeland: ['dikes', 'villages', 'gifts', 'kaart1560'] }[t];
    for (const id of Object.keys(this.wms)) this.toggle(id, want.includes(id));
    for (const id of ['monuments', 'time', 'areasTime', 'dikes', 'villages', 'gifts']) {
      if (want.includes(id)) await this.ensure(id);
      this.toggle(id, want.includes(id));
    }
    this.renderPanel();
    if (t === 'zeeland') {
      const z = svc(this.db, 'zeeland90').bbox;
      const c = this.addr && inBbox(this.addr.lon, this.addr.lat, z) ? [this.addr.lat, this.addr.lon] : MIDDELBURG;
      this.map.setView(c, Math.max(this.map.getZoom(), 14));
    }
    if (t === 'tijd' && this.map.getZoom() > 12) this.map.setZoom(11);
  }

  layer(id) { return this.wms[id] || this.own[id]; }
  toggle(id, on) {
    const l = this.layer(id); if (!l) return;
    if (on && !this.map.hasLayer(l)) l.addTo(this.map);
    if (!on && this.map.hasLayer(l)) this.map.removeLayer(l);
    const cb = document.getElementById('lyr-' + id); if (cb) cb.checked = on;
  }

  async ensure(id) {
    if (this.own[id]) return;
    if (id === 'time') this.own.time = timeLayer(this, await this.pointsP);
    if (id === 'areasTime') {
      const a = (await this.areasP).areas.filter(x => x.kind === 'polder' || x.kind === 'droogmakerij');
      this.own.areasTime = L.geoJSON({ type: 'FeatureCollection', features: a.map(x => ({ type: 'Feature', geometry: x.geometry, properties: x })) },
        { renderer: L.canvas(), style: f => this.areaStyle(f.properties),
          onEachFeature: (f, l) => l.bindPopup(() => areaPopup(f.properties)) });
    }
    if (['dikes', 'villages', 'gifts'].includes(id)) {
      const z = await this.zeelandP;
      if (!this.own.dikes) {
        const r = L.canvas({ tolerance: 6 });
        this.own.dikes = L.geoJSON({ type: 'FeatureCollection', features: z.dikes.map(d => ({ type: 'Feature', geometry: d.geometry, properties: d })) },
          { renderer: r, style: f => ({ color: dikeColor(f.properties.indicative || f.properties.begin), weight: 3, opacity: .9 }),
            onEachFeature: (f, l) => l.on('click', e => this.dikePopup(f.properties, e.latlng)) });
        this.own.villages = L.layerGroup(z.drownedVillages.map(v => L.circleMarker([v.lat, v.lon], { radius: 6, weight: 2, color: css('--warm'), fillOpacity: 0 })
          .bindPopup(`<b>Verdronken dorp: ${esc(v.name)}</b><br>Periode: ${esc(v.period || 'onbekend')}${v.altNames.length ? `<br>Ook: ${esc(v.altNames.join(', '))}` : ''}<br><a href="${esc(v.source)}" target="_blank" rel="noopener">bron (Provincie Zeeland)</a>`)));
        this.own.gifts = L.layerGroup(z.giftHouses.map(g => L.circleMarker([g.lat, g.lon], { radius: 4, weight: 1, color: '#fff', fillColor: css('--water'), fillOpacity: 1 })
          .bindPopup(() => `${g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : ''}<b>Geschenkwoning uit ${esc(g.country)}</b><br>${esc(g.street)} ${esc(g.number)}${esc(g.addition || '')}, ${esc(g.place)}<br>Datering: ${esc(g.dated || 'onbekend')} · ${esc(g.recognisable || '')}<br><a href="${esc(g.source)}" target="_blank" rel="noopener">bron (Provincie Zeeland)</a>`)));
      }
    }
  }

  areaStyle(p) {
    const done = p.year && p.year <= this.year;
    return done ? { color: css('--mill'), weight: 1, fillColor: css('--mill'), fillOpacity: .22, dashArray: null }
                : { color: css('--water'), weight: 1, fillOpacity: 0, dashArray: '3 4', opacity: .6 };
  }

  async dikePopup(d, latlng) {
    const head = `<b>${esc(d.name || 'Dijk zonder naam')}</b><br>${esc(d.originalFunction || 'functie onbekend')}${d.laterFunction && d.laterFunction.trim() ? `, later ${esc(d.laterFunction)}` : ''}<br>
      Aangelegd ${d.begin && d.end && d.end !== d.begin ? `tussen ${d.begin} en ${d.end}` : (d.begin || d.indicative || 'onbekend')} · nu: ${esc(d.status || 'onbekend')}`;
    const pop = L.popup({ maxWidth: 320 }).setLatLng(latlng).setContent(head + '<br><span class="muted">Beschrijving ophalen bij de Provincie Zeeland…</span>').openOn(this.map);
    try {
      const f = (await getJSON(d.source)).features[0].properties; // live from the source feature (CORS open)
      pop.setContent(`${f.afbeelding ? `<img src="${esc(f.afbeelding)}" alt="" loading="lazy">` : ''}${head}
        ${f.bijzonderh_uitg ? `<p>${esc(f.bijzonderh_uitg.replace(/\*$/, ''))}</p>` : ''}${f.bron_data_uitg ? `<p class="muted"><b>Literatuur:</b> ${esc(f.bron_data_uitg)}</p>` : ''}
        <a href="${esc(d.source)}" target="_blank" rel="noopener">bron (Provincie Zeeland, WFS)</a>`);
    } catch { pop.setContent(head + `<br><a href="${esc(d.source)}" target="_blank" rel="noopener">bron</a>`); }
  }

  // ---------- panel under the map ----------
  async renderPanel() {
    const el = $('#themepanel');
    if (this.theme === 'nu') {
      el.innerHTML = `<p>Wie beheert het water nu: waterschapsgrenzen, de gemalen van nu (waterschapsregister) en het waterstaatserfgoed.</p>
        <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span><span class="dot" style="background:var(--st-${k})"></span>${v}</span>`).join('')}</div>`;
    } else if (this.theme === 'risico') {
      const s = svc(this.db, 'liwo');
      el.innerHTML = `<p>Maximale waterdiepte bij een dijkdoorbraak (LIWO). Kies de kansklasse:</p>
        <select id="liwo-k" aria-label="Kansklasse">${s.variants.map(v => `<option value="${esc(v.layer)}" ${v.layer === (this.liwoLayer || s.layer) ? 'selected' : ''}>${esc(v.name)} (${esc(v.probability)})</option>`).join('')}</select>
        <img alt="Legenda waterdiepte" style="display:block;margin-top:8px;max-width:180px" src="${esc(s.url)}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=${esc(this.liwoLayer || s.layer)}&STYLE=${esc(s.style)}">
        <p class="muted small">Modeluitkomst van Rijkswaterstaat/Deltares, geen voorspelling. ${s.documentation ? `<a href="${esc(s.documentation)}" target="_blank" rel="noopener">methode</a>` : ''}</p>`;
      $('#liwo-k').addEventListener('change', e => { this.liwoLayer = e.target.value; this.wms.liwo.setParams({ layers: e.target.value }); this.renderPanel(); });
    } else if (this.theme === 'zeeland') {
      el.innerHTML = `<p>Zeeland: dijken met hun aanlegjaar (klik voor beschrijving en literatuur), verdronken dorpen <span class="dot ring" style="color:var(--warm)"></span>en geschenkwoningen na 1953 <span class="dot" style="background:var(--water)"></span>.</p>
        <div class="legend">${[[900, 'vóór 1200'], [1400, '1200–1600'], [1700, '1600–1800'], [1850, '1800–1953'], [1980, 'na 1953']].map(([y, l]) => `<span><span class="dot sq" style="background:${dikeColor(y)}"></span>${l}</span>`).join('')}</div>
        <label>Historische kaart: <select id="histmap"><option value="">geen</option><option value="kaart1560" selected>1560 (stadskaarten)</option><option value="hattinga">rond 1750 (Hattinga)</option><option value="pourbus">1571 (Pourbus, Zeeuws-Vlaanderen)</option></select></label>
        <label style="display:block;margin-top:6px">Doorzichtigheid <input type="range" id="histop" min="0" max="1" step="0.05" value="0.9" style="width:140px;vertical-align:middle"></label>
        <p class="muted small">Kaarten: Provincie Zeeland (opengeodata.zeeland.nl). De kaart van 1560 dekt alleen de omgeving van 15 steden.</p>`;
      $('#histmap').addEventListener('change', e => { for (const k of ['kaart1560', 'hattinga', 'pourbus']) this.toggle(k, k === e.target.value); });
      $('#histop').addEventListener('input', e => { for (const k of ['kaart1560', 'hattinga', 'pourbus']) this.wms[k].setOpacity(+e.target.value); });
    } else if (this.theme === 'tijd') {
      const pts = await this.pointsP;
      el.innerHTML = `<div class="slider"><button type="button" id="play" class="ghost" aria-label="Afspelen">▶</button>
          <input type="range" id="year" min="${START}" max="${NOW}" step="1" value="${this.year}" aria-label="Jaar"><output id="yearv">${this.year}</output></div>
        <p id="yearcount" class="small"></p>
        <div class="legend"><span><span class="dot" style="background:var(--mill)"></span>poldermolen</span><span><span class="dot sq" style="background:var(--pump)"></span>gemaal</span>
          <span><span class="dot ring" style="color:var(--pump)"></span>gemaal, later gesloopt (jaar onbekend)</span><span><span class="dot sq" style="background:var(--mill);opacity:.35"></span>polder of droogmakerij bestaat al</span></div>
        <label class="small"><input type="checkbox" id="allmills"> ook koren-, zaag- en andere molens</label>
        <div class="chart" id="chart"></div>${spikeNote(pts)}
        <p class="muted small">Alleen molens en gemalen met een bekend jaartal staan op de tijdschuif (${nf(pts.millsGone.built.filter(Boolean).length)} van ${nf(pts.millsGone.built.length)} verdwenen molens, ${nf(pts.pumps.filter(p => p.founded).length)} van ${nf(pts.pumps.length)} gemalen). Bron: RCE Landschapsatlas (verdwenen molens, molens, gemalen) en de Zeeuwse polderkaarten.</p>`;
      const set = y => { this.year = y; $('#yearv').textContent = y; this.own.time?.redraw(); this.own.areasTime?.setStyle(f => this.areaStyle(f.properties)); this.updateCount(pts); drawChart($('#chart'), pts.decades, y); };
      $('#year').addEventListener('input', e => set(+e.target.value));
      $('#allmills').addEventListener('change', e => { this.allMills = e.target.checked; this.own.time?.redraw(); this.updateCount(pts); });
      $('#play').addEventListener('click', () => {
        if (this.playing) { clearInterval(this.playing); this.playing = null; $('#play').textContent = '▶'; return; }
        if (this.year >= NOW) set(START);
        $('#play').textContent = '❚❚';
        this.playing = setInterval(() => { const y = Math.min(NOW, this.year + 5); $('#year').value = y; set(y); if (y >= NOW) { clearInterval(this.playing); this.playing = null; $('#play').textContent = '▶'; } }, 140);
      });
      set(this.year);
    }
  }

  updateCount(pts) {
    const y = this.year, m = pts.millsGone; let mills = 0, pumps = 0;
    for (let i = 0; i < m.built.length; i++) if (m.cat[i] === 0 && m.built[i] && m.built[i] <= y && (!m.gone[i] || y < m.gone[i])) mills++;
    for (const x of pts.millsExisting) if (/polder/.test(x.mainFunc || '') && x.built && x.built <= y) mills++;
    for (const p of pts.pumps) if (p.founded && p.founded <= y && !(y >= NOW && p.status === 'Gesloopt')) pumps++;
    const el = $('#yearcount'); if (el) el.innerHTML = `In <b>${y}</b> stonden er volgens deze bronnen <b>${nf(mills)}</b> poldermolens en <b>${nf(pumps)}</b> gemalen (heel Nederland, alleen records met bekend jaartal).`;
  }

  buildLayerPanel() {
    const box = $('#layers'); const rows = [];
    const own = [['monuments', 'Waterstaatserfgoed (rijksmonumenten), gekleurd naar staat van gebruik'], ['time', 'Molens en gemalen door de tijd (tijdschuif)'],
      ['areasTime', 'Polders en droogmakerijen met jaartal'], ['dikes', 'Zeeland: dijken met aanlegjaar'], ['villages', 'Zeeland: verdronken dorpen'], ['gifts', 'Geschenkwoningen 1953']];
    for (const [id, name] of own) rows.push(`<label><input type="checkbox" id="lyr-${id}"> ${esc(name)}</label>`);
    for (const s of this.db.services.filter(s => !s.base)) {
      rows.push(`<label><input type="checkbox" id="lyr-${s.id}"> ${esc(s.name)}</label><div class="about">${esc(s.about || '')} Bron: ${esc(s.publisher)} · licentie: ${esc(s.license)}</div>`);
    }
    box.innerHTML = rows.join('');
    for (const id of [...own.map(o => o[0]), ...Object.keys(this.wms)]) {
      document.getElementById('lyr-' + id).addEventListener('change', async e => { if (e.target.checked) await this.ensure(id); this.toggle(id, e.target.checked); });
    }
  }

  setAddress(a, boardGeom) {
    this.addr = a;
    if (this.marker) this.map.removeLayer(this.marker);
    this.marker = L.marker([a.lat, a.lon], { title: a.label }).addTo(this.map).bindPopup(esc(a.label));
    if (this.board) this.map.removeLayer(this.board);
    if (boardGeom) this.board = L.geoJSON(boardGeom, { style: { color: css('--water'), weight: 2, fill: false } }).addTo(this.map);
    this.map.setView([a.lat, a.lon], 14, { animate: false });
  }
  showArea(geom) {
    if (this.area) this.map.removeLayer(this.area);
    if (geom) this.area = L.geoJSON(geom, { style: { color: css('--warm'), weight: 2, fill: false, dashArray: '5 4' } }).addTo(this.map);
  }
}

// Single years that occur suspiciously often in the source (e.g. 1850) are probably rounded or estimated.
function spikeNote(pts) {
  const m = pts.millsGone, n = {};
  for (let i = 0; i < m.gone.length; i++) if (m.cat[i] === 0 && m.gone[i]) n[m.gone[i]] = (n[m.gone[i]] || 0) + 1;
  const top = Object.entries(n).filter(([, c]) => c >= 300).sort((a, b) => b[1] - a[1]);
  return top.length ? `<p class="muted small"><b>Let op:</b> ${top.map(([y, c]) => `${nf(c)} poldermolens hebben precies ${y}`).join(' en ')} als verdwijnjaar. Zulke pieken zijn mogelijk afgeronde of geschatte jaartallen in de bron (niet gecontroleerd), geen echte golf.</p>` : '';
}

function dikeColor(y) {
  if (!y) return '#8a959b';
  return y < 1200 ? '#5b3a1e' : y < 1600 ? '#8c6a3d' : y < 1800 ? '#b8935a' : y < 1953 ? '#3f7fa8' : '#1e4f6e';
}

function areaPopup(p) {
  const kind = p.kind === 'droogmakerij' ? 'Droogmakerij' : 'Polder';
  return `<b>${kind}: ${esc(p.name || 'zonder naam')}</b><br>${p.kind === 'droogmakerij' ? 'Drooggemaakt' : 'Ingedijkt'}: ${esc(p.yearText || p.periodLayer || 'onbekend')}
    ${p.precision === 'eeuw' ? '<br><span class="muted">Alleen de eeuw is bekend; op de tijdschuif telt het begin van die eeuw.</span>' : ''}
    <br>${p.report ? `<a href="${esc(p.report)}" target="_blank" rel="noopener">beschrijving (pdf)</a> · ` : ''}<a href="${esc(p.source)}" target="_blank" rel="noopener">bron</a>`;
}

// ---------- canvas layer for the time slider ----------
function timeLayer(view, pts) {
  const map = view.map, m = pts.millsGone, N = m.lat.length;
  const merc = (lat, lon) => { const s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };
  const items = [];
  for (let i = 0; i < N; i++) items.push({ k: 'gone', i, cat: m.cat[i], b: m.built[i], g: m.gone[i], xy: merc(m.lat[i], m.lon[i]) });
  pts.millsExisting.forEach((x, i) => items.push({ k: 'mill', i, cat: /polder/.test(x.mainFunc || '') ? 0 : 1, b: x.built, g: 0, xy: merc(x.lat, x.lon) }));
  pts.pumps.forEach((x, i) => items.push({ k: 'pump', i, b: x.founded, gesloopt: x.status === 'Gesloopt', xy: merc(x.lat, x.lon) }));
  const visible = it => {
    const y = view.year;
    if (it.k === 'pump') return it.b ? (it.b <= y && !(it.gesloopt && y >= NOW)) : (y >= NOW && !it.gesloopt);
    if (it.cat !== 0 && !view.allMills) return false;
    if (it.k === 'mill') return it.b ? it.b <= y : y >= NOW;
    return it.b && it.b <= y && (!it.g || y < it.g);
  };
  const Layer = L.Layer.extend({
    onAdd() {
      this.c = L.DomUtil.create('canvas', 'leaflet-time-canvas'); this.c.style.position = 'absolute'; this.c.style.pointerEvents = 'none';
      map.getPanes().overlayPane.appendChild(this.c);
      map.on('moveend zoomend resize', this.redraw, this); map.on('zoomstart', this.hide, this); map.on('click', this.click, this);
      this.redraw();
    },
    onRemove() { this.c.remove(); map.off('moveend zoomend resize', this.redraw, this); map.off('zoomstart', this.hide, this); map.off('click', this.click, this); },
    hide() { this.c.style.opacity = 0; },
    frame() {
      const size = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]), z = map.getZoom(), scale = 256 * 2 ** z;
      const abs = map.project(map.containerPointToLatLng([0, 0]), z);
      return { size, tl, scale, ox: abs.x, oy: abs.y };
    },
    redraw() {
      if (!this.c) return;
      const f = this.frame(), dpr = window.devicePixelRatio || 1;
      this.c.width = f.size.x * dpr; this.c.height = f.size.y * dpr; this.c.style.width = f.size.x + 'px'; this.c.style.height = f.size.y + 'px';
      L.DomUtil.setPosition(this.c, f.tl); this.c.style.opacity = 1;
      const g = this.c.getContext('2d'); g.scale(dpr, dpr);
      const r = map.getZoom() < 9 ? 1.6 : map.getZoom() < 12 ? 2.6 : 4.5;
      const mill = css('--mill'), pump = css('--pump'), other = css('--muted');
      for (const it of items) {
        if (!visible(it)) continue;
        const x = it.xy[0] * f.scale - f.ox, y = it.xy[1] * f.scale - f.oy;
        if (x < -5 || y < -5 || x > f.size.x + 5 || y > f.size.y + 5) continue;
        if (it.k === 'pump') {
          if (it.gesloopt && view.year < NOW) { g.strokeStyle = pump; g.lineWidth = 1.2; g.strokeRect(x - r, y - r, 2 * r, 2 * r); }
          else { g.fillStyle = pump; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
        } else {
          g.fillStyle = it.cat === 0 ? mill : other; g.beginPath(); g.arc(x, y, it.k === 'mill' ? r * 1.25 : r, 0, 7); g.fill();
          if (it.k === 'mill') { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
        }
      }
    },
    click(e) {
      const f = this.frame(); let best = null, bd = 9;
      for (const it of items) {
        if (!visible(it)) continue;
        const d = Math.hypot(it.xy[0] * f.scale - f.ox - e.containerPoint.x, it.xy[1] * f.scale - f.oy - e.containerPoint.y);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(timePopup(pts, best)).openOn(map);
    },
  });
  const layer = new Layer();
  return layer;
}

function timePopup(pts, it) {
  const a = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : '';
  if (it.k === 'gone') {
    const m = pts.millsGone, i = it.i, lk = pts.millsGoneLookups;
    const name = (m.name[i] || '').replace(/<[^>]+>/g, '') || `naamloze ${lk.type[m.type[i]] || 'molen'}`;
    return `<b>${esc(name)}</b> (verdwenen)<br>${esc(lk.type[m.type[i]] || '')}, ${esc(lk.func[m.func[i]] || '')}<br>
      Gebouwd: ${esc(m.built[i] || 'onbekend')} ${esc(m.builtQ[i] || '')}<br>Verdwenen: ${esc(m.gone[i] || 'onbekend')} ${esc(m.goneQ[i] || '')}<br>
      ${a(pts.linkTemplates.molendatabaseOrg.replace('{tb}', encodeURIComponent(m.tb[i])), 'molendatabase.org')} · ${a(pts.featureUriTemplate.verdwenenmolens.replace('{fid}', m.fid[i]), 'bron (RCE)')}${m.wikidata[i] ? ' · ' + a('http://www.wikidata.org/entity/' + m.wikidata[i], 'Wikidata') : ''}`;
  }
  if (it.k === 'mill') {
    const x = pts.millsExisting[it.i];
    return `${x.photo ? `<img src="${esc(pts.photoBase + x.photo)}" alt="" loading="lazy">` : ''}<b>${esc(x.name || 'Molen')}</b>, ${esc(x.place || '')}<br>${esc(x.type || '')}, ${esc(x.func || '')} · ${esc(x.state || '')}<br>Bouwjaar: ${esc(x.builtText || 'onbekend')}<br>
      ${a(x.info, 'allemolens.nl')}${x.monument ? ' · ' + a('https://monumentenregister.cultureelerfgoed.nl/monumenten/' + x.monument, 'rijksmonument') : ''} · ${a(pts.featureUriTemplate.Molens.replace('{fid}', x.fid), 'bron (RCE)')}${x.photographer ? `<br><span class="muted">Foto: ${esc(x.photographer)}</span>` : ''}`;
  }
  const p = pts.pumps[it.i];
  return `${p.photo ? `<img src="${esc(pts.photoBase + p.photo)}" alt="" loading="lazy">` : ''}<b>${esc(p.name || 'Gemaal')}</b>, ${esc(p.place || '')}<br>Gesticht: ${esc(p.foundedText || 'onbekend')} · ${esc(p.status || '')}<br>
    Aandrijving: ${esc(p.driveOriginal || '?')} → nu ${esc(p.driveNow || '?')}${p.area ? `<br>Bemalingsgebied: ${esc(p.area)}` : ''}
    ${p.imwa ? `<br>Nu in het waterschapsregister: ${a(p.imwa['@id'], p.imwa.name)}` : ''}<br>${a(p.info, 'Gemalenstichting')} · ${a(pts.featureUriTemplate.gemalen.replace('{fid}', p.fid), 'bron (RCE)')}${p.photographer ? `<br><span class="muted">Foto: ${esc(p.photographer)}</span>` : ''}`;
}

// ---------- chart: water mills that disappeared vs. pumping stations founded, per decade ----------
function drawChart(el, decades, year) {
  const W = 360, H = 120, P = { l: 30, r: 6, t: 8, b: 20 };
  const d = decades.filter(x => x.decade >= 1750);
  const max = Math.max(...d.map(x => Math.max(x.poldermolensVerdwenen, x.gemalenGesticht)));
  const bw = (W - P.l - P.r) / d.length, sy = v => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2 / 50) * 50, Math.round(max / 50) * 50].filter((v, i, s) => s.indexOf(v) === i && v <= max);
  const bars = d.map((x, i) => {
    const x0 = P.l + i * bw, hl = year >= x.decade && year < x.decade + 10;
    return `<g${hl ? '' : ' opacity=".75"'}><rect x="${x0 + .5}" y="${sy(x.poldermolensVerdwenen)}" width="${bw / 2 - .5}" height="${H - P.b - sy(x.poldermolensVerdwenen)}" fill="var(--mill)"><title>${x.decade}s: ${x.poldermolensVerdwenen} poldermolens verdwenen</title></rect>
      <rect x="${x0 + bw / 2}" y="${sy(x.gemalenGesticht)}" width="${bw / 2 - .5}" height="${H - P.b - sy(x.gemalenGesticht)}" fill="var(--pump)"><title>${x.decade}s: ${x.gemalenGesticht} gemalen gesticht</title></rect></g>`;
  }).join('');
  const yi = d.findIndex(x => year >= x.decade && year < x.decade + 10);
  const marker = yi >= 0 ? `<line x1="${P.l + yi * bw + bw / 2}" x2="${P.l + yi * bw + bw / 2}" y1="${P.t}" y2="${H - P.b}" stroke="var(--ink)" stroke-dasharray="2 2"/>` : '';
  const xl = d.filter(x => x.decade % 50 === 0).map(x => `<text x="${P.l + d.indexOf(x) * bw}" y="${H - 6}">${x.decade}</text>`).join('');
  el.innerHTML = `<p class="small" style="margin:10px 0 2px"><b>Per tien jaar:</b> <span class="dot" style="background:var(--mill)"></span>poldermolens verdwenen <span class="dot sq" style="background:var(--pump);margin-left:8px"></span>gemalen gesticht</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Staafdiagram: verdwenen poldermolens en gestichte gemalen per decennium, 1750 tot nu">
      ${ticks.map(t => `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="var(--line)"/><text x="${P.l - 4}" y="${sy(t) + 3}" text-anchor="end">${t}</text>`).join('')}
      ${bars}${marker}${xl}</svg>`;
}
