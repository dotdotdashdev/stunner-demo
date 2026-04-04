export type VertexAttribute = {
  /** Byte offset of this attribute within one vertex record. */
  offset: number;
  /** Number of f32 components: 2 | 3 | 4. */
  components: 2 | 3 | 4;
};

/**
 * Interleaved vertex layout — every vertex stores:
 *   position  (vec3 @ offset 0)
 *   normal    (vec3 @ offset 12)
 *   uv        (vec2 @ offset 24)
 *   tangent   (vec4 @ offset 32)  w = handedness (+1/-1)
 *
 * Stride = 48 bytes.
 */
export const VERTEX_STRIDE_BYTES = 48;
export const VERTEX_ATTRIBUTES: Record<string, VertexAttribute> = {
  position: { offset: 0, components: 3 },
  normal: { offset: 12, components: 3 },
  uv: { offset: 24, components: 2 },
  tangent: { offset: 32, components: 4 },
};

export type MeshGeometry = {
  /** Interleaved f32 vertex data. */
  vertices: Float32Array;
  /** Triangle indices (Uint32). */
  indices: Uint32Array;
  vertexCount: number;
  indexCount: number;
};
