export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** PBR material definition. */
export type PbrMaterial = {
  /** Display name, used for debugging. */
  name: string;

  // ── Base color ──────────────────────────────────────────────────────────────
  /** Linear-space RGBA base color (albedo). Alpha drives transparency. */
  baseColor: Vec4;

  // ── PBR scalars ─────────────────────────────────────────────────────────────
  /** 0 = dielectric, 1 = metal. */
  metalness: number;
  /** 0 = perfectly smooth, 1 = fully rough. */
  roughness: number;

  // ── Emissive ─────────────────────────────────────────────────────────────────
  /**
   * Linear-space RGB emissive color. Values > 1 are intentional (HDR).
   * High emissive contributes to bloom.
   */
  emissive: Vec3;
  /** Multiplier applied on top of the emissive color. */
  emissiveIntensity: number;

  // ── Geometry flags ───────────────────────────────────────────────────────────
  /** Render back-faces in addition to front-faces. */
  twoSided: boolean;
  /**
   * When true the fragment is blended using premultiplied-alpha.
   * baseColor.a drives opacity; 1 = fully opaque.
   */
  transparent: boolean;

  // ── Texture slots ────────────────────────────────────────────────────────────
  /**
   * Path or URL for each texture slot. Absent slots use defaults.
   * All textures are expected sRGB unless noted below.
   */
  textures: {
    /** sRGB albedo/opacity texture. Multiplied with baseColor. */
    baseColor?: string;
    /**
     * Linear ORM texture:
     *   R = occlusion, G = roughness, B = metalness.
     */
    orm?: string;
    /** Tangent-space normal map (linear). */
    normal?: string;
    /** sRGB emissive texture. Multiplied with emissive * emissiveIntensity. */
    emissive?: string;
  };
};

export const createDefaultMaterial = (overrides: Partial<PbrMaterial> = {}): PbrMaterial => {
  return {
    name: 'default',
    baseColor: [0.8, 0.8, 0.8, 1],
    metalness: 0,
    roughness: 0.5,
    emissive: [0, 0, 0],
    emissiveIntensity: 1,
    twoSided: false,
    transparent: false,
    textures: {},
    ...overrides,
  };
};
