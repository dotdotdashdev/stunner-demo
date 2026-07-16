import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';
import type { RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import { createGSplatWebGpuStage } from '@dotdotdash/stunner-gsplat';
import type { Camera } from '@dotdotdash/stunner-core/camera/Camera';

export type GsplatExampleController = {
  engineOptions: RendererEngineOptions;
  dispose: () => void;
};

const GSPLAT_ASSET_URL = '/models/sog/shell-1.sog';

export const startGsplatExample = (
  onSceneReady: (scene: RenderScene) => void,
  camera: Camera,
  _options?: unknown,
): GsplatExampleController => {
  const scene: RenderScene = { meshes: [], lights: [] };
  onSceneReady(scene);

  const stage = createGSplatWebGpuStage(GSPLAT_ASSET_URL, { camera, name: 'gsplat-stage' });

  return {
    engineOptions: {
      webGpuStages: [stage],
    },
    dispose: () => {
      stage.dispose();
    },
  };
};
