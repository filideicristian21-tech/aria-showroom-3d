// Auto: modello GLB con licenza (se presente) oppure sagoma generica procedurale.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

let gltfLoader = null;
export function initLoaders(renderer) {
  const draco = new DRACOLoader().setDecoderPath('lib/three/addons/libs/draco/');
  const ktx2 = new KTX2Loader().setTranscoderPath('lib/three/addons/libs/basis/').detectSupport(renderer);
  gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

export function makePaint(hex = '#e9ebee') {
  return new THREE.MeshPhysicalMaterial({ name: 'paint', color: new THREE.Color(hex), metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
}
export function makeRim(hex = '#c9ccd1') {
  return new THREE.MeshStandardMaterial({ name: 'rim', color: new THREE.Color(hex), metalness: 1, roughness: 0.25 });
}
const M = () => ({
  glass: new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x0a0d12, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
  trim: new THREE.MeshStandardMaterial({ name: 'trim', color: 0x0c0d10, metalness: 0.3, roughness: 0.55 }),
  tyre: new THREE.MeshStandardMaterial({ name: 'tyre', color: 0x101113, metalness: 0, roughness: 0.85 }),
  disc: new THREE.MeshStandardMaterial({ name: 'disc', color: 0x5a5d62, metalness: 0.9, roughness: 0.4 }),
  head: new THREE.MeshStandardMaterial({ name: 'headlight', color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 3.2 }),
  tail: new THREE.MeshStandardMaterial({ name: 'taillight', color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 2.4 }),
});

// Profili laterali generici (metri). x avanti, y su. Non riproducono un modello reale.
const PROFILES = {
  sedan:    { L: 4.72, W: 1.85, wb: 2.88, wr: 0.34, clear: 0.16, belt: 0.95, roof: 1.42, hoodF: 0.66, deck: 1.00, wsBase: 1.02, roofF: 0.12, roofR: -0.72, tailX: -1.92, fast: true },
  liftback: { L: 4.97, W: 1.96, wb: 2.96, wr: 0.35, clear: 0.15, belt: 0.95, roof: 1.43, hoodF: 0.66, deck: 0.99, wsBase: 1.06, roofF: 0.08, roofR: -0.85, tailX: -2.18, fast: true },
  suv:      { L: 4.79, W: 1.92, wb: 2.89, wr: 0.37, clear: 0.20, belt: 1.05, roof: 1.62, hoodF: 0.80, deck: 1.12, wsBase: 1.00, roofF: 0.20, roofR: -1.30, tailX: -2.20, fast: false },
};

function bodyShape(p) {
  const h = p.L / 2, ax = p.wb / 2, r = p.wr + 0.06, y0 = p.clear + 0.12;
  const s = new THREE.Shape();
  s.moveTo(-h + 0.08, y0);
  s.lineTo(-ax - r, y0); s.absarc(-ax, y0, r, Math.PI, 0, true);
  s.lineTo(ax - r, y0); s.absarc(ax, y0, r, Math.PI, 0, true);
  s.lineTo(h - 0.12, y0);
  s.quadraticCurveTo(h + 0.04, y0 + 0.04, h, y0 + 0.24);
  s.quadraticCurveTo(h - 0.02, p.hoodF - 0.02, h - 0.22, p.hoodF);
  s.quadraticCurveTo(p.wsBase + 0.5, p.belt - 0.02, p.wsBase, p.belt);
  s.lineTo(p.tailX - 0.05, p.deck - 0.02);
  s.quadraticCurveTo(-h + 0.08, p.deck + 0.02, -h, p.deck - 0.12);
  s.quadraticCurveTo(-h - 0.04, y0 + 0.3, -h + 0.08, y0);
  return s;
}
function cabinShape(p) {
  const s = new THREE.Shape();
  s.moveTo(p.wsBase + 0.02, p.belt - 0.04);
  s.quadraticCurveTo(p.roofF + 0.45, p.roof - 0.08, p.roofF, p.roof);
  s.quadraticCurveTo((p.roofF + p.roofR) / 2, p.roof + 0.03, p.roofR, p.roof - 0.01);
  if (p.fast) s.quadraticCurveTo(p.tailX + 0.45, p.roof - 0.12, p.tailX, p.deck - 0.02);
  else { s.lineTo(p.tailX + 0.1, p.roof - 0.06); s.quadraticCurveTo(p.tailX - 0.05, p.roof - 0.1, p.tailX - 0.02, p.deck - 0.02); }
  s.lineTo(p.wsBase + 0.02, p.belt - 0.04);
  return s;
}
function extrude(shape, width, bevel, mat, segs = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: segs, curveSegments: 28 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function wheel(p, mats, rimMat) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(p.wr - 0.09, 0.095, 18, 48), mats.tyre);
  tyre.scale.z = 1.25; g.add(tyre);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(p.wr - 0.17, p.wr - 0.17, 0.05, 32), mats.disc);
  disc.rotation.x = Math.PI / 2; disc.position.z = -0.03; g.add(disc);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 20), rimMat);
  hub.rotation.x = Math.PI / 2; hub.position.z = 0.07; g.add(hub);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(p.wr - 0.12, 0.018, 8, 48), rimMat); lip.position.z = 0.07; g.add(lip);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, p.wr - 0.15, 0.03), rimMat);
    sp.geometry.translate(0, (p.wr - 0.15) / 2, 0); sp.rotation.z = (i / 5) * Math.PI * 2; sp.position.z = 0.065; g.add(sp);
  }
  return g;
}

// Pick-up a cuneo generico (sagoma spigolosa, non il modello reale).
function buildTruck(paint, rim) {
  const L = 5.68, W = 2.0, h = L / 2, ax = 1.905, wr = 0.43, y0 = 0.42, peakX = 0.35, peakY = 1.79, noseY = 1.02, tailY = 1.15;
  const mats = M();
  const car = new THREE.Group(); car.name = 'car-procedural-truck';
  const s = new THREE.Shape();
  s.moveTo(h - 0.22, y0);
  for (const c of [ax, -ax]) { s.lineTo(c + 0.64, y0); s.lineTo(c + 0.44, y0 + 0.52); s.lineTo(c - 0.44, y0 + 0.52); s.lineTo(c - 0.64, y0); }
  s.lineTo(-h + 0.05, y0 + 0.04); s.lineTo(-h, y0 + 0.2); s.lineTo(-h, tailY); s.lineTo(peakX, peakY); s.lineTo(h, noseY); s.lineTo(h, noseY - 0.2); s.lineTo(h - 0.22, y0);
  const body = extrude(s, W, 0.03, paint, 1); body.name = 'body'; car.add(body);
  const yTop = x => x > peakX ? peakY - (peakY - noseY) * (x - peakX) / (h - peakX) : peakY - (peakY - tailY) * (peakX - x) / (peakX + h);
  // finestrini laterali (piani sottili) e parabrezza sul piano del cofano
  const win = new THREE.Shape(); win.moveTo(1.5, 1.16); win.lineTo(peakX + 0.05, yTop(peakX) - 0.13); win.lineTo(-1.25, yTop(-1.25) - 0.1); win.lineTo(-1.25, 1.16); win.lineTo(1.5, 1.16);
  for (const sz of [1, -1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(win), mats.glass); m.position.z = sz * (W / 2 + 0.006); if (sz < 0) { m.rotation.y = Math.PI; m.scale.x = -1; } car.add(m); }
  const wz = W / 2 - 0.16, x1 = peakX + 0.08, x2 = 1.75, e = 0.012;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x1, yTop(x1) + e, -wz, x2, yTop(x2) + e, -wz, x2, yTop(x2) + e, wz, x1, yTop(x1) + e, wz], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
  const ws = new THREE.Mesh(g, mats.glass); ws.name = 'glass'; car.add(ws);
  // barre luminose piene larghezza, davanti e dietro
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, W * 0.96), mats.head); hl.position.set(h + 0.005, noseY - 0.02, 0); car.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, W * 0.96), mats.tail); tl.position.set(-h - 0.005, tailY - 0.04, 0); car.add(tl);
  // rivestimento scuro passaruota e sottoporta
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2 * ax - 1.3, 0.12, W + 0.01), mats.trim); sill.position.set(0, y0 + 0.06, 0); car.add(sill);
  const p = { wr };
  const wheels = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const w = wheel(p, mats, rim); w.scale.setScalar(1.0); w.position.set(sx * ax, wr, sz * (W / 2 - 0.15));
    if (sz < 0) w.rotation.y = Math.PI; car.add(w); wheels.push(w);
  }
  car.userData = { procedural: true, length: L, width: W, height: peakY, wheels, paintMats: [paint], rimMats: [rim] };
  return car;
}

export function buildProcedural(kind, paint, rim) {
  if (kind === 'truck') return buildTruck(paint, rim);
  const p = PROFILES[kind] || PROFILES.sedan;
  const mats = M();
  const car = new THREE.Group(); car.name = 'car-procedural';
  const body = extrude(bodyShape(p), p.W, 0.16, paint, 8); body.name = 'body'; car.add(body);
  const cab = extrude(cabinShape(p), p.W * 0.84, 0.14, mats.glass, 8); cab.name = 'glass'; car.add(cab);
  // pannello sottoporta e diffusore
  const sill = new THREE.Mesh(new THREE.BoxGeometry(p.wb - 0.9, 0.09, p.W - 0.02), mats.trim); sill.position.set(0, p.clear + 0.14, 0); car.add(sill);
  // fari: barra sottile anteriore e posteriore (generica)
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, p.W * 0.78), mats.head); hl.position.set(p.L / 2 - 0.1, p.hoodF - 0.08, 0); hl.rotation.z = -0.5; car.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, p.W * 0.9), mats.tail); tl.position.set(-p.L / 2 + 0.02, p.deck - 0.16, 0); car.add(tl);
  const wheels = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const w = wheel(p, mats, rim); w.position.set(sx * p.wb / 2, p.wr, sz * (p.W / 2 - 0.13));
    if (sz < 0) w.rotation.y = Math.PI; car.add(w); wheels.push(w);
  }
  car.userData = { procedural: true, length: p.L, width: p.W, height: p.roof, wheels, paintMats: [paint], rimMats: [rim] };
  car.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return car;
}

// Carica un GLB, lo normalizza (lunghezza, centro, a terra) e trova vernice e cerchi.
export function loadGLB(def, paint, rim, onProgress) {
  return new Promise((res, rej) => {
    gltfLoader.load(def.glb, gltf => {
      const root = gltf.scene; root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
      const wrap = new THREE.Group(); wrap.name = 'car-glb';
      if (size.z > size.x) root.rotation.y = Math.PI / 2 * (def.flip ? -1 : 1);
      if (def.rotY) root.rotation.y += def.rotY;
      wrap.add(root); root.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(root), s2 = b2.getSize(new THREE.Vector3()), c2 = b2.getCenter(new THREE.Vector3());
      const k = (def.lengthM || 4.75) / s2.x; root.scale.multiplyScalar(k);
      root.position.set(-c2.x * k, -b2.min.y * k, -c2.z * k);
      const paintMats = [], rimMats = [], areas = new Map();
      const reP = def.paintRe ? new RegExp(def.paintRe, 'i') : /paint|body|carpaint|car_paint|exterior|coat|vernice|carroz/i;
      const reR = def.rimRe ? new RegExp(def.rimRe, 'i') : /rim|alloy|cerch|wheel(?!.*(tyre|tire|rubber))/i;
      const reG = def.glassRe ? new RegExp(def.glassRe, 'i') : /glass|vetr|window/i;
      const reH = def.headRe ? new RegExp(def.headRe, 'i') : null, reT = def.tailRe ? new RegExp(def.tailRe, 'i') : null;
      const reHide = def.hideRe ? new RegExp(def.hideRe, 'i') : null;
      const glass = new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x07090c, metalness: 0, roughness: 0.03, transmission: 0.2, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide });
      const head = new THREE.MeshStandardMaterial({ name: 'headlight', color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.6 });
      const tail = new THREE.MeshPhysicalMaterial({ name: 'taillight', color: 0x3a0004, emissive: 0xc0000c, emissiveIntensity: 1.4, roughness: 0.15, clearcoat: 1 });
      const hidden = [];
      // frontX: segno dell'asse x (coordinate originali del file) dove sta il muso. Serve a non colorare di rosso i fari anteriori.
      const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert(), tmpB = new THREE.Box3(), tmpC = new THREE.Vector3();
      const isFront = o => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmpB.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld)); return Math.sign(tmpB.getCenter(tmpC).x) === Math.sign(def.frontX); };
      root.traverse(o => {
        if (!o.isMesh) return;
        if (reHide && reHide.test(o.name)) { hidden.push(o); return; }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m, i) => {
          const mn = m.name || '', byNode = !def.matOnly;
          if (reP.test(mn) || (byNode && reP.test(o.name))) setM(o, i, paint);
          else if (reR.test(mn)) setM(o, i, rim);
          else if (reH && reH.test(mn)) setM(o, i, head);
          else if (reT && reT.test(mn)) setM(o, i, def.frontX && isFront(o) ? head : tail);
          else if (reG.test(mn)) setM(o, i, glass);
          else { if (m.map) m.map.anisotropy = 4; if (m.isMeshStandardMaterial) m.envMapIntensity = 1.2; }
        });
      });
      hidden.forEach(o => o.parent && o.parent.remove(o));
      paintMats.push(paint); rimMats.push(rim);
      wrap.userData = { procedural: false, length: def.lengthM || 4.75, width: s2.z * k, height: s2.y * k, wheels: [], paintMats, rimMats };
      res(wrap);
    }, e => onProgress && e.total && onProgress(e.loaded / e.total), rej);
  });
  function setM(o, i, m) { if (Array.isArray(o.material)) o.material[i] = m; else o.material = m; }
}

// Punti sulla superficie dell'auto (coordinate locali del gruppo) per la dissolvenza a particelle.
export function samplePoints(car, n) {
  car.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const meshes = []; let tot = 0;
  car.traverse(o => { if (o.isMesh && o.geometry.attributes.position) { const a = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; const w = Math.sqrt(a); meshes.push([o, w]); tot += w; } });
  const out = new Float32Array(n * 3), v = new THREE.Vector3(), m = new THREE.Matrix4();
  let k = 0;
  for (const [o, w] of meshes) {
    const cnt = Math.round(n * w / tot); if (!cnt) continue;
    let s; try { s = new MeshSurfaceSampler(o).build(); } catch (e) { continue; } m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < cnt && k < n; i++) { s.sample(v); v.applyMatrix4(m); if (!Number.isFinite(v.x + v.y + v.z)) continue; out.set([v.x, v.y, v.z], k * 3); k++; }
  }
  for (; k < n; k++) out.set(out.subarray(((k * 7) % Math.max(1, k)) * 3, ((k * 7) % Math.max(1, k)) * 3 + 3), k * 3);
  return out;
}
