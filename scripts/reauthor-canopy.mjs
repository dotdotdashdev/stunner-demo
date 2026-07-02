// Re-author the track GLB: convert the grandstand canopy ROOF to glass.
// The roof is the world-space HIGHEST part of each grandstands_large node
// (the mesh's local axes are rotated, so we must classify in world space).
// The top fraction (roof) moves to a transparent glass material; the rest
// (seats/structure) stays on `garages`. Idempotent: always derives from the
// pristine backup, so the FRACTION can be re-tuned by re-running.
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';

const FRACTION = Number(process.argv[2] ?? 0.5); // canopy = triangles reaching above this fraction of each grandstand's world-height
const SRC = 'public/models/race-track/cartoon_race_track_oval.glb';
const BACKUP = 'public/models/race-track/cartoon_race_track_oval.original.glb';

if (!fs.existsSync(BACKUP)) { fs.copyFileSync(SRC, BACKUP); console.log('backed up ->', BACKUP); }

const io = new NodeIO();
const doc = await io.read(BACKUP);
const root = doc.getRoot();

// The canopy roof reuses the garages texture but is its own OPAQUE material so
// the demo can target it (to fix the shadow/culling noise) without affecting
// the ~300 other garages meshes.
const garages = root.listMaterials().find((m) => m.getName() === 'garages');
const canopy = doc.createMaterial('canopy')
  .setBaseColorFactor(garages ? garages.getBaseColorFactor() : [1, 1, 1, 1])
  .setMetallicFactor(garages ? garages.getMetallicFactor() : 0)
  .setRoughnessFactor(garages ? garages.getRoughnessFactor() : 0.9)
  .setAlphaMode('OPAQUE')
  .setDoubleSided(false);
if (garages?.getBaseColorTexture()) {
  canopy.setBaseColorTexture(garages.getBaseColorTexture());
  const info = garages.getBaseColorTextureInfo();
  if (info) canopy.getBaseColorTextureInfo()?.setTexCoord(info.getTexCoord());
}
const glass = canopy; // roof material (kept variable name below)

// World matrices via scene traversal.
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c=0;c<4;c++) for (let r=0;r<4;r++) for (let k=0;k<4;k++) o[c*4+r]+=a[k*4+r]*b[c*4+k]; return o; };
const worldOf = new Map();
const walk = (n, p) => { const w = mul(p, n.getMatrix()); worldOf.set(n, w); for (const c of n.listChildren()) walk(c, w); };
for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n, [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const worldY = (m, x, y, z) => m[1]*x + m[5]*y + m[9]*z + m[13];

let glassTris = 0, restTris = 0;
const processed = new Set();
for (const node of root.listNodes()) {
  if (!(node.getName() || '').startsWith('grandstands_large')) continue;
  const mesh = node.getMesh(); if (!mesh) continue;
  const w = worldOf.get(node);
  for (const prim of [...mesh.listPrimitives()]) {
    if (prim.getMaterial()?.getName() !== 'garages') continue;
    if (processed.has(prim)) continue; processed.add(prim);
    const pos = prim.getAttribute('POSITION');
    const idxAcc = prim.getIndices();
    const n = pos.getCount();
    const wy = new Float32Array(n);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { const p = pos.getElement(i, [0,0,0]); const y = worldY(w, p[0], p[1], p[2]); wy[i] = y; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    const thr = minY + (maxY - minY) * FRACTION;

    const idx = idxAcc ? idxAcc.getArray() : Uint32Array.from({ length: n }, (_, i) => i);
    const triCount = idx.length / 3;
    const roof = [], rest = [];
    for (let t = 0; t < triCount; t++) {
      const a = idx[t*3], b = idx[t*3+1], c = idx[t*3+2];
      // Whole roof (including its lower eaves) => highest vertex above threshold.
      if (Math.max(wy[a], wy[b], wy[c]) > thr) { roof.push(a,b,c); } else { rest.push(a,b,c); }
    }
    glassTris += roof.length/3; restTris += rest.length/3;
    if (roof.length === 0) { console.log('  (no roof triangles)'); continue; }
    idxAcc.setArray(new Uint32Array(rest));
    const roofPrim = doc.createPrimitive().setMaterial(glass).setMode(prim.getMode());
    for (const sem of prim.listSemantics()) roofPrim.setAttribute(sem, prim.getAttribute(sem));
    roofPrim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(roof)));
    mesh.addPrimitive(roofPrim);
    console.log(`  ${node.getName()}: worldY ${minY.toFixed(1)}..${maxY.toFixed(1)} thr=${thr.toFixed(1)}  glassTris=${roof.length/3} restTris=${rest.length/3}`);
  }
}
console.log(`total: glassTris=${glassTris} restTris=${restTris}`);
await io.write(SRC, doc);
console.log('wrote', SRC);
