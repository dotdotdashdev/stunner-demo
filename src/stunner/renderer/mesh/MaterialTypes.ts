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
  metallic: number;
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
  /**
   * Strength of screen-space refraction applied to transparent surfaces.
   * 0 disables refraction, 1 is full effect.
   */
  refractionStrength: number;

  /** Controls whether this mesh contributes to shadow casting. */
  castsShadows: boolean;
  /** Controls whether this mesh receives shadow darkening. */
  receivesShadows: boolean;

  // ── Texture slots ────────────────────────────────────────────────────────────
  /**
   * UV transform for texture sampling.
   *
   * Layout: [scaleU, scaleV, offsetU, offsetV].
   * Default [1, 1, 0, 0] samples the full texture range.
   */
  uvScaleOffset: Vec4;

  /**
   * Path or URL for each texture slot. Absent slots use defaults.
   * All textures are expected sRGB unless noted below.
   */
  textures: {
    /** sRGB albedo/opacity texture. Multiplied with baseColor. */
    baseColor?: string;
    /**
     * Linear ORM texture:
     *   R = occlusion, G = roughness, B = metallic.
     */
    orm?: string;
    /** Tangent-space normal map (linear). */
    normal?: string;
    /** sRGB emissive texture. Multiplied with emissive * emissiveIntensity. */
    emissive?: string;
  };

  /**
   * Optional texture IDs resolved through a scene-level texture library.
   *
   * These decouple material definitions from concrete texture URLs.
   */
  textureIds?: {
    baseColor?: string;
    orm?: string;
    normal?: string;
    emissive?: string;
  };

  /**
   * Optional texture-array IDs resolved through scene-level texture-array library.
   */
  textureArrayIds?: {
    baseColor?: string;
  };

  /**
   * Optional per-slot texture array layer selection.
   */
  textureArrayLayers?: {
    baseColor?: number;
  };
};

export const createDefaultMaterial = (overrides: Partial<PbrMaterial> = {}): PbrMaterial => {
  return {
    name: 'default',
    baseColor: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    emissive: [0, 0, 0],
    emissiveIntensity: 1,
    twoSided: false,
    transparent: false,
    refractionStrength: 1,
    castsShadows: true,
    receivesShadows: true,
    uvScaleOffset: [1, 1, 0, 0],
    textures: {},
    ...overrides,
  };
};
