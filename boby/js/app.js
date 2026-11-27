import { buildStyle, C } from './style.js';
import * as S from './services.js';
import { Boby, parseCommand, voiceSupported } from './voice.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem('boby.' + k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('boby.' + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------------- stato ----------------
const st = {
  pos: store.get('lastPos', [12.4964, 41.9028]), // Roma finché il GPS non risponde
  heading: 0,
  speed: 0,
  hasFix: false,
  follow: true,
  pitch3d: true,
  route: null,     // { coords, cum, total, steps, stepAt, dest, destName, ratio }
  along: 0,
  stepIdx: 0,
  spoken: {},
  offCount: 0,
  rerouting: false,
  sim: null,
  wakeLock: null,
};

// ---------------- mappa ----------------
const map = new maplibregl.Map({
  container: 'map',
  style: buildStyle(),
  center: st.pos,
  zoom: 14.5,
  pitch: 55,
  bearing: -20,
  maxPitch: 75,
  attributionControl: false,
  fadeDuration: 150,
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.on('dragstart', () => { st.follow = false; $('btnCenter').setAttribute('aria-pressed', 'false'); });

const puckEl = document.createElement('div');
puckEl.className = 'puck';
puckEl.innerHTML = '<svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="15" fill="#0C1530" stroke="#38E8FF" stroke-width="3"/><path d="M23 12l8 20-8-4.5-8 4.5z" fill="#38E8FF"/></svg>';
const puck = new maplibregl.Marker({ element: puckEl, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(st.pos).addTo(map);

const destEl = document.createElement('div');
destEl.className = 'dest';
destEl.innerHTML = '<svg viewBox="0 0 34 44"><path d="M17 43C17 43 32 26 32 16A15 15 0 0 0 2 16C2 26 17 43 17 43Z" fill="#FF5C8A"/><circle cx="17" cy="16" r="6" fill="#0C1530"/></svg>';
const destMarker = new maplibregl.Marker({ element: destEl, anchor: 'bottom' });

let routeAnim = { reveal: 1, dash: 0 };
map.on('load', () => {
  map.addSource('route', { type: 'geojson', lineMetrics: true, data: emptyLine() });
  map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': C.amber, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 18, 34], 'line-blur': 10, 'line-opacity': 0.35 } }, 'road-label');
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#04081A', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 18, 26] } }, 'road-label');
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4.5, 18, 18], 'line-gradient': gradient(0, 1) } }, 'road-label');
  map.addLayer({ id: 'route-flow', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 18, 4], 'line-dasharray': [0, 4, 3] } }, 'road-label');
  map.setLight({ anchor: 'map', color: '#B9C8FF', intensity: 0.35, position: [1.2, 210, 40] });
  animateFlow();
});

function emptyLine() { return { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} }; }

// gradiente del percorso: tratto già percorso trasparente, poi ciano → corallo, troncato dalla rivelazione iniziale
function gradient(from, to) {
  const a = Math.min(Math.max(from, 0), 0.999), b = Math.max(Math.min(to, 1), a + 0.0005);
  const stops = ['interpolate', ['linear'], ['line-progress']];
  const add = (p, c) => { if (stops.length > 3 && p <= stops[stops.length - 2]) p = stops[stops.length - 2] + 1e-6; stops.push(p, c); };
  add(0, 'rgba(56,232,255,0)');
  if (a > 0) add(a, 'rgba(56,232,255,0)');
  add(a + 1e-5, '#38E8FF');
  add(a + (b - a) * 0.6, '#7A7CFF');
  add(b, '#FF5C8A');
  if (b < 1) { add(b + 1e-5, 'rgba(255,92,138,0)'); add(1, 'rgba(255,92,138,0)'); }
  return stops;
}

// flusso luminoso che scorre lungo il percorso
const DASHES = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
let dashStep = -1;
function animateFlow(t = 0) {
  const s = Math.floor(t / 70) % DASHES.length;
  if (s !== dashStep && map.getLayer('route-flow') && st.route) { map.setPaintProperty('route-flow', 'line-dasharray', DASHES[s]); dashStep = s; }
  requestAnimationFrame(animateFlow);
}

function paintRoute() {
  if (!map.getLayer('route-line') || !st.route) return;
  const done = st.route.total ? st.along / st.route.total : 0;
  map.setPaintProperty('route-line', 'line-gradient', gradient(done, routeAnim.reveal));
}

function revealRoute() {
  const t0 = performance.now(), dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1600;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    routeAnim.reveal = 1 - Math.pow(1 - k, 3);
    paintRoute();
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------- UI di base ----------------
const ui = {
  bubbleTimer: 0,
  bubble(text, who = 'boby', ms = 5000) {
    const b = $('bubble');
    b.className = 'bubble' + (who === 'user' ? ' user' : '');
    b.innerHTML = `<span class="who">${who === 'user' ? 'Hai detto' : 'Boby'}</span>`;
    b.append(document.createTextNode(text));
    b.hidden = false;
    clearTimeout(this.bubbleTimer);
    if (ms) this.bubbleTimer = setTimeout(() => (b.hidden = true), ms);
  },
  toast(text, ms = 3200) {
    const t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(this.tt); this.tt = setTimeout(() => (t.hidden = true), ms);
  },
};

async function say(text, opts) {
  ui.bubble(text, 'boby', Math.max(4000, text.length * 80));
  await boby.say(text, opts);
}

// ---------------- Boby ----------------
const boby = new Boby({
  onState: (s) => { $('orb').dataset.state = s; },
  onWake: () => { navigator.vibrate?.(30); chime(); ui.bubble('Ti ascolto…', 'boby', 8000); },
  onHeard: (text, final) => { if (text) ui.bubble(text, 'user', final ? 4000 : 8000); },
  onCommand: (text) => handle(text),
});

let actx;
function chime() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const now = actx.currentTime;
    [660, 990].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.25);
      o.connect(g).connect(actx.destination); o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.3);
    });
  } catch (e) {}
}

async function handle(text) {
  const c = parseCommand(text);
  try {
    switch (c.intent) {
      case 'go': return await goTo(c.dest, { near: c.near });
      case 'home': return await goSaved('home', 'casa');
      case 'work': return await goSaved('work', 'lavoro');
      case 'cancel': if (st.route) { endNav(); return say('Navigazione terminata.'); } return say('Non stiamo navigando verso nessuna destinazione.');
      case 'eta': return st.route ? say(etaPhrase()) : say('Dimmi prima dove vuoi andare.');
      case 'repeat': return st.route ? say(currentInstructionPhrase()) : say('Non c\'è nessuna indicazione da ripetere.');
      case 'time': return say('Sono le ' + S.clock(new Date()) + '.');
      case 'sethome': store.set('home', { coord: st.pos, name: 'Casa' }); return say('Fatto, ho salvato questa posizione come casa.');
      case 'setwork': store.set('work', { coord: st.pos, name: 'Lavoro' }); return say('Fatto, ho salvato questa posizione come lavoro.');
      case 'mute': setMuted(true); ui.bubble('Voce disattivata. Di\' «Hey Boby, riattiva la voce».'); return;
      case 'unmute': setMuted(false); return say('Eccomi, voce riattivata.');
      case 'zoomin': map.zoomIn(); return boby.setState('idle');
      case 'zoomout': map.zoomOut(); return boby.setState('idle');
      case 'center': recenter(); return boby.setState('idle');
      case 'simulate': if (st.route) { startSim(); return say('Avvio la simulazione del percorso.'); } return say('Prima scegli una destinazione, poi posso simulare il viaggio.');
      case 'help': return say('Puoi dirmi: portami in via Roma, portami al benzinaio più vicino, portami a casa, quanto manca, ripeti, oppure termina navigazione.');
      case 'hello': return say('Ciao! Dove andiamo?');
      default: return say('Non ho capito dove vuoi andare. Prova con: portami a, seguito dal posto.');
    }
  } catch (err) {
    console.error(err);
    say(navigator.onLine ? 'Non riesco a raggiungere il servizio di mappe. Riprova tra poco.' : 'Sei offline: mi serve internet per calcolare il percorso.');
  }
}

async function goSaved(key, label) {
  const p = store.get(key);
  if (!p) return say(`Non so ancora dov'è ${label}. Quando sei lì, di' «Hey Boby, imposta ${label} qui».`);
  return startNav(p.coord, label === 'casa' ? 'Casa' : 'Lavoro', `Si torna a ${label}.`);
}

async function goTo(dest, { near } = {}) {
  const cat = S.matchCategory(dest);
  if (cat && (near || dest.split(' ').length <= 2)) {
    ui.bubble(`Cerco ${cat.label.toLowerCase()} qui vicino…`, 'boby', 0);
    let items = [];
    try { items = await S.nearest(cat, st.pos); } catch (e) { /* ricado sulla ricerca testuale */ }
    if (!items.length) items = await S.searchPlaces(dest, st.pos);
    if (!items.length) return say(`Non trovo ${cat.label.toLowerCase()} nei dintorni.`);
    const p = items[0];
    return startNav(p.coord, p.name, `${cat.label} più vicino: ${p.name}.`);
  }
  ui.bubble(`Cerco «${dest}»…`, 'boby', 0);
  const res = await S.searchPlaces(dest, st.pos);
  if (!res.length) return say(`Non ho trovato «${dest}». Puoi ripetere con il nome della città?`);
  const p = res[0];
  return startNav(p.coord, p.name, `Ti porto a ${p.name}${p.where ? ', ' + p.where.split(',')[0] : ''}.`);
}

// ---------------- navigazione ----------------
function prepareRoute(r, dest, destName) {
  const cum = [0];
  for (let i = 1; i < r.coords.length; i++) cum.push(cum[i - 1] + S.haversine(r.coords[i - 1], r.coords[i]));
  const total = cum[cum.length - 1] || 1;
  const ratio = total / (r.distance || total);
  // posizione lungo la linea in cui avviene ogni manovra (inizio di ogni step)
  const stepAt = []; let acc = 0;
  for (const s of r.steps) { stepAt.push(acc * ratio); acc += s.distance; }
  return { ...r, cum, total, stepAt, dest, destName, avgSpeed: r.distance / Math.max(r.duration, 1) };
}

async function startNav(dest, destName, intro) {
  stopSim();
  const r = await S.route(st.pos, dest);
  st.route = prepareRoute(r, dest, destName);
  st.along = 0; st.stepIdx = 0; st.spoken = {}; st.offCount = 0;
  map.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords }, properties: {} });
  destMarker.setLngLat(dest).addTo(map);
  document.body.classList.add('navigating');
  $('top').hidden = true; $('maneuver').hidden = false; $('trip').hidden = false; $('speed').hidden = false;
  closeSheet();

  // panoramica animata, poi la camera si aggancia all'auto
  const b = r.coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(r.coords[0], r.coords[0]));
  st.follow = false;
  map.fitBounds(b, { padding: { top: 190, bottom: 200, left: 50, right: 90 }, pitch: 35, bearing: 0, duration: 1400 });
  routeAnim.reveal = 0; revealRoute();
  setTimeout(() => { st.follow = true; $('btnCenter').setAttribute('aria-pressed', 'true'); follow(true); }, 3600);

  update();
  requestWakeLock();
  const first = st.route.steps[1] ? ` ${S.instruction(st.route.steps[1])} tra ${S.speakDist(st.route.stepAt[1])}.` : '';
  await say(`${intro} ${S.speakDur(r.duration)}, arrivo previsto alle ${S.clock(new Date(Date.now() + r.duration * 1000))}.${first}`);
  st.spoken[1 + ':far'] = true;
}

function endNav() {
  stopSim();
  st.route = null;
  map.getSource('route')?.setData(emptyLine());
  destMarker.remove();
  document.body.classList.remove('navigating');
  $('top').hidden = false; $('maneuver').hidden = true; $('trip').hidden = true; $('speed').hidden = true;
  st.wakeLock?.release?.().catch(() => {}); st.wakeLock = null;
  map.easeTo({ pitch: st.pitch3d ? 55 : 0, zoom: 15, duration: 900 });
}

function etaPhrase() {
  const left = remaining();
  return `Mancano ${S.speakDur(left.time)} e ${S.speakDist(left.dist)}. Arrivo alle ${S.clock(new Date(Date.now() + left.time * 1000))}.`;
}
function remaining() {
  const dist = Math.max(0, st.route.total - st.along);
  return { dist, time: dist / st.route.avgSpeed };
}
function currentInstructionPhrase() {
  const i = Math.min(st.stepIdx + 1, st.route.steps.length - 1);
  const d = st.route.stepAt[i] - st.along;
  return `Tra ${S.speakDist(d)}, ${S.instruction(st.route.steps[i]).toLowerCase()}.`;
}

// proietta la posizione sul percorso cercando vicino all'ultimo punto noto
function project(p) {
  const { coords, cum } = st.route;
  let best = { d: Infinity, along: st.along };
  let i0 = 0;
  while (i0 < cum.length - 1 && cum[i0 + 1] < st.along - 80) i0++;
  const i1 = Math.min(coords.length - 1, i0 + 400);
  const kx = Math.cos(p[1] * Math.PI / 180) * 111320, ky = 110540;
  for (let i = i0; i < i1; i++) {
    const a = coords[i], b = coords[i + 1];
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
    if (d < best.d) best = { d, along: cum[i] + t * (cum[i + 1] - cum[i]), seg: i };
  }
  return best;
}

function update() {
  const r = st.route;
  if (!r) return;
  const pr = project(st.pos);
  if (pr.d < 45) { st.along = Math.max(st.along - 5, pr.along); st.offCount = 0; }
  else if (++st.offCount >= 3 && !st.rerouting && !st.sim) reroute();

  while (st.stepIdx < r.steps.length - 1 && r.stepAt[st.stepIdx + 1] <= st.along + 8) st.stepIdx++;
  const nextI = Math.min(st.stepIdx + 1, r.steps.length - 1);
  const next = r.steps[nextI];
  const dNext = Math.max(0, r.stepAt[nextI] - st.along);
  const left = remaining();

  // pannello manovra
  const fd = S.fmtDist(dNext);
  $('mvDist').textContent = fd.v; $('mvUnit').textContent = fd.u;
  $('mvText').textContent = S.instruction(next);
  $('mvIcon').innerHTML = ICONS[S.iconFor(next)] || ICONS.straight;
  const then = r.steps[nextI + 1];
  const mvThen = $('mvThen');
  if (then && r.stepAt[nextI + 1] - r.stepAt[nextI] < 250) { mvThen.hidden = false; mvThen.textContent = 'Subito dopo: ' + S.instruction(then).toLowerCase(); }
  else mvThen.hidden = true;

  $('tripArrive').textContent = S.clock(new Date(Date.now() + left.time * 1000));
  $('tripLeft').textContent = S.fmtDur(left.time);
  const fk = S.fmtDist(left.dist); $('tripKm').textContent = `${fk.v} ${fk.u}`;
  $('speedV').textContent = Math.round(st.speed * 3.6);

  paintRoute();
  announce(nextI, next, dNext);

  if (left.dist < 25 || (next.maneuver.type === 'arrive' && dNext < 20)) {
    const name = r.destName;
    endNav();
    say(`Sei arrivato${name ? ' a ' + name : ''}. Buona giornata!`);
  }
}

function announce(i, step, d) {
  if (boby.muted) return;
  const v = Math.max(st.speed, 8); // m/s
  const far = Math.max(700, v * 45), mid = Math.max(200, v * 14), now = Math.max(40, v * 4);
  const instr = S.instruction(step);
  const key = (k) => i + ':' + k;
  if (d <= now && !st.spoken[key('now')]) {
    st.spoken[key('now')] = st.spoken[key('mid')] = st.spoken[key('far')] = true;
    const then = st.route.steps[i + 1];
    const after = then && st.route.stepAt[i + 1] - st.route.stepAt[i] < 200 && then.maneuver.type !== 'arrive' ? `, poi ${S.instruction(then).toLowerCase()}` : '';
    boby.say(instr + after + '.');
  } else if (d <= mid && d > now && !st.spoken[key('mid')]) {
    st.spoken[key('mid')] = st.spoken[key('far')] = true;
    boby.say(`Tra ${S.speakDist(d)}, ${instr.toLowerCase()}.`);
  } else if (d <= far && d > mid * 1.6 && !st.spoken[key('far')]) {
    st.spoken[key('far')] = true;
    boby.say(`Tra ${S.speakDist(d)}, ${instr.toLowerCase()}.`);
  }
}

async function reroute() {
  st.rerouting = true;
  ui.toast('Ricalcolo il percorso…');
  try {
    const r = st.route;
    const nr = await S.route(st.pos, r.dest);
    st.route = prepareRoute(nr, r.dest, r.destName);
    st.along = 0; st.stepIdx = 0; st.spoken = {}; st.offCount = 0;
    map.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: nr.coords }, properties: {} });
    routeAnim.reveal = 0; revealRoute();
    boby.say('Percorso ricalcolato.');
  } catch (e) { ui.toast('Ricalcolo non riuscito, riprovo.'); }
  finally { setTimeout(() => (st.rerouting = false), 4000); }
}

// ---------------- camera ----------------
let lastCam = 0;
function follow(force) {
  if (!st.follow) return;
  const now = performance.now();
  if (!force && now - lastCam < 250) return;
  lastCam = now;
  const nav = !!st.route;
  const mobile = innerWidth < 700;
  map.easeTo({
    center: st.pos,
    bearing: nav ? st.heading : map.getBearing(),
    pitch: st.pitch3d ? (nav ? 62 : 55) : 0,
    zoom: nav ? zoomForSpeed(st.speed) : Math.max(map.getZoom(), 15),
    padding: nav ? { top: mobile ? 260 : 120, bottom: 40, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 },
    duration: force ? 1200 : 900,
    easing: (t) => t,
    essential: true,
  });
}
function zoomForSpeed(v) { const kmh = v * 3.6; return kmh > 100 ? 15.2 : kmh > 60 ? 16 : kmh > 30 ? 16.6 : 17.2; }
function recenter() { st.follow = true; $('btnCenter').setAttribute('aria-pressed', 'true'); follow(true); }

// ---------------- posizione ----------------
let lastPosTime = 0;
function setPosition(lngLat, heading, speed) {
  const prev = st.pos;
  st.pos = lngLat;
  if (Number.isFinite(speed)) st.speed = speed;
  const moved = S.haversine(prev, lngLat);
  if (Number.isFinite(heading) && heading !== null && st.speed > 1) st.heading = heading;
  else if (moved > 3 && moved < 300 && st.hasFix) st.heading = S.bearing(prev, lngLat);
  puck.setLngLat(lngLat).setRotation(st.heading);
  update();
  follow();
  if (Date.now() - lastPosTime > 30000) { store.set('lastPos', lngLat); lastPosTime = Date.now(); }
}

function startGPS() {
  if (!('geolocation' in navigator)) { ui.toast('Questo dispositivo non fornisce la posizione.'); return; }
  navigator.geolocation.watchPosition((p) => {
    if (st.sim) return;
    const first = !st.hasFix;
    setPosition([p.coords.longitude, p.coords.latitude], p.coords.heading, p.coords.speed ?? st.speed);
    st.hasFix = true;
    if (first) recenter();
  }, (err) => {
    if (err.code === 1) ui.toast('Posizione negata: attivala nelle impostazioni del browser per navigare.', 6000);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}

// ---------------- simulazione ----------------
function startSim() {
  stopSim();
  const r = st.route; if (!r) return;
  st.follow = true;
  let along = st.along, last = performance.now();
  const kmh = 55;
  st.sim = { raf: 0 };
  const step = (now) => {
    if (!st.sim || !st.route) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    along += (kmh / 3.6) * 2.2 * dt; // 2,2× per vedere il viaggio in fretta
    const { coords, cum } = st.route;
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < along) i++;
    const t = Math.min(1, (along - cum[i]) / Math.max(cum[i + 1] - cum[i], 0.01));
    const p = [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
    const h = S.bearing(coords[i], coords[i + 1]);
    st.heading = st.heading + (((h - st.heading + 540) % 360) - 180) * Math.min(1, dt * 4);
    setPosition(p, st.heading, kmh / 3.6);
    if (st.sim) st.sim.raf = requestAnimationFrame(step);
  };
  st.sim.raf = requestAnimationFrame(step);
}
function stopSim() { if (st.sim) { cancelAnimationFrame(st.sim.raf); st.sim = null; } }

async function requestWakeLock() {
  try { st.wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.route) requestWakeLock(); });

// ---------------- ricerca manuale ----------------
let searchTimer = 0, searchSeq = 0;
function openSheet() { $('sheet').hidden = false; $('q').value = ''; renderResults([]); setTimeout(() => $('q').focus(), 50); }
function closeSheet() { $('sheet').hidden = true; }
function renderResults(items, msg) {
  const ul = $('results'); ul.innerHTML = '';
  if (msg) { ul.innerHTML = `<li class="empty">${msg}</li>`; return; }
  items.forEach((p) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const km = S.fmtDist(S.haversine(st.pos, p.coord));
    b.innerHTML = `<span class="pin">●</span><span><span class="nm"></span><span class="wh"></span></span><span class="km">${km.v} ${km.u}</span>`;
    b.querySelector('.nm').textContent = p.name; b.querySelector('.wh').textContent = p.where || '';
    b.onclick = () => run(() => startNav(p.coord, p.name, `Ti porto a ${p.name}.`));
    let press;
    b.addEventListener('pointerdown', () => { press = setTimeout(() => { store.set('home', { coord: p.coord, name: p.name }); ui.toast(`${p.name} salvato come Casa`); navigator.vibrate?.(40); press = 'done'; }, 650); });
    b.addEventListener('pointerup', () => clearTimeout(press));
    b.addEventListener('pointerleave', () => clearTimeout(press));
    li.append(b); ul.append(li);
  });
}
function run(fn) { Promise.resolve().then(fn).catch((e) => { console.error(e); ui.toast('Servizio mappe non raggiungibile. Controlla la connessione.'); }); }

$('searchBtn').onclick = openSheet;
$('sheetClose').onclick = closeSheet;
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
$('q').addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 3) return renderResults([]);
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try { const r = await S.searchPlaces(q, st.pos); if (seq === searchSeq) renderResults(r, r.length ? null : 'Nessun risultato. Prova ad aggiungere la città.'); }
    catch (err) { if (seq === searchSeq) renderResults([], 'Ricerca non disponibile in questo momento.'); }
  }, 320);
});
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = $('results').querySelector('button'); first?.click(); } });
document.querySelectorAll('.chips button').forEach((b) => {
  b.onclick = () => run(() => b.dataset.go ? goSaved(b.dataset.go, b.dataset.go === 'home' ? 'casa' : 'lavoro') : goTo(b.dataset.cat, { near: true }));
});

$('btnEnd').onclick = () => { endNav(); boby.say('Navigazione terminata.'); };
$('btnCenter').onclick = recenter;
$('btn3d').onclick = () => {
  st.pitch3d = !st.pitch3d; $('btn3d').setAttribute('aria-pressed', String(st.pitch3d));
  map.easeTo({ pitch: st.pitch3d ? 60 : 0, duration: 700 });
};
function setMuted(m) {
  boby.muted = m; if (m) speechSynthesis?.cancel();
  $('btnMute').classList.toggle('muted', m); $('btnMute').setAttribute('aria-label', m ? 'Voce disattivata' : 'Voce attiva');
  store.set('muted', m);
}
$('btnMute').onclick = () => setMuted(!boby.muted);
$('orb').onclick = () => { if (boby.state === 'speaking') { speechSynthesis.cancel(); } boby.arm(); };
// doppio tocco sull'orb = simulazione (utile per provare l'app da fermi)
$('orb').addEventListener('dblclick', () => st.route && startSim());

// ---------------- avvio ----------------
function boot() {
  $('onboard').hidden = true;
  store.set('onboarded', true);
  boby.unlockAudio();
  startGPS();
  if (voiceSupported) {
    boby.start();
    setTimeout(() => say('Ciao, sono Boby. Quando vuoi, di\' hey Boby e dimmi dove andare.'), 600);
  } else {
    boby.setState('off');
    ui.bubble('Questo browser non supporta i comandi vocali. Usa Chrome o Safari aggiornati, oppure cerca a mano.', 'boby', 9000);
  }
}
$('obStart').onclick = boot;
$('btn3d').setAttribute('aria-pressed', 'true');
$('btnCenter').setAttribute('aria-pressed', 'true');
setMuted(store.get('muted', false));
if (store.get('onboarded')) {
  // Il microfono richiede un gesto: il primo tocco ovunque riaccende Boby.
  $('onboard').hidden = true;
  startGPS();
  ui.bubble('Tocca Boby per accenderlo.', 'boby', 0);
  const wake = () => { boby.unlockAudio(); if (voiceSupported && !boby.wantRunning) boby.start(); $('bubble').hidden = true; };
  addEventListener('pointerdown', wake, { once: true });
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// debug / test
window.__boby = { handle, st, startSim, parseCommand };

// ---------------- icone manovra ----------------
const ICONS = {
  straight: '<path d="M24 42V8M13 19L24 8l11 11"/>',
  left: '<path d="M32 42V24a6 6 0 0 0-6-6H10M19 9l-9 9 9 9"/>',
  right: '<path d="M16 42V24a6 6 0 0 1 6-6h16M29 9l9 9-9 9"/>',
  'slight-left': '<path d="M30 42V28L16 14M15 26V13h13"/>',
  'slight-right': '<path d="M18 42V28l14-14M33 26V13H20"/>',
  uturn: '<path d="M14 42V18a9 9 0 0 1 18 0v14M24 26l8 8 8-8"/>',
  roundabout: '<circle cx="24" cy="22" r="8"/><path d="M24 42V30M30 16l8-8M30 8h8v8"/>',
  arrive: '<path d="M24 44S38 30 38 20a14 14 0 0 0-28 0c0 10 14 24 14 24z"/><circle class="fill" cx="24" cy="20" r="5"/>',
};
