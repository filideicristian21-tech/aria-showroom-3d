import { buildStyle, C } from './style.js';
import * as S from './services.js';
import { Boby, parseCommand, voiceSupported, isYes, isNo } from './voice.js';
import { Brain } from './brain.js';

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
  pending: null,    // domanda di Boby in attesa di sì/no
  limit: null,      // limite di velocità della strada
  limitCheck: { at: 0, pos: null },
  overSince: 0,
  warnedLimit: 0,
  driveStart: 0,
  breakWarned: false,
  address: '',
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
  if (!text) return;
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

// ---------------- cervello: comandi locali + Claude ----------------
const LOCAL_FAST = new Set(['cancel', 'eta', 'repeat', 'time', 'mute', 'unmute', 'zoomin', 'zoomout', 'center', 'simulate', 'limit', 'avoid', 'sethome', 'setwork']);

async function handle(text) {
  // Risposta a una domanda di Boby (es. "vuoi che cerchi parcheggio?")
  if (st.pending) {
    const p = st.pending; st.pending = null;
    if (isYes(text)) return run(p.yes);
    if (isNo(text)) return say(p.noText || 'Va bene.');
  }
  const c = parseCommand(text);
  try {
    if (brain.enabled && !LOCAL_FAST.has(c.intent)) {
      ui.bubble('Ci penso…', 'boby', 0);
      try {
        const reply = await brain.ask(text, contextLine());
        return say(reply, { expectReply: /\?\s*$/.test(reply) });
      } catch (e) {
        if (e.kind === 'auth') { ui.toast('Chiave Claude non valida: controlla le impostazioni.', 6000); }
        // rete assente o servizio occupato: continuo con i comandi locali
      }
    }
    return await local(c);
  } catch (err) {
    console.error(err);
    say(navigator.onLine ? 'Non riesco a raggiungere il servizio di mappe. Riprova tra poco.' : 'Sei offline: mi serve internet per calcolare il percorso.');
  }
}

async function local(c) {
  switch (c.intent) {
    case 'go': return goTo(c.dest, { near: c.near });
    case 'home': return goSaved('home', 'casa');
    case 'work': return goSaved('work', 'lavoro');
    case 'stop': return c.dest ? addStop(c.dest).then((r) => say(r.say)) : say('Dove vuoi fare tappa?', { expectReply: true });
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
    case 'avoid': {
      const o = store.get('opts', {});
      if (c.toll) o.avoidTolls = true; if (c.motorway) o.avoidMotorways = true;
      store.set('opts', o);
      if (st.route) await reroute(true);
      return say(`Ok, evito ${[c.toll && 'i pedaggi', c.motorway && 'le autostrade'].filter(Boolean).join(' e ')}.`);
    }
    case 'weather': {
      const where = c.dest && st.route ? st.route.dest : st.pos;
      const w = await S.weather(where);
      return say(`${c.dest && st.route ? 'A destinazione' : 'Qui'} ${Math.abs(w.temp) === 1 ? (w.temp < 0 ? 'c\'è meno un grado' : 'c\'è un grado') : `ci sono ${w.temp} gradi`}, ${w.desc}.`);
    }
    case 'limit': return say(st.limit ? `Il limite qui è ${st.limit} chilometri orari.` : 'Non conosco il limite di questa strada.');
    case 'help': return say('Puoi dirmi: portami in via Roma, fai una tappa al benzinaio, evita le autostrade, che tempo fa a destinazione, quanto manca, oppure termina navigazione.');
    case 'hello': return say('Ciao! Dove andiamo?', { expectReply: true });
    default: return say('Non ho capito dove vuoi andare. Prova con: portami a, seguito dal posto.');
  }
}

function contextLine() {
  const d = new Date();
  const parts = [`ora ${S.clock(d)}`, `${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`, `velocità ${Math.round(st.speed * 3.6)} km/h`];
  if (st.address) parts.push(`posizione: ${st.address}`);
  if (st.route) parts.push(`in navigazione verso ${st.route.destName}, mancano ${S.fmtDur(remaining().time)}`);
  const saved = Object.keys(store.get('places', {})).concat(['home', 'work'].filter((k) => store.get(k)).map((k) => (k === 'home' ? 'casa' : 'lavoro')));
  if (saved.length) parts.push(`luoghi salvati: ${saved.join(', ')}`);
  const rec = store.get('recent', []).slice(0, 5).map((r) => r.name);
  if (rec.length) parts.push(`destinazioni recenti: ${rec.join(', ')}`);
  return parts.join('; ');
}

// Trova un luogo: salvato, categoria "più vicino" o ricerca libera
async function resolvePlace(query, { nearest = false, near = st.pos } = {}) {
  const q = query.trim().toLowerCase();
  if (/^(casa|a casa|casa mia)$/.test(q) && store.get('home')) return [{ ...store.get('home'), name: 'Casa' }];
  if (/^(lavoro|ufficio)$/.test(q) && store.get('work')) return [{ ...store.get('work'), name: 'Lavoro' }];
  const places = store.get('places', {});
  if (places[q]) return [places[q]];
  const cat = S.matchCategory(q);
  if (cat && (nearest || q.split(' ').length <= 2)) {
    try { const items = await S.nearest(cat, near); if (items.length) return items.slice(0, 5); } catch (e) {}
  }
  return S.searchPlaces(query, near);
}

async function goSaved(key, label) {
  const p = store.get(key);
  if (!p) return say(`Non so ancora dov'è ${label}. Quando sei lì, di' «Hey Boby, imposta ${label} qui».`);
  return startNav(p.coord, label === 'casa' ? 'Casa' : 'Lavoro', `Si torna a ${label}.`);
}

async function goTo(dest, { near } = {}) {
  ui.bubble(`Cerco «${dest}»…`, 'boby', 0);
  const res = await resolvePlace(dest, { nearest: near });
  if (!res.length) return say(`Non ho trovato «${dest}». Puoi ripetere con il nome della città?`, { expectReply: true });
  const p = res[0];
  return startNav(p.coord, p.name, `Ti porto a ${p.name}${p.where ? ', ' + p.where.split(',')[0] : ''}.`);
}

// Tappa: sceglie il posto che allunga meno il viaggio tra i più vicini al percorso
async function addStop(query) {
  if (!st.route) { await goTo(query, { near: true }); return { say: '', ok: true }; }
  const r = st.route;
  const ahead = r.coords.slice(Math.max(0, r.coords.findIndex((_, i) => r.cum[i] >= st.along)));
  const probe = ahead[Math.min(ahead.length - 1, Math.floor(ahead.length * 0.25))] || st.pos;
  let cands = [];
  for (const near of [st.pos, probe]) { try { cands = cands.concat(await resolvePlace(query, { nearest: true, near })); } catch (e) {} }
  if (!cands.length) return { say: `Non trovo ${query} lungo il percorso.`, ok: false };
  const detour = (c) => S.haversine(st.pos, c.coord) + S.haversine(c.coord, r.dest) - S.haversine(st.pos, r.dest);
  cands.sort((a, b) => detour(a) - detour(b));
  const p = cands[0];
  const before = remaining().time;
  await startNav(r.dest, r.destName, null, { via: [{ coord: p.coord, name: p.name }] });
  const extra = Math.max(0, Math.round((st.route.duration - before) / 60));
  return { ok: true, stop: p.name, extra_minutes: extra, say: `Ho aggiunto la tappa ${p.name}${extra ? `, ${extra} minuti in più` : ''}.` };
}

// Azioni che Claude può usare
const brain = new Brain(() => store.get('claudeKey', ''), {
  async find_places({ query, near }) {
    const at = near === 'destination' && st.route ? st.route.dest : st.pos;
    const res = await resolvePlace(query, { near: at });
    return res.slice(0, 5).map((p) => ({ name: p.name, where: p.where, km: +(S.haversine(st.pos, p.coord) / 1000).toFixed(1) }));
  },
  async navigate_to({ query, nearest }) {
    const res = await resolvePlace(query, { nearest });
    if (!res.length) return { ok: false, error: 'nessun risultato' };
    const p = res[0];
    await startNav(p.coord, p.name, null);
    const left = remaining();
    return { ok: true, destination: p.name, where: p.where, minutes: Math.round(left.time / 60), km: +(left.dist / 1000).toFixed(1), arrival: S.clock(new Date(Date.now() + left.time * 1000)) };
  },
  async add_stop({ query }) { const r = await addStop(query); delete r.say; return r; },
  async trip_status() {
    const base = { speed_kmh: Math.round(st.speed * 3.6), speed_limit: st.limit, position: st.address || null };
    if (!st.route) return { ...base, navigating: false };
    const left = remaining();
    return { ...base, navigating: true, destination: st.route.destName, stops: st.route.via.map((v) => v.name), minutes_left: Math.round(left.time / 60), km_left: +(left.dist / 1000).toFixed(1), arrival: S.clock(new Date(Date.now() + left.time * 1000)), next: currentInstructionPhrase() };
  },
  async stop_navigation() { if (st.route) endNav(); return { ok: true }; },
  async weather({ where }) { const w = await S.weather(where === 'destination' && st.route ? st.route.dest : st.pos); return w; },
  async save_place({ label, address }) {
    let p = { coord: st.pos, name: label };
    if (address) { const r = await S.searchPlaces(address, st.pos); if (!r.length) return { ok: false, error: 'indirizzo non trovato' }; p = { coord: r[0].coord, name: label, where: r[0].name }; }
    const k = label.toLowerCase();
    if (k === 'casa') store.set('home', p); else if (k === 'lavoro' || k === 'ufficio') store.set('work', p);
    else { const pl = store.get('places', {}); pl[k] = p; store.set('places', pl); }
    return { ok: true };
  },
  async route_options({ avoid_tolls, avoid_motorways }) {
    store.set('opts', { avoidTolls: avoid_tolls, avoidMotorways: avoid_motorways });
    if (st.route) await reroute(true);
    return { ok: true };
  },
  async voice_settings({ muted }) { setMuted(muted); return { ok: true }; },
});

// ---------------- navigazione ----------------
function prepareRoute(r, dest, destName, via = []) {
  const cum = [0];
  for (let i = 1; i < r.coords.length; i++) cum.push(cum[i - 1] + S.haversine(r.coords[i - 1], r.coords[i]));
  const total = cum[cum.length - 1] || 1;
  const ratio = total / (r.distance || total);
  // posizione lungo la linea in cui avviene ogni manovra (inizio di ogni step)
  const stepAt = []; let acc = 0;
  for (const s of r.steps) { stepAt.push(acc * ratio); acc += s.distance; }
  return { ...r, cum, total, stepAt, dest, destName, via, avgSpeed: r.distance / Math.max(r.duration, 1) };
}

function routeOpts() {
  const o = store.get('opts', {});
  return [o.avoidTolls && 'toll', o.avoidMotorways && 'motorway'].filter(Boolean);
}

const stopMarkers = [];
function drawRoute(r) {
  map.getSource('route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords }, properties: {} });
  destMarker.setLngLat(r.dest).addTo(map);
  stopMarkers.splice(0).forEach((m) => m.remove());
  r.via.forEach((v) => {
    const el = document.createElement('div'); el.className = 'stopdot'; el.title = v.name;
    stopMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(v.coord).addTo(map));
  });
}

function remember(dest, name) {
  if (!name || name === 'Casa' || name === 'Lavoro') return;
  const rec = store.get('recent', []).filter((r) => r.name !== name);
  rec.unshift({ coord: dest, name, at: Date.now() });
  store.set('recent', rec.slice(0, 8));
}

async function startNav(dest, destName, intro, { via = [] } = {}) {
  stopSim();
  const r = await S.route(st.pos, dest, { via: via.map((v) => v.coord), exclude: routeOpts() });
  const wasNavigating = !!st.route;
  st.route = prepareRoute(r, dest, destName, via);
  st.along = 0; st.stepIdx = 0; st.spoken = {}; st.offCount = 0; st.parkingAsked = false;
  if (!st.driveStart) st.driveStart = Date.now();
  drawRoute(st.route);
  document.body.classList.add('navigating');
  $('top').hidden = true; $('maneuver').hidden = false; $('trip').hidden = false; $('speed').hidden = false;
  closeSheet();
  remember(dest, destName);

  // panoramica animata, poi la camera si aggancia all'auto
  const b = r.coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(r.coords[0], r.coords[0]));
  st.follow = false;
  map.fitBounds(b, { padding: { top: 190, bottom: 200, left: 50, right: 90 }, pitch: 35, bearing: 0, duration: 1400 });
  routeAnim.reveal = 0; revealRoute();
  setTimeout(() => { st.follow = true; $('btnCenter').setAttribute('aria-pressed', 'true'); follow(true); }, 3600);

  update();
  requestWakeLock();
  if (intro === null) { st.spoken[1 + ':far'] = true; return; } // annuncia il cervello (Claude)
  // meteo a destinazione: lo dico solo se serve (pioggia, neve, freddo)
  let meteo = '';
  if (!wasNavigating && r.distance > 3000) {
    try { const w = await S.weather(dest); if (w.wet || w.temp <= 2) meteo = ` A destinazione: ${w.desc}, ${w.temp} gradi${w.wet ? ', guida con prudenza' : ''}.`; } catch (e) {}
  }
  const first = st.route.steps[1] ? ` ${S.instruction(st.route.steps[1])} tra ${S.speakDist(st.route.stepAt[1])}.` : '';
  await say(`${intro} ${S.speakDur(r.duration)}, arrivo previsto alle ${S.clock(new Date(Date.now() + r.duration * 1000))}.${meteo}${first}`);
  st.spoken[1 + ':far'] = true;
}

function endNav() {
  stopSim();
  st.route = null; st.pending = null; st.driveStart = 0; st.breakWarned = false;
  map.getSource('route')?.setData(emptyLine());
  destMarker.remove();
  stopMarkers.splice(0).forEach((m) => m.remove());
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

  if (left.dist < 25 || (next.maneuver.type === 'arrive' && next.lastLeg !== false && dNext < 20)) {
    const name = r.destName;
    endNav();
    say(`Sei arrivato${name ? ' a ' + name : ''}. Buona giornata!`);
    return;
  }
  smart(left);
}

// tappe ancora da raggiungere (per i ricalcoli)
function viaLeft() {
  const r = st.route;
  const passed = r.steps.filter((s, i) => s.maneuver.type === 'arrive' && s.lastLeg === false && r.stepAt[i] <= st.along + 30).length;
  return r.via.slice(passed);
}

// ---------------- assistente proattivo ----------------
function smart(left) {
  const now = Date.now();
  // 1. limite di velocità: lo aggiorno ogni 20 s o 300 m
  const lc = st.limitCheck;
  if (!st.sim && now - lc.at > 20000 && (!lc.pos || S.haversine(lc.pos, st.pos) > 300 || now - lc.at > 60000)) {
    lc.at = now; lc.pos = st.pos;
    S.speedLimit(st.pos).then((l) => { st.limit = l?.limit || null; showLimit(); }).catch(() => {});
  }
  const kmh = st.speed * 3.6;
  if (st.limit && kmh > st.limit + 7) {
    if (!st.overSince) st.overSince = now;
    if (now - st.overSince > 6000 && now - st.warnedLimit > 90000) {
      st.warnedLimit = now;
      boby.say(`Attenzione, il limite è ${st.limit}.`);
    }
  } else st.overSince = 0;
  $('speed').classList.toggle('over', !!(st.limit && kmh > st.limit + 3));

  // 2. a circa un chilometro dall'arrivo propongo il parcheggio
  const cat = S.matchCategory(st.route.destName.toLowerCase());
  if (!st.parkingAsked && left.dist < 1200 && st.route.total > 3000 && !(cat && /Parcheggio/.test(cat.label))) {
    st.parkingAsked = true;
    const dest = st.route.dest, destName = st.route.destName;
    st.pending = {
      yes: async () => {
        const items = await S.nearest(S.matchCategory('parcheggio'), dest, 800).catch(() => []);
        if (!items.length) return say('Non trovo parcheggi vicino alla destinazione, proseguo.');
        const p = items[0];
        await startNav(p.coord, p.name, null);
        st.parkingAsked = true;
        say(`Ti porto ${/parchegg|parking|garage/i.test(p.name) ? 'a ' + p.name : 'al parcheggio ' + p.name}, a ${S.speakDist(S.haversine(p.coord, dest))} da ${destName}.`);
      },
      noText: 'Va bene, proseguo verso la destinazione.',
    };
    say('Siamo quasi arrivati. Vuoi che cerchi un parcheggio vicino alla destinazione?', { expectReply: true });
    setTimeout(() => { if (st.pending) st.pending = null; }, 15000);
  }

  // 3. dopo due ore di guida suggerisco una pausa
  if (st.driveStart && !st.breakWarned && now - st.driveStart > 2 * 3600 * 1000 && !st.sim) {
    st.breakWarned = true;
    st.pending = { yes: () => addStop('area di servizio').then((r) => say(r.say)), noText: 'Ok, ma ricordati di riposare.' };
    say('Guidi da due ore. Vuoi che aggiunga una sosta per una pausa?', { expectReply: true });
  }
}

function showLimit() {
  const el = $('limit');
  el.hidden = !st.limit;
  if (st.limit) el.textContent = st.limit;
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

async function reroute(quiet = false) {
  st.rerouting = true;
  if (!quiet) ui.toast('Ricalcolo il percorso…');
  try {
    const r = st.route;
    const via = viaLeft();
    const nr = await S.route(st.pos, r.dest, { via: via.map((v) => v.coord), exclude: routeOpts() });
    st.route = prepareRoute(nr, r.dest, r.destName, via);
    st.along = 0; st.stepIdx = 0; st.spoken = {}; st.offCount = 0;
    drawRoute(st.route);
    routeAnim.reveal = 0; revealRoute();
    if (!quiet) boby.say('Percorso ricalcolato.');
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
  if (!st.sim && Date.now() - (st.addrAt || 0) > 120000) { st.addrAt = Date.now(); S.reverse(lngLat).then((a) => { if (a) st.address = a; }); }
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
function openSheet() { $('sheet').hidden = false; $('q').value = ''; renderResults(store.get('recent', []).map((r) => ({ ...r, where: 'Recente' }))); setTimeout(() => $('q').focus(), 50); }
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
  if (q.length < 3) return renderResults(q ? [] : store.get('recent', []).map((r) => ({ ...r, where: 'Recente' })));
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
// Avvio a mani libere: se microfono e posizione sono già stati concessi, Boby ascolta subito.
function unlockAudio() {
  boby.unlockAudio();
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {}
  $('tapWake').hidden = true;
  if (voiceSupported && !boby.wantRunning) boby.start();
}
addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
$('tapWake').onclick = unlockAudio;
boby.onBlocked = (text) => { $('tapWake').hidden = false; ui.bubble(text, 'boby', 8000); };

if (store.get('onboarded')) {
  $('onboard').hidden = true;
  startGPS();
  if (voiceSupported) {
    boby.start(); // il riconoscimento parte da solo quando il permesso è già dato
    setTimeout(() => {
      if (boby.state === 'denied' || boby.state === 'off') { $('tapWake').hidden = false; $('tapWake').textContent = 'Tocca una volta per accendere Boby'; }
      else if (!navigator.userActivation?.hasBeenActive) { $('tapWake').hidden = false; } // l'ascolto va, ma la voce del telefono richiede un tocco
    }, 2500);
  }
}

// ---------------- impostazioni ----------------
function renderSettings() {
  const k = store.get('claudeKey', '');
  $('keyIn').value = k;
  $('keyState').textContent = k ? 'Cervello attivo: Boby usa Claude.' : 'Cervello di base attivo.';
  const o = store.get('opts', {});
  $('optToll').checked = !!o.avoidTolls; $('optMoto').checked = !!o.avoidMotorways;
  const ul = $('savedList'); ul.innerHTML = '';
  const entries = [['home', store.get('home')], ['work', store.get('work')], ...Object.entries(store.get('places', {}))].filter(([, v]) => v);
  if (!entries.length) ul.innerHTML = '<li class="empty">Nessun luogo salvato. Di\' «Hey Boby, imposta casa qui».</li>';
  entries.forEach(([k2, v]) => {
    const li = document.createElement('li');
    li.textContent = k2 === 'home' ? 'Casa' : k2 === 'work' ? 'Lavoro' : k2[0].toUpperCase() + k2.slice(1);
    const del = document.createElement('button'); del.textContent = 'Elimina';
    del.onclick = () => {
      if (k2 === 'home' || k2 === 'work') store.set(k2, null);
      else { const pl = store.get('places', {}); delete pl[k2]; store.set('places', pl); }
      renderSettings();
    };
    li.append(del); ul.append(li);
  });
}
$('btnSettings').onclick = () => { renderSettings(); $('settings').hidden = false; };
$('setClose').onclick = () => { $('settings').hidden = true; };
$('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('settings').hidden = true; });
$('keyIn').addEventListener('change', (e) => { store.set('claudeKey', e.target.value.trim()); brain.reset(); renderSettings(); });
const saveOpts = () => { store.set('opts', { avoidTolls: $('optToll').checked, avoidMotorways: $('optMoto').checked }); if (st.route) reroute(true); };
$('optToll').onchange = saveOpts; $('optMoto').onchange = saveOpts;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// debug / test
window.__boby = { handle, st, startSim, parseCommand, brain, addStop, store, update };

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
