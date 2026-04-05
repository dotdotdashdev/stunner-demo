import { loadGltfSceneFromUrl } from '../stunner/renderer/mesh/GltfLoader';
import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  mat4Multiply,
  mat4Scale,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '../stunner/renderer/mesh/SceneTypes';

export type BasicDemoSceneResult = {
  scene: RenderScene;
  dispose: () => void;
};

const BASIC_DEMO_MODEL_URL = '/models/BoomBox.gltf';

const createBaseScene = (): RenderScene => {
  return {
    meshes: [
      {
        geometry: createSphere({ radius: 0.9, widthSegments: 48, heightSegments: 32 }),
        material: createDefaultMaterial({
          name: 'basic-sphere',
          baseColor: [1.0, 1.0, 1.0, 1.0],
          roughness: 0.0,
          metallic: 1.0
        }),
        transform: mat4Translation(0, 0.7, -5.5),
      },
      {
        geometry: createPlane({ width: 40, depth: 40, widthSegments: 20, depthSegments: 20 }),
        material: createDefaultMaterial({
          name: 'basic-ground',
          baseColor: [0.14, 0.16, 0.18, 1],
          roughness: 0.8,
        }),
        transform: mat4Translation(0, -0.2, -10),
      },
    ],
    lights: [],
  };
};

const MODEL_TARGET_CENTER: [number, number, number] = [2.4, 0.7, -5.5];
const MODEL_SCALE = 100;

const transformPoint = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
};

const getWorldBounds = (
  mesh: SceneMeshInstance,
  transform: Mat4,
): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } => {
  const stride = 12;
  const vertices = mesh.geometry.vertices;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < mesh.geometry.vertexCount; index += 1) {
    const base = index * stride;
    const worldPoint = transformPoint(transform, vertices[base], vertices[base + 1], vertices[base + 2]);
    minX = Math.min(minX, worldPoint[0]);
    maxX = Math.max(maxX, worldPoint[0]);
    minY = Math.min(minY, worldPoint[1]);
    maxY = Math.max(maxY, worldPoint[1]);
    minZ = Math.min(minZ, worldPoint[2]);
    maxZ = Math.max(maxZ, worldPoint[2]);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const orientAndPlaceMeshAtSphereCenter = (mesh: SceneMeshInstance): SceneMeshInstance => {
  const transform = mat4Multiply(mesh.transform ?? mat4Identity(), mat4Scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE));
  const bounds = getWorldBounds(mesh, transform);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const deltaX = MODEL_TARGET_CENTER[0] - centerX;
  const deltaY = MODEL_TARGET_CENTER[1] - centerY;
  const deltaZ = MODEL_TARGET_CENTER[2] - centerZ;
  const movedTransform = mat4Multiply(mat4Translation(deltaX, deltaY, deltaZ), transform);
  return {
    ...mesh,
    transform: movedTransform,
  };
};

export const createBasicDemoScene = async (): Promise<BasicDemoSceneResult> => {
  const baseScene = createBaseScene();
  let loadedModel: Awaited<ReturnType<typeof loadGltfSceneFromUrl>>;
  try {
    loadedModel = await loadGltfSceneFromUrl(BASIC_DEMO_MODEL_URL);
  } catch (error: unknown) {
    console.warn('Basic demo model failed to load.', error);
    return {
      scene: baseScene,
      dispose: () => {},
    };
  }

  const loadedMeshes = loadedModel.meshes.map((mesh) => orientAndPlaceMeshAtSphereCenter(mesh));
  return {
    scene: {
      ...baseScene,
      meshes: [...baseScene.meshes, ...loadedMeshes],
    },
    dispose: () => {
      loadedModel.dispose();
    },
  };
};
