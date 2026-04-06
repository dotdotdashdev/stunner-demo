import type { RenderScene } from '../stunner/renderer/mesh/SceneTypes';

export type CrowdExampleSceneResult = {
  scene: RenderScene;
  dispose: () => void;
};

export type CrowdExampleOptions = {
  crowdCount: number;
};

export const createCrowdExampleScene = async (
  _options: CrowdExampleOptions = { crowdCount: 100 },
): Promise<CrowdExampleSceneResult> => {
  return {
    scene: {
      meshes: [],
      directionalLightingEnabled: true,
      directionalLightingIntensity: 1.0,
      keyLightDirection: [0.42, 0.94, 0.25],
      lights: [],
    },
    dispose: () => {},
  };
};
