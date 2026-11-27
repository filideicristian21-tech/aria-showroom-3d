// Boby: parola d'attivazione "Hey Boby", riconoscimento vocale e voce.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = !!SR;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();

// Accetta le varianti che il riconoscitore italiano produce per "Hey Boby".
const WAKE = /(?:^|\s)(?:hey|hei|hej|ehi|ehy|ei|eh|ey|e|ok|okay|ciao)?\s*(?:boby|bobby|bobi|bobbi|bob bi|bobie|bobbie|bobo|baby|bobb|boby's)(?:\s|$)/;

export function splitWake(text) {
  const t = norm(text);
  const m = t.match(WAKE);
  if (!m) return null;
  return t.slice(m.index + m[0].length).trim();
}

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

  arm() { // Attivazione manuale (tocco sull'orb)
    this.armedUntil = Date.now() + 8000;
    this.setState('listening');
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
        if (rest !== null && !armed) { this.armedUntil = Date.now() + 8000; this.setState('listening'); this.onWake?.(); }
        if (armed || rest !== null) this.onHeard?.(rest ?? text, false);
        continue;
      }
      if (rest !== null) {
        if (rest.split(' ').length >= 1 && rest.length > 1) { this._fire(rest); }
        else { this.armedUntil = Date.now() + 8000; this.setState('listening'); this.onWake?.(); }
      } else if (armed) {
        this._fire(text);
      }
    }
  }

  _fire(text) {
    this.armedUntil = 0;
    this.onHeard?.(text, true);
    this.setState('thinking');
    this.onCommand?.(text);
  }

  say(text, { interrupt = true } = {}) {
    return new Promise((resolve) => {
      if (this.muted || !('speechSynthesis' in window)) return resolve();
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
        resolve();
      };
      u.onend = done; u.onerror = done;
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
