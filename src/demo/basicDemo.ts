import type { DemoModelFormat } from '../stunner/renderer/debug/RuntimeControls';
import { loadGltfSceneFromUrl } from '../stunner/renderer/mesh/GltfLoader';
import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationY,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '../stunner/renderer/mesh/SceneTypes';

export type BasicDemoSceneResult = {
  scene: RenderScene;
  dispose: () => void;
};

const getDemoModelUrls = (format: DemoModelFormat): string[] => {
  if (format === 'gltf') {
    return ['/models/demo-quad.gltf'];
  }
  if (format === 'glb') {
    return ['/models/demo-quad.glb'];
  }
  return ['/models/demo-quad.gltf', '/models/demo-quad.glb'];
};

const createBaseScene = (): RenderScene => {
  return {
    meshes: [
      {
        geometry: createSphere({ radius: 0.9, widthSegments: 48, heightSegments: 32 }),
        material: createDefaultMaterial({
          name: 'basic-sphere',
          baseColor: [0.9, 0.74, 0.56, 1],
          roughness: 0.35,
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

const SPHERE_CENTER_Y = 0.7;

const transformPoint = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
};

const getWorldBoundsY = (mesh: SceneMeshInstance, transform: Mat4): { minY: number; maxY: number } => {
  const stride = 12;
  const vertices = mesh.geometry.vertices;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < mesh.geometry.vertexCount; index += 1) {
    const base = index * stride;
    const worldPoint = transformPoint(transform, vertices[base], vertices[base + 1], vertices[base + 2]);
    minY = Math.min(minY, worldPoint[1]);
    maxY = Math.max(maxY, worldPoint[1]);
  }
  return { minY, maxY };
};

const orientAndPlaceMeshAtSphereCenter = (mesh: SceneMeshInstance): SceneMeshInstance => {
  const baseTransform = mesh.transform ?? mat4Identity();
  const yawRotation = mat4RotationY(Math.PI * 0.36);
  const rotatedTransform = mat4Multiply(baseTransform, yawRotation);
  const boundsY = getWorldBoundsY(mesh, rotatedTransform);
  const centerY = (boundsY.minY + boundsY.maxY) * 0.5;
  const deltaY = SPHERE_CENTER_Y - centerY;
  const liftedTransform = mat4Multiply(mat4Translation(0, deltaY, 0), rotatedTransform);
  return {
    ...mesh,
    transform: liftedTransform,
  };
};

export const createBasicDemoScene = async (
  demoModelFormat: DemoModelFormat,
): Promise<BasicDemoSceneResult> => {
  const baseScene = createBaseScene();
  const modelUrls = getDemoModelUrls(demoModelFormat);
  const settled = await Promise.allSettled(modelUrls.map((url) => loadGltfSceneFromUrl(url)));

  const successfulLoads = settled
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof loadGltfSceneFromUrl>>> => {
      return result.status === 'fulfilled';
    })
    .map((result) => result.value);

  const failedLoads = settled.filter((result): result is PromiseRejectedResult => {
    return result.status === 'rejected';
  });

  for (const failedLoad of failedLoads) {
    console.warn('Basic demo model failed to load.', failedLoad.reason);
  }

  if (successfulLoads.length === 0) {
    return {
      scene: baseScene,
      dispose: () => {},
    };
  }

  const loadedMeshes = successfulLoads
    .flatMap((loaded) => loaded.meshes)
    .map((mesh) => orientAndPlaceMeshAtSphereCenter(mesh));
  return {
    scene: {
      ...baseScene,
      meshes: [...baseScene.meshes, ...loadedMeshes],
    },
    dispose: () => {
      for (const loaded of successfulLoads) {
        loaded.dispose();
      }
    },
  };
};
