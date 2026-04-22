// Hills example: a single subdivided heightmapped plane with a tiled dirt
// material. Useful as a baseline scene for the terrain helper.

import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createSkySphere } from '@stunner/core/sky';
import { createTerrain } from '@stunner/core/terrain';

export type HillsExampleOptions = Record<string, never>;

export const DEFAULT_HILLS_OPTIONS: HillsExampleOptions = {};

export type HillsExampleController = {
  setOptions: (_options: HillsExampleOptions) => void;
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
  material.uvScaleOffset = [DIRT_TILES, DIRT_TILES, 0, 0];
  return material;
};

export const startHillsExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<HillsExampleOptions>,
): HillsExampleController => {
  let disposed = false;

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
      const sky = createSkySphere({
        textureId: SKY_TEXTURE_ID,
        radius: SKY_RADIUS,
      });
      const scene: RenderScene = {
        meshes: [terrain.mesh, sky],
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
    dispose: () => {
      disposed = true;
    },
  };
};
