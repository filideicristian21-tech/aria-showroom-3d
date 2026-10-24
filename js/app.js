import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CARS, PAINTS, RIMS, STORAGE_PREFIX, AI_NAME } from './config.js';
import { initLoaders, buildProcedural, loadGLB, makePaint, makeRim, samplePoints } from './car.js';
import { initAria } from './aria.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const params = new URLSearchParams(location.search);
const state = { selected: 'model3', shown: null, paint: {}, rim: 'argento', xray: false, chatOpen: false, quality: isMobile ? 1 : 2, lite: false };
CARS.forEach(c => state.paint[c.id] = c.defaultPaint || 'bianco');
document.querySelectorAll('.ai-name').forEach(e => e.textContent = AI_NAME);

let specs = { cars: {}, rows: [] };
const credits = [];

// ---------- caricamento dati ----------
const loader = $('#loader'), ldPct = $('#ldPct');
function setPct(p) { ldPct.textContent = Math.round(p * 100) + '%'; }
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); }

// ---------- capitoli dei modelli ----------
function buildChapters() {
  const host = $('#chaptersHost');
  CARS.forEach((c, i) => {
    const s = specs.cars[c.id] || {};
    const sec = document.createElement('section');
    sec.className = 'sec chapter'; sec.id = 'm-' + c.id; sec.dataset.car = c.id; sec.dataset.cam = 'chapter';
    const bar = (s.bar || []).map(b => `<div><div class="l">${b.label}</div><div class="v" data-count="${b.value}">${b.value}</div><div class="s">${b.sub || ''}</div></div>`).join('');
    sec.innerHTML = `
      <p class="ch-num">0${i + 1} / 0${CARS.length}</p>
      <h2 class="ch-title">${c.name}</h2>
      <p class="lead small">${c.line}</p>
      ${c.glb ? '' : `<p class="procnote">Segnaposto 3D: sagoma generica, non l'auto reale. Il modello con licenza CC BY arriva dopo.</p>`}
      <div class="dragzone" aria-hidden="true"></div>
      ${bar ? `<div class="specbar">${bar}</div>` : `<div class="glass panel" style="margin-top:auto;padding:14px"><p class="note" style="margin:0">${s.note || 'Dati: dato mancante.'}</p></div>`}
      <p class="src">${s.url ? `Fonte: <a href="${s.url}" target="_blank" rel="noopener">tesla.com</a>, consultato il ${specs.consulted}. Valore indicativo, può essere cambiato.` : ''}</p>
      <div class="row ch-cta"><button class="btn small" data-goto-cfg="${c.id}">Configura</button><button class="btn small ghost" data-ask="${c.id === 'cybertruck' ? 'Mostrami il Cybertruck' : 'Quanta autonomia ha la ' + c.name + '?'}">Chiedi ad ${AI_NAME}</button></div>`;
    host.appendChild(sec);
  });
  const nav = $('#chapters');
  const items = [['hero', 'Intro'], ...CARS.map(c => ['m-' + c.id, c.name]), ['configura', 'Configura'], ['confronta', 'Confronta'], ['aria', AI_NAME]];
  nav.innerHTML = items.map(([id, n]) => `<a href="#${id}" data-sec="${id}" aria-label="${n}">${n}<i></i></a>`).join('');
}

function buildCompare() {
  const t = $('#cmpTable');
  let h = '<thead><tr><th scope="col">Dato</th>' + CARS.map(c => `<th scope="col">${c.name}</th>`).join('') + '</tr></thead><tbody>';
  for (const r of specs.rows) {
    h += `<tr><th scope="row">${r.label}</th>` + CARS.map(c => { const v = specs.cars[c.id]?.values?.[r.key]; return v ? `<td>${v}</td>` : `<td class="missing">${specs.cars[c.id]?.usSpecsOnly ? 'solo specifiche USA' : 'dato mancante'}</td>`; }).join('') + '</tr>';
  }
  h += `<tr><th scope="row">Prezzo</th><td colspan="${CARS.length}" class="missing">Nessun prezzo in questo concept: vedi tesla.com</td></tr></tbody>`;
  t.innerHTML = h;
  $('#cmpSource').innerHTML = 'Fonte: ' + CARS.map(c => specs.cars[c.id]?.url ? `<a href="${specs.cars[c.id].url}" target="_blank" rel="noopener">${specs.cars[c.id].url.replace('https://www.', '')}</a>` : '').filter(Boolean).join(', ') + `, consultato il ${specs.consulted}. Valori indicativi, possono essere cambiati. Cybertruck: la pagina italiana mostra solo specifiche USA, quindi nessun numero.`;
  $('#dataNote').textContent = `I dati tecnici sono indicativi, presi da tesla.com/it_it il ${specs.consulted}, e possono essere cambiati: verificali sempre su tesla.com/it_it. Le immagini e i modelli 3D sono a scopo illustrativo; i colori a schermo sono indicativi.`;
}

function buildCredits() {
  const ul = $('#creditsList');
  const lines = CARS.filter(c => c.glb && c.credit).map(c => `<li>${c.name}: «${c.credit.title}» di <a href="${c.credit.authorUrl}" target="_blank" rel="noopener">${c.credit.author}</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, modificato (<a href="${c.credit.url}" target="_blank" rel="noopener">fonte</a>)${c.credit.via ? `, adattamento di <a href="${c.credit.via.url}" target="_blank" rel="noopener">${c.credit.via.name}</a>` : ''}.</li>`);
  if (lines.length) lines.push('<li>Modifiche ai modelli: loghi e badge rimossi, oggetti di scena tolti, mesh semplificata e compressa (meshopt), materiali sostituiti. La licenza copre la mesh, non i marchi né il design delle auto.</li>');
  if (!lines.length) lines.push('<li>Modelli 3D delle auto: segnaposto procedurali creati per questo concept (sagome generiche, nessun modello di terzi). I modelli CC BY 4.0 verranno accreditati qui.</li>');
  lines.push('<li>HDRI «Studio Small 09» di Sergej Majboroda, <a href="https://polyhaven.com/a/studio_small_09" target="_blank" rel="noopener">Poly Haven</a>, CC0.</li>');
  ul.innerHTML = lines.join('');
}

// ---------- WebGL ----------
let renderer, scene, camera, composer, bloom, pmrem, pivot, floorMat, ring, shadowMesh;
const cars = {}; let particles = null;
const clock = new THREE.Clock();

function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

function showFallback(reason) {
  console.warn('fallback 3D:', reason);
  $('#scene').style.display = 'none'; document.body.classList.add('no3d');
  const fb = $('#fallback'); fb.hidden = false;
  $('#fbGallery').innerHTML = CARS.map(c => `<figure><img src="assets/img/${c.id}.webp" alt="${c.name}, immagine del modello 3D" loading="lazy" width="640" height="480"><figcaption>${c.name} (immagine statica del segnaposto)</figcaption></figure>`).join('');
  loader.classList.add('done');
}

function initGL() {
  const canvas = $('#scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
  renderer.setClearColor(0x07080A);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showFallback('context lost'); });
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07080A, 18, 60);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  pmrem = new THREE.PMREMGenerator(renderer);
  initLoaders(renderer);
  pivot = new THREE.Group(); scene.add(pivot);

  // pavimento lucido che sfuma nel nero
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const g = fc.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128); grd.addColorStop(0, '#fff'); grd.addColorStop(0.55, '#888'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  floorMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0f, roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.2, alphaMap: new THREE.CanvasTexture(fc), transparent: true, envMapIntensity: 0.1 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 64), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // anello luminoso della pedana
  ring = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.6, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4DA3FF).multiplyScalar(2.2), transparent: true, opacity: 0.8, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
  // ombra di contatto (texture, niente ombre in tempo reale)
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 128; const sg = sc.getContext('2d');
  const sgr = sg.createRadialGradient(128, 64, 4, 128, 64, 120); sgr.addColorStop(0, 'rgba(0,0,0,.95)'); sgr.addColorStop(0.5, 'rgba(0,0,0,.55)'); sgr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = sgr; sg.fillRect(0, 0, 256, 128);
  shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.position.y = 0.01; pivot.add(shadowMesh);
  const key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(4, 8, 3); scene.add(key);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.5, 0.9); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  resize();
}

async function loadEnv() {
  const hdr = await new HDRLoader().loadAsync('assets/hdri/studio_small_09_256.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  // ambiente da studio: HDRI CC0 + softbox lineari aggiunti, filtrato con PMREM
  const env = new THREE.Scene();
  const sph = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide }));
  sph.material.color.setScalar(0.3); env.add(sph);
  const L = (w, h, x, y, z, ry, rx, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); };
  L(14, 1.2, 0, 9, -2.2, 0, Math.PI / 2, 5); L(14, 1.2, 0, 9, 2.2, 0, Math.PI / 2, 5);
  L(1.4, 6, -12, 3, 0, Math.PI / 2, 0, 3); L(1.4, 6, 12, 3, 0, -Math.PI / 2, 0, 2);
  L(9, 0.6, 0, 2.2, -12, 0, 0, 2.5);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  // con scene.environment three usa environmentIntensity: per il pavimento serve envMap esplicita
  floorMat.envMap = scene.environment; floorMat.needsUpdate = true;
  hdr.dispose();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const dprCap = state.lite ? 1 : (state.quality >= 2 ? 2 : state.quality === 1 ? 1.5 : 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  dirty = true;
}

// ---------- auto ----------
function paintDef(id) { return PAINTS.find(p => p.id === id) || PAINTS[0]; }
function rimDef(id) { return RIMS.find(r => r.id === id) || RIMS[0]; }
function applyPaintDef(mat, d) { mat.color.set(d.hex); mat.metalness = d.metal; mat.roughness = d.rough; mat.clearcoat = d.coat ?? 1; }

async function getCar(id) {
  if (cars[id]) return cars[id];
  const def = CARS.find(c => c.id === id);
  const paint = makePaint(); applyPaintDef(paint, paintDef(state.paint[id]));
  const rim = makeRim(rimDef(state.rim).hex);
  let obj = null;
  if (def.glb) { try { obj = await loadGLB(def, paint, rim, p => setPct(p)); } catch (e) { console.warn('GLB non caricato, uso il segnaposto', e); } }
  if (!obj) obj = buildProcedural(def.kind, paint, rim);
  obj.userData.id = id; obj.userData.paint = paint; obj.userData.rim = rim;
  obj.userData.points = samplePoints(obj, isMobile ? 6000 : 14000);
  cars[id] = obj; return obj;
}
function fitShadow(car) { shadowMesh.scale.set(car.userData.length * 1.35, car.userData.width * 1.9, 1); }

let swapping = false, wantCar = null;
async function showCar(id, instant = false) {
  wantCar = id;
  if (swapping || state.shown === id) return;
  swapping = true;
  const next = await getCar(id);
  const prev = state.shown ? cars[state.shown] : null;
  if (!prev || instant || reduced || state.lite) {
    if (prev) pivot.remove(prev);
    pivot.add(next); setXray(next, state.xray); fitShadow(next);
  } else {
    await dissolve(prev, next);
  }
  state.shown = id; swapping = false; dirty = true;
  updateSummary(); syncCfgUI();
  if (wantCar !== id) showCar(wantCar);
  // precarica la prossima auto (lazy, una alla volta)
  const i = CARS.findIndex(c => c.id === id), nx = CARS[(i + 1) % CARS.length];
  setTimeout(() => getCar(nx.id), 400);
}

const pVert = `attribute vec3 aTo; attribute vec4 aRnd; uniform float uT; uniform float uSize; varying float vA;
void main(){ float t=uT; float m=smoothstep(0.3,0.75,t+ (aRnd.w-0.5)*0.15); vec3 p=mix(position,aTo,m);
 float s=sin(3.14159*clamp(t,0.,1.)); p+= (aRnd.xyz-0.5)*vec3(2.2,1.2,2.2)*s + vec3(0.,s*0.35*aRnd.y,0.);
 vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(0.6+aRnd.w)/-mv.z; vA=0.35+0.65*s; }`;
const pFrag = `uniform vec3 uColor; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard; gl_FragColor=vec4(uColor, (1.-d*2.)*vA); }`;
function dissolve(prev, next) {
  return new Promise(res => {
    const a = prev.userData.points, b = next.userData.points, n = Math.min(a.length, b.length) / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.slice(0, n * 3), 3));
    g.setAttribute('aTo', new THREE.BufferAttribute(b.slice(0, n * 3), 3));
    const rnd = new Float32Array(n * 4); for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({ vertexShader: pVert, fragmentShader: pFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uSize: { value: (isMobile ? 26 : 34) * renderer.getPixelRatio() }, uColor: { value: new THREE.Color(0x4DA3FF).multiplyScalar(1.6) } } });
    particles = new THREE.Points(g, m); pivot.add(particles);
    pivot.remove(prev);
    const t0 = performance.now(), D = 1400;
    particles.userData.tick = () => {
      const t = Math.min(1, (performance.now() - t0) / D); m.uniforms.uT.value = t;
      if (t >= 0.9 && !next.parent) { pivot.add(next); setXray(next, state.xray); fitShadow(next); }
      if (t >= 1) { pivot.remove(particles); g.dispose(); m.dispose(); particles = null; res(); }
    };
  });
}

// ---------- raggi X ----------
const xrayMat = new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(0x4DA3FF) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2); gl_FragColor=vec4(uC*(0.25+2.2*f), 0.05+0.8*f); }` });
const wireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff).multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const wireMatDense = wireMat.clone(); wireMatDense.opacity = 0.035;
function setXray(car, on) {
  if (car.userData.tris == null) { let t = 0; car.traverse(o => { if (o.isMesh && !o.userData.isWire) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); car.userData.tris = t; }
  const wm = car.userData.tris > 80000 ? wireMatDense : wireMat;
  car.traverse(o => {
    if (!o.isMesh || o.userData.isWire) return;
    if (on) {
      if (!o.userData.orig) o.userData.orig = o.material;
      o.material = xrayMat;
      if (!o.userData.wire) { const w = new THREE.Mesh(o.geometry, wm); w.userData.isWire = true; o.add(w); o.userData.wire = w; }
      o.userData.wire.visible = true;
    } else if (o.userData.orig) { o.material = o.userData.orig; if (o.userData.wire) o.userData.wire.visible = false; }
  });
  floorMat.opacity = on ? 0.4 : 1; ring.material.opacity = on ? 1 : 0.8;
  dirty = true;
}
function toggleXray(v) {
  state.xray = v ?? !state.xray; if (state.shown) setXray(cars[state.shown], state.xray);
  $('#xrayBtn').setAttribute('aria-pressed', state.xray); updateSummary();
}

// ---------- colore e cerchi ----------
const tweens = [];
function setPaint(id, carId = state.shown || state.selected) {
  const d = paintDef(id); state.paint[carId] = id;
  const car = cars[carId];
  if (car) {
    const mat = car.userData.paint, from = mat.color.clone(), to = new THREE.Color(d.hex), t0 = performance.now();
    mat.metalness = d.metal; mat.roughness = d.rough; mat.clearcoat = d.coat ?? 1;
    tweens.push(() => { const t = Math.min(1, (performance.now() - t0) / (reduced ? 1 : 600)); mat.color.copy(from).lerp(to, t * t * (3 - 2 * t)); return t < 1; });
  }
  syncCfgUI(); updateSummary(); toast(`Colore applicato: ${d.name}`);
}
function setRim(id) {
  const d = rimDef(id); state.rim = id;
  Object.values(cars).forEach(c => { const m = c.userData.rim; m.color.set(d.hex); m.metalness = d.metal; m.roughness = d.rough; });
  syncCfgUI(); updateSummary(); toast(`Cerchi: ${d.name}`); dirty = true;
}

// ---------- camera guidata dallo scroll ----------
const DEG = Math.PI / 180;
const CAM = {
  hero: [{ p: 0, az: 38, el: 9, d: 1, ty: 0.75, sx: 0.18 }, { p: 1, az: 60, el: 14, d: 1.05, ty: 0.7, sx: 0.18 }],
  chapter: [{ p: 0, az: 25, el: 7, d: 1.05, ty: 0.75, sx: 0.2 }, { p: 0.45, az: 90, el: 6, d: 0.98, ty: 0.75, sx: 0.2 }, { p: 0.8, az: 128, el: 4, d: 0.62, ty: 0.55, sx: 0.12 }, { p: 1, az: 160, el: 10, d: 0.9, ty: 0.7, sx: 0.2 }],
  config: [{ p: 0, az: 35, el: 10, d: 1.05, ty: 0.7, sx: -0.22 }, { p: 1, az: 35, el: 12, d: 1.05, ty: 0.7, sx: -0.22 }],
  compare: [{ p: 0, az: 200, el: 18, d: 1.15, ty: 0.7, sx: 0 }, { p: 1, az: 240, el: 24, d: 1.2, ty: 0.7, sx: 0 }],
  ai: [{ p: 0, az: 300, el: 12, d: 1.05, ty: 0.7, sx: 0.2 }, { p: 1, az: 330, el: 10, d: 1.05, ty: 0.7, sx: 0.2 }],
  footer: [{ p: 0, az: 0, el: 55, d: 1.25, ty: 0.4, sx: 0 }, { p: 1, az: 20, el: 70, d: 1.3, ty: 0.4, sx: 0 }],
};
const VIEWS = { front: { az: 0, el: 6 }, side: { az: 90, el: 5 }, rear: { az: 180, el: 8 }, top: { az: 90, el: 80 } };
const cam = { az: 38, el: 9, d: 1, ty: 0.75, sx: 0, sy: 0.17 }, camT = { ...cam };
// sy: spostamento verticale solo in verticale (iPhone), frazione di schermo; + = auto più in basso
const SY = { hero: 0.17, chapter: 0.03, config: -0.17, compare: 0.1, ai: 0.12, footer: 0 };
let viewOverride = null, zoomMul = 1;
let sections = [], activeSec = null;

function interp(keys, p) {
  if (reduced) p = 0.35;
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i].p && p <= keys[i + 1].p) { a = keys[i]; b = keys[i + 1]; break; }
  const t = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const o = {}; for (const k of ['az', 'el', 'd', 'ty', 'sx']) o[k] = a[k] + (b[k] - a[k]) * e; return o;
}
function onScroll() {
  const vh = innerHeight; let best = null, bestVis = -1;
  for (const s of sections) {
    const r = s.getBoundingClientRect(); const vis = Math.min(vh, r.bottom) - Math.max(0, r.top);
    if (vis > bestVis) { bestVis = vis; best = s; }
  }
  if (!best) return;
  if (best !== activeSec) {
    activeSec = best; viewOverride = null;
    $$('#chapters a').forEach(a => a.classList.toggle('on', a.dataset.sec === best.id));
    const want = best.dataset.car === 'current' ? state.selected : best.dataset.car;
    if (best.dataset.car !== 'current') state.selected = want;
    if (renderer) showCar(want);
  }
  const r = best.getBoundingClientRect(); const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh * 0.4)));
  Object.assign(camT, interp(CAM[best.dataset.cam] || CAM.hero, p)); camT.sy = SY[best.dataset.cam] ?? 0;
  if (viewOverride) Object.assign(camT, viewOverride);
  dirty = true;
}
function camDist() {
  const car = state.shown ? cars[state.shown] : null; const L = car ? car.userData.length : 4.8, H = car ? car.userData.height : 1.5;
  const vf = camera.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const occupy = camera.aspect < 1 ? 0.84 : 0.46;
  return Math.max((L * 0.5) / (Math.tan(hf / 2) * occupy), (H * 1.4) / Math.tan(vf / 2));
}

// ---------- tocco: ruota con inerzia ----------
let spin = 0, spinV = 0, lastInteract = -1e9, dragging = false, lastX = 0, lastTap = 0;
function bindDrag(el) {
  el.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; spinV = 0; lastInteract = performance.now(); el.setPointerCapture?.(e.pointerId); $('#dragHint')?.classList.add('gone');
    const now = performance.now(); if (now - lastTap < 300) { spin = 0; spinV = 0; zoomMul = 1; viewOverride = null; onScroll(); } lastTap = now; });
  el.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; const d = dx * 0.008; spin += d; spinV = d; lastInteract = performance.now(); dirty = true; });
  const up = () => { dragging = false; lastInteract = performance.now(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('gesturestart', e => e.preventDefault());
}

// ---------- loop ----------
let dirty = true, running = true, fpsAcc = 0, fpsN = 0, slowFor = 0;
function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), now = performance.now();
  let anim = false;
  // turntable: 360° in 24 s nell'hero e nel configuratore, riparte dopo 3 s di inattività
  const auto = !reduced && activeSec && (activeSec.id === 'hero' || activeSec.id === 'configura') && now - lastInteract > 3000 && !viewOverride;
  if (!dragging) { spin += spinV; spinV *= 0.94; if (Math.abs(spinV) > 1e-4) anim = true; }
  if (auto) { spin += dt * (Math.PI * 2 / 24); anim = true; }
  else if (!dragging && now - lastInteract > 3000 && activeSec && !(activeSec.id === 'hero' || activeSec.id === 'configura')) {
    const target = Math.round(spin / (Math.PI * 2)) * Math.PI * 2; spin += (target - spin) * 0.04; if (Math.abs(target - spin) > 1e-3) anim = true;
  }
  pivot.rotation.y = spin;
  for (let i = tweens.length - 1; i >= 0; i--) { if (!tweens[i]()) tweens.splice(i, 1); anim = true; }
  if (particles) { particles.userData.tick(); anim = true; }
  // camera smorzata
  const k = reduced ? 1 : 1 - Math.pow(0.002, dt);
  for (const key of ['az', 'el', 'd', 'ty', 'sx', 'sy']) { const diff = camT[key] - cam[key]; if (Math.abs(diff) > 1e-4) anim = true; cam[key] += diff * k; }
  const wide = camera.aspect >= 1;
  const R = camDist() * cam.d * zoomMul;
  const az = cam.az * DEG, el = Math.max(2, cam.el) * DEG;
  camera.position.set(Math.cos(az) * Math.cos(el) * R, Math.sin(el) * R + 0.2, Math.sin(az) * Math.cos(el) * R);
  camera.lookAt(0, cam.ty, 0);
  camera.filmOffset = wide ? -cam.sx * 18 : 0;
  const W = innerWidth, Hh = innerHeight;
  if (!wide) camera.setViewOffset(W, Hh, 0, -cam.sy * Hh, W, Hh); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  ring.material.color.setRGB(0.3, 0.64, 1).multiplyScalar(1.6 + 0.6 * Math.sin(now * 0.0015));
  if (anim || dirty) {
    if (state.quality >= 1 && !state.lite) composer.render(); else renderer.render(scene, camera);
    dirty = false;
    // qualità adattiva: sotto ~45 fps per 2 s si abbassa
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { const fps = fpsN / fpsAcc; window.__fps = fps; if (fps < 45) slowFor++; else slowFor = 0; if (slowFor >= 2 && state.quality > 0) { state.quality--; slowFor = 0; resize(); if (state.quality >= 1 && !state.lite) composer.render(); else renderer.render(scene, camera); console.info('qualità ridotta a', state.quality); } fpsAcc = 0; fpsN = 0; }
  }
}
function setRunning(v) { if (v === running) return; running = v; if (v) { clock.getDelta(); requestAnimationFrame(frame); } }
document.addEventListener('visibilitychange', () => setRunning(!document.hidden && !state.chatOpen));

// ---------- configuratore UI ----------
function buildCfgUI() {
  $('#carPick').innerHTML = CARS.map(c => `<button class="chip" data-car="${c.id}" aria-pressed="false">${c.name}</button>`).join('');
  $('#paintPick').innerHTML = PAINTS.map(p => `<button class="sw" role="radio" aria-checked="false" data-paint="${p.id}"><i style="background:${p.hex}"></i>${p.name}</button>`).join('');
  $('#rimPick').innerHTML = RIMS.map(r => `<button class="sw" role="radio" aria-checked="false" data-rim="${r.id}"><i style="background:${r.hex}"></i>${r.name}</button>`).join('');
  $('#carPick').addEventListener('click', e => { const b = e.target.closest('[data-car]'); if (b) selectCar(b.dataset.car); });
  $('#paintPick').addEventListener('click', e => { const b = e.target.closest('[data-paint]'); if (b) setPaint(b.dataset.paint); });
  $('#rimPick').addEventListener('click', e => { const b = e.target.closest('[data-rim]'); if (b) setRim(b.dataset.rim); });
  $$('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => {
    $$('.tabs [role=tab]').forEach(x => x.setAttribute('aria-selected', x === t));
    $$('.tabpanel').forEach(p => p.hidden = p.dataset.panel !== t.dataset.tab);
    if (t.dataset.tab === 'rims') setView('wheel'); else if (viewOverride?.name === 'wheel') setView(null);
  }));
  $('#xrayBtn').addEventListener('click', () => toggleXray());
  $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#zoomIn').addEventListener('click', () => { zoomMul = Math.max(0.55, zoomMul * 0.85); dirty = true; });
  $('#zoomOut').addEventListener('click', () => { zoomMul = Math.min(1.5, zoomMul / 0.85); dirty = true; });
  $('#saveCfg').addEventListener('click', () => { try { localStorage.setItem(STORAGE_PREFIX + 'cfg', JSON.stringify({ selected: state.selected, paint: state.paint, rim: state.rim })); toast('Configurazione salvata solo in questo browser.'); } catch { toast('Salvataggio non disponibile.'); } });
  $('#shareCfg').addEventListener('click', async () => {
    const u = new URL(location.href); u.search = `?auto=${state.selected}&c=${state.paint[state.selected]}&r=${state.rim}`; u.hash = 'configura';
    try { if (navigator.share) await navigator.share({ title: 'Aria Showroom 3D (concept)', url: u.href }); else { await navigator.clipboard.writeText(u.href); toast('Link copiato.'); } } catch { toast(u.href); }
  });
  $('#wipeBtn').addEventListener('click', () => { Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX)).forEach(k => localStorage.removeItem(k)); toast('Dati salvati cancellati.'); $('#wipeBtn').textContent = 'Dati cancellati'; });
  $('#liteBtn').addEventListener('click', () => { state.lite = !state.lite; $('#liteBtn').setAttribute('aria-pressed', state.lite); resize(); });
}
function setView(name) {
  if (!name) { viewOverride = null; onScroll(); return; }
  if (name === 'wheel') viewOverride = { name, az: 70, el: 4, d: 0.5, ty: 0.4, sx: 0 };
  else viewOverride = { name, ...VIEWS[name], d: name === 'top' ? 1.1 : 1, ty: 0.7, sx: activeSec?.id === 'configura' ? -0.22 : 0 };
  spin = 0; spinV = 0; lastInteract = performance.now(); Object.assign(camT, viewOverride); dirty = true;
}
function selectCar(id) { state.selected = id; if (renderer) showCar(id); syncCfgUI(); updateSummary(); }
function syncCfgUI() {
  $$('#carPick [data-car]').forEach(b => b.setAttribute('aria-pressed', b.dataset.car === state.selected));
  $$('#paintPick [data-paint]').forEach(b => b.setAttribute('aria-checked', b.dataset.paint === state.paint[state.selected]));
  $$('#rimPick [data-rim]').forEach(b => b.setAttribute('aria-checked', b.dataset.rim === state.rim));
}
function updateSummary() {
  const c = CARS.find(c => c.id === state.selected);
  $('#sumLine').textContent = `${c.name} · ${paintDef(state.paint[c.id]).name} · cerchi ${rimDef(state.rim).name}${state.xray ? ' · raggi X' : ''}`;
}
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; clearTimeout(toastT); toastT = setTimeout(() => t.textContent = '', 3000); }

// ---------- API per l'assistente ----------
const sceneAPI = {
  cars: CARS, paints: PAINTS,
  showCar(id) { selectCar(id); const el = document.getElementById('m-' + id); return el; },
  goSection(id) { document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); },
  paint(id) { setPaint(id, state.selected); },
  xray(v) { toggleXray(v); },
  view(v) { setView(v); },
  spin() { spinV = 0.12; lastInteract = performance.now(); },
  pause(v) { state.chatOpen = v; setRunning(!v && !document.hidden); },
  get selected() { return state.selected; },
};

// ---------- avvio ----------
async function boot() {
  try { specs = await getJSON('data/specs.json'); } catch (e) { console.warn(e); }
  buildChapters(); buildCompare(); buildCredits(); buildCfgUI();
  // parametri da link condiviso
  const pa = params.get('auto'); if (CARS.some(c => c.id === pa)) state.selected = pa;
  const pc = params.get('c'); if (PAINTS.some(p => p.id === pc)) state.paint[state.selected] = pc;
  const pr = params.get('r'); if (RIMS.some(r => r.id === pr)) state.rim = pr;
  if (!pa) { try { const s = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'cfg') || 'null'); if (s) { Object.assign(state.paint, s.paint || {}); if (RIMS.some(r => r.id === s.rim)) state.rim = s.rim; } } catch { } }
  syncCfgUI(); updateSummary();
  sections = $$('main .sec');
  $$('.dragzone').forEach(bindDrag);
  $$('[data-goto-cfg]').forEach(b => b.addEventListener('click', () => { selectCar(b.dataset.gotoCfg); sceneAPI.goSection('configura'); }));
  initAria(sceneAPI);

  if (!webglOK() || params.has('nogl')) { showFallback('no webgl'); return; }
  try {
    initGL();
    setPct(0.1); await loadEnv(); setPct(0.5);
    onScroll();
    const first = activeSec && activeSec.dataset.car !== 'current' ? activeSec.dataset.car : state.selected;
    await showCar(first, true); setPct(1);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', resize); screen.orientation?.addEventListener?.('change', resize);
    requestAnimationFrame(frame);
    setTimeout(() => loader.classList.add('done'), 150);
    window.__ready = true;
  } catch (e) { console.error(e); showFallback(e.message); }
  setTimeout(() => { if (!window.__ready) showFallback('timeout'); }, 15000);
}
boot();
window.__scene = sceneAPI;
