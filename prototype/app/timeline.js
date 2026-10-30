// "Hoe werd dit droog?" - builds a per-address timeline from the koppelvlak (history-areas, history-points,
// zeeland) plus live results. Every step carries the verbatim year text, a precision label and its source.
// Missing information becomes an explicit "onbekend voor deze plek" step; nothing is estimated.
import { esc, nf, km, areasAt, distToLineKm } from './lib/core.js';

export const PRECISION = {
  jaar: '', circa: 'ca.', voor: 'uiterlijk', periode: 'periode', eeuw: 'eeuw', 'periode-van-laag': 'ruwe periode',
  'met kanttekening': 'zie bron', onzeker: 'onzeker', onbekend: 'onbekend',
};
const PREC_HELP = {
  circa: 'De bron zegt "ca.": ongeveer dit jaar.', voor: 'De bron zegt "voor": uiterlijk in dit jaar.',
  periode: 'De bron geeft een periode; we tonen het begin.', eeuw: 'Alleen de eeuw is bekend.',
  'periode-van-laag': 'Alleen de periode van de kaartlaag is bekend.', 'met kanttekening': 'De bron zet er een opmerking bij.',
  onzeker: 'De jaartekst in de bron is niet eenduidig.',
};
const link = (url, label) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';
const src = (url, label = 'bron') => link(url, label);
const kmTxt = d => d < 1 ? `${nf(Math.round(d * 1000 / 10) * 10)} m` : `${nf(d, 1)} km`;
const millSrc = (pts, i) => pts.featureUriTemplate.verdwenenmolens.replace('{fid}', pts.millsGone.fid[i]);
const yearWithQ = (y, q) => y ? `${y}${q ? ' ' + q : ''}` : 'onbekend';

export const SW_DELTA = [3.3, 51.2, 4.9, 52.05]; // Zeeland and the southern Zuid-Holland islands

export function buildTimeline(ctx) {
  const { lat, lon, areas, points, zeeland, flood, gift, today, risk } = ctx;
  const items = [];
  const add = it => items.push(it);
  const hits = areasAt(areas.areas, lon, lat);
  const byKind = k => hits.filter(a => a.kind === k);

  // 1. Embankment (Zeeland) and drained lakes (RCE)
  const polders = byKind('polder'), names = byKind('poldernaam'), drained = byKind('droogmakerij');
  for (const a of polders) {
    const alt = names.find(n => n.year);
    add({ year: a.year, yearText: a.yearText || a.periodLayer, precision: a.precision,
      title: `Ingedijkt: ${a.name || 'polder zonder naam'}`,
      detail: `Bedijkingsperiode op de cultuurhistorische kaart van Zeeland: ${esc(a.periodLayer)}.` +
        (alt ? ` De poldernamenkaart noemt ${esc(alt.name)}, indijking ${esc(alt.yearText)}.` : '') +
        ` ${src(a.report, 'beschrijving (pdf)')} · ${src(a.source)}` + (a.wikidata ? ` · ${link('http://www.wikidata.org/entity/' + a.wikidata, 'Wikidata')}` : ''),
      kind: 'indijking', source: a.source });
  }
  if (!polders.length) for (const a of names.filter(n => n.year)) {
    add({ year: a.year, yearText: a.yearText, precision: a.precision, title: `Ingedijkt: ${a.name}`,
      detail: `Volgens de poldernamenkaart van de Provincie Zeeland. ${src(a.source)}`, kind: 'indijking', source: a.source });
  }
  for (const a of drained) {
    add({ year: a.year, yearText: a.yearText, precision: a.precision, title: `Drooggemaakt: ${a.name}`,
      detail: `Hier lag eerst een meer of plas. Polderpeil volgens de bron: ${esc(a.polderLevel || 'niet vermeld')}. Literatuur: ${esc(a.literature || 'niet vermeld')}. ${src(a.source)}`,
      kind: 'droogmaking', source: a.source });
  }
  if (!polders.length && !names.length && !drained.length) {
    add({ year: null, title: 'Indijking of droogmaking: onbekend voor deze plek',
      detail: 'De open kaarten die we gebruiken (droogmakerijen van de RCE, polders van de Provincie Zeeland) dekken deze plek niet. Dat zegt niet dat hier geen polder is.',
      kind: 'onbekend' });
  }

  // 2. Dikes and drowned villages (Zeeland)
  if (zeeland) {
    const dikes = zeeland.dikes.map(d => ({ d, dist: distToLineKm(lat, lon, d.geometry) })).filter(x => x.dist <= 0.25 && (x.d.indicative || x.d.begin))
      .sort((a, b) => a.dist - b.dist).slice(0, 2);
    for (const { d, dist } of dikes) {
      add({ year: d.begin || d.indicative, yearText: d.begin && d.end && d.end !== d.begin ? `${d.begin}–${d.end}` : String(d.begin || d.indicative),
        precision: d.begin && d.end && d.end !== d.begin ? 'periode' : 'jaar',
        title: d.name ? d.name.replace(/,\s*/g, ', ') : 'Dijk of wal zonder naam',
        detail: `Op ${kmTxt(dist)}.${d.originalFunction && d.originalFunction.trim() ? ` Soort volgens de bron: ${esc(d.originalFunction.toLowerCase())}.` : ''} Aangelegd ${d.begin && d.end && d.end !== d.begin ? `tussen ${d.begin} en ${d.end}` : `in ${d.begin || d.indicative}`}${d.status ? `; nu: ${esc(d.status.toLowerCase())}` : ''}. ` +
          `<button type="button" class="link" data-dike="${esc(d.source)}">Lees de beschrijving${d.hasLiterature ? ' en literatuur' : ''}</button> · ${src(d.source)}`,
        kind: 'dijk', source: d.source });
    }
    const villages = zeeland.drownedVillages.map(v => ({ v, d: km(lat, lon, v.lat, v.lon) })).filter(x => x.d <= 3).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { v, d } of villages) {
      add({ year: v.year, yearText: v.period, precision: v.precision === 'jaar' ? 'jaar' : v.precision, title: `Verdronken dorp: ${v.name}`,
        detail: `Op ${kmTxt(d)}${v.altNames.length ? `; ook bekend als ${esc(v.altNames.join(', '))}` : ''}. Het jaartal is de periode die de Provincie Zeeland bij dit dorp vermeldt. ${src(v.source)}`,
        kind: 'verdronken', source: v.source });
    }
  }

  // 3. Mills within 1 km
  const mg = points.millsGone, near = [];
  for (let i = 0; i < mg.lat.length; i++) {
    if (Math.abs(mg.lat[i] - lat) > 0.01 || Math.abs(mg.lon[i] - lon) > 0.016) continue;
    const d = km(lat, lon, mg.lat[i], mg.lon[i]);
    if (d <= 1) near.push({ i, d });
  }
  const polderMills = near.filter(x => mg.cat[x.i] === 0), otherMills = near.filter(x => mg.cat[x.i] !== 0);
  if (polderMills.length) {
    const built = polderMills.filter(x => mg.built[x.i]).sort((a, b) => mg.built[a.i] - mg.built[b.i]);
    const gone = polderMills.filter(x => mg.gone[x.i]).sort((a, b) => mg.gone[b.i] - mg.gone[a.i]);
    const list = [...polderMills].sort((a, b) => (mg.built[a.i] || 9999) - (mg.built[b.i] || 9999)).slice(0, 15).map(x => {
      const i = x.i, name = mg.name[i] ? mg.name[i].replace(/<[^>]+>/g, '') : `naamloze ${points.millsGoneLookups.type[mg.type[i]] || 'molen'}`;
      return `<li>${esc(name)}: ${esc(yearWithQ(mg.built[i], mg.builtQ[i]))} tot ${esc(yearWithQ(mg.gone[i], mg.goneQ[i]))} · ${link(points.linkTemplates.molendatabaseOrg.replace('{tb}', encodeURIComponent(mg.tb[i])), 'molendatabase')}</li>`;
    }).join('');
    const first = built[0];
    add({ year: first ? mg.built[first.i] : null, yearText: first ? String(mg.built[first.i]) : null,
      precision: first ? (mg.builtQ[first.i] ? 'met kanttekening' : 'jaar') : 'onbekend',
      title: `${polderMills.length} ${polderMills.length === 1 ? 'poldermolen' : 'poldermolens'} binnen 1 km`,
      detail: `${first ? `De oudste met bekend bouwjaar: ${esc(mg.name[first.i]?.replace(/<[^>]+>/g, '') || 'naamloos')} (${mg.built[first.i]}). ` : ''}Ze zijn allemaal verdwenen.` +
        (otherMills.length ? ` Ook ${otherMills.length} andere molens (koren, olie, zaag, …) verdwenen hier.` : '') +
        `<details><summary>Welke molens?</summary><ul>${list}</ul>${polderMills.length > 15 ? `<p>… en ${polderMills.length - 15} meer.</p>` : ''}</details>` +
        `Bron: RCE Landschapsatlas, verdwenen molens (uit de Molendatabase).`, kind: 'molens' });
    if (gone[0]) {
      add({ year: mg.gone[gone[0].i], yearText: String(mg.gone[gone[0].i]), precision: mg.goneQ[gone[0].i] ? 'met kanttekening' : 'jaar',
        title: 'De laatste poldermolen hier verdwijnt',
        detail: `${esc(mg.name[gone[0].i]?.replace(/<[^>]+>/g, '') || 'Naamloze molen')}, op ${kmTxt(gone[0].d)}. ${src(millSrc(points, gone[0].i))}`, kind: 'molens' });
    }
  } else if (otherMills.length) {
    add({ year: null, title: `Geen poldermolens bekend binnen 1 km`, detail: `Wel ${otherMills.length} verdwenen andere molens (koren, olie, zaag, …), die geen water verzetten.`, kind: 'onbekend' });
  }
  const standing = points.millsExisting.map(m => ({ m, d: km(lat, lon, m.lat, m.lon) })).filter(x => x.d <= 1 && /polder/.test(x.m.mainFunc || '')).sort((a, b) => a.d - b.d).slice(0, 2);
  for (const { m, d } of standing) {
    add({ year: m.built, yearText: m.builtText, precision: m.built ? 'jaar' : 'onbekend', title: `Poldermolen ${m.name || ''} wordt gebouwd`,
      detail: `Staat er nog (${esc(m.state || 'staat onbekend')}), op ${kmTxt(d)}. ${link(m.info, 'allemolens.nl')}${m.monument ? ` · ${link('https://monumentenregister.cultureelerfgoed.nl/monumenten/' + m.monument, 'rijksmonument ' + m.monument)}` : ''}`,
      kind: 'molens', photo: m.photo && points.photoBase + m.photo });
  }

  // 4. Historic pumping stations within 3 km (Nederlandse Gemalenstichting via RCE)
  const pumps = points.pumps.map(p => ({ p, d: km(lat, lon, p.lat, p.lon) })).filter(x => x.d <= 3).sort((a, b) => a.d - b.d).slice(0, 3);
  for (const { p, d } of pumps) {
    const drive = p.driveOriginal && p.driveNow && p.driveOriginal !== p.driveNow ? `eerst ${p.driveOriginal.toLowerCase()}, nu ${p.driveNow.toLowerCase()}` : p.driveOriginal ? `aandrijving ${p.driveOriginal.toLowerCase()}` : 'aandrijving onbekend';
    add({ year: p.founded, yearText: p.foundedText, precision: p.foundedPrecision, title: `Gemaal ${p.name || ''} gesticht`,
      detail: `Op ${kmTxt(d)}; ${esc(drive)}; status: ${esc((p.status || 'onbekend').toLowerCase())}${p.area ? `; bemaalt ${esc(p.area)}` : ''}.` +
        `${p.imwa ? ' Staat met dezelfde naam in het huidige waterschapsregister.' : ''} ${link(p.info, 'meer bij de Gemalenstichting')} · ${src(points.featureUriTemplate.gemalen.replace('{fid}', p.fid))}`,
      kind: 'gemaal', photo: p.photo && points.photoBase + p.photo });
  }

  // 5. Waterstaatskaart sheet, land consolidation, dike-breach pools
  for (const a of byKind('waterstaatskaart')) {
    add({ year: a.year, yearText: a.yearText, precision: 'jaar', title: `Rijkswaterstaat brengt het water hier in kaart`,
      detail: `Waterstaatskaart, eerste editie, blad ${esc(a.name)}. ${link(a.download, 'bekijk het kaartblad (jpg)')} · ${src(a.source)}`, kind: 'kaart' });
  }
  for (const a of byKind('landinrichting')) {
    add({ year: a.year, yearText: a.yearText, precision: a.precision, title: `${a.form || 'Landinrichting'}: ${a.name}`,
      detail: `Kavels, sloten en wegen werden opnieuw ingedeeld. In de bron: uitvoering ${a.year || '?'}, akte ${a.deedYear || '?'}, afgesloten ${a.closedYear || '?'} (${esc(a.status || '')}). ${src(a.source)}`,
      kind: 'landinrichting' });
  }
  const pools = points.wielen.map(w => ({ w, d: km(lat, lon, w.lat, w.lon) })).filter(x => x.d <= 1).sort((a, b) => a.d - b.d).slice(0, 2);
  for (const { w, d } of pools) {
    add({ year: w.year, yearText: w.year ? String(w.year) : null, precision: w.year ? 'jaar' : 'onbekend',
      title: `Dijkdoorbraak: ${w.name || 'naamloze kolk'}`, detail: `Een ${esc(w.type || 'wiel')} op ${kmTxt(d)}: een kolk die een dijkdoorbraak achterliet${w.river ? ` langs de ${esc(w.river)}` : ''}. ${w.year ? '' : 'Wanneer, staat niet in de bron.'}`, kind: 'doorbraak' });
  }

  // 6. 1953
  if (flood.inside) {
    add({ year: 1953, yearText: '1953', precision: 'jaar', title: 'Watersnoodramp: deze plek liep onder',
      detail: `Volgens de kaart "Historische Inundatie Ramp 1953" van de Provincie Noord-Brabant (${esc(flood.area.salt || 'onbekend')} water${flood.area.salt === 'zoet' ? '; de oorzaak staat niet in de bron' : ''}). Hoe diep, staat niet in die kaart. ${src(flood.area.metadata, 'metadata')}`, kind: '1953' });
  } else if (lon >= SW_DELTA[0] && lon <= SW_DELTA[2] && lat >= SW_DELTA[1] && lat <= SW_DELTA[3]) {
    add({ year: 1953, yearText: '1953', precision: 'onbekend', unknownStep: true, title: 'Watersnoodramp: of deze plek onderliep, weten we niet',
      detail: 'Voor Zeeland en Zuid-Holland vonden we geen open, gedigitaliseerde inundatiekaart van 1953. We tonen daarom geen waterlijn.', kind: 'onbekend' });
  }
  if (gift?.exact) {
    const g = gift.exact;
    add({ year: parseInt(g.dated), yearText: g.dated, precision: /^\d{4}$/.test(g.dated || '') ? 'jaar' : 'periode', title: `Dit huis is een geschenk uit ${g.country}`,
      detail: `Geschenkwoning na de watersnoodramp (${esc(g.ensemble || '')}). ${src(g.source)}`, kind: 'geschenk' });
  } else if (gift?.near?.length) {
    const countries = [...new Set(gift.near.map(x => x.g.country))];
    add({ year: 1953, yearText: '1953–1955', precision: 'periode', title: `${gift.near.length} geschenkwoningen in de buurt`,
      detail: `Na de watersnoodramp geschonken uit ${esc(countries.join(', '))}, binnen 500 m.`, kind: 'geschenk' });
  }

  // dated steps in order, then undated ones; 'today' and 'risk' are kept apart so they always show
  const dated = items.filter(i => i.year && !i.unknownStep).sort((a, b) => a.year - b.year);
  const undated = items.filter(i => !i.year || i.unknownStep);
  const tail = [today && { ...today, now: true }, risk && { ...risk, risk: true }].filter(Boolean);
  return { history: [...dated, ...undated], tail };
}

export function renderTimeline({ history, tail }, el, moreEl, max = 6) {
  const html = it => {
    const p = it.precision && PRECISION[it.precision];
    const yr = it.now || it.risk ? 'nu' : it.year ? esc(it.yearText || it.year) : '?';
    const unknown = (!it.year && !it.now && !it.risk) || it.unknownStep;
    return `<li class="tl${unknown ? ' unknown' : ''}${it.now ? ' now' : ''}${it.risk ? ' risk' : ''}">
      <div class="yr">${yr}</div>
      <div><div class="t">${esc(it.title)}${p ? ` <span class="prec" title="${esc(PREC_HELP[it.precision] || '')}">${esc(p)}</span>` : ''}</div>
      <div class="d">${it.detail || ''}</div></div></li>`;
  };
  const draw = n => {
    const hidden = history.length - n;
    el.innerHTML = history.slice(0, n).map(html).join('') +
      (hidden > 0 ? `<li class="tl unknown"><div class="yr">…</div><div><button type="button" class="link" id="tl-all">Toon nog ${hidden} ${hidden === 1 ? 'stap' : 'stappen'}</button></div></li>` : '') +
      tail.map(html).join('');
    el.querySelector('#tl-all')?.addEventListener('click', () => draw(history.length));
  };
  draw(history.length > max + 1 ? max : history.length);
  if (moreEl) moreEl.innerHTML = '';
}
