// Il "cervello" di Boby: Claude con strumenti per guidare il navigatore.
// Si attiva solo se l'utente inserisce la propria chiave API nelle impostazioni (resta sul telefono).
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.8.0/+esm';
const MODEL = 'claude-opus-5-5';

const SYSTEM = `Sei Boby, l'assistente vocale di un navigatore per auto. Parli italiano.
L'utente sta guidando: ogni tua risposta viene letta ad alta voce.
- Rispondi in una o due frasi brevi, naturali, senza elenchi, simboli, markdown o emoji.
- Quando l'utente vuole andare da qualche parte, usa subito gli strumenti e parti: non chiedere conferme se la richiesta è chiara.
- Se ci sono più posti plausibili, scegli il più sensato (vicino, aperto, famoso) e dillo in breve; chiedi solo se è davvero ambiguo.
- Per "lungo il percorso" o "una tappa" usa add_stop; per cambiare destinazione usa navigate_to.
- Numeri e orari detti come si parlano ("tra dodici minuti", "alle diciotto e trenta").
- La sicurezza viene prima: non invitare mai a guardare o toccare il telefono.
- Se non puoi fare qualcosa con gli strumenti, dillo con onestà in una frase.`;

const tool = (name, description, properties = {}, required = []) => ({
  name, description, strict: true,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
});

const TOOLS = [
  tool('find_places', 'Cerca luoghi per nome, indirizzo o categoria. Restituisce fino a 5 risultati con distanza da te.', {
    query: { type: 'string', description: 'Nome, indirizzo o categoria (es. "benzinaio", "Piazza Duomo Milano", "pizzeria")' },
    near: { type: 'string', enum: ['me', 'destination'], description: 'Cerca vicino a me o vicino alla destinazione attuale' },
  }, ['query', 'near']),
  tool('navigate_to', 'Avvia subito la navigazione verso un luogo (sostituisce la destinazione attuale).', {
    query: { type: 'string', description: 'Indirizzo, nome del luogo, categoria, oppure "casa"/"lavoro"/nome di un luogo salvato' },
    nearest: { type: 'boolean', description: 'true se serve il più vicino di una categoria (es. benzinaio più vicino)' },
  }, ['query', 'nearest']),
  tool('add_stop', 'Aggiunge una tappa prima della destinazione attuale, scegliendo il posto più comodo vicino al percorso.', {
    query: { type: 'string', description: 'Categoria o nome del posto (es. "benzinaio", "farmacia", "Esselunga")' },
  }, ['query']),
  tool('trip_status', 'Stato attuale: posizione, destinazione, tempo e distanza mancanti, orario di arrivo, prossima manovra, velocità, limite.'),
  tool('stop_navigation', 'Termina la navigazione in corso.'),
  tool('weather', 'Meteo attuale qui o alla destinazione.', { where: { type: 'string', enum: ['here', 'destination'] } }, ['where']),
  tool('save_place', 'Salva un luogo con un nome (es. casa, lavoro, palestra). Senza indirizzo salva la posizione attuale.', {
    label: { type: 'string' }, address: { type: 'string', description: 'Indirizzo da salvare, oppure stringa vuota per la posizione attuale' },
  }, ['label', 'address']),
  tool('route_options', 'Cambia le preferenze del percorso e ricalcola.', {
    avoid_tolls: { type: 'boolean' }, avoid_motorways: { type: 'boolean' },
  }, ['avoid_tolls', 'avoid_motorways']),
  tool('voice_settings', 'Silenzia o riattiva le indicazioni vocali.', { muted: { type: 'boolean' } }, ['muted']),
];

let sdk = null;
async function client(key) {
  if (!sdk) sdk = await import(SDK_URL);
  const Anthropic = sdk.default;
  return { c: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 25000 }), Anthropic };
}

export class Brain {
  constructor(getKey, actions) {
    this.getKey = getKey;
    this.actions = actions; // { name: async (input) => result }
    this.messages = [];
    this.lastAt = 0;
  }
  get enabled() { return !!this.getKey(); }
  reset() { this.messages = []; }

  // Restituisce il testo da dire. Lancia un errore se l'API non è raggiungibile (si torna ai comandi locali).
  async ask(text, context) {
    if (Date.now() - this.lastAt > 10 * 60 * 1000) this.messages = []; // nuova conversazione dopo 10 minuti
    this.lastAt = Date.now();
    const { c, Anthropic } = await client(this.getKey());
    const start = this.messages.length;
    this.messages.push({ role: 'user', content: `[${context}]\n${text}` });
    let spoken = '';
    for (let turn = 0; turn < 6; turn++) {
      let res;
      try {
        res = await c.beta.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM,
          tools: TOOLS,
          output_config: { effort: 'low' }, // risposte rapide: chi guida non deve aspettare
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages: this.messages,
        });
      } catch (err) {
        this.messages.length = start; // torna allo stato prima della domanda
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw Object.assign(new Error('auth'), { kind: 'auth' });
        if (err instanceof Anthropic.RateLimitError) throw Object.assign(new Error('rate'), { kind: 'rate' });
        throw Object.assign(new Error('net'), { kind: 'net' });
      }
      this.messages.push({ role: 'assistant', content: res.content }); // contenuto completo, invariato
      for (const b of res.content) if (b.type === 'text') spoken += (spoken ? ' ' : '') + b.text;
      if (res.stop_reason === 'refusal') return 'Su questo non posso aiutarti.';
      if (res.stop_reason !== 'tool_use') break;

      const results = await Promise.all(res.content.filter((b) => b.type === 'tool_use').map(async (b) => {
        try {
          const out = await this.actions[b.name](b.input || {});
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out ?? { ok: true }) };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: b.id, content: String(e.message || e), is_error: true };
        }
      }));
      this.messages.push({ role: 'user', content: results });
      spoken = ''; // conta solo il testo finale
    }
    if (this.messages.length > 40) this.messages = [];
    return spoken.replace(/[*_#`>]/g, '').trim() || 'Fatto.';
  }
}
