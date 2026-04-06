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
  animationStatus: {
    clipName: string;
    playbackSpeed: number;
  } | null;
  setRotationSpeed: (speed: number) => void;
  setDirectionalLight: (position: [number, number, number], intensity: number) => void;
  beforeFrame: (context: RendererFrameHookContext) => void;
  dispose: () => void;
};

export type ModelsAndMaterialsExampleOptions = {
  animationPlaybackSpeed?: number;
  rotationSpeedRadPerSec?: number;
  directionalLightAzimuthDeg?: number;
  directionalLightElevationDeg?: number;
  directionalLightIntensity?: number;
};

const CESIUM_MAN_MODEL_URL = '/models/cesium-man/CesiumMan.gltf';
const DAMAGED_HELMET_MODEL_URL = '/models/damaged-helmet/DamagedHelmet.gltf';

const createBaseScene = (): RenderScene => {
  return {
    meshes: [
      {
        geometry: createPlane({ width: 40, depth: 40, widthSegments: 20, depthSegments: 20 }),
        material: createDefaultMaterial({
          name: 'models-and-materials-ground',
          baseColor: [0.14, 0.16, 0.18, 1],
          roughness: 1.0
        }),
        transform: mat4Translation(0, -0.2, -10),
      },
    ],
    directionalLightingEnabled: true,
    directionalLightingIntensity: DEFAULT_DIRECTIONAL_LIGHT_INTENSITY,
    keyLightDirection: [0.55, 0.92, 0.28],
    lights: [],
  };
};

const CESIUM_MAN_TARGET_CENTER_XZ: [number, number] = [3.2, -5.8];
const CESIUM_MAN_SCALE = 2.0;
const GROUND_Y = -0.2;
const CESIUM_GROUND_CLEARANCE = 0.02;
const DAMAGED_HELMET_TARGET_CENTER: [number, number, number] = [-4.1, 2.3, -5.8];
const DAMAGED_HELMET_SCALE = 2.0;
const GLASS_SPHERE_BASE_COLOR: [number, number, number, number] = [0.95, 0.98, 1.0, 0.12];
const DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC = 0.18;
const DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG = 27;
const DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG = 56;
const DEFAULT_DIRECTIONAL_LIGHT_INTENSITY = 3.7;

const directionFromAnglesDeg = (
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] => {
  const azimuthRadians = (azimuthDeg * Math.PI) / 180;
  const elevationRadians = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevationRadians);
  return [
    Math.cos(azimuthRadians) * horizontal,
    Math.sin(elevationRadians),
    Math.sin(azimuthRadians) * horizontal,
  ];
};

const normalizeDirection = (value: [number, number, number]): [number, number, number] => {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 0.000001) {
    return [0, 1, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
};

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
  const baseScene = createBaseScene();
  const noopBeforeFrame = () => {};
  const requestedPlaybackSpeed = options?.animationPlaybackSpeed;
  const playbackSpeed = Number.isFinite(requestedPlaybackSpeed)
    ? Math.max(0, requestedPlaybackSpeed ?? 1)
    : 1;
  const requestedRotationSpeed = options?.rotationSpeedRadPerSec;
  const initialRotationSpeedRadPerSec = Number.isFinite(requestedRotationSpeed)
    ? requestedRotationSpeed ?? DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC
    : DEFAULT_MODEL_ROTATION_SPEED_RAD_PER_SEC;
  const requestedDirectionalLightAzimuthDeg = options?.directionalLightAzimuthDeg;
  const requestedDirectionalLightElevationDeg = options?.directionalLightElevationDeg;
  const initialDirectionalLightAzimuthDeg = Number.isFinite(requestedDirectionalLightAzimuthDeg)
    ? requestedDirectionalLightAzimuthDeg ?? DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG
    : DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG;
  const initialDirectionalLightElevationDeg = Number.isFinite(requestedDirectionalLightElevationDeg)
    ? Math.max(-89, Math.min(89, requestedDirectionalLightElevationDeg ?? DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG))
    : DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG;
  const requestedDirectionalLightIntensity = options?.directionalLightIntensity;
  const initialDirectionalLightIntensity = Number.isFinite(requestedDirectionalLightIntensity)
    ? Math.max(0, requestedDirectionalLightIntensity ?? DEFAULT_DIRECTIONAL_LIGHT_INTENSITY)
    : DEFAULT_DIRECTIONAL_LIGHT_INTENSITY;

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
    const cesiumHeight = Math.max(0.4, cesiumMaxY - cesiumMinY);
    const glassSphereRadius = cesiumHeight * 0.5;
    const glassSphereCenter: [number, number, number] = [
      (CESIUM_MAN_TARGET_CENTER_XZ[0] + DAMAGED_HELMET_TARGET_CENTER[0]) * 0.5,
      (cesiumMinY + cesiumMaxY) * 0.5,
      (CESIUM_MAN_TARGET_CENTER_XZ[1] + DAMAGED_HELMET_TARGET_CENTER[2]) * 0.5,
    ];
    const glassSphereMesh: SceneMeshInstance = {
      geometry: createSphere({
        radius: glassSphereRadius,
        widthSegments: 64,
        heightSegments: 32,
      }),
      material: createDefaultMaterial({
        name: 'models-and-materials-glass-sphere',
        baseColor: GLASS_SPHERE_BASE_COLOR,
        metallic: 0.02,
        roughness: 0.03,
        clearCoatFactor: 1.0,
        clearCoatRoughness: 0.02,
        transparent: true,
        twoSided: true,
        refractionStrength: 1.25,
        ior: 1.52,
        refractionSteps: 14,
        refractionDepthBias: 0.0028,
        castsShadows: false,
      }),
      transform: mat4Translation(glassSphereCenter[0], glassSphereCenter[1], glassSphereCenter[2]),
    };

    const damagedHelmetMeshes = (damagedHelmetModel?.meshes ?? []).map((mesh) =>
      placeMeshAtTarget(mesh, DAMAGED_HELMET_TARGET_CENTER, DAMAGED_HELMET_SCALE),
    );
    const damagedHelmetBaseTransforms = damagedHelmetMeshes.map(
      (mesh) => new Float32Array(mesh.transform ?? mat4Identity()),
    );

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
    let rotationSpeedRadPerSec = initialRotationSpeedRadPerSec;
    let directionalLightPosition: [number, number, number] = directionFromAnglesDeg(
      initialDirectionalLightAzimuthDeg,
      initialDirectionalLightElevationDeg,
    );
    let directionalLightIntensity = initialDirectionalLightIntensity;

    const applyYawFromBase = (
      meshes: SceneMeshInstance[],
      baseTransforms: Mat4[],
      yawRadians: number,
    ): void => {
      const yaw = mat4RotationY(yawRadians);
      for (let index = 0; index < meshes.length; index += 1) {
        const base = baseTransforms[index];
        const pivotX = base[12];
        const pivotY = base[13];
        const pivotZ = base[14];
        const translateToPivot = mat4Translation(pivotX, pivotY, pivotZ);
        const translateFromPivot = mat4Translation(-pivotX, -pivotY, -pivotZ);
        const pivotYaw = mat4Multiply(translateToPivot, mat4Multiply(yaw, translateFromPivot));
        meshes[index].transform = mat4Multiply(pivotYaw, base);
      }
    };

    const applyYawOnCurrentTransform = (
      meshes: SceneMeshInstance[],
      deltaYawRadians: number,
    ): void => {
      const yaw = mat4RotationY(deltaYawRadians);
      for (const mesh of meshes) {
        const current = mesh.transform ?? mat4Identity();
        const pivotX = current[12];
        const pivotY = current[13];
        const pivotZ = current[14];
        const translateToPivot = mat4Translation(pivotX, pivotY, pivotZ);
        const translateFromPivot = mat4Translation(-pivotX, -pivotY, -pivotZ);
        const pivotYaw = mat4Multiply(translateToPivot, mat4Multiply(yaw, translateFromPivot));
        mesh.transform = mat4Multiply(pivotYaw, current);
      }
    };

    const sceneTextureLibrary = {
      ...cesiumTextureLibrary,
      ...damagedHelmetTextureLibrary,
    };
    const scene: RenderScene = {
      ...baseScene,
      meshes: [...baseScene.meshes, ...cesiumMeshes, glassSphereMesh, ...damagedHelmetMeshes],
      textureLibrary: sceneTextureLibrary,
    };
    const applyDirectionalLightToScene = (): void => {
      scene.directionalLightingEnabled = true;
      scene.directionalLightingIntensity = Math.max(0, directionalLightIntensity);
      scene.keyLightDirection = normalizeDirection(directionalLightPosition);
    };
    applyDirectionalLightToScene();

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
      setRotationSpeed: (speed) => {
        if (!Number.isFinite(speed)) {
          return;
        }
        rotationSpeedRadPerSec = speed;
      },
      setDirectionalLight: (position, intensity) => {
        if (!Number.isFinite(position[0]) || !Number.isFinite(position[1]) || !Number.isFinite(position[2])) {
          return;
        }
        if (!Number.isFinite(intensity)) {
          return;
        }
        directionalLightPosition = [position[0], position[1], position[2]];
        directionalLightIntensity = Math.max(0, intensity);
        applyDirectionalLightToScene();
      },
      beforeFrame: (context) => {
        const deltaSeconds = Math.max(0, context.deltaTimeMs) / 1000;
        cesiumModel?.controller.update(deltaSeconds);

        damagedHelmetYawRadians -= rotationSpeedRadPerSec * deltaSeconds;
        applyYawOnCurrentTransform(cesiumMeshes, rotationSpeedRadPerSec * deltaSeconds);
        applyYawFromBase(damagedHelmetMeshes, damagedHelmetBaseTransforms, damagedHelmetYawRadians);
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
      setRotationSpeed: () => {},
      setDirectionalLight: () => {},
      beforeFrame: noopBeforeFrame,
      dispose: () => {
        for (const dispose of disposalCallbacks) {
          dispose();
        }
      },
    };
  }
};
