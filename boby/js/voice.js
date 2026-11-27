// Boby: parola d'attivazione "Hey Boby", riconoscimento vocale e voce.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = !!SR;

export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();

// Accetta le varianti che il riconoscitore italiano produce per "Hey Boby".
const HEY = new Set(['hey', 'hei', 'hej', 'ehi', 'ehy', 'ei', 'eh', 'ey', 'e', 'ok', 'okay', 'ciao', 'ehm', 'hai', 'ay', 'a']);
const NAMES = new Set(['boby', 'bobby', 'bobi', 'bobbi', 'bobie', 'bobbie', 'bobo', 'bobb', 'bobbe', 'bob', 'boobie', 'booby', 'bobbing', 'bobbit']);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const isName = (w) => NAMES.has(w) || (w.length >= 4 && w.length <= 6 && w[0] === 'b' && lev(w, 'bobby') <= 1);

export function splitWake(text) {
  const w = norm(text).replace(/'/g, ' ').split(' ').filter(Boolean);
  for (let i = 0; i < w.length; i++) {
    // "hey boby", "ehi bobby", oppure il nome da solo all'inizio della frase; "baby" solo dopo "hey"
    const prevHey = i > 0 && HEY.has(w[i - 1]);
    if (isName(w[i]) && (prevHey || i === 0) || (prevHey && (w[i] === 'baby' || w[i] === 'bobby'))) return w.slice(i + 1).join(' ');
    if (w[i] === 'heybobby' || w[i] === 'heyboby' || w[i] === 'ehibobby') return w.slice(i + 1).join(' ');
  }
  return null;
}

export function isYes(t) { return /^(si|sì|certo|ok|okay|va bene|vai|perfetto|esatto|volentieri|si grazie|sì grazie|fallo|d accordo|daccordo)\b/.test(norm(t)); }
export function isNo(t) { return /^(no|non|lascia|lascia stare|niente|annulla|no grazie)\b/.test(norm(t)); }

// ---------------- Comprensione dei comandi ----------------
const PREP = /^(?:a|ad|da|dal|dalla|dallo|dai|al|alla|allo|ai|agli|alle|all|in|nel|nella|nello|verso|fino a|fino al|fino alla|presso|il|la|lo|l|i|gli|le|un|una|uno)\s+/;

function stripPreps(s) {
  let prev;
  do { prev = s; s = s.replace(PREP, '').replace(/^'/, ''); } while (s !== prev);
  return s.replace(/\b(per favore|grazie|subito|adesso|ora)\b/g, '').replace(/\s+/g, ' ').trim();
}

export function parseCommand(raw) {
  const t = norm(raw);
  if (!t) return { intent: 'empty' };
  if (/\b(annulla|ferma|stop|termina|interrompi|basta)\b.*\b(navigazione|percorso|viaggio)?/.test(t) && !/portami|vai/.test(t)) return { intent: 'cancel' };
  if (/quanto manca|quando arrivo|tra quanto|a che ora arrivo|tempo di arrivo/.test(t)) return { intent: 'eta' };
  if (/\b(ripeti|cosa hai detto|prossima (svolta|manovra|indicazione))\b/.test(t)) return { intent: 'repeat' };
  if (/che ore sono|che ora e/.test(t)) return { intent: 'time' };
  if (/(imposta|salva|segna).*(casa)/.test(t)) return { intent: 'sethome' };
  if (/(imposta|salva|segna).*(lavoro|ufficio)/.test(t)) return { intent: 'setwork' };
  if (/\b(muto|silenzio|zitto|silenzia)\b/.test(t)) return { intent: 'mute' };
  if (/\b(riattiva|attiva) (la )?(voce|audio)\b/.test(t)) return { intent: 'unmute' };
  if (/zoom avanti|avvicina|ingrandisci/.test(t)) return { intent: 'zoomin' };
  if (/zoom indietro|allontana|rimpicciolisci/.test(t)) return { intent: 'zoomout' };
  if (/\b(centra|dove sono|mia posizione)\b/.test(t)) return { intent: 'center' };
  if (/\b(simula|demo|prova il percorso)\b/.test(t)) return { intent: 'simulate' };
  if (/(evita|senza).*(autostrad|pedagg|casell)/.test(t)) return { intent: 'avoid', toll: /pedagg|casell/.test(t), motorway: /autostrad/.test(t) };
  if (/(che tempo|meteo|piove|pioggia).*/.test(t) && !/portami|vai/.test(t)) return { intent: 'weather', dest: /destinazione|arrivo|dove vado/.test(t) };
  if (/(limite|velocita massima)/.test(t)) return { intent: 'limit' };
  if (/\b(tappa|fermata|sosta|passa(re)? (da|dal|per))\b/.test(t)) {
    const m = t.match(/(?:tappa|fermata|sosta|passa(?:re)?)\s*(?:da|dal|dalla|al|alla|a|per|in|presso)?\s*(.*)$/);
    const dest = stripPreps((m?.[1] || '').replace(/\b(piu vicin\w*|lungo (il|la) (strada|percorso)|sulla strada|prima)\b/g, '').trim());
    return { intent: 'stop', dest };
  }
  if (/\b(aiuto|cosa sai fare|cosa posso dire|comandi)\b/.test(t)) return { intent: 'help' };
  if (/^(ciao|salve|buongiorno|buonasera|come stai)\b/.test(t)) return { intent: 'hello' };

  const nav = t.match(/(?:portami|porta mi|accompagnami|guidami|vai|andiamo|voglio andare|devo andare|naviga|navigazione|percorso|strada per|come arrivo|come si arriva|cerca|trova|trovami|dove (?:si )?trova|dov e)\s*(.*)$/);
  let dest = nav ? nav[1] : t;
  dest = stripPreps(dest).replace(/^(verso|per)\s+/, '');
  if (!dest) return { intent: 'unknown', text: t };
  const near = /piu vicin|vicin|qui vicino|nei dintorni|in zona/.test(dest);
  dest = dest.replace(/\b(piu vicino|piu vicina|piu vicini|piu vicine|qui vicino|vicino a me|nei dintorni|in zona|vicino|vicina)\b/g, '').trim();
  if (/^casa\b|^casa mia/.test(dest)) return { intent: 'home' };
  if (/^(lavoro|ufficio)\b/.test(dest)) return { intent: 'work' };
  return { intent: 'go', dest: stripPreps(dest), near, raw: t };
}

// ---------------- Voce (sintesi) ----------------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('it'));
  voice = vs.find((v) => /google|alice|federica|elsa|natural|neural/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export class Boby {
  constructor({ onWake, onCommand, onHeard, onState }) {
    Object.assign(this, { onWake, onCommand, onHeard, onState });
    this.state = 'off';
    this.muted = false;
    this.armedUntil = 0;
    this.speaking = false;
    this.wantRunning = false;
    this.rec = null;
    this.restartDelay = 250;
  }

  setState(s) { if (this.state !== s) { this.state = s; this.onState?.(s); } }

  start() {
    if (!SR) return false;
    this.wantRunning = true;
    this._spawn();
    return true;
  }

  stop() { this.wantRunning = false; try { this.rec?.abort(); } catch (e) {} this.setState('off'); }

  _expire(ms) {
    clearTimeout(this._exp);
    this._exp = setTimeout(() => { if (this.state === 'listening' && Date.now() >= this.armedUntil) this.setState(this.rec ? 'idle' : 'off'); }, ms + 50);
  }

  listenFor(ms = 7000) { // Ascolto di seguito, senza dover ridire "Hey Boby"
    this.armedUntil = Date.now() + ms;
    this.followUp = true;
    this.setState('listening');
    this._expire(ms);
    if (this.wantRunning && !this.rec && !this.speaking) this._spawn();
  }

  arm() { // Attivazione manuale (tocco sull'orb)
    this.armedUntil = Date.now() + 8000;
    this.setState('listening');
    this._expire(8000);
    this.onWake?.();
    if (!this.wantRunning) this.start();
  }

  _spawn() {
    if (this.rec) return;
    const rec = new SR();
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart = () => { this.restartDelay = 250; if (this.state === 'off' || this.state === 'error') this.setState('idle'); };
    rec.onresult = (e) => this._result(e);
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.wantRunning = false; this.setState('denied'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') this.restartDelay = Math.min(this.restartDelay * 2, 4000);
    };
    rec.onend = () => {
      this.rec = null;
      if (this.wantRunning && !this.speaking) setTimeout(() => this.wantRunning && !this.speaking && this._spawn(), this.restartDelay);
      else if (!this.wantRunning) this.setState('off');
    };
    this.rec = rec;
    try { rec.start(); } catch (err) { this.rec = null; }
  }

  _result(e) {
    if (this.speaking) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const alts = Array.from(res).map((a) => a.transcript);
      const text = alts[0];
      const armed = Date.now() < this.armedUntil;
      let rest = null;
      for (const a of alts) { const r = splitWake(a); if (r !== null) { rest = r; break; } }

      if (!res.isFinal) {
        if (rest !== null && !armed) { this.armedUntil = Date.now() + 8000; this.setState('listening'); this._expire(8000); this.onWake?.(); }
        if (armed || rest !== null) this.onHeard?.(rest ?? text, false);
        continue;
      }
      if (rest !== null) {
        if (rest.split(' ').length >= 1 && rest.length > 1) { this._fire(rest); }
        else { this.armedUntil = Date.now() + 8000; this.setState('listening'); this._expire(8000); this.onWake?.(); }
      } else if (armed) {
        this._fire(text);
      }
    }
  }

  _fire(text) {
    this.armedUntil = 0;
    this.followUp = false;
    this.onHeard?.(text, true);
    this.setState('thinking');
    this.onCommand?.(text);
  }

  say(text, { interrupt = true, expectReply = false } = {}) {
    return new Promise((resolve) => {
      const after = () => { if (expectReply) this.listenFor(8000); resolve(); };
      if (this.muted || !('speechSynthesis' in window)) return after();
      if (interrupt) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      if (voice) u.voice = voice;
      u.rate = 1.04; u.pitch = 1.02;
      // Durante la voce sospendo l'ascolto, così Boby non sente se stesso.
      this.speaking = true;
      try { this.rec?.abort(); } catch (e) {}
      const prev = this.state;
      this.setState('speaking');
      const done = () => {
        this.speaking = false;
        this.setState(prev === 'speaking' || prev === 'thinking' || prev === 'listening' ? 'idle' : prev);
        if (this.wantRunning && !this.rec) setTimeout(() => this._spawn(), 200);
        after();
      };
      u.onend = done;
      u.onerror = (ev) => { if (ev.error === 'not-allowed') this.onBlocked?.(text); done(); };
      speechSynthesis.speak(u);
      setTimeout(() => { if (this.speaking && !speechSynthesis.speaking) done(); }, 15000);
    });
  }

  unlockAudio() {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; speechSynthesis.speak(u);
  }
}
