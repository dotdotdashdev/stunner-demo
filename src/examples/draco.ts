import {
  loadAnimatedGltfSceneFromArrayBuffer,
  type AnimatedGltfLoadResult,
} from '@stunner/core/renderer/mesh/AnimatedGltfLoader';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationY,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '@stunner/core/renderer/mesh/SceneTypes';
import { decodeDracoGltfFromUrlToArrayBuffer } from '@stunner/draco';

const DRACO_MODEL_URL = '/models/brain-stem/BrainStem.gltf';
const YAW_ROTATION_SPEED_RAD_PER_SEC = 0.2;

export type DracoExampleOptions = Record<string, never>;

export const DEFAULT_DRACO_OPTIONS: DracoExampleOptions = {};

export type DracoExampleController = {
  beforeFrame: (deltaTimeSeconds: number) => void;
  setOptions: (_options: DracoExampleOptions) => void;
  dispose: () => void;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const transformPoint = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
};

const getWorldBounds = (mesh: SceneMeshInstance): Bounds => {
  const transform = mesh.transform ?? mat4Identity();
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
    const point = transformPoint(transform, vertices[base], vertices[base + 1], vertices[base + 2]);
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
    minZ = Math.min(minZ, point[2]);
    maxZ = Math.max(maxZ, point[2]);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const getCombinedBounds = (meshes: SceneMeshInstance[]): Bounds | null => {
  if (meshes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of meshes) {
    const bounds = getWorldBounds(mesh);
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minY = Math.min(minY, bounds.minY);
    maxY = Math.max(maxY, bounds.maxY);
    minZ = Math.min(minZ, bounds.minZ);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const placeAtGroundCenter = (meshes: SceneMeshInstance[]): void => {
  const bounds = getCombinedBounds(meshes);
  if (!bounds) {
    return;
  }

  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const liftY = -bounds.minY;
  const offset = mat4Translation(-centerX, liftY, -centerZ);

  for (const mesh of meshes) {
    const baseTransform = mesh.transform ?? mat4Identity();
    mesh.transform = mat4Multiply(offset, baseTransform);
  }
};

export const startDracoExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<DracoExampleOptions>,
): DracoExampleController => {
  let disposed = false;
  let yawRadians = 0;
  let loadedResult: AnimatedGltfLoadResult | null = null;
  const baseTransforms = new WeakMap<SceneMeshInstance, Mat4>();

  void decodeDracoGltfFromUrlToArrayBuffer(DRACO_MODEL_URL)
    .then((decodedSource) => {
      return loadAnimatedGltfSceneFromArrayBuffer(decodedSource, {
        baseUrl: DRACO_MODEL_URL,
        loop: true,
        playbackSpeed: 1,
      });
    })
    .then((result) => {
      if (disposed) {
        result.dispose();
        return;
      }

      loadedResult = result;
      placeAtGroundCenter(result.meshes);

      for (const mesh of result.meshes) {
        baseTransforms.set(mesh, mesh.transform ?? mat4Identity());
      }

      const clipNames = result.controller.getClipNames();
      if (clipNames.length > 0) {
        result.controller.setClipByName(clipNames[0]);
      }

      const scene: RenderScene = {
        meshes: result.meshes,
        textureLibrary: result.textureLibrary,
        lights: [],
      };
      applyScene(scene);
    })
    .catch((error: unknown) => {
      console.warn('Draco example failed to load brain-stem.', error);
    });

  return {
    beforeFrame: (deltaTimeSeconds: number) => {
      if (!loadedResult) {
        return;
      }

      loadedResult.controller.update(deltaTimeSeconds);
      yawRadians += deltaTimeSeconds * YAW_ROTATION_SPEED_RAD_PER_SEC;
      const yawRotation = mat4RotationY(yawRadians);

      for (const mesh of loadedResult.meshes) {
        const baseTransform = baseTransforms.get(mesh);
        if (baseTransform) {
          mesh.transform = mat4Multiply(yawRotation, baseTransform);
        }
      }
    },
    setOptions: () => {},
    dispose: () => {
      disposed = true;
      if (!loadedResult) {
        return;
      }
      loadedResult.dispose();
      loadedResult = null;
    },
  };
};
