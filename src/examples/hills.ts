// Hills example: a single subdivided heightmapped plane with a tiled dirt
// material, scattered with thousands of CPU-instanced grass blades whose
// per-instance transforms tilt in response to a sampled wind field.

import type { RenderScene, SceneInstancedMesh, Mat4 } from '@stunner/core/renderer/mesh/SceneTypes';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationY,
  mat4Scale,
  mat4Translation,
} from '@stunner/core/renderer/mesh/SceneTypes';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createSkySphere } from '@stunner/core/sky';
import {
  createGrassBladeGeometry,
  createTerrain,
  createWindField,
  type TerrainResult,
  type WindField,
} from '@stunner/core/terrain';

export type HillsExampleOptions = Record<string, never>;

export const DEFAULT_HILLS_OPTIONS: HillsExampleOptions = {};

export type HillsExampleController = {
  setOptions: (_options: HillsExampleOptions) => void;
  /**
   * Per-frame wind update. Recomputes grass instance transforms from the
   * wind field and re-applies the scene so the engine re-uploads the new
   * matrices on its next draw.
   */
  beforeFrame: (deltaSeconds: number) => void;
  dispose: () => void;
};

const HEIGHTMAP_URL = '/images/heightmap.jpg';
const DIRT_TEXTURE_URL = '/images/dirt.jpg';
const SKY_TEXTURE_URL = '/images/sky-1.png';
const SKY_TEXTURE_ID = 'demo:sky:sky-1';
const SKY_RADIUS = 400;

const TERRAIN_WIDTH = 100;
const TERRAIN_DEPTH = 100;
const TERRAIN_SEGMENTS = 256;
const TERRAIN_HEIGHT_SCALE = 12;
// Tile the dirt roughly once every ~4 metres so the surface reads as ground
// rather than printed.
const DIRT_TILES = TERRAIN_WIDTH / 4;

// Grass scatter / appearance. Tweak GRASS_COUNT to trade fill for CPU cost
// (each blade costs ~one matrix multiply per frame in the wind update).
const GRASS_COUNT = 6000;
const GRASS_BASE_HEIGHT = 0.45;
const GRASS_BASE_WIDTH = 0.05;
const GRASS_SCALE_MIN = 0.7;
const GRASS_SCALE_MAX = 1.4;
// Inset the scatter area slightly from the terrain edge so blades don't poke
// past the visible footprint.
const GRASS_SCATTER_INSET = 1.5;

// Wind: ±maxTiltRadians around the blade's base when wind strength = 1.
const WIND_MAX_TILT = 0.7;
const WIND_GUST_SPEED = 0.45;
const WIND_BASE_DIRECTION: [number, number] = [1, 0.3];
const WIND_BASE_STRENGTH = 1;

const buildDirtMaterial = () => {
  const material = createDefaultMaterial({ name: 'hills-dirt' });
  material.baseColor = [1, 1, 1, 1];
  material.metallic = 0;
  // Matte / rough surface — no specular highlights.
  material.roughness = 1;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 1;
  material.transparent = false;
  material.twoSided = false;
  material.textures.baseColor = DIRT_TEXTURE_URL;
  material.castsShadows = false;
  material.uvScaleOffset = [DIRT_TILES, DIRT_TILES, 0, 0];
  return material;
};

// Pure white base colour so the per-instance custom0 tint is the colour
// the surface reads as. Two-sided so blades viewed from behind still light.
const buildGrassMaterial = () => {
  const material = createDefaultMaterial({ name: 'hills-grass' });
  material.baseColor = [1, 1, 1, 1];
  material.metallic = 0;
  material.roughness = 1;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 1;
  material.transparent = false;
  material.twoSided = true;
  material.castsShadows = false;
  material.receivesShadows = false;
  return material;
};

// Deterministic pseudo-random in [0, 1) — keeps the scatter stable across
// reloads so the visual matches between sessions.
const randAt = (seed: number, salt: number): number => {
  let h = (seed * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 1000003) / 1000003;
};

type GrassBladeRecord = {
  // World-space base position. Y is pre-sampled from the terrain height.
  x: number;
  y: number;
  z: number;
  // Static per-instance trim: scale * RotY(facing). The wind update only
  // composes the instantaneous wind tilt + translation around it.
  staticTrs: Mat4;
};

const buildGrassRecords = (terrain: TerrainResult): GrassBladeRecord[] => {
  const records: GrassBladeRecord[] = [];
  const halfW = terrain.width * 0.5 - GRASS_SCATTER_INSET;
  const halfD = terrain.depth * 0.5 - GRASS_SCATTER_INSET;
  for (let i = 0; i < GRASS_COUNT; i += 1) {
    const x = (randAt(i, 17) * 2 - 1) * halfW;
    const z = (randAt(i, 31) * 2 - 1) * halfD;
    const y = terrain.sampleHeight(x, z);
    const scale = GRASS_SCALE_MIN + randAt(i, 47) * (GRASS_SCALE_MAX - GRASS_SCALE_MIN);
    const facing = randAt(i, 67) * Math.PI * 2;
    const staticTrs = mat4Multiply(
      mat4Scale(scale, scale, scale),
      mat4RotationY(facing),
    );
    records.push({ x, y, z, staticTrs });
  }
  return records;
};

const buildGrassTints = (): [number, number, number, number][] => {
  // Shade-of-green palette: vary hue, saturation, and brightness slightly
  // around a mid-grass green.
  const tints: [number, number, number, number][] = [];
  for (let i = 0; i < GRASS_COUNT; i += 1) {
    const r = 0.18 + randAt(i, 91) * 0.18;   // 0.18..0.36
    const g = 0.42 + randAt(i, 113) * 0.28;  // 0.42..0.70
    const b = 0.10 + randAt(i, 137) * 0.18;  // 0.10..0.28
    tints.push([r, g, b, 1]);
  }
  return tints;
};

// Build T(base) * RotY(windYaw) * RotX(tilt) * staticTRS. This rigidly
// tilts the entire blade about its base in the wind direction. The blade
// geometry has multiple vertical quads ready to support a future
// shader-side per-vertex bend, but per-instance rigid tilt is what the
// engine's existing instanced shader can express today.
const composeBladeMatrix = (
  out: Mat4,
  record: GrassBladeRecord,
  windYaw: number,
  tilt: number,
): void => {
  const cs = Math.cos(tilt);
  const sn = Math.sin(tilt);
  // RotX(tilt): standard column-major.
  const rotX: Mat4 = mat4Identity();
  rotX[5] = cs; rotX[6] = sn;
  rotX[9] = -sn; rotX[10] = cs;
  const rotY = mat4RotationY(windYaw);
  const t = mat4Translation(record.x, record.y, record.z);
  const inner = mat4Multiply(rotX, record.staticTrs);
  const yawed = mat4Multiply(rotY, inner);
  const final = mat4Multiply(t, yawed);
  out.set(final);
};

export const startHillsExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<HillsExampleOptions>,
): HillsExampleController => {
  let disposed = false;
  let elapsed = 0;
  let scene: RenderScene | null = null;
  let grassMesh: SceneInstancedMesh | null = null;
  let grassRecords: GrassBladeRecord[] = [];
  let windField: WindField | null = null;

  void createTerrain({
    width: TERRAIN_WIDTH,
    depth: TERRAIN_DEPTH,
    widthSegments: TERRAIN_SEGMENTS,
    depthSegments: TERRAIN_SEGMENTS,
    heightmapUrl: HEIGHTMAP_URL,
    heightScale: TERRAIN_HEIGHT_SCALE,
    material: buildDirtMaterial(),
  })
    .then((terrain) => {
      if (disposed) return;
      const sky = createSkySphere({ textureId: SKY_TEXTURE_ID, radius: SKY_RADIUS });

      grassRecords = buildGrassRecords(terrain);
      windField = createWindField({
        width: terrain.width,
        depth: terrain.depth,
        baseDirection: WIND_BASE_DIRECTION,
        baseStrength: WIND_BASE_STRENGTH,
        gustSpeed: WIND_GUST_SPEED,
      });

      const transforms: Mat4[] = grassRecords.map(() => mat4Identity());
      for (let i = 0; i < grassRecords.length; i += 1) {
        composeBladeMatrix(transforms[i]!, grassRecords[i]!, 0, 0);
      }

      grassMesh = {
        geometry: createGrassBladeGeometry({
          height: GRASS_BASE_HEIGHT,
          baseWidth: GRASS_BASE_WIDTH,
          segments: 4,
        }),
        material: buildGrassMaterial(),
        instanceTransforms: transforms,
        instanceCustomData: { custom0: buildGrassTints() },
      };

      scene = {
        meshes: [terrain.mesh, sky],
        instancedMeshes: [grassMesh],
        textureLibrary: { [SKY_TEXTURE_ID]: SKY_TEXTURE_URL },
        environmentMap: { textureId: SKY_TEXTURE_ID, intensity: 1 },
        lights: [],
      };
      applyScene(scene);
    })
    .catch((error: unknown) => {
      console.warn('hills: terrain build failed.', error);
    });

  return {
    setOptions: () => {},
    beforeFrame: (deltaSeconds: number) => {
      if (disposed || !scene || !grassMesh || !windField || grassRecords.length === 0) {
        return;
      }
      elapsed += deltaSeconds;
      const transforms = grassMesh.instanceTransforms;
      for (let i = 0; i < grassRecords.length; i += 1) {
        const record = grassRecords[i]!;
        const wind = windField.sample(record.x, record.z, elapsed);
        const tilt = Math.atan(wind.strength) * WIND_MAX_TILT;
        // Yaw: rotate so the blade-local +Z (the side a +RotX tip leans
        // toward) aligns with the wind direction.
        const windYaw = Math.atan2(wind.dx, wind.dz);
        composeBladeMatrix(transforms[i]!, record, windYaw, tilt);
      }
      applyScene(scene);
    },
    dispose: () => {
      disposed = true;
    },
  };
};
