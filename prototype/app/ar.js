// AR page: water planes at the heights that open sources give for this address.
// WebXR 'immersive-ar' with hit-test where available; otherwise a 3D room (three.js) with the same planes and switch.
// Kept apart from the main app; shares only the data access module (lib/core.js).
import * as THREE from 'three';
import { OrbitControls } from './vendor/three-0.170.0/OrbitControls.js';
import { $, $$, esc, nf, signed, koppelvlak, geocode, heightAt, liwoAt, boardAt, nearbyPumps, pumpName, flood1953 } from './lib/core.js';

const STOREY_H = 2.8;               // simplification, stated in the UI
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('instant');
const qs = new URLSearchParams(location.search);
const S = { layer: 'liwo', kans: 4, storey: 0, data: null, target: 0, shown: 0, anim: null };

// ---------- data ----------
async function load() {
  const db = await koppelvlak();
  let lat = parseFloat(qs.get('lat')), lon = parseFloat(qs.get('lon')), label = qs.get('q');
  if ((isNaN(lat) || isNaN(lon)) && label) { const a = await geocode(label); if (a) ({ lat, lon, label } = a); }
  if (isNaN(lat) || isNaN(lon)) throw new Error('Geen adres meegegeven. Zoek eerst een adres op de hoofdpagina.');
  $('#addr').textContent = label || `${nf(lat, 5)}, ${nf(lon, 5)}`;
  $('#back').href = label ? `./?q=${encodeURIComponent(label)}` : './';
  const [h, liwo, board, pumps] = await Promise.allSettled([heightAt(db, lat, lon), liwoAt(db, lat, lon), boardAt(db, lat, lon), nearbyPumps(lat, lon)]);
  const v = r => r.status === 'fulfilled' ? r.value : null;
  return { db, lat, lon, h: v(h)?.value ?? null, liwo: v(liwo) || [], board: v(board), pumps: v(pumps)?.list || [], f53: flood1953(db, lat, lon) };
}

// Height of the water above the floor of the chosen storey, or why we cannot show it.
function compute() {
  const d = S.data, floor = S.storey * STOREY_H;
  let r;
  if (S.layer === 'liwo') {
    const k = d.liwo[S.kans];
    if (!k || k.v === undefined) r = { off: 'LIWO kon niet worden bevraagd.' };
    else r = { ground: k.v && k.v > 0.02 ? k.v : 0, label: `LIWO, ${k.name}`, source: `Maximale waterdiepte bij een dijkdoorbraak, kansklasse "${k.name}" (${k.probability}). Modeluitkomst van Rijkswaterstaat/Deltares, geen voorspelling.`,
      dry: !(k.v > 0.02) && 'Volgens LIWO komt hier in deze kansklasse geen water.' };
  } else if (S.layer === 'nap') {
    if (d.h == null) r = { off: 'Geen maaiveldhoogte (AHN) gevonden voor dit punt.' };
    else r = { ground: -d.h, label: 'Zeeniveau (NAP 0 m)', source: `Je maaiveld ligt op ${signed(d.h)} m NAP (AHN). NAP is ongeveer het gemiddelde zeeniveau.` };
  } else {
    const f = d.f53;
    if (!f.inside) r = { off: 'Geen betrouwbare bron voor deze plek. We vonden geen open inundatiekaart van 1953 die dit adres dekt, dus tonen we geen geschatte lijn.' };
    else if (f.area.salt !== 'zout') r = { off: 'Volgens de kaart van de Provincie Noord-Brabant stond hier in 1953 zoet water. Dat kwam niet rechtstreeks uit zee, dus is de zeewaterstand geen goede maat. Een betrouwbare hoogte hebben we niet; we tonen geen lijn.' };
    else if (d.h == null || !f.gauge) r = { off: 'De maaiveldhoogte of de gemeten waterstand ontbreekt.' };
    else r = { ground: f.gauge.level_m - d.h, label: `1953: zee bij ${f.gauge.name}`,
      source: `Deze plek liep in 1953 onder (inundatiekaart Provincie Noord-Brabant). Vereenvoudiging: de hoogte is de waterstand op zee bij ${f.gauge.name}, NAP +${nf(f.gauge.level_m, 2)} m op 1 februari 1953 om ${f.gauge.time.slice(11, 16)} (Rijkswaterstaat). Binnen de polder kan het anders zijn geweest.` };
  }
  if (r.off) return r;
  return { ...r, floor: r.ground - floor };
}

// ---------- labels ----------
// Text sprite; lineH = height of the first line in metres, width follows the text.
function label(lines, lineH = 0.12) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = '600 44px system-ui, sans-serif'; let tw = g.measureText(lines[0]).width;
  g.font = '34px system-ui, sans-serif'; for (const l of lines.slice(1)) tw = Math.max(tw, g.measureText(l).width);
  const W = Math.ceil(tw + 48), H = 64 + 50 * (lines.length - 1) + 22;
  c.width = W; c.height = H;
  g.fillStyle = 'rgba(12,30,42,.85)'; g.beginPath(); g.roundRect(0, 0, W, H, 18); g.fill();
  g.fillStyle = '#fff'; g.font = '600 44px system-ui, sans-serif'; g.fillText(lines[0], 24, 56);
  g.font = '34px system-ui, sans-serif'; g.fillStyle = '#cfe6f3';
  lines.slice(1).forEach((l, i) => g.fillText(l, 24, 56 + 50 * (i + 1)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const k = lineH / 64; s.scale.set(W * k * 1.4, H * k * 1.4, 1); s.renderOrder = 10;
  return s;
}
const waterMat = () => new THREE.MeshBasicMaterial({ color: 0x2f86c0, transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false });

// ---------- scene ----------
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
camera.position.set(4.0, 2.4, 4.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.3, -0.6); controls.maxPolarAngle = Math.PI * 0.95; controls.minDistance = 2; controls.maxDistance = 14;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(3, 6, 4); scene.add(sun);

const room = new THREE.Group(); scene.add(room);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function buildRoom() {
  room.clear();
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c7, transparent: true, opacity: .9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), floorMat); floor.rotation.x = -Math.PI / 2; room.add(floor); room.userData.floor = floorMat;
  const grid = new THREE.GridHelper(5, 10, 0x9a9486, 0xb9b2a2); grid.position.y = 0.002; room.add(grid);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1eee7, side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat); back.position.set(0, 1.5, -2.5); room.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat); left.rotation.y = Math.PI / 2; left.position.set(-2.5, 1.5, 0); room.add(left);
  // door 0.9 x 2.10 m
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8c6a3d });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.05), doorMat); door.position.set(0.9, 1.05, -2.47); room.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshStandardMaterial({ color: 0xdddddd })); knob.position.set(0.55, 1.0, -2.43); room.add(knob);
  // person 1.80 m
  const pm = new THREE.MeshStandardMaterial({ color: 0x3a4a52 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 1.5, 20), pm); body.position.set(-0.9, 0.75, -1.2); room.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), pm); head.position.set(-0.9, 1.67, -1.2); room.add(head);
  // measuring rod 3 m with ticks every 0.5 m
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3, 0.04), new THREE.MeshStandardMaterial({ color: 0x1c2629 })); rod.position.set(-2.4, 1.5, -2.4); room.add(rod);
  for (let y = 0.5; y <= 3; y += 0.5) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.02), new THREE.MeshStandardMaterial({ color: 0x1c2629 })); t.position.set(-2.32, y, -2.4); room.add(t);
    const l = label([`${nf(y, 1)} m`], 0.13); l.position.set(-2.05, y, -2.38); room.add(l);
  }
  const lp = label(['persoon 1,80 m'], 0.13); lp.position.set(-0.9, 2.02, -1.2); room.add(lp);
  const ld = label(['deur 2,10 m'], 0.13); ld.position.set(0.9, 2.3, -2.4); room.add(ld);
}
buildRoom();

// water plane (room) and its label
const water = new THREE.Group(); scene.add(water);
const roomPlane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), waterMat()); roomPlane.rotation.x = -Math.PI / 2; water.add(roomPlane);
const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(5, 5)), new THREE.LineBasicMaterial({ color: 0x1e6a96 })); edge.rotation.x = -Math.PI / 2; water.add(edge);
let waterLabel = null;

function setLabel(r) {
  if (waterLabel) water.remove(waterLabel);
  const h = r.floor;
  const head = h >= 0 ? `${nf(h, 2)} m boven je vloer` : `${nf(-h, 2)} m onder je vloer`;
  waterLabel = label([head, r.label], xr.active ? 0.07 : 0.16);
  waterLabel.position.set(xr.active ? 0 : 1.2, 0.18, xr.active ? -0.6 : 1.4);
  water.add(waterLabel);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------- update + animation ----------
function update() {
  const r = compute();
  $$('[data-layer]').forEach(b => b.setAttribute('aria-pressed', b.dataset.layer === S.layer));
  $('#kans-wrap').hidden = S.layer !== 'liwo';
  $('#xr-seg').innerHTML = $('.seg').innerHTML;
  if (r.off) {
    water.visible = false;
    $('#readout').innerHTML = `<span class="muted">${esc(r.off)}</span>`; $('#source').textContent = ''; $('#xr-read').textContent = r.off;
    $('#keeper').hidden = true;
    room.userData.floor && (room.userData.floor.opacity = .9);
    return;
  }
  water.visible = true;
  const h = r.floor;
  $('#readout').innerHTML = r.dry ? esc(r.dry) : h >= 0 ? `Het water staat <b>${nf(h, 2)} m</b> boven je vloer.` : `Het water blijft <b>${nf(-h, 2)} m</b> onder je vloer.`;
  $('#source').textContent = r.source + (S.storey ? ` Verdieping: ${S.storey} × ${nf(STOREY_H, 1)} m (vereenvoudiging).` : '');
  $('#xr-read').textContent = r.dry ? 'Geen water in deze kansklasse' : `${h >= 0 ? nf(h, 2) + ' m boven' : nf(-h, 2) + ' m onder'} je vloer · ${r.label}`;
  room.userData.floor && (room.userData.floor.opacity = h < 0 ? .35 : .9);
  setLabel(r);
  animateTo(Math.max(-4, Math.min(12, h)));
}
function animateTo(y) {
  const from = S.shown, t0 = performance.now(), dur = REDUCED ? 0 : 2600;
  S.anim = t => {
    const k = dur ? Math.min(1, (t - t0) / dur) : 1, e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    S.shown = from + (y - from) * e;
    if (k >= 1) { S.anim = null; showKeeper(); }
  };
}
function showKeeper() {
  const d = S.data, r = compute(); if (r.off) return;
  const ws = d.board?.board?.label || d.board?.label, p = d.pumps[0];
  const big = d.pumps.filter(x => x.d <= 3 && x.p.maximalecapaciteit && x.p.functiegemaal !== 'Aanvoeren').sort((x, y) => y.p.maximalecapaciteit - x.p.maximalecapaciteit)[0];
  const what = S.layer === 'nap' ? (d.h < 0 ? 'Dat het zeeniveau niet je kamer in staat,' : 'Je woont boven zeeniveau. Toch')
    : S.layer === '1953' ? 'Sinds 1953 zijn de dijken verhoogd en de Deltawerken gebouwd.' : 'Dit water houden de dijken tegen.';
  $('#keeper').hidden = false;
  $('#keeper').innerHTML = `<h2>Wie houdt dit water tegen?</h2>
    <p>${esc(what)} ${S.layer === 'nap' ? 'komt door dijken en gemalen.' : ''}${ws ? ` <b>${esc(ws)}</b> beheert hier de dijken en het water.` : ''}</p>
    ${p ? `<p>Het dichtstbijzijnde gemaal is <b>${esc(pumpName(p.p))}</b> (${nf(p.d, 1)} km${p.p.maximalecapaciteit ? `, ${nf(p.p.maximalecapaciteit, 0)} m³ per minuut` : ''}).${big && big !== p ? ` Het grootste gemaal binnen 3 km is <b>${esc(pumpName(big.p))}</b> (${nf(big.d, 1)} km, ${nf(big.p.maximalecapaciteit, 0)} m³ per minuut).` : ''} ${p.uri ? `<a href="${esc(p.uri)}" target="_blank" rel="noopener">waterschapsregister</a>` : ''}</p>` : '<p>Binnen 3 km staat geen gemaal in het waterschapsregister.</p>'}
    <p class="muted small">Bron: waterschapsgrenzen en waterschapsregister IMWA (PDOK). <a href="${esc($('#back').href)}">Terug naar de tijdlijn van dit adres</a></p>`;
}

// ---------- WebXR ----------
const xr = { active: false, session: null, hit: null, placed: false, reticle: null, plane: null };
async function arSupported() {
  if (!navigator.xr) return false;
  try { return !!(await Promise.race([navigator.xr.isSessionSupported('immersive-ar'), new Promise(r => setTimeout(() => r(false), 3000))])); } catch { return false; }
}

async function startAR() {
  renderer.xr.enabled = true;
  const overlay = $('#xr-overlay');
  const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
  xr.session = session; xr.active = true; xr.placed = false;
  overlay.style.display = 'block';
  overlay.addEventListener('beforexrselect', e => e.preventDefault()); // taps on the panel do not place the floor
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  const viewer = await session.requestReferenceSpace('viewer');
  xr.hit = await session.requestHitTestSource({ space: viewer });
  room.visible = false; water.visible = false; scene.background = null;
  roomPlane.geometry = new THREE.PlaneGeometry(30, 30); edge.visible = false;
  xr.reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  xr.reticle.matrixAutoUpdate = false; xr.reticle.visible = false; scene.add(xr.reticle);
  const ctrl = renderer.xr.getController(0); scene.add(ctrl);
  ctrl.addEventListener('select', () => {
    if (!xr.reticle.visible || xr.placed) return;
    const p = new THREE.Vector3().setFromMatrixPosition(xr.reticle.matrix);
    water.position.set(p.x, p.y, p.z); water.userData.base = p.y; xr.placed = true; xr.reticle.visible = false; S.shown = 0;
    $('#xr-msg').textContent = 'Kijk rond. Kies hieronder een andere waterhoogte.';
    update();
  });
  session.addEventListener('end', () => {
    xr.active = false; xr.hit = null; renderer.xr.enabled = false; overlay.style.display = 'none';
    room.visible = true; roomPlane.geometry = new THREE.PlaneGeometry(5, 5); edge.visible = true; water.position.set(0, 0, 0); water.userData.base = 0;
    scene.remove(xr.reticle); update(); resize();
  });
}

renderer.setAnimationLoop((t, frame) => {
  if (S.anim) S.anim(t ?? performance.now());
  water.position.y = (water.userData.base || 0) + S.shown;
  if (xr.active && frame && xr.hit && !xr.placed) {
    const res = frame.getHitTestResults(xr.hit);
    if (res.length) { const pose = res[0].getPose(renderer.xr.getReferenceSpace()); xr.reticle.visible = true; xr.reticle.matrix.fromArray(pose.transform.matrix); }
    else xr.reticle.visible = false;
  }
  if (xr.active && !xr.placed) water.visible = false;
  else if (S.data && !compute().off) water.visible = true;
  if (!xr.active) controls.update();
  renderer.render(scene, camera);
});

// ---------- wiring ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-layer]'); if (!b) return;
  S.layer = b.dataset.layer; update();
});
$('#kans').addEventListener('change', e => { S.kans = +e.target.value; update(); });
$('#storey').addEventListener('change', e => { S.storey = +e.target.value; update(); });
$('#xr-stop').addEventListener('click', () => xr.session?.end());
$('#start-ar').addEventListener('click', () => startAR().catch(err => { $('#ar-hint').textContent = 'AR kon niet starten: ' + err.message; }));

(async () => {
  try {
    $('#status').textContent = 'Hoogtes ophalen bij AHN en LIWO…';
    S.data = await load();
    $('#status').textContent = '';
    $('#kans').innerHTML = S.data.liwo.map((k, i) => `<option value="${i}" ${i === 4 ? 'selected' : ''}>${esc(k.name)} (${esc(k.probability)})</option>`).join('');
    // 1953 is only offered where an open inundation map covers the address
    if (!S.data.f53.inside) $('[data-layer="1953"]').dataset.off = 'true';
    $('#controls').hidden = false;
    // start on LIWO when it has water here, otherwise on NAP
    if (!(S.data.liwo[4]?.v > 0.02) && S.data.h != null) S.layer = 'nap';
    if (['liwo', '1953', 'nap'].includes(qs.get('laag'))) S.layer = qs.get('laag');
    resize(); update();
    const ok = await arSupported();
    $('#start-ar').hidden = !ok;
    $('#ar-hint').textContent = ok ? 'Werkt op Android in Chrome. Het camerabeeld blijft op je toestel.' : 'AR is op dit apparaat niet beschikbaar (bijvoorbeeld desktop of iPhone). Je ziet hieronder dezelfde waterhoogte in een 3D-kamer.';
  } catch (err) {
    $('#status').className = 'status error'; $('#status').textContent = err.message;
  }
})();
