import type { RendererEngineOptions } from '@stunner/core/renderer/RendererEngine';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { CrowdExampleOptions } from './crowdCompute';

export {
  CROWD_BODY_COUNT_MAX,
  CROWD_BODY_COUNT_MIN,
  CROWD_COLLISION_RADIUS_MAX,
  CROWD_COLLISION_RADIUS_MIN,
  DEFAULT_CROWD_OPTIONS,
  type CrowdExampleOptions,
} from './crowdCompute';

type CrowdExampleController = {
  engineOptions: RendererEngineOptions;
  setOptions: (options: CrowdExampleOptions) => void;
  dispose: () => void;
};

const EMPTY_CROWD_SCENE: RenderScene = {
  meshes: [],
  instancedMeshes: [],
  textureLibrary: {},
  lights: [],
};

export const startCrowdExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<CrowdExampleOptions>,
): CrowdExampleController => {
  applyScene(EMPTY_CROWD_SCENE);

  return {
    engineOptions: {},
    setOptions: (_options: CrowdExampleOptions) => {},
    dispose: () => {},
  };
};
