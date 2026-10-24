// Configurazione centrale. Per rinominare l'assistente basta cambiare AI_NAME.
export const AI_NAME = 'Aria';
export const AI_DISPLAY = `${AI_NAME}, assistente del concept`; // mai «Aria AI»
export const AI_LABEL = 'Assistente AI';
export const SITE_NAME = 'Aria Showroom 3D';
export const STORAGE_PREFIX = 'ariaS_';
// Dettatura vocale: il riconoscimento vocale di Chrome/Safari può inviare l'audio ai server
// di Google/Apple. Guard (punto 5) vieta dati che escono dal browser, quindi resta spenta.
export const VOICE_INPUT_ENABLED = false;

// Massimo 3 auto (Guard/Nova). Modelli CC BY 4.0 (loghi rimossi, vedi CREDITS.md); se il GLB non carica si usa la sagoma procedurale.
export const CARS = [
  { id: 'model3', name: 'Model 3', kind: 'sedan', glb: 'assets/models/model3.glb', lengthM: 4.72, matOnly: true, paintRe: '^CAR_PAINT$', rimRe: '^Material\\.012$', headRe: '^LED_PHARE$', glassRe: '^(Material\\.017|Material\\.016)$', credit: { title: 'Tesla Model 3', author: 'David_Holiday', authorUrl: 'https://sketchfab.com/David_Holiday', url: 'https://sketchfab.com/3d-models/tesla-model-3-123c10f376ec4f18b93c73afc382808b', license: 'CC BY 4.0' }, line: 'Berlina sportiva.' },
  { id: 'modely', name: 'Model Y', kind: 'suv', glb: 'assets/models/modely.glb', lengthM: 4.79, matOnly: true, rotY: Math.PI, frontX: -1, paintRe: '^(body)$', rimRe: '^wheels$', glassRe: '^glass_body$', tailRe: '^glass_lights$', credit: { title: 'Tesla Model Y 2021', author: '763468712', authorUrl: 'https://sketchfab.com/763468712', url: 'https://sketchfab.com/3d-models/tesla-model-y-2021-c0a86cac582d4b33aba0fb1b1912d970', license: 'CC BY 4.0', via: { name: 'Tina 3D Tesla', url: 'https://github.com/Tina2088/tina-3d-tesla' } }, line: 'SUV di medie dimensioni.' },
  { id: 'cybertruck', name: 'Cybertruck', kind: 'truck', glb: 'assets/models/cybertruck.glb', lengthM: 5.68, matOnly: true, paintRe: '^body', rimRe: '^$', headRe: '^light_f', glassRe: '^(Glass|glassgray)', defaultPaint: 'acciaio', credit: { title: 'Tesla Cybertruck', author: 'hashikemu', authorUrl: 'https://sketchfab.com/hashikemu', url: 'https://sketchfab.com/3d-models/tesla-cybertruck-657e71b3e2ad468196668e9c9df708fb', license: 'CC BY 4.0' }, line: 'Pick-up in acciaio inossidabile.' },
];
// Per sostituire la sagoma: glb: 'assets/models/<id>.glb', lengthM, credit: { title, author, authorUrl, url, license }
//   (opzionali: paintRe, rimRe, rotY, flip). Ogni nuovo modello va prima approvato da Guard.

export const PAINTS = [
  { id: 'bianco', name: 'Bianco perla', hex: '#e9ebee', metal: 0.15, rough: 0.28 },
  { id: 'nero', name: 'Nero lucido', hex: '#0b0c0f', metal: 0.2, rough: 0.22 },
  { id: 'grigio', name: 'Grigio grafite', hex: '#3b3f46', metal: 0.6, rough: 0.3 },
  { id: 'argento', name: 'Argento', hex: '#a9adb3', metal: 0.85, rough: 0.25 },
  { id: 'blu', name: 'Blu notte', hex: '#123a7a', metal: 0.6, rough: 0.26 },
  { id: 'rosso', name: 'Rosso', hex: '#a10f14', metal: 0.45, rough: 0.24 },
  { id: 'acciaio', name: 'Acciaio spazzolato', hex: '#b9bcc0', metal: 1, rough: 0.38, coat: 0 },
];
export const RIMS = [
  { id: 'argento', name: 'Argento', hex: '#c9ccd1', metal: 1, rough: 0.25 },
  { id: 'grafite', name: 'Grafite', hex: '#3a3d42', metal: 0.9, rough: 0.35 },
  { id: 'nero', name: 'Nero opaco', hex: '#111214', metal: 0.4, rough: 0.6 },
];
