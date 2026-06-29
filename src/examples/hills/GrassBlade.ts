import type { MeshGeometry } from '@dotdotdash/stunner-core/renderer/mesh/MeshTypes';
import { VERTEX_STRIDE_BYTES } from '@dotdotdash/stunner-core/renderer/mesh/MeshTypes';

const F32_PER_VERTEX = VERTEX_STRIDE_BYTES / 4;

export type GrassBladeOptions = {
  /** Total blade height along +Y in local space. Defaults to `1`. */
  height?: number;
  /** Maximum blade width along ±X in local space. Defaults to `0.08`. */
  baseWidth?: number;
  /**
   * Number of vertical quads. Each quad becomes two triangles. Defaults to
   * `4` — enough resolution for the mesh to bend smoothly when a future
   * vertex-stage wind shader displaces vertices by their normalised height.
   * The top quad collapses to a point at the tip.
   */
  segments?: number;
};

/**
 * Build the geometry for a single grass blade: a thin vertical strip of
 * stacked quads that starts narrow at the base, broadens slightly above the
 * base, and tapers to a point at the tip.
 *
 * The blade lies in the local XY plane (width along ±X, height along +Y)
 * with normals facing +Z. UVs map u = 0/1 across the width and v = 0..1
 * from base to tip — useful if a future material wants to gradient-shade by
 * height. Tangent is `(1, 0, 0, 1)` so any normal mapping behaves sanely.
 *
 * The intended use is instanced rendering with a `twoSided` material so
 * each blade is visible from both sides, with per-instance transforms
 * positioning, scaling, rotating, and tilting the blades across a terrain.
 */
export const createGrassBladeGeometry = (
  options: GrassBladeOptions = {},
): MeshGeometry => {
  const height = options.height ?? 1;
  const baseWidth = options.baseWidth ?? 0.08;
  const segments = Math.max(2, options.segments ?? 4);

  const vertexCount = (segments + 1) * 2;
  const indexCount = segments * 6;
  const vertices = new Float32Array(vertexCount * F32_PER_VERTEX);
  const indices = new Uint32Array(indexCount);

  // Width profile: narrow at the base, widest just above the base, tapering
  // to zero at the tip. (1 - t^2) gives the overall taper; the (0.6 + 0.4 *
  // sin(πt)) factor adds a subtle bell so the base isn't the widest point.
  const widthAt = (t: number): number => {
    const taper = 1 - t * t;
    const bell = 0.6 + 0.4 * Math.sin(Math.PI * t);
    return baseWidth * taper * bell;
  };

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const y = t * height;
    const halfWidth = i === segments ? 0 : widthAt(t) * 0.5;
    const baseIndex = i * 2;
    writeVertex(vertices, baseIndex + 0, -halfWidth, y, 0, 0, 0, 1, 0, t, 1, 0, 0, 1);
    writeVertex(vertices, baseIndex + 1, +halfWidth, y, 0, 0, 0, 1, 1, t, 1, 0, 0, 1);
  }

  let ii = 0;
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2; // left bottom
    const b = a + 1; // right bottom
    const c = a + 2; // left top
    const d = a + 3; // right top
    indices[ii++] = a; indices[ii++] = b; indices[ii++] = c;
    indices[ii++] = b; indices[ii++] = d; indices[ii++] = c;
  }

  return { vertices, indices, vertexCount, indexCount };
};

const writeVertex = (
  out: Float32Array,
  index: number,
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  u: number, v: number,
  tx: number, ty: number, tz: number, tw: number,
): void => {
  const base = index * F32_PER_VERTEX;
  out[base + 0] = px; out[base + 1] = py; out[base + 2] = pz;
  out[base + 3] = nx; out[base + 4] = ny; out[base + 5] = nz;
  out[base + 6] = u;  out[base + 7] = v;
  out[base + 8] = tx; out[base + 9] = ty; out[base + 10] = tz; out[base + 11] = tw;
};
