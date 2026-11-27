// Ricerca luoghi (Photon), percorsi (OSRM) e "più vicino" (Overpass). Nessuna chiave richiesta.

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

async function getJSON(url, opts = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function photonLabel(p) {
  const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ');
  const where = [p.street && p.name ? [p.street, p.housenumber].filter(Boolean).join(' ') : null, p.city || p.town || p.village, p.state]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && v !== name);
  return { name: name || p.city || 'Luogo', where: where.join(', ') };
}

export async function searchPlaces(q, near) {
  const u = new URL(PHOTON);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '6');
  if (near) { u.searchParams.set('lat', near[1].toFixed(5)); u.searchParams.set('lon', near[0].toFixed(5)); }
  try {
    const j = await getJSON(u, {}, 8000);
    const out = (j.features || []).map((f) => ({ ...photonLabel(f.properties), coord: f.geometry.coordinates }));
    if (out.length) return out;
  } catch (e) { /* passa a Nominatim */ }
  const n = new URL(NOMINATIM);
  n.searchParams.set('q', q); n.searchParams.set('format', 'jsonv2'); n.searchParams.set('limit', '6');
  n.searchParams.set('accept-language', 'it');
  if (near) { const d = 0.6; n.searchParams.set('viewbox', [near[0] - d, near[1] + d, near[0] + d, near[1] - d].join(',')); }
  const j = await getJSON(n);
  return j.map((r) => ({ name: r.name || r.display_name.split(',')[0], where: r.display_name.split(',').slice(1, 3).join(',').trim(), coord: [+r.lon, +r.lat] }));
}

export const CATEGORIES = [
  { re: /benzin|distribut|carburant|rifornim|gasolio|diesel/, tag: '["amenity"="fuel"]', label: 'Distributore' },
  { re: /colonnin|ricaric/, tag: '["amenity"="charging_station"]', label: 'Colonnina di ricarica' },
  { re: /parchegg/, tag: '["amenity"="parking"]', label: 'Parcheggio' },
  { re: /farmaci/, tag: '["amenity"="pharmacy"]', label: 'Farmacia' },
  { re: /ospedal|pronto soccorso/, tag: '["amenity"="hospital"]', label: 'Ospedale' },
  { re: /supermercat|spesa/, tag: '["shop"="supermarket"]', label: 'Supermercato' },
  { re: /pizzeri|pizza/, tag: '["cuisine"~"pizza"]', label: 'Pizzeria' },
  { re: /ristorant|mangiare/, tag: '["amenity"="restaurant"]', label: 'Ristorante' },
  { re: /\bbar\b|caff|colazione/, tag: '["amenity"~"cafe|bar"]', label: 'Bar' },
  { re: /bancomat|atm|prelev/, tag: '["amenity"="atm"]', label: 'Bancomat' },
  { re: /autolavagg/, tag: '["amenity"="car_wash"]', label: 'Autolavaggio' },
  { re: /meccanic|officin|gommist/, tag: '["shop"~"car_repair|tyres"]', label: 'Officina' },
  { re: /bagno|toilette|wc/, tag: '["amenity"="toilets"]', label: 'Bagni' },
];

export function matchCategory(text) {
  return CATEGORIES.find((c) => c.re.test(text)) || null;
}

export async function nearest(cat, near, radius = 6000) {
  const q = `[out:json][timeout:12];nwr${cat.tag}(around:${radius},${near[1]},${near[0]});out center 30;`;
  const j = await getJSON(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 15000);
  const items = (j.elements || []).map((e) => {
    const lon = e.lon ?? e.center?.lon, lat = e.lat ?? e.center?.lat;
    const tg = e.tags || {};
    return { name: tg.name || tg.brand || cat.label, where: [tg['addr:street'], tg['addr:city']].filter(Boolean).join(', '), coord: [lon, lat], d: haversine(near, [lon, lat]) };
  }).filter((x) => Number.isFinite(x.coord[0]));
  items.sort((a, b) => a.d - b.d);
  return items;
}

export async function route(from, to) {
  const url = `${OSRM}${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true&alternatives=false`;
  const j = await getJSON(url, {}, 15000);
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('Nessun percorso trovato');
  const r = j.routes[0];
  const steps = r.legs.flatMap((l) => l.steps);
  return { coords: r.geometry.coordinates, distance: r.distance, duration: r.duration, steps };
}

// ---------- geometria ----------
export function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function bearing(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toR) * Math.cos(b[1] * toR);
  const x = Math.cos(a[1] * toR) * Math.sin(b[1] * toR) - Math.sin(a[1] * toR) * Math.cos(b[1] * toR) * Math.cos((b[0] - a[0]) * toR);
  return (Math.atan2(y, x) / toR + 360) % 360;
}

// ---------- istruzioni in italiano ----------
const DIR = {
  left: 'a sinistra', right: 'a destra', 'slight left': 'leggermente a sinistra', 'slight right': 'leggermente a destra',
  'sharp left': 'tutto a sinistra', 'sharp right': 'tutto a destra', straight: 'dritto', uturn: 'con inversione a U',
};
const ORD = ['', 'prima', 'seconda', 'terza', 'quarta', 'quinta', 'sesta', 'settima', 'ottava'];

export function instruction(step) {
  const m = step.maneuver || {};
  const d = DIR[m.modifier] || '';
  const road = step.name ? ` su ${step.name}` : (step.ref ? ` su ${step.ref}` : '');
  switch (m.type) {
    case 'depart': return `Parti${road || ''}`;
    case 'arrive': return 'Sei arrivato a destinazione';
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return m.exit ? `Alla rotonda prendi la ${ORD[m.exit] || m.exit + 'ª'} uscita${road}` : `Entra nella rotonda${road}`;
    case 'exit roundabout': case 'exit rotary': return `Esci dalla rotonda${road}`;
    case 'merge': return `Immettiti ${d}${road}`.replace('  ', ' ');
    case 'on ramp': return `Prendi la rampa ${d}${road}`;
    case 'off ramp': return `Prendi l'uscita ${d}${road}`;
    case 'fork': return `Al bivio tieni ${d.replace('leggermente ', '')}${road}`;
    case 'end of road': return `In fondo alla strada svolta ${d}${road}`;
    case 'continue': case 'new name':
      return m.modifier && m.modifier !== 'straight' ? `Continua ${d}${road}` : `Prosegui dritto${road}`;
    default:
      if (m.modifier === 'straight') return `Prosegui dritto${road}`;
      if (m.modifier === 'uturn') return `Fai inversione a U${road}`;
      return `Svolta ${d}${road}`;
  }
}

export function iconFor(step) {
  const m = step.maneuver || {};
  if (m.type === 'arrive') return 'arrive';
  if (/roundabout|rotary/.test(m.type)) return 'roundabout';
  const mod = m.modifier || 'straight';
  return { 'slight left': 'slight-left', 'slight right': 'slight-right', 'sharp left': 'left', 'sharp right': 'right' }[mod] || mod.replace(' ', '-');
}

export function fmtDist(m) {
  if (m >= 10000) return { v: Math.round(m / 1000), u: 'km' };
  if (m >= 950) return { v: (m / 1000).toFixed(1).replace('.', ','), u: 'km' };
  if (m >= 100) return { v: Math.round(m / 50) * 50, u: 'm' };
  return { v: Math.max(0, Math.round(m / 10) * 10), u: 'm' };
}
export function speakDist(m) {
  if (m >= 950) { const k = Math.round(m / 100) / 10; return k === 1 ? 'un chilometro' : `${String(k).replace('.', ' virgola ')} chilometri`; }
  return `${Math.round(m / 50) * 50 || 50} metri`;
}
export function fmtDur(s) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
export function speakDur(s) {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return min === 1 ? 'un minuto' : `${min} minuti`;
  const h = Math.floor(min / 60), r = min % 60;
  return `${h === 1 ? "un'ora" : h + ' ore'}${r ? ' e ' + r + ' minuti' : ''}`;
}
export function clock(date) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
