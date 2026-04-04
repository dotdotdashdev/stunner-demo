import type { DemoModelFormat } from '../stunner/renderer/debug/RuntimeControls';
import { loadGltfSceneFromUrl } from '../stunner/renderer/mesh/GltfLoader';
import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import { mat4Translation, type RenderScene } from '../stunner/renderer/mesh/SceneTypes';

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
        transform: mat4Translation(0, 0.9, -5.5),
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

  const loadedMeshes = successfulLoads.flatMap((loaded) => loaded.meshes);
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
