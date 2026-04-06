import type { RendererFrameHookContext } from '../stunner/renderer/RendererEngine';
import {
  loadGltfSceneFromUrl,
} from '../stunner/renderer/mesh/GltfLoader';
import {
  loadAnimatedGltfSceneFromUrl,
  type AnimatedRigController,
} from '../stunner/renderer/mesh/AnimatedGltfLoader';
import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationY,
  mat4Scale,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '../stunner/renderer/mesh/SceneTypes';

export type ModelsAndMaterialsExampleSceneResult = {
  scene: RenderScene;
  rigController: AnimatedRigController | null;
  beforeFrame: (context: RendererFrameHookContext) => void;
  dispose: () => void;
};

const CESIUM_MAN_MODEL_URL = '/models/cesium-man/CesiumMan.decoded.gltf';
const BOOMBOX_MODEL_URL = '/models/boombox/BoomBox.gltf';

const createBaseScene = (): RenderScene => {
  return {
    meshes: [
      {
        geometry: createSphere({ radius: 0.9, widthSegments: 48, heightSegments: 32 }),
        material: createDefaultMaterial({
          name: 'models-and-materials-sphere',
          baseColor: [1.0, 1.0, 1.0, 1.0],
          roughness: 0.0,
          metallic: 1.0,
        }),
        transform: mat4Translation(0, 0.7, -5.8),
      },
      {
        geometry: createPlane({ width: 40, depth: 40, widthSegments: 20, depthSegments: 20 }),
        material: createDefaultMaterial({
          name: 'models-and-materials-ground',
          baseColor: [0.14, 0.16, 0.18, 1],
          roughness: 0.8,
          metallic: 0.2,
        }),
        transform: mat4Translation(0, -0.2, -10),
      },
    ],
    lights: [],
  };
};

const CESIUM_MAN_TARGET_CENTER: [number, number, number] = [-2.4, 0.2, -5.8];
const CESIUM_MAN_SCALE = 1.0;
const BOOMBOX_TARGET_CENTER: [number, number, number] = [2.4, 0.8, -5.8];
const BOOMBOX_SCALE = 100.0;
const MODEL_ROTATION_SPEED_RAD_PER_SEC = 0.32;

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

const placeMeshAtTarget = (
  mesh: SceneMeshInstance,
  targetCenter: [number, number, number],
  scale: number,
): SceneMeshInstance => {
  const transform = mat4Multiply(mesh.transform ?? mat4Identity(), mat4Scale(scale, scale, scale));
  const bounds = getWorldBounds(mesh, transform);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const deltaX = targetCenter[0] - centerX;
  const deltaY = targetCenter[1] - centerY;
  const deltaZ = targetCenter[2] - centerZ;
  const movedTransform = mat4Multiply(mat4Translation(deltaX, deltaY, deltaZ), transform);
  return {
    ...mesh,
    transform: movedTransform,
  };
};

export const createModelsAndMaterialsExampleScene = async (): Promise<ModelsAndMaterialsExampleSceneResult> => {
  const baseScene = createBaseScene();
  const noopBeforeFrame = () => {};

  const disposalCallbacks: Array<() => void> = [];

  try {
    const [cesiumResult, boomboxResult] = await Promise.allSettled([
      loadAnimatedGltfSceneFromUrl(CESIUM_MAN_MODEL_URL, {
        playbackSpeed: 1,
        loop: true,
      }),
      loadGltfSceneFromUrl(BOOMBOX_MODEL_URL),
    ]);

    const cesiumModel = cesiumResult.status === 'fulfilled' ? cesiumResult.value : null;
    const boomboxModel = boomboxResult.status === 'fulfilled' ? boomboxResult.value : null;

    if (cesiumResult.status === 'rejected') {
      console.warn('Models and materials example: failed to load Cesium Man model.', cesiumResult.reason);
    }
    if (boomboxResult.status === 'rejected') {
      console.warn('Models and materials example: failed to load boombox model.', boomboxResult.reason);
    }

    if (!cesiumModel && !boomboxModel) {
      throw new Error('Both Cesium Man and boombox models failed to load.');
    }

    const cesiumMeshes = (cesiumModel?.meshes ?? []).map((mesh) =>
      placeMeshAtTarget(mesh, CESIUM_MAN_TARGET_CENTER, CESIUM_MAN_SCALE),
    );
    const boomboxMeshes = (boomboxModel?.meshes ?? []).map((mesh) =>
      placeMeshAtTarget(mesh, BOOMBOX_TARGET_CENTER, BOOMBOX_SCALE),
    );

    const cesiumBaseTransforms = cesiumMeshes.map(
      (mesh) => new Float32Array(mesh.transform ?? mat4Identity()),
    );
    const boomboxBaseTransforms = boomboxMeshes.map(
      (mesh) => new Float32Array(mesh.transform ?? mat4Identity()),
    );

    if (cesiumModel) {
      disposalCallbacks.push(() => {
        cesiumModel.dispose();
      });
    }
    if (boomboxModel) {
      disposalCallbacks.push(() => {
        boomboxModel.dispose();
      });
    }

    let cesiumYawRadians = 0;
    let boomboxYawRadians = 0;

    const applyYaw = (
      meshes: SceneMeshInstance[],
      baseTransforms: Mat4[],
      yawRadians: number,
    ): void => {
      const yaw = mat4RotationY(yawRadians);
      for (let index = 0; index < meshes.length; index += 1) {
        meshes[index].transform = mat4Multiply(baseTransforms[index], yaw);
      }
    };

    const sceneTextureLibrary = {
      ...(cesiumModel?.textureLibrary ?? {}),
      ...(boomboxModel?.textureLibrary ?? {}),
    };

    return {
      scene: {
        ...baseScene,
        meshes: [...baseScene.meshes, ...cesiumMeshes, ...boomboxMeshes],
        textureLibrary: sceneTextureLibrary,
      },
      rigController: cesiumModel?.controller ?? null,
      beforeFrame: (context) => {
        const deltaSeconds = Math.max(0, context.deltaTimeMs) / 1000;
        cesiumModel?.controller.update(deltaSeconds);

        cesiumYawRadians += MODEL_ROTATION_SPEED_RAD_PER_SEC * deltaSeconds;
        boomboxYawRadians += MODEL_ROTATION_SPEED_RAD_PER_SEC * deltaSeconds;
        applyYaw(cesiumMeshes, cesiumBaseTransforms, cesiumYawRadians);
        applyYaw(boomboxMeshes, boomboxBaseTransforms, boomboxYawRadians);
      },
      dispose: () => {
        for (const dispose of disposalCallbacks) {
          dispose();
        }
      },
    };
  } catch (error: unknown) {
    console.warn('Models and materials example model failed to load.', error);
    return {
      scene: baseScene,
      rigController: null,
      beforeFrame: noopBeforeFrame,
      dispose: () => {
        for (const dispose of disposalCallbacks) {
          dispose();
        }
      },
    };
  }
};
