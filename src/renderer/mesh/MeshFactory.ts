import type { MeshGeometry } from './MeshTypes';
import { VERTEX_STRIDE_BYTES } from './MeshTypes';

// ── Utility functions ─────────────────────────────────────────────────────────

const F32_PER_VERTEX = VERTEX_STRIDE_BYTES / 4; // 12

/** Write one vertex into a Float32Array at the given vertex index. */
const writeVertex = (
  out: Float32Array,
  index: number,
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
  tx: number,
  ty: number,
  tz: number,
  tw: number,
): void => {
  const base = index * F32_PER_VERTEX;
  out[base + 0] = px;
  out[base + 1] = py;
  out[base + 2] = pz;
  out[base + 3] = nx;
  out[base + 4] = ny;
  out[base + 5] = nz;
  out[base + 6] = u;
  out[base + 7] = v;
  out[base + 8] = tx;
  out[base + 9] = ty;
  out[base + 10] = tz;
  out[base + 11] = tw;
};

/** Compute a face tangent from edge vectors and UV deltas, returned as [tx,ty,tz,tw]. */
export const computeTangent = (
  e1x: number, e1y: number, e1z: number,
  e2x: number, e2y: number, e2z: number,
  du1: number, dv1: number,
  du2: number, dv2: number,
  nx: number, ny: number, nz: number,
): [number, number, number, number] => {
  const det = du1 * dv2 - du2 * dv1;
  const r = det !== 0 ? 1 / det : 0;
  let tx = (dv2 * e1x - dv1 * e2x) * r;
  let ty = (dv2 * e1y - dv1 * e2y) * r;
  let tz = (dv2 * e1z - dv1 * e2z) * r;
  // Gram–Schmidt orthogonalize
  const dot = tx * nx + ty * ny + tz * nz;
  tx -= dot * nx;
  ty -= dot * ny;
  tz -= dot * nz;
  const len = Math.hypot(tx, ty, tz) || 1;
  tx /= len; ty /= len; tz /= len;
  // Handedness: cross(n, t) should align with bitangent
  const btx = ny * tz - nz * ty;
  const bty = nz * tx - nx * tz;
  const btz = nx * ty - ny * tx;
  const bx = (dv2 * e2x - dv1 * e1x) * r;
  const by = (dv2 * e2y - dv1 * e1y) * r;
  const bz = (dv2 * e2z - dv1 * e1z) * r;
  const w = (btx * bx + bty * by + btz * bz) < 0 ? -1 : 1;
  return [tx, ty, tz, w];
};

// ── Sphere ────────────────────────────────────────────────────────────────────

export type SphereOptions = {
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
};

/**
 * UV-sphere with configurable radial and stack segment counts.
 * Poles are stitched cleanly with deduplicated apex vertices.
 */
export const createSphere = (options: SphereOptions = {}): MeshGeometry => {
  const radius = options.radius ?? 1;
  const widthSegments = Math.max(3, options.widthSegments ?? 32);
  const heightSegments = Math.max(2, options.heightSegments ?? 16);

  const vertexCount = (widthSegments + 1) * (heightSegments + 1);
  const indexCount = widthSegments * heightSegments * 6;

  const vertices = new Float32Array(vertexCount * F32_PER_VERTEX);
  const indices = new Uint32Array(indexCount);

  let vi = 0;
  for (let stack = 0; stack <= heightSegments; stack++) {
    const phi = (stack / heightSegments) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const v = stack / heightSegments;

    for (let slice = 0; slice <= widthSegments; slice++) {
      const theta = (slice / widthSegments) * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const nx = sinPhi * cosTheta;
      const ny = cosPhi;
      const nz = sinPhi * sinTheta;

      const u = slice / widthSegments;
      // Tangent along +theta direction
      const tx = -sinTheta;
      const tz = cosTheta;
      writeVertex(vertices, vi++,
        nx * radius, ny * radius, nz * radius,
        nx, ny, nz,
        u, v,
        tx, 0, tz, 1,
      );
    }
  }

  let ii = 0;
  for (let stack = 0; stack < heightSegments; stack++) {
    for (let slice = 0; slice < widthSegments; slice++) {
      const a = stack * (widthSegments + 1) + slice;
      const b = a + (widthSegments + 1);
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = a + 1;
      indices[ii++] = b; indices[ii++] = b + 1; indices[ii++] = a + 1;
    }
  }

  return { vertices, indices, vertexCount, indexCount };
};

// ── Box ───────────────────────────────────────────────────────────────────────

export type BoxOptions = {
  width?: number;
  height?: number;
  depth?: number;
  widthSegments?: number;
  heightSegments?: number;
  depthSegments?: number;
};

type FaceSpec = {
  normal: [number, number, number];
  tangent: [number, number, number];
  bitangent: [number, number, number];
  size: [number, number];
  segments: [number, number];
  offset: [number, number, number];
};

/** Axis-aligned box with per-axis segment control and clean UV mapping per face. */
export const createBox = (options: BoxOptions = {}): MeshGeometry => {
  const w = options.width ?? 1;
  const h = options.height ?? 1;
  const d = options.depth ?? 1;
  const ws = Math.max(1, options.widthSegments ?? 1);
  const hs = Math.max(1, options.heightSegments ?? 1);
  const ds = Math.max(1, options.depthSegments ?? 1);

  const faces: FaceSpec[] = [
    // +X
    { normal: [1, 0, 0], tangent: [0, 0, -1], bitangent: [0, 1, 0], size: [d, h], segments: [ds, hs], offset: [w / 2, 0, 0] },
    // -X
    { normal: [-1, 0, 0], tangent: [0, 0, 1], bitangent: [0, 1, 0], size: [d, h], segments: [ds, hs], offset: [-w / 2, 0, 0] },
    // +Y
    { normal: [0, 1, 0], tangent: [1, 0, 0], bitangent: [0, 0, 1], size: [w, d], segments: [ws, ds], offset: [0, h / 2, 0] },
    // -Y
    { normal: [0, -1, 0], tangent: [1, 0, 0], bitangent: [0, 0, -1], size: [w, d], segments: [ws, ds], offset: [0, -h / 2, 0] },
    // +Z
    { normal: [0, 0, 1], tangent: [1, 0, 0], bitangent: [0, 1, 0], size: [w, h], segments: [ws, hs], offset: [0, 0, d / 2] },
    // -Z
    { normal: [0, 0, -1], tangent: [-1, 0, 0], bitangent: [0, 1, 0], size: [w, h], segments: [ws, hs], offset: [0, 0, -d / 2] },
  ];

  const totalVerts = faces.reduce((acc, f) => acc + (f.segments[0] + 1) * (f.segments[1] + 1), 0);
  const totalIndices = faces.reduce((acc, f) => acc + f.segments[0] * f.segments[1] * 6, 0);

  const vertices = new Float32Array(totalVerts * F32_PER_VERTEX);
  const indices = new Uint32Array(totalIndices);
  let vi = 0;
  let ii = 0;
  let baseIndex = 0;

  for (const face of faces) {
    const [nx, ny, nz] = face.normal;
    const [tx, ty, tz] = face.tangent;
    const [bx, by, bz] = face.bitangent;
    const [sw, sh] = face.size;
    const [segsU, segsV] = face.segments;
    const [ox, oy, oz] = face.offset;

    for (let j = 0; j <= segsV; j++) {
      for (let i = 0; i <= segsU; i++) {
        const s = i / segsU - 0.5;
        const t = j / segsV - 0.5;
        const px = ox + s * sw * tx + t * sh * bx;
        const py = oy + s * sw * ty + t * sh * by;
        const pz = oz + s * sw * tz + t * sh * bz;
        writeVertex(vertices, vi++, px, py, pz, nx, ny, nz, i / segsU, j / segsV, tx, ty, tz, 1);
      }
    }

    for (let j = 0; j < segsV; j++) {
      for (let i = 0; i < segsU; i++) {
        const a = baseIndex + j * (segsU + 1) + i;
        const b = a + (segsU + 1);
        indices[ii++] = a; indices[ii++] = b; indices[ii++] = a + 1;
        indices[ii++] = b; indices[ii++] = b + 1; indices[ii++] = a + 1;
      }
    }
    baseIndex += (segsU + 1) * (segsV + 1);
  }

  return { vertices, indices, vertexCount: totalVerts, indexCount: totalIndices };
};

// ── Plane ─────────────────────────────────────────────────────────────────────

export type PlaneOptions = {
  width?: number;
  depth?: number;
  widthSegments?: number;
  depthSegments?: number;
};

/** Horizontal plane (XZ) centred at origin, facing +Y. */
export const createPlane = (options: PlaneOptions = {}): MeshGeometry => {
  const w = options.width ?? 1;
  const d = options.depth ?? 1;
  const ws = Math.max(1, options.widthSegments ?? 1);
  const ds = Math.max(1, options.depthSegments ?? 1);

  const vertexCount = (ws + 1) * (ds + 1);
  const indexCount = ws * ds * 6;
  const vertices = new Float32Array(vertexCount * F32_PER_VERTEX);
  const indices = new Uint32Array(indexCount);

  let vi = 0;
  for (let j = 0; j <= ds; j++) {
    for (let i = 0; i <= ws; i++) {
      const px = (i / ws - 0.5) * w;
      const pz = (j / ds - 0.5) * d;
      writeVertex(vertices, vi++, px, 0, pz, 0, 1, 0, i / ws, j / ds, 1, 0, 0, 1);
    }
  }

  let ii = 0;
  for (let j = 0; j < ds; j++) {
    for (let i = 0; i < ws; i++) {
      const a = j * (ws + 1) + i;
      const b = a + (ws + 1);
      indices[ii++] = a; indices[ii++] = b; indices[ii++] = a + 1;
      indices[ii++] = b; indices[ii++] = b + 1; indices[ii++] = a + 1;
    }
  }

  return { vertices, indices, vertexCount, indexCount };
};

// ── Cylinder / Cone ───────────────────────────────────────────────────────────

export type CylinderOptions = {
  /** Radius of the top cap. Set to 0 for a cone (pointed top). Default 1. */
  topRadius?: number;
  /** Radius of the bottom cap. Default 1. */
  bottomRadius?: number;
  height?: number;
  /** Number of sides around the circumference. */
  radialSegments?: number;
  /** Number of segments along the height axis. */
  heightSegments?: number;
  openEnded?: boolean;
};

/**
 * Cylinder with independent top/bottom cap radii.
 * Setting topRadius = 0 produces a cone.
 * Setting openEnded = true omits the caps.
 */
export const createCylinder = (options: CylinderOptions = {}): MeshGeometry => {
  const topR = options.topRadius ?? 1;
  const botR = options.bottomRadius ?? 1;
  const height = options.height ?? 2;
  const radSeg = Math.max(3, options.radialSegments ?? 32);
  const hSeg = Math.max(1, options.heightSegments ?? 1);
  const openEnded = options.openEnded ?? false;

  const capTopVerts = openEnded || topR === 0 ? 0 : radSeg + 1;
  const capBotVerts = openEnded ? 0 : radSeg + 1;
  const sideVerts = (radSeg + 1) * (hSeg + 1);
  const totalVerts = sideVerts + capTopVerts + capBotVerts;

  const capTopTris = openEnded || topR === 0 ? 0 : radSeg;
  const capBotTris = openEnded ? 0 : radSeg;
  const sideTris = radSeg * hSeg * 2;
  const totalIndices = (sideTris + capTopTris + capBotTris) * 3;

  const vertices = new Float32Array(totalVerts * F32_PER_VERTEX);
  const indices = new Uint32Array(totalIndices);
  let vi = 0;
  let ii = 0;

  // Side wall
  const halfH = height / 2;
  const slope = (botR - topR) / height;

  for (let s = 0; s <= hSeg; s++) {
    const t = s / hSeg;
    const y = halfH - t * height;
    const radius = topR + (botR - topR) * t;
    for (let r = 0; r <= radSeg; r++) {
      const theta = (r / radSeg) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const nx = cosT;
      const nz = sinT;
      // Correct outward normal accounts for the taper slope
      const nLen = Math.hypot(1, slope);
      writeVertex(vertices, vi++,
        radius * cosT, y, radius * sinT,
        nx / nLen, slope / nLen, nz / nLen,
        r / radSeg, t,
        -sinT, 0, cosT, 1,
      );
    }
  }

  let baseIndex = 0;
  for (let s = 0; s < hSeg; s++) {
    for (let r = 0; r < radSeg; r++) {
      const a = baseIndex + s * (radSeg + 1) + r;
      const b = a + (radSeg + 1);
      indices[ii++] = a; indices[ii++] = a + 1; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = a + 1; indices[ii++] = b + 1;
    }
  }
  baseIndex += (radSeg + 1) * (hSeg + 1);

  // Caps
  const writeCap = (yPos: number, radius: number, normalY: number): void => {
    if (radius === 0) return;
    // Centre vertex
    writeVertex(vertices, vi++, 0, yPos, 0, 0, normalY, 0, 0.5, 0.5, 1, 0, 0, 1);
    const centreIndex = baseIndex;
    vi--; vi++;
    const centre = baseIndex;
    baseIndex++;

    for (let r = 0; r < radSeg; r++) {
      const theta = (r / radSeg) * Math.PI * 2;
      writeVertex(vertices, vi++,
        radius * Math.cos(theta), yPos, radius * Math.sin(theta),
        0, normalY, 0,
        0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta),
        1, 0, 0, 1,
      );
    }

    for (let r = 0; r < radSeg; r++) {
      const curr = baseIndex + r + 1;
      const next = baseIndex + ((r + 1) % radSeg) + 1;
      if (normalY > 0) {
        indices[ii++] = centre; indices[ii++] = curr; indices[ii++] = next;
      } else {
        indices[ii++] = centre; indices[ii++] = next; indices[ii++] = curr;
      }
    }
    baseIndex += radSeg;
    void centreIndex;
  };

  if (!openEnded) {
    writeCap(halfH, topR, 1);
    writeCap(-halfH, botR, -1);
  }

  return { vertices, indices, vertexCount: totalVerts, indexCount: totalIndices };
};
