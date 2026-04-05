import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createBox, createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Translation,
  type RenderScene,
  type SceneMeshInstance,
} from '../stunner/renderer/mesh/SceneTypes';
import type { RenderLight } from '../stunner/renderer/lights/LightTypes';

type Vec3 = [number, number, number];

type MovingStreetLight = {
  id: number;
  axis: 'x' | 'z';
  lane: number;
  phase: number;
  speed: number;
  color: [number, number, number];
};

export type CityDemoController = {
  dispose: () => void;
};

const GRID_SIZE = 16;
const BUILDING_SPACING = 2.6;
const BUILDING_BASE = 1.9;
const BUILDING_HEIGHT_MIN = 1.2;
const BUILDING_HEIGHT_MAX = BUILDING_BASE * 2.0;
const GROUND_SIZE = 800;
const STREET_LIGHT_COUNT = 200;
const STREET_LIGHT_HEIGHT_BASE = 2.1;
const STREET_LIGHT_HEIGHT_VARIATION = 1.8;
const STREET_LIGHT_RADIUS = 0.044;
const STREET_LIGHT_RANGE = 42;
const STREET_LIGHT_INTENSITY = 36;
const SUNSET_SPHERE_CENTER: Vec3 = [0, 8, -140];
const SUNSET_SPHERE_RADIUS = 10;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hash = (x: number, z: number): number => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
};

const gridCenterOffset = ((GRID_SIZE - 1) * BUILDING_SPACING) * 0.5;
const cityHalfExtent = gridCenterOffset + BUILDING_BASE * 0.5;

const buildStaticCityMeshes = (): SceneMeshInstance[] => {
  const meshes: SceneMeshInstance[] = [];

  meshes.push({
    geometry: createPlane({ width: GROUND_SIZE, depth: GROUND_SIZE, widthSegments: 256, depthSegments: 256 }),
    material: createDefaultMaterial({
      name: 'city-ground',
      baseColor: [0.45, 0.45, 0.47, 1],
      roughness: 0.88,
      metallic: 0.02,
    }),
    transform: mat4Translation(0, 0, -8),
  });

  for (let gz = 0; gz < GRID_SIZE; gz += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const hNoise = hash(gx, gz);
      const nx = (gx / (GRID_SIZE - 1)) * 2 - 1;
      const nz = (gz / (GRID_SIZE - 1)) * 2 - 1;
      const radial = Math.hypot(nx, nz);
      const coreMask = Math.max(0, 1 - radial * 0.95);
      const avenueMask = 1 - Math.min(1, Math.abs(nx) * 0.45 + Math.abs(nz) * 0.25);
      const skyline = Math.pow(coreMask, 1.5) * 0.62 + avenueMask * 0.26;
      const varied = 0.2 + hNoise * 0.8;
      const heightFactor = Math.min(1, skyline * 0.78 + varied * 0.3);
      const height = lerp(BUILDING_HEIGHT_MIN, BUILDING_HEIGHT_MAX, heightFactor);
      const x = gx * BUILDING_SPACING - gridCenterOffset;
      const z = gz * BUILDING_SPACING - gridCenterOffset - 8;
      const gray = lerp(0.42, 0.56, hash(gx * 2 + 3, gz * 3 + 7));
      meshes.push({
        geometry: createBox({ width: BUILDING_BASE, height: height, depth: BUILDING_BASE }),
        material: createDefaultMaterial({
          name: `city-building-${gx}-${gz}`,
          baseColor: [gray, gray, gray + 0.01, 1],
          roughness: 0.72,
          metallic: 0.04,
        }),
        transform: mat4Translation(x, height * 0.5, z),
      });
    }
  }

  meshes.push({
    geometry: createSphere({ radius: SUNSET_SPHERE_RADIUS, widthSegments: 40, heightSegments: 24 }),
    material: createDefaultMaterial({
      name: 'city-sunset-sphere',
      baseColor: [1.0, 0.7, 0.35, 1.0],
      roughness: 0.2,
      metallic: 0.0,
      emissive: [1.0, 0.46, 0.16],
      emissiveIntensity: 9.0,
      castsShadows: false,
      receivesShadows: false,
    }),
    transform: mat4Translation(SUNSET_SPHERE_CENTER[0], SUNSET_SPHERE_CENTER[1], SUNSET_SPHERE_CENTER[2]),
  });

  return meshes;
};

const createStreetLights = (): MovingStreetLight[] => {
  const streetCountPerAxis = GRID_SIZE - 1;
  const lights: MovingStreetLight[] = [];
  for (let index = 0; index < STREET_LIGHT_COUNT; index += 1) {
    const axis: 'x' | 'z' = index % 2 === 0 ? 'x' : 'z';
    const lane = index % streetCountPerAxis;
    const phase = (index / STREET_LIGHT_COUNT) * Math.PI * 2;
    const speed = (0.24 + (index % 5) * 0.04) * 0.1;
    const warm = 0.8 + (index % 4) * 0.05;
    lights.push({
      id: index + 1,
      axis,
      lane,
      phase,
      speed,
      color: [1.0, warm, 0.52],
    });
  }
  return lights;
};

const streetCoordinate = (lane: number): number => {
  const start = -gridCenterOffset;
  return start + lane * BUILDING_SPACING + BUILDING_SPACING * 0.5;
};

const lightPositionAt = (light: MovingStreetLight, timeSeconds: number): Vec3 => {
  const travel = Math.sin(light.phase + timeSeconds * light.speed) * cityHalfExtent;
  const laneCoord = streetCoordinate(light.lane);
  const y = STREET_LIGHT_HEIGHT_BASE + Math.sin(light.phase * 1.7 + timeSeconds * (light.speed * 0.9)) * STREET_LIGHT_HEIGHT_VARIATION;
  if (light.axis === 'x') {
    return [travel, y, laneCoord - 8];
  }
  return [laneCoord, y, travel - 8];
};

const buildDynamicLights = (streetLights: MovingStreetLight[], timeSeconds: number): RenderLight[] => {
  const lights: RenderLight[] = [];

  for (const light of streetLights) {
    const position = lightPositionAt(light, timeSeconds);
    lights.push({
      id: light.id,
      type: 'point',
      position,
      range: STREET_LIGHT_RANGE,
      color: light.color,
      intensity: STREET_LIGHT_INTENSITY,
      castsShadows: false,
      shadowIndex: -1,
    });
  }

  return lights;
};

const buildDynamicLightMeshes = (streetLights: MovingStreetLight[], timeSeconds: number): SceneMeshInstance[] => {
  return streetLights.map((light) => {
    const position = lightPositionAt(light, timeSeconds);
    return {
      geometry: createSphere({ radius: STREET_LIGHT_RADIUS, widthSegments: 14, heightSegments: 10 }),
      material: createDefaultMaterial({
        name: `city-light-sphere-${light.id}`,
        baseColor: [1.0, 0.85, 0.62, 1],
        roughness: 0.2,
        metallic: 0.0,
        emissive: light.color,
        emissiveIntensity: 12.0,
        castsShadows: false,
        receivesShadows: false,
      }),
      transform: mat4Translation(position[0], position[1], position[2]),
    };
  });
};

export const startCityDemo = (applyScene: (scene: RenderScene) => void): CityDemoController => {
  const staticMeshes = buildStaticCityMeshes();
  const streetLights = createStreetLights();
  let disposed = false;
  const start = performance.now();

  const update = (): void => {
    if (disposed) {
      return;
    }

    const now = performance.now();
    const timeSeconds = (now - start) / 1000;
    const lightMeshes = buildDynamicLightMeshes(streetLights, timeSeconds);
    const lights = buildDynamicLights(streetLights, timeSeconds);

    applyScene({
      meshes: [...staticMeshes, ...lightMeshes],
      lights,
    });

    window.requestAnimationFrame(update);
  };

  update();

  return {
    dispose: () => {
      disposed = true;
    },
  };
};
