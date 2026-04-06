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
      lights: [],
    },
    dispose: () => {},
  };
};
