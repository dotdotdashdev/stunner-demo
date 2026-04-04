import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '../camera/Camera';
import { KeyboardController } from '../camera/KeyboardController';
import { MouseController } from '../camera/MouseController';
import { TouchController } from '../camera/TouchController';
import { RendererEngine, type RenderBackend } from './RendererEngine';
import type { RendererConfig } from './config/RendererConfig';
import type { DemoModelFormat } from './debug/RuntimeControls';
import { createSphere, createPlane } from './mesh/MeshFactory';
import { loadGltfSceneFromUrl } from './mesh/GltfLoader';
import { createDefaultMaterial } from './mesh/MaterialTypes';
import { mat4Translation, type RenderScene } from './mesh/SceneTypes';

export type CameraTelemetry = {
  location: [number, number, number];
  forward: [number, number, number];
};

type CanvasStageProps = {
  className?: string;
  onBackendReady?: (backend: RenderBackend) => void;
  onCameraTelemetry?: (telemetry: CameraTelemetry) => void;
  rendererConfig?: RendererConfig;
  demoModelFormat?: DemoModelFormat;
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

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  onCameraTelemetry,
  rendererConfig,
  demoModelFormat = 'both',
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RendererEngine | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const camera = new Camera({
      location: [6.5, 6.5, 1.0],
      rotationEuler: [0, 0, 0],
    });
    camera.lookAt([0, 0.8, -5.5]);

    const touchController = new TouchController(camera, canvas);
    const mouseController = new MouseController(camera, canvas);
    const keyboardController = new KeyboardController(camera);

    const telemetryTimer = window.setInterval(() => {
      onCameraTelemetry?.({
        location: camera.getLocation(),
        forward: camera.forwardDir(),
      });
    }, 120);

    const engine = new RendererEngine(canvas, undefined, camera);
    engineRef.current = engine;

    const demoScene: RenderScene = {
      meshes: [
        {
          geometry: createSphere({ radius: 0.9, widthSegments: 48, heightSegments: 32 }),
          material: createDefaultMaterial({ name: 'sphere', baseColor: [0.9, 0.74, 0.56, 1], roughness: 0.35 }),
          transform: mat4Translation(0, 0.9, -5.5),
        },
        {
          geometry: createPlane({ width: 40, depth: 40, widthSegments: 20, depthSegments: 20 }),
          material: createDefaultMaterial({ name: 'ground', baseColor: [0.14, 0.16, 0.18, 1], roughness: 0.8 }),
          transform: mat4Translation(0, -0.2, -10),
        },
      ],
      lights: [],
    };
    engine.setScene(demoScene);
    let disposed = false;
    let disposeLoadedModels: (() => void) | null = null;

    void (async () => {
      try {
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
          console.warn('Demo model failed to load.', failedLoad.reason);
        }

        if (successfulLoads.length === 0) {
          throw new Error('No demo model variants loaded successfully.');
        }

        if (disposed) {
          for (const loaded of successfulLoads) {
            loaded.dispose();
          }
          return;
        }

        disposeLoadedModels = () => {
          for (const loaded of successfulLoads) {
            loaded.dispose();
          }
        };

        const loadedMeshes = successfulLoads.flatMap((loaded) => loaded.meshes);
        engine.setScene({
          ...demoScene,
          meshes: [...demoScene.meshes, ...loadedMeshes],
        });
      } catch (error: unknown) {
        console.warn('Demo glTF/GLB model load failed.', error);
      }
    })();

    void engine
      .start()
      .then((backend) => {
        if (!disposed) {
          onBackendReady?.(backend);
        }
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Renderer failed to start with WebGPU and WebGL2.';
        setFatalError(message);
      });
    return () => {
      disposed = true;
      engineRef.current = null;
      touchController.dispose();
      mouseController.dispose();
      keyboardController.dispose();
      window.clearInterval(telemetryTimer);
      disposeLoadedModels?.();
      engine.dispose();
    };
  }, [demoModelFormat, onBackendReady, onCameraTelemetry]);
  useEffect(() => {
    if (!rendererConfig || !engineRef.current) {
      return;
    }
    engineRef.current.updateConfig(rendererConfig);
  }, [rendererConfig]);
  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className={className} aria-label="Game rendering surface" />
      {fatalError ? <p className="canvas-error">{fatalError}</p> : null}
    </div>
  );
});
