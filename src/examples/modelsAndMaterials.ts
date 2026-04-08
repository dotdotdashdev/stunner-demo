import type { RendererFrameHookContext } from '@stunner/core/renderer/RendererEngine';
import type { RenderBackend } from '@stunner/core/renderer/RendererEngine';
import {
  loadGltfSceneFromUrl,
} from '@stunner/core/renderer/mesh/GltfLoader';
import {
  loadAnimatedGltfSceneFromUrl,
  type AnimatedRigController,
} from '@stunner/core/renderer/mesh/AnimatedGltfLoader';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createCircle, createSphere } from '@stunner/core/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationY,
  mat4Scale,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '@stunner/core/renderer/mesh/SceneTypes';

export type ModelsAndMaterialsExampleSceneResult = {
  scene: RenderScene;
  rigController: AnimatedRigController | null;
  animationStatus: {
    clipName: string;
    playbackSpeed: number;
  } | null;
  setOrbitSpeed: (speed: number) => void;
  setRotationSpeed: (speed: number) => void;
  setAnimationPlaybackSpeed: (speed: number) => void;
  beforeFrame: (context: RendererFrameHookContext) => void;
  dispose: () => void;
};

export type ModelsAndMaterialsExampleOptions = {
  animationPlaybackSpeed?: number;
  orbitSpeedRadPerSec?: number;
  rotationSpeedRadPerSec?: number;
  backend?: RenderBackend;
};

const CESIUM_MAN_MODEL_URL = '/models/cesium-man/CesiumMan.gltf';
const DAMAGED_HELMET_MODEL_URL = '/models/damaged-helmet/DamagedHelmet.gltf';

const createBaseScene = (backend: RenderBackend): RenderScene => {
  const groundTwoSided = backend === 'webgl2';
  return {
    meshes: [
      {
        geometry: createCircle({ radius: 20, radialSegments: 80, ringSegments: 20 }),
        material: createDefaultMaterial({
          name: 'models-and-materials-ground',
          baseColor: [0.14, 0.16, 0.18, 1],
          roughness: 1.0,
          twoSided: groundTwoSided,
        }),
        transform: mat4Translation(0, -0.2, -10),
      },
    ],
    lights: [],
  };
};

const CESIUM_MAN_TARGET_CENTER_XZ: [number, number] = [1.6, -5.8];
const CESIUM_MAN_SCALE = 2.5;
const GROUND_Y = -0.2;
const CESIUM_GROUND_CLEARANCE = -0.03;
const DAMAGED_HELMET_TARGET_CENTER: [number, number, number] = [-4.6, 2.3, -5.8];
const DAMAGED_HELMET_SCALE = 1.6;
const DAMAGED_HELMET_GROUND_CLEARANCE = 0.03;
const GLASS_SPHERE_BASE_COLOR: [number, number, number, number] = [1, 1, 1, 0.12];
const WEBGL2_GLASS_SPHERE_BASE_COLOR: [number, number, number, number] = [1, 1, 1, 0.22];
const MIRROR_SPHERE_SIZE_RATIO = 0.75;
const MIRROR_SPHERE_VERTICAL_GAP = 0.25;
const DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC = 0.18;
const HELMET_YAW_ROTATION_SPEED_RAD_PER_SEC = 1.3;

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

const getCombinedWorldBounds = (
  meshes: SceneMeshInstance[],
): { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null => {
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
    const meshBounds = getWorldBounds(mesh, mesh.transform ?? mat4Identity());
    minX = Math.min(minX, meshBounds.minX);
    maxX = Math.max(maxX, meshBounds.maxX);
    minY = Math.min(minY, meshBounds.minY);
    maxY = Math.max(maxY, meshBounds.maxY);
    minZ = Math.min(minZ, meshBounds.minZ);
    maxZ = Math.max(maxZ, meshBounds.maxZ);
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

const placeMeshAtTargetXZAboveGround = (
  mesh: SceneMeshInstance,
  targetCenterXZ: [number, number],
  scale: number,
  groundY: number,
  groundClearance: number,
): SceneMeshInstance => {
  const transform = mat4Multiply(mesh.transform ?? mat4Identity(), mat4Scale(scale, scale, scale));
  const bounds = getWorldBounds(mesh, transform);
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const deltaX = targetCenterXZ[0] - centerX;
  const deltaY = groundY + groundClearance - bounds.minY;
  const deltaZ = targetCenterXZ[1] - centerZ;
  const movedTransform = mat4Multiply(mat4Translation(deltaX, deltaY, deltaZ), transform);
  return {
    ...mesh,
    transform: movedTransform,
  };
};

const namespaceTextureLibrary = (
  modelNamespace: string,
  meshes: SceneMeshInstance[],
  textureLibrary: Record<string, string>,
): Record<string, string> => {
  const namespacedLibrary: Record<string, string> = {};
  const idRemap = new Map<string, string>();
  for (const [textureId, textureUrl] of Object.entries(textureLibrary)) {
    const namespacedId = `${modelNamespace}-${textureId}`;
    idRemap.set(textureId, namespacedId);
    namespacedLibrary[namespacedId] = textureUrl;
  }

  for (const mesh of meshes) {
    const textureIds = mesh.material.textureIds;
    if (!textureIds) {
      continue;
    }
    if (textureIds.baseColor && idRemap.has(textureIds.baseColor)) {
      textureIds.baseColor = idRemap.get(textureIds.baseColor);
    }
    if (textureIds.normal && idRemap.has(textureIds.normal)) {
      textureIds.normal = idRemap.get(textureIds.normal);
    }
    if (textureIds.orm && idRemap.has(textureIds.orm)) {
      textureIds.orm = idRemap.get(textureIds.orm);
    }
    if (textureIds.ao && idRemap.has(textureIds.ao)) {
      textureIds.ao = idRemap.get(textureIds.ao);
    }
    if (textureIds.rm && idRemap.has(textureIds.rm)) {
      textureIds.rm = idRemap.get(textureIds.rm);
    }
    if (textureIds.roughness && idRemap.has(textureIds.roughness)) {
      textureIds.roughness = idRemap.get(textureIds.roughness);
    }
    if (textureIds.metallic && idRemap.has(textureIds.metallic)) {
      textureIds.metallic = idRemap.get(textureIds.metallic);
    }
    if (textureIds.anisotropy && idRemap.has(textureIds.anisotropy)) {
      textureIds.anisotropy = idRemap.get(textureIds.anisotropy);
    }
    if (textureIds.emissive && idRemap.has(textureIds.emissive)) {
      textureIds.emissive = idRemap.get(textureIds.emissive);
    }
  }

  return namespacedLibrary;
};

export const createModelsAndMaterialsExampleScene = async (
  options?: ModelsAndMaterialsExampleOptions,
): Promise<ModelsAndMaterialsExampleSceneResult> => {
  const backend = options?.backend ?? 'webgpu';
  const baseScene = createBaseScene(backend);
  const noopBeforeFrame = () => {};
  const requestedPlaybackSpeed = options?.animationPlaybackSpeed;
  const playbackSpeed = Number.isFinite(requestedPlaybackSpeed)
    ? Math.max(0, requestedPlaybackSpeed ?? 1)
    : 1;
  const requestedOrbitSpeed = options?.orbitSpeedRadPerSec;
  const initialOrbitSpeedRadPerSec = Number.isFinite(requestedOrbitSpeed)
    ? requestedOrbitSpeed ?? DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC
    : DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC;
  const requestedHelmetRotationSpeed = options?.rotationSpeedRadPerSec;
  const initialHelmetRotationSpeedRadPerSec = Number.isFinite(requestedHelmetRotationSpeed)
    ? requestedHelmetRotationSpeed ?? HELMET_YAW_ROTATION_SPEED_RAD_PER_SEC
    : HELMET_YAW_ROTATION_SPEED_RAD_PER_SEC;

  const disposalCallbacks: Array<() => void> = [];

  try {
    const [cesiumResult, damagedHelmetResult] = await Promise.allSettled([
      loadAnimatedGltfSceneFromUrl(CESIUM_MAN_MODEL_URL, {
        playbackSpeed,
        loop: true,
      }),
      loadGltfSceneFromUrl(DAMAGED_HELMET_MODEL_URL),
    ]);

    const cesiumModel = cesiumResult.status === 'fulfilled' ? cesiumResult.value : null;
    const damagedHelmetModel = damagedHelmetResult.status === 'fulfilled' ? damagedHelmetResult.value : null;

    if (cesiumResult.status === 'rejected') {
      console.warn('Models and materials example: failed to load Cesium Man model.', cesiumResult.reason);
    }
    if (damagedHelmetResult.status === 'rejected') {
      console.warn('Models and materials example: failed to load damaged-helmet model.', damagedHelmetResult.reason);
    }
    if (!cesiumModel && !damagedHelmetModel) {
      throw new Error('All models failed to load.');
    }

    const cesiumMeshes = (cesiumModel?.meshes ?? []).map((mesh) =>
      placeMeshAtTargetXZAboveGround(
        mesh,
        CESIUM_MAN_TARGET_CENTER_XZ,
        CESIUM_MAN_SCALE,
        GROUND_Y,
        CESIUM_GROUND_CLEARANCE,
      ),
    );
    for (const mesh of cesiumMeshes) {
      mesh.material.clearCoatFactor = 2.0;
      mesh.material.clearCoatRoughness = 0.02;
      mesh.material.roughness = Math.min(mesh.material.roughness, 0.12);
      mesh.material.metallic = Math.min(mesh.material.metallic, 0.08);
    }

    const cesiumBounds = getCombinedWorldBounds(cesiumMeshes);
    const cesiumMinY = cesiumBounds?.minY ?? GROUND_Y + CESIUM_GROUND_CLEARANCE;
    const cesiumMaxY = cesiumBounds?.maxY ?? (GROUND_Y + CESIUM_GROUND_CLEARANCE + 2.0);
    const cesiumCenterX = cesiumBounds ? (cesiumBounds.minX + cesiumBounds.maxX) * 0.5 : CESIUM_MAN_TARGET_CENTER_XZ[0];
    const cesiumCenterY = cesiumBounds ? (cesiumBounds.minY + cesiumBounds.maxY) * 0.5 : (cesiumMinY + cesiumMaxY) * 0.5;
    const cesiumCenterZ = cesiumBounds ? (cesiumBounds.minZ + cesiumBounds.maxZ) * 0.5 : CESIUM_MAN_TARGET_CENTER_XZ[1];
    const cesiumHeight = Math.max(0.4, cesiumMaxY - cesiumMinY);
    const glassSphereRadius = cesiumHeight * 0.5;
    const glassSphereCenter: [number, number, number] = [
      (CESIUM_MAN_TARGET_CENTER_XZ[0] + DAMAGED_HELMET_TARGET_CENTER[0]) * 0.5,
      (cesiumMinY + cesiumMaxY) * 0.5 + 0.3,
      (CESIUM_MAN_TARGET_CENTER_XZ[1] + DAMAGED_HELMET_TARGET_CENTER[2]) * 0.5,
    ];
    const cesiumRelativeTransforms = cesiumMeshes.map((mesh) =>
      mat4Multiply(
        mat4Translation(-cesiumCenterX, -cesiumCenterY, -cesiumCenterZ),
        mesh.transform ?? mat4Identity(),
      ),
    );
    const cesiumOrbitStartAngleRadians = Math.atan2(
      cesiumCenterZ - glassSphereCenter[2],
      cesiumCenterX - glassSphereCenter[0],
    );
    const cesiumOrbitRadius = Math.max(
      0.001,
      Math.hypot(cesiumCenterX - glassSphereCenter[0], cesiumCenterZ - glassSphereCenter[2]),
    );
    const damagedHelmetOrbitRadius = cesiumOrbitRadius + 0.8;
    const glassSphereMesh: SceneMeshInstance = {
      geometry: createSphere({
        radius: glassSphereRadius,
        widthSegments: 64,
        heightSegments: 32,
      }),
      material: createDefaultMaterial({
        name: 'models-and-materials-glass-sphere',
        baseColor: backend === 'webgl2' ? WEBGL2_GLASS_SPHERE_BASE_COLOR : GLASS_SPHERE_BASE_COLOR,
        metallic: backend === 'webgl2' ? 1.0 : 1,
        roughness: backend === 'webgl2' ? 0.012 : 0.035,
        transparent: true,
        twoSided: true,
        clearCoatFactor: backend === 'webgl2' ? 2.0 : 1.2,
        clearCoatRoughness: backend === 'webgl2' ? 0.01 : 0.03,
        refractionStrength: backend === 'webgl2' ? 1.25 : 1.6,
        ior: backend === 'webgl2' ? 1.58 : 1.62,
        refractionSteps: backend === 'webgl2' ? 10 : 14,
        refractionDepthBias: backend === 'webgl2' ? 0.02 : 0.028,
        castsShadows: false,
      }),
      transform: mat4Translation(glassSphereCenter[0], glassSphereCenter[1], glassSphereCenter[2]),
    };
    const mirrorSphereRadius = glassSphereRadius * MIRROR_SPHERE_SIZE_RATIO;
    const mirrorSphereCenter: [number, number, number] = [
      glassSphereCenter[0],
      glassSphereCenter[1] + glassSphereRadius + mirrorSphereRadius + MIRROR_SPHERE_VERTICAL_GAP,
      glassSphereCenter[2],
    ];
    const mirrorSphereMesh: SceneMeshInstance = {
      geometry: createSphere({
        radius: mirrorSphereRadius,
        widthSegments: 64,
        heightSegments: 32,
      }),
      material: createDefaultMaterial({
        name: 'models-and-materials-mirror-sphere',
        baseColor: [0, 0, 0, 1],
        metallic: 1.0,
        roughness: 0.001,
        transparent: false,
        twoSided: false,
        clearCoatFactor: 0,
        clearCoatRoughness: 0,
        castsShadows: true,
      }),
      transform: mat4Translation(mirrorSphereCenter[0], mirrorSphereCenter[1], mirrorSphereCenter[2]),
    };

    const damagedHelmetMeshes = (damagedHelmetModel?.meshes ?? []).map((mesh) =>
      placeMeshAtTarget(mesh, DAMAGED_HELMET_TARGET_CENTER, DAMAGED_HELMET_SCALE),
    );
    const damagedHelmetBounds = getCombinedWorldBounds(damagedHelmetMeshes);
    const damagedHelmetCenterX = damagedHelmetBounds
      ? (damagedHelmetBounds.minX + damagedHelmetBounds.maxX) * 0.5
      : glassSphereCenter[0];
    const damagedHelmetHalfHeight = damagedHelmetBounds
      ? (damagedHelmetBounds.maxY - damagedHelmetBounds.minY) * 0.5
      : 0.5;
    const damagedHelmetCenterY = damagedHelmetBounds
      ? GROUND_Y + DAMAGED_HELMET_GROUND_CLEARANCE + damagedHelmetHalfHeight
      : GROUND_Y + DAMAGED_HELMET_GROUND_CLEARANCE + damagedHelmetHalfHeight;
    const damagedHelmetCenterZ = damagedHelmetBounds
      ? (damagedHelmetBounds.minZ + damagedHelmetBounds.maxZ) * 0.5
      : glassSphereCenter[2];
    const damagedHelmetRelativeTransforms = damagedHelmetMeshes.map((mesh) =>
      mat4Multiply(
        mat4Translation(-damagedHelmetCenterX, -damagedHelmetCenterY, -damagedHelmetCenterZ),
        mesh.transform ?? mat4Identity(),
      ),
    );
    const damagedHelmetInitialOrbitAngle = cesiumOrbitStartAngleRadians + Math.PI;
    const damagedHelmetInitialCenterX = glassSphereCenter[0] + Math.cos(damagedHelmetInitialOrbitAngle) * damagedHelmetOrbitRadius;
    const damagedHelmetInitialCenterZ = glassSphereCenter[2] + Math.sin(damagedHelmetInitialOrbitAngle) * damagedHelmetOrbitRadius;
    const damagedHelmetInitialTransform = mat4Translation(
      damagedHelmetInitialCenterX,
      damagedHelmetCenterY,
      damagedHelmetInitialCenterZ,
    );
    for (let index = 0; index < damagedHelmetMeshes.length; index += 1) {
      damagedHelmetMeshes[index].transform = mat4Multiply(
        damagedHelmetInitialTransform,
        damagedHelmetRelativeTransforms[index],
      );
    }

    const cesiumTextureLibrary = cesiumModel
      ? namespaceTextureLibrary('cesium-man', cesiumMeshes, cesiumModel.textureLibrary)
      : {};
    const damagedHelmetTextureLibrary = damagedHelmetModel
      ? namespaceTextureLibrary('damaged-helmet', damagedHelmetMeshes, damagedHelmetModel.textureLibrary)
      : {};
    if (cesiumModel) {
      disposalCallbacks.push(() => {
        cesiumModel.dispose();
      });
    }
    if (damagedHelmetModel) {
      disposalCallbacks.push(() => {
        damagedHelmetModel.dispose();
      });
    }

    let damagedHelmetYawRadians = 0;
    let cesiumOrbitAngleRadians = 0;
    let orbitSpeedRadPerSec = initialOrbitSpeedRadPerSec;
    let helmetRotationSpeedRadPerSec = initialHelmetRotationSpeedRadPerSec;
    let animationPlaybackSpeed = playbackSpeed;

    const sceneTextureLibrary = {
      ...cesiumTextureLibrary,
      ...damagedHelmetTextureLibrary,
    };
    const scene: RenderScene = {
      ...baseScene,
      meshes: [...baseScene.meshes, ...cesiumMeshes, glassSphereMesh, mirrorSphereMesh, ...damagedHelmetMeshes],
      textureLibrary: sceneTextureLibrary,
      ...(backend === 'webgl2'
        ? {
            reflectionProbes: [
              {
                position: [glassSphereCenter[0], glassSphereCenter[1], glassSphereCenter[2]],
                radius: Math.max(5.5, glassSphereRadius * 6.5),
                strength: 0.95,
                tint: [1, 1, 1],
              },
              {
                position: [glassSphereCenter[0], GROUND_Y + 0.6, glassSphereCenter[2]],
                radius: Math.max(4.2, glassSphereRadius * 4.2),
                strength: 0.7,
                tint: [0.96, 0.98, 1.0],
              },
            ],
            planarReflections: [
              {
                normal: [0, 1, 0],
                offset: -GROUND_Y,
                fadeStart: 0.02,
                fadeEnd: 2.4,
                strength: 0.95,
              },
            ],
          }
        : {}),
    };

    const animationStatus = cesiumModel
      ? {
          clipName: cesiumModel.controller.getClipNames()[0] ?? 'unknown',
          playbackSpeed,
        }
      : null;

    return {
      scene,
      rigController: cesiumModel?.controller ?? null,
      animationStatus,
      setOrbitSpeed: (speed) => {
        if (!Number.isFinite(speed)) {
          return;
        }
        orbitSpeedRadPerSec = speed;
      },
      setRotationSpeed: (speed) => {
        if (!Number.isFinite(speed)) {
          return;
        }
        helmetRotationSpeedRadPerSec = speed;
      },
      setAnimationPlaybackSpeed: (speed) => {
        if (!Number.isFinite(speed)) {
          return;
        }
        animationPlaybackSpeed = Math.max(0, speed);
      },
      beforeFrame: (context) => {
        const deltaSeconds = Math.max(0, context.deltaTimeMs) / 1000;
        cesiumModel?.controller.update(deltaSeconds);

        const scaledOrbitSpeedRadPerSec = orbitSpeedRadPerSec * 2 * animationPlaybackSpeed;
        cesiumOrbitAngleRadians += scaledOrbitSpeedRadPerSec * deltaSeconds;
        const orbitAngle = cesiumOrbitStartAngleRadians + cesiumOrbitAngleRadians;
        const orbitCenterX = glassSphereCenter[0] + Math.cos(orbitAngle) * cesiumOrbitRadius;
        const orbitCenterZ = glassSphereCenter[2] + Math.sin(orbitAngle) * cesiumOrbitRadius;
        const tangentX = -Math.sin(orbitAngle);
        const tangentZ = Math.cos(orbitAngle);
        const forwardYaw = Math.atan2(tangentX, -tangentZ) + Math.PI;
        const orbitTransform = mat4Multiply(
          mat4Translation(orbitCenterX, cesiumCenterY, orbitCenterZ),
          mat4RotationY(forwardYaw),
        );
        for (let index = 0; index < cesiumMeshes.length; index += 1) {
          cesiumMeshes[index].transform = mat4Multiply(orbitTransform, cesiumRelativeTransforms[index]);
        }

        damagedHelmetYawRadians -= helmetRotationSpeedRadPerSec * deltaSeconds;
        const damagedHelmetOrbitAngle = orbitAngle + Math.PI;
        const damagedHelmetOrbitCenterX = glassSphereCenter[0] + Math.cos(damagedHelmetOrbitAngle) * damagedHelmetOrbitRadius;
        const damagedHelmetOrbitCenterZ = glassSphereCenter[2] + Math.sin(damagedHelmetOrbitAngle) * damagedHelmetOrbitRadius;
        const damagedHelmetTransform = mat4Multiply(
          mat4Translation(damagedHelmetOrbitCenterX, damagedHelmetCenterY, damagedHelmetOrbitCenterZ),
          mat4RotationY(damagedHelmetYawRadians),
        );
        for (let index = 0; index < damagedHelmetMeshes.length; index += 1) {
          damagedHelmetMeshes[index].transform = mat4Multiply(
            damagedHelmetTransform,
            damagedHelmetRelativeTransforms[index],
          );
        }
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
      animationStatus: null,
      setOrbitSpeed: () => {},
      setRotationSpeed: () => {},
      setAnimationPlaybackSpeed: () => {},
      beforeFrame: noopBeforeFrame,
      dispose: () => {
        for (const dispose of disposalCallbacks) {
          dispose();
        }
      },
    };
  }
};
