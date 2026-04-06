import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createBox, createCircle, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Multiply,
  mat4Scale,
  mat4Translation,
  type RenderScene,
  type SceneInstancedMesh,
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

export type PointLightsExampleController = {
  setOptions: (options: PointLightsExampleOptions) => void;
  dispose: () => void;
};

export type PointLightsExampleOptions = {
  pointLightCount: number;
  pointLightSpeed: number;
  pointLightsCastShadows: boolean;
  pointShadowStrength: number;
  pointLightRange: number;
  pointLightIntensity: number;
  pointLightFalloffSoftness: number;
};

const GRID_SIZE = 16;
const BUILDING_SPACING = 2.6;
const BUILDING_BASE = 1.9;
const BUILDING_HEIGHT_MIN = 1.2;
const BUILDING_HEIGHT_MAX = BUILDING_BASE * 2.0;
const GROUND_SIZE = 800;
// Matches the current renderer dynamic point-light budget.
export const POINT_LIGHTS_MAX_EFFECTIVE_COUNT = 256;
const STREET_LIGHT_MAX_COUNT = POINT_LIGHTS_MAX_EFFECTIVE_COUNT;
const STREET_LIGHT_RADIUS = 0.044;
const STREET_LIGHT_RANGE = 4;
const STREET_LIGHT_INTENSITY = 10;
const STREET_LIGHT_HEIGHT = 0.38;
const GROUND_OUTER_RADIUS = GROUND_SIZE * 0.5;
const GROUND_INNER_RADIUS = GROUND_OUTER_RADIUS * 0.76;

const DEFAULT_POINT_LIGHTS_EXAMPLE_OPTIONS: PointLightsExampleOptions = {
  pointLightCount: 64,
  pointLightSpeed: 1.0,
  pointLightsCastShadows: false,
  pointShadowStrength: 1.0,
  pointLightRange: STREET_LIGHT_RANGE,
  pointLightIntensity: STREET_LIGHT_INTENSITY,
  pointLightFalloffSoftness: 0.7,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const brightenTint = (color: [number, number, number]): [number, number, number] => {
  const luminance = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const lift = luminance < 0.7 ? (0.7 - luminance) : 0;
  const toWhiteMix = 0.22 + lift * 0.65;
  return [
    clamp01(lerp(color[0], 1, toWhiteMix)),
    clamp01(lerp(color[1], 1, toWhiteMix)),
    clamp01(lerp(color[2], 1, toWhiteMix)),
  ];
};

const hash = (x: number, z: number): number => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return h - Math.floor(h);
};

const buildingColorAt = (gx: number, gz: number): [number, number, number, number] => {
  const base = lerp(0.58, 0.76, hash(gx * 3 + 19, gz * 5 + 31));
  const rSeed = hash(gx * 11 + 5, gz * 7 + 13);
  const gSeed = hash(gx * 17 + 2, gz * 13 + 29);
  const bSeed = hash(gx * 23 + 37, gz * 19 + 3);
  const tintAmount = lerp(0.2, 0.34, hash(gx * 29 + 43, gz * 31 + 47));
  const pastelLift = lerp(0.08, 0.2, hash(gx * 47 + 61, gz * 43 + 67));

  const rPastel = clamp01(lerp(base + (rSeed - 0.5) * tintAmount, 1, pastelLift));
  const gPastel = clamp01(lerp(base + (gSeed - 0.5) * tintAmount, 1, pastelLift));
  const bPastel = clamp01(lerp(base + (bSeed - 0.5) * tintAmount, 1, pastelLift));

  const luminance = rPastel * 0.2126 + gPastel * 0.7152 + bPastel * 0.0722;
  const desaturateMix = lerp(0.22, 0.38, hash(gx * 41 + 53, gz * 37 + 59));

  return [
    lerp(rPastel, luminance, desaturateMix),
    lerp(gPastel, luminance, desaturateMix),
    lerp(bPastel, luminance, desaturateMix),
    1,
  ];
};

const gridCenterOffset = ((GRID_SIZE - 1) * BUILDING_SPACING) * 0.5;
const cityHalfExtent = gridCenterOffset + BUILDING_BASE * 0.5;

const buildStaticCityMeshes = (): SceneMeshInstance[] => {
  const meshes: SceneMeshInstance[] = [];

  meshes.push({
    geometry: createCircle({ radius: GROUND_OUTER_RADIUS, radialSegments: 256, ringSegments: 128 }),
    material: createDefaultMaterial({
      name: 'city-ground-outer',
      baseColor: [0.34, 0.35, 0.37, 1],
      roughness: 0.92,
      metallic: 0.01,
    }),
    transform: mat4Translation(0, -0.001, -8),
  });

  meshes.push({
    geometry: createCircle({ radius: GROUND_INNER_RADIUS, radialSegments: 192, ringSegments: 96 }),
    material: createDefaultMaterial({
      name: 'city-ground-inner',
      baseColor: [0.45, 0.45, 0.47, 1],
      roughness: 0.88,
      metallic: 0.02,
    }),
    transform: mat4Translation(0, 0, -8),
  });

  return meshes;
};

const buildInstancedBuildings = (): SceneInstancedMesh => {
  const instanceTransforms: Float32Array[] = [];
  const instanceMaterialIndices: number[] = [];
  const buildingMaterialPalette = Array.from({ length: 10 }, (_, index) => {
    const color = buildingColorAt(index * 3 + 7, index * 5 + 11);
    return createDefaultMaterial({
      name: `city-building-instanced-material-${index}`,
      baseColor: color,
      roughness: lerp(0.62, 0.82, hash(index * 13 + 5, index * 17 + 9)),
      metallic: lerp(0.01, 0.08, hash(index * 19 + 7, index * 23 + 3)),
    });
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

      const translate = mat4Translation(x, height * 0.5, z);
      const scale = mat4Scale(BUILDING_BASE, height, BUILDING_BASE);
      instanceTransforms.push(mat4Multiply(translate, scale));
      const materialIndex = Math.min(
        buildingMaterialPalette.length - 1,
        Math.floor(hash(gx * 31 + 13, gz * 37 + 17) * buildingMaterialPalette.length),
      );
      instanceMaterialIndices.push(materialIndex);
    }
  }

  return {
    geometry: createBox({ width: 1, height: 1, depth: 1 }),
    material: createDefaultMaterial({
      name: 'city-buildings-instanced',
      baseColor: [1, 1, 1, 1],
      roughness: 0.72,
      metallic: 0.04,
    }),
    instanceMaterials: buildingMaterialPalette,
    instanceTransforms,
    instanceMaterialIndices,
  };
};

const createStreetLights = (): MovingStreetLight[] => {
  const streetCountPerAxis = GRID_SIZE - 1;
  const lights: MovingStreetLight[] = [];
  for (let index = 0; index < STREET_LIGHT_MAX_COUNT; index += 1) {
    const axis: 'x' | 'z' = index % 2 === 0 ? 'x' : 'z';
    const lane = index % streetCountPerAxis;
    const phase = (index / STREET_LIGHT_MAX_COUNT) * Math.PI * 2;
    const speed = (0.24 + (index % 5) * 0.04) * 0.1;
    const hueChoice = hash(index * 17 + 3, lane * 13 + 7);
    const variance = hash(index * 29 + 11, lane * 19 + 5);
    const isBlue = hueChoice < 0.5;
    const color: [number, number, number] = isBlue
      ? [
        lerp(0.3, 0.45, variance),
        lerp(0.5, 0.7, variance),
        lerp(0.95, 1.0, variance),
      ]
      : [
        lerp(0.95, 1.0, variance),
        lerp(0.54, 0.72, variance),
        lerp(0.25, 0.4, variance),
      ];
    lights.push({
      id: index + 1,
      axis,
      lane,
      phase,
      speed,
      color: brightenTint(color),
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
  const y = STREET_LIGHT_HEIGHT;
  if (light.axis === 'x') {
    return [travel, y, laneCoord - 8];
  }
  return [laneCoord, y, travel - 8];
};

const buildDynamicLights = (
  streetLights: MovingStreetLight[],
  timeSeconds: number,
  options: PointLightsExampleOptions,
): RenderLight[] => {
  const lights: RenderLight[] = [];

  for (const light of streetLights) {
    const position = lightPositionAt(light, timeSeconds);
    lights.push({
      id: light.id,
      type: 'point',
      position,
      range: options.pointLightRange,
      color: light.color,
      intensity: options.pointLightIntensity,
      castsShadows: options.pointLightsCastShadows,
      shadowIndex: -1,
    });
  }

  return lights;
};

const buildDynamicLightInstanceTransforms = (
  streetLights: MovingStreetLight[],
  timeSeconds: number,
) => {
  return streetLights.map((light) => {
    const position = lightPositionAt(light, timeSeconds);
    return mat4Translation(position[0], position[1], position[2]);
  });
};

const buildDynamicLightInstanceEmissiveColors = (
  streetLights: MovingStreetLight[],
  timeSeconds: number,
): [number, number, number, number][] => {
  return streetLights.map((light) => {
    const primaryWave = Math.sin(light.phase * 2.3 + timeSeconds * (light.speed * 6.5));
    const secondaryWave = Math.sin(light.phase * 0.9 + timeSeconds * 1.7);
    const emissiveScale = Math.max(0.55, 0.92 + primaryWave * 0.18 + secondaryWave * 0.1);
    return [
      light.color[0] * emissiveScale,
      light.color[1] * emissiveScale,
      light.color[2] * emissiveScale,
      1,
    ];
  });
};

export const startPointLightsExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<PointLightsExampleOptions>,
): PointLightsExampleController => {
  const staticMeshes = buildStaticCityMeshes();
  const buildingsInstanced = buildInstancedBuildings();
  const streetLights = createStreetLights();
  const lightMarkerGeometry = createSphere({ radius: STREET_LIGHT_RADIUS, widthSegments: 14, heightSegments: 10 });
  const lightMarkerMaterial = createDefaultMaterial({
    name: 'city-light-sphere-instanced',
    baseColor: [1, 1, 1, 1],
    roughness: 0.2,
    metallic: 0.0,
    emissive: [1, 1, 1],
    emissiveIntensity: 12.0,
    castsShadows: false,
    receivesShadows: false,
  });
  const lightMarkersInstanced: SceneInstancedMesh = {
    geometry: lightMarkerGeometry,
    material: lightMarkerMaterial,
    instanceTransforms: [],
    instanceCustomData: {
      custom1: streetLights.map((light) => [light.color[0], light.color[1], light.color[2], 1]),
    },
  };
  const instancedMeshes: SceneInstancedMesh[] = [buildingsInstanced, lightMarkersInstanced];
  let options: PointLightsExampleOptions = {
    ...DEFAULT_POINT_LIGHTS_EXAMPLE_OPTIONS,
    ...initialOptions,
  };
  let disposed = false;
  const start = performance.now();

  const update = (): void => {
    if (disposed) {
      return;
    }

    const now = performance.now();
    const timeSeconds = (now - start) / 1000;
    const activeLightCount = Math.max(1, Math.min(STREET_LIGHT_MAX_COUNT, Math.round(options.pointLightCount)));
    const speedScale = Math.max(0.05, options.pointLightSpeed);
    const activeLights = streetLights.slice(0, activeLightCount);
    const scaledTimeSeconds = timeSeconds * speedScale;

    lightMarkersInstanced.instanceTransforms =
      buildDynamicLightInstanceTransforms(activeLights, scaledTimeSeconds);
    if (lightMarkersInstanced.instanceCustomData) {
      lightMarkersInstanced.instanceCustomData.custom1 =
        buildDynamicLightInstanceEmissiveColors(activeLights, scaledTimeSeconds);
    }
    const lights = buildDynamicLights(activeLights, scaledTimeSeconds, options);

    applyScene({
      meshes: staticMeshes,
      instancedMeshes,
      directionalLightingEnabled: false,
      directionalLightingIntensity: 0,
      keyLightDirection: [0, 1, 0],
      pointShadowStrengthOverride: options.pointShadowStrength,
      pointLightEdgeSoftnessOverride: options.pointLightFalloffSoftness,
      lights,
    });

    window.requestAnimationFrame(update);
  };

  update();

  return {
    setOptions: (nextOptions: PointLightsExampleOptions) => {
      options = {
        pointLightCount: Math.max(1, Math.min(STREET_LIGHT_MAX_COUNT, Math.round(nextOptions.pointLightCount))),
        pointLightSpeed: Math.max(0.05, nextOptions.pointLightSpeed),
        pointLightsCastShadows: nextOptions.pointLightsCastShadows,
        pointShadowStrength: Math.max(0, Math.min(2.5, nextOptions.pointShadowStrength)),
        pointLightRange: Math.max(0.5, Math.min(20, nextOptions.pointLightRange)),
        pointLightIntensity: Math.max(0, Math.min(30, nextOptions.pointLightIntensity)),
        pointLightFalloffSoftness: Math.max(0.1, Math.min(0.95, nextOptions.pointLightFalloffSoftness)),
      };
    },
    dispose: () => {
      disposed = true;
    },
  };
};
