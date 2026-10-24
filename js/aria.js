// Aria, assistente del concept: risposte predefinite da JSON locale (tesla-lumen.md, VERDE Guard).
// Nessuna API, nessun dato che esce dal browser.
import { AI_NAME, VOICE_INPUT_ENABLED } from './config.js';

const $ = s => document.querySelector(s);
const WELCOME = "Ciao, sono Aria, un'assistente AI con risposte predefinite di un sito concept non ufficiale. Non sono un servizio Tesla e posso sbagliare. Posso raccontarti autonomia, ricarica, differenze tra i modelli e colori, con la fonte di ogni dato. Da dove vuoi iniziare?";
const FB_OFFTOPIC = "Su questo non ho una risposta predefinita. Posso aiutarti con autonomia, ricarica, differenze tra i modelli, Autopilot e colori. Per tutto il resto serve tesla.com o un centro Tesla.";
const FB_UNSAFE = "Non posso aiutarti con questo: proteggo la sicurezza di chi guida e di chi è in strada. Per l'assistenza sul veicolo serve tesla.com o un centro Tesla.";
const FB_COMPANY = "Non parlo a nome di Tesla né commento notizie o persone. Per informazioni ufficiali serve tesla.com.";
const CHIPS = [['Autonomia Model Y', 'q04'], ['Model 3 o Model Y?', 'q14'], ['Ricarica a casa', 'q12'], ['Autopilot, in breve', 'q18'], ['Colori Model 3', 'q20'], ['Come provarla?', 'q22']];
const SCENE_CHIPS = ['Mostrami il Cybertruck', 'Colore rosso', 'Raggi X'];

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[«»"“”'’`?!.,;:()\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('il lo la i gli le un una uno di a da in con su per tra fra e o ed che chi cosa come quanto quanta quanti quante qual quale quali c ce ci si mi ti me te ne del della dello dei degli delle al alla allo ai agli alle dal dalla nel nella sul sulla mio tuo suo ha ho hai fa fanno sono sei e è puoi posso può vuoi dimmi mostrami fammi vedere'.split(' '));
const MODEL_TOK = { '3': 'model3', 'y': 'modely', 's': 'models', 'x': 'modelx' };
const toks = s => norm(s).split(' ').filter(t => t && (!STOP.has(t) || MODEL_TOK[t]));
function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
const tokEq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (lev(a, b) <= (Math.min(a.length, b.length) >= 7 ? 2 : 1) || a.startsWith(b.slice(0, 5)) && b.length >= 5 && a.length >= 5));
function modelsIn(ts) { const m = new Set(); ts.forEach((t, i) => { if ((ts[i - 1] === 'model' || ts[i - 1] === 'modello') && MODEL_TOK[t]) m.add(MODEL_TOK[t]); if (/^model(3|y|s|x)$/.test(t)) m.add('model' + t[5]); if (t === 'cybertruck' || t === 'cyber') m.add('cybertruck'); }); return m; }
function sim(q, cand) {
  const a = toks(q), b = toks(cand); if (!a.length || !b.length) return 0;
  let hit = 0; for (const t of b) if (a.some(x => tokEq(x, t))) hit++;
  let s = (2 * hit) / (a.length + b.length);
  // parole di contenuto (non nomi di modello): se la domanda ne ha ma nessuna coincide, la somiglianza vale poco
  const isMod = t => t === 'model' || t === 'modello' || MODEL_TOK[t] || /^model(3|y|s|x)$/.test(t) || t === 'cybertruck';
  const ca = a.filter(t => !isMod(t)), cb = b.filter(t => !isMod(t));
  const chit = cb.filter(t => ca.some(x => tokEq(x, t))).length;
  const pen = (ca.length && !chit) ? 0.4 : 1, minus = (chit === 1 && ca.length >= 2 && cb.length >= 2 && hit === 1) ? 0.12 : 0;
  const nq = norm(q), nc = norm(cand); if (nc.length > 5 && nq.includes(nc)) s += 0.35;
  const mq = modelsIn(a), mc = modelsIn(b);
  if (mc.size && mq.size) s += [...mc].some(m => mq.has(m)) ? 0.25 : -0.6;
  return s * pen - minus;
}

let QA = [];
function match(q) {
  let best = null, bs = 0;
  for (const e of QA) for (const c of [e.domanda, ...e.varianti]) { const s = sim(q, c); if (s > bs) { bs = s; best = e; } }
  return bs >= 0.5 ? best : null;
}

const RE_UNSAFE = /(disattiv|disabilit|aggir|bypass|sblocc|rimuov).*(sicurezz|limitator|airbag|abs|controllo|allarm|sensor)|limitatore|jailbreak|hack|crack|root(are)?|modificare il software|guidare ubriac|senza patente/;
const RE_COMPANY = /\belon\b|\bmusk\b|azion[ie] tesla|\bborsa\b|notizi|opinion[ei] su tesla|ceo/;
const PAINT_WORDS = { bianco: 'bianco', bianca: 'bianco', nero: 'nero', nera: 'nero', grigio: 'grigio', grigia: 'grigio', argento: 'argento', blu: 'blu', rosso: 'rosso', rossa: 'rosso', acciaio: 'acciaio' };

function command(q, api) {
  const n = norm(q), acts = [];
  if (/raggi ?x|x ?ray|wireframe|radiografi/.test(n)) { const off = /(togli|spegni|disattiva|chiudi|basta|via)/.test(n); api.xray(!off); acts.push(off ? 'Raggi X spenti.' : 'Raggi X attivi: vedi la struttura in wireframe.'); }
  const nn = n.replace(/raggi ?x|x ?ray/g, '');
  const wantsShow = /(mostra|fammi vedere|fai vedere|vai|apri|passa|cambia|metti|voglio vedere|show|carica)/.test(nn);
  const m = modelsIn(toks(nn));
  if (m.size && (wantsShow || toks(nn).length <= 3)) {
    const id = [...m][0];
    if (api.cars.some(c => c.id === id)) { api.showCar(id); const name = api.cars.find(c => c.id === id).name; acts.push(`Ecco ${name}.`); }
    else return { text: `${id === 'modelx' ? 'La Model X' : 'La Model S'} non è tra le 3 auto di questo concept: qui trovi ${api.cars.map(c => c.name).join(', ')}.`, acts };
  }
  const pw = Object.keys(PAINT_WORDS).find(w => new RegExp('\\b' + w + '\\b').test(nn));
  if (pw && (/(colore|vernic|dipingi|fall[ao]|metti|rendi|in )/.test(nn) || toks(nn).length <= 2)) { api.paint(PAINT_WORDS[pw]); const p = api.paints.find(p => p.id === PAINT_WORDS[pw]); acts.push(`Colore applicato: ${p.name}. I colori a schermo sono indicativi.`); }
  if (/(vista|guarda).*(fronte|frontale|davanti)/.test(nn)) { api.view('front'); acts.push('Vista frontale.'); }
  else if (/(vista|guarda).*(lato|laterale|fianco|profilo)/.test(nn)) { api.view('side'); acts.push('Vista laterale.'); }
  else if (/(vista|guarda).*(dietro|posteriore|retro)/.test(nn)) { api.view('rear'); acts.push('Vista posteriore.'); }
  else if (/(dall alto|vista alto|dall'alto)/.test(nn)) { api.view('top'); acts.push('Vista dall\'alto.'); }
  if (/\b(ruota|gira|girala|giralo)\b/.test(nn) && !acts.length) { api.spin(); acts.push('La faccio girare.'); }
  if (/\b(configura|configuratore)\b/.test(nn)) { api.goSection('configura'); acts.push('Ti porto al configuratore visivo.'); }
  if (/\b(confronta|confronto|tabella)\b/.test(nn)) { api.goSection('confronta'); acts.push('Ecco la tabella di confronto.'); }
  return acts.length ? { acts } : null;
}

// C'è anche una domanda oltre al comando di scena?
function isQuestion(q) {
  if (/\?/.test(q)) return true;
  return /\b(cos[ae]?|cosa|quant[aeio]?|come|quando|perche|perché|qual[ei]?|dove|chi|posso|puoi|può|puo|serve|conviene|esiste)\b/.test(norm(q));
}

export function reply(q, api) {
  const n = norm(q);
  if (RE_UNSAFE.test(n)) return { text: FB_UNSAFE };
  if (RE_COMPANY.test(n)) return { text: FB_COMPANY };
  const cmd = command(q, api);
  if (cmd?.text) return cmd;
  const qa = (cmd && cmd.acts.length && !/(autonomia|ricaric|quant|cos|differenz|colori|garanzi|prezz|cost)/.test(n)) ? null : match(q);
  // Guard v1: testo unico sul Cybertruck (niente «non in vendita»), uguale a q25.
  if (n.includes('cybertruck') && !qa && ((cmd && !isQuestion(q)) || /vend|disponib|itali|acquist|compr/.test(n))) return { acts: cmd ? cmd.acts : [], text: 'Sagoma 3D generica. La pagina del Cybertruck su tesla.com/it_it riporta specifiche per gli USA, quindi qui non do numeri. Per sapere se e come è disponibile in Italia, controlla tesla.com/it_it.', src: 'https://www.tesla.com/it_it/cybertruck' };
  if (qa) return { text: qa.risposta, src: qa.fonte, acts: cmd?.acts };
  // Guard v1 punto 3: Aria non resta mai muta. Comando puro = solo riga ✓; comando + domanda senza risposta = FB_OFFTOPIC + azione.
  if (cmd) return isQuestion(q) ? { acts: cmd.acts, text: FB_OFFTOPIC } : { acts: cmd.acts };
  return { text: FB_OFFTOPIC };
}

// ---------- orb (canvas 2D, toni ambra; niente anelli rossi stile logo) ----------
function makeOrb(canvas, nParticles) {
  const g = canvas.getContext('2d'), W = canvas.width, C = W / 2;
  const P = Array.from({ length: nParticles }, () => ({ a: Math.random() * 6.28, r: 0.55 + Math.random() * 0.4, s: 0.2 + Math.random() * 0.6, z: Math.random() }));
  const o = { state: 'idle', amp: 0, running: true };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(t) {
    if (!o.running) return; requestAnimationFrame(draw);
    if (reduced && o._drawn && o.state === 'idle') return; o._drawn = true;
    const st = o.state, time = t / 1000;
    g.clearRect(0, 0, W, W);
    const breathe = 1 + 0.04 * Math.sin(time * Math.PI / 2);
    const R = W * 0.22 * breathe * (st === 'listen' ? 1.06 : 1) * (1 + o.amp * 0.12);
    const glow = g.createRadialGradient(C, C, R * 0.4, C, C, R * 2.1);
    glow.addColorStop(0, 'rgba(255,170,90,.45)'); glow.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, W);
    // superficie ondulata
    g.beginPath();
    const wob = st === 'think' ? 0.09 : st === 'speak' ? 0.05 + o.amp * 0.08 : 0.03;
    for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283; const rr = R * (1 + wob * Math.sin(a * 3 + time * 2.3) * Math.cos(a * 2 - time * 1.7)); const x = C + Math.cos(a) * rr, y = C + Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    const body = g.createRadialGradient(C - R * 0.35, C - R * 0.4, R * 0.1, C, C, R * 1.05);
    body.addColorStop(0, '#FFF1DA'); body.addColorStop(0.35, '#FFD08A'); body.addColorStop(1, '#FF9A4D');
    g.fillStyle = body; g.fill();
    // particelle in orbita
    const speed = st === 'think' ? 2.4 : st === 'listen' ? 0.6 : 1;
    for (const p of P) {
      p.a += 0.004 * p.s * speed * (reduced ? 0 : 1);
      const rr = (st === 'listen' ? 0.75 : st === 'think' ? 1.05 : 1) * p.r * W * 0.45;
      const x = C + Math.cos(p.a) * rr, y = C + Math.sin(p.a) * rr * (st === 'think' ? 0.35 : 0.8);
      g.fillStyle = `rgba(255,${200 + p.z * 50 | 0},${150 + p.z * 80 | 0},${0.35 + 0.5 * p.z})`;
      g.beginPath(); g.arc(x, y, 0.8 + p.z * 1.6 * (W / 160), 0, 6.283); g.fill();
    }
    // parla: 24 barre radiali sottili
    if (st === 'speak') {
      o.amp = 0.35 + 0.65 * Math.abs(Math.sin(time * 9) * Math.sin(time * 3.3));
      g.strokeStyle = 'rgba(255,215,160,.7)'; g.lineWidth = Math.max(1, W / 120);
      for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, l = R * (0.15 + 0.35 * o.amp * (0.5 + 0.5 * Math.sin(time * 11 + i))); g.beginPath(); g.moveTo(C + Math.cos(a) * R * 1.25, C + Math.sin(a) * R * 1.25); g.lineTo(C + Math.cos(a) * (R * 1.25 + l), C + Math.sin(a) * (R * 1.25 + l)); g.stroke(); }
    } else o.amp *= 0.9;
  }
  requestAnimationFrame(draw);
  o.setRunning = v => { if (v && !o.running) { o.running = true; requestAnimationFrame(draw); } else o.running = v; };
  return o;
}

export async function initAria(api) {
  try { QA = await (await fetch('data/aria-qa.json')).json(); } catch (e) { console.warn('QA non caricato', e); }
  const small = makeOrb($('#orb'), matchMedia('(pointer: coarse)').matches ? 40 : 70);
  const big = makeOrb($('#orbBig'), 60); big.setRunning(false);
  const chat = $('#chat'), msgs = $('#msgs'), input = $('#chatInput'), stateEl = $('#aiState');
  let opened = false, tts = false, lastFocus = null;

  const setState = s => { big.state = small.state = s; stateEl.textContent = s === 'think' ? 'Ci penso…' : s === 'listen' ? 'Ti ascolto…' : s === 'speak' ? 'Voce generata dal browser' : 'Assistente con risposte predefinite'; };
  function add(text, who, extra = {}) {
    const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text || '';
    if (extra.acts?.length) { const a = document.createElement('span'); a.className = 'act'; a.textContent = '✓ ' + extra.acts.join(' '); d.appendChild(a); }
    if (extra.src) { const a = document.createElement('a'); a.className = 'srcl'; a.href = extra.src; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Apri la fonte: ' + extra.src.replace('https://www.', ''); d.appendChild(a); }
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; return d;
  }
  function ask(q) {
    if (!q.trim()) return;
    add(q, 'me'); setState('think');
    const typing = add('…', 'bot typing');
    setTimeout(() => {
      typing.remove();
      const r = reply(q, api);
      if (!r.text && r.acts?.length) add('', 'bot', { acts: r.acts }); else add(r.text, 'bot', r);
      speak([r.acts?.join(' '), r.text].filter(Boolean).join(' '));
    }, 450);
  }
  // voce in uscita: solo voci locali (localService) per non inviare testo a server esterni
  function localVoice() { const v = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('it') && v.localService); return v[0] || null; }
  function speak(text) {
    if (!tts || !('speechSynthesis' in window)) { setState('idle'); return; }
    const v = localVoice(); if (!v) { setState('idle'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/https?:\/\/\S+/g, '')); u.voice = v; u.lang = v.lang; u.rate = 1.03;
    u.onstart = () => setState('speak'); u.onend = u.onerror = () => setState('idle');
    speechSynthesis.speak(u);
  }
  const ttsBtn = $('#ttsBtn');
  if (!('speechSynthesis' in window)) ttsBtn.hidden = true;
  ttsBtn.addEventListener('click', () => {
    if (!localVoice()) { add('Su questo dispositivo non trovo una voce italiana locale, quindi resto solo testo.', 'bot'); return; }
    tts = !tts; ttsBtn.setAttribute('aria-pressed', tts); if (!tts) speechSynthesis.cancel();
  });
  // dettatura: spenta (vedi config.js). Su iPhone si può usare il microfono della tastiera.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (VOICE_INPUT_ENABLED && SR) {
    const mic = $('#micBtn'); mic.hidden = false;
    mic.addEventListener('click', () => { const r = new SR(); r.lang = 'it-IT'; r.interimResults = false; setState('listen'); r.onresult = e => ask(e.results[0][0].transcript); r.onend = () => setState('idle'); r.start(); });
  }

  const quick = $('#quickChips');
  const chipHTML = (label, q) => `<button class="chip" data-q="${q}">${label}</button>`;
  quick.innerHTML = CHIPS.map(([l, id]) => chipHTML(l, QA.find(e => e.id === id)?.domanda || l)).join('') + SCENE_CHIPS.map(c => chipHTML(c, c)).join('');
  $('#aiSecChips').innerHTML = quick.innerHTML;
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-q]'); if (c) { if (!opened) open(); ask(c.dataset.q); return; }
    const a = e.target.closest('[data-ask]'); if (a) { open(); ask(a.dataset.ask); return; }
    const o = e.target.closest('[data-open-ai]'); if (o) { e.preventDefault(); open(); }
  });

  // tastiera iOS: la chat segue il visualViewport
  const vv = window.visualViewport;
  function fitVV() { if (!vv || !opened) return; chat.style.setProperty('--vvh', vv.height + 'px'); if (innerWidth <= 640) chat.style.transform = `translateY(${vv.offsetTop}px)`; chat.classList.toggle('kb', vv.height < innerHeight * 0.75); msgs.scrollTop = msgs.scrollHeight; }
  vv?.addEventListener('resize', fitVV); vv?.addEventListener('scroll', fitVV);

  function open() {
    if (opened) return; opened = true; lastFocus = document.activeElement;
    chat.hidden = false; document.body.classList.add('chat-open'); $('#orbBtn').setAttribute('aria-expanded', 'true');
    big.setRunning(true); small.setRunning(false); api.pause(true);
    if (!msgs.childElementCount) add(WELCOME, 'bot');
    fitVV(); setTimeout(() => (matchMedia('(pointer: coarse)').matches ? $('#chatClose') : input).focus(), 50);
  }
  function close() {
    opened = false; chat.hidden = true; document.body.classList.remove('chat-open'); $('#orbBtn').setAttribute('aria-expanded', 'false');
    big.setRunning(false); small.setRunning(true); api.pause(false); speechSynthesis?.cancel?.(); setState('idle'); chat.style.transform = '';
    lastFocus?.focus?.();
  }
  $('#orbBtn').addEventListener('click', open);
  $('#chatClose').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && opened) close(); });
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  window.__aria = { open, close, ask, reply: q => reply(q, api) };
}
