import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '../camera/Camera';
import { KeyboardController } from '../camera/KeyboardController';
import { MouseController } from '../camera/MouseController';
import { TouchController } from '../camera/TouchController';
import { RendererEngine, type RenderBackend } from './RendererEngine';
import type { RendererConfig } from './config/RendererConfig';
import { createBasicDemoScene } from '../../demo/basicDemo';
import { startCityDemo } from '../../demo/cityDemo';

export type CameraTelemetry = {
  location: [number, number, number];
  forward: [number, number, number];
};

export type PerformanceTelemetry = {
  fps: number;
  frameIntervalMs: number;
  frameTimeMs: number;
};

type CanvasStageProps = {
  className?: string;
  onBackendReady?: (backend: RenderBackend) => void;
  onCameraTelemetry?: (telemetry: CameraTelemetry) => void;
  onPerformanceTelemetry?: (telemetry: PerformanceTelemetry) => void;
  rendererConfig?: RendererConfig;
  demoSelection?: SandboxDemo;
  forceWebGpu?: boolean;
};

export type SandboxDemo = 'basic' | 'pointLights';

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  onCameraTelemetry,
  onPerformanceTelemetry,
  rendererConfig,
  demoSelection = 'basic',
  forceWebGpu = false,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const engineRef = useRef<RendererEngine | null>(null);
  const onBackendReadyRef = useRef<typeof onBackendReady>(onBackendReady);
  const onCameraTelemetryRef = useRef<typeof onCameraTelemetry>(onCameraTelemetry);
  const onPerformanceTelemetryRef = useRef<typeof onPerformanceTelemetry>(onPerformanceTelemetry);
  const [engineInstanceVersion, setEngineInstanceVersion] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const smoothedFpsRef = useRef(0);

  useEffect(() => {
    onBackendReadyRef.current = onBackendReady;
  }, [onBackendReady]);

  useEffect(() => {
    onCameraTelemetryRef.current = onCameraTelemetry;
  }, [onCameraTelemetry]);

  useEffect(() => {
    onPerformanceTelemetryRef.current = onPerformanceTelemetry;
  }, [onPerformanceTelemetry]);

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
    cameraRef.current = camera;

    const touchController = new TouchController(camera, canvas);
    const mouseController = new MouseController(camera, canvas);
    const keyboardController = new KeyboardController(camera);

    const telemetryTimer = window.setInterval(() => {
      const latestMetrics = engineRef.current?.getLatestFrameMetrics();
      let fps = 0;
      let frameIntervalMs = 0;
      let frameTimeMs = 0;
      if (latestMetrics && latestMetrics.frameIntervalMs > 0.0001) {
        frameIntervalMs = latestMetrics.frameIntervalMs;
        frameTimeMs = latestMetrics.frameTimeMs;
        const instantaneousFps = 1000 / latestMetrics.frameIntervalMs;
        const boundedFps = Math.min(240, Math.max(0, instantaneousFps));
        const alpha = 0.2;
        if (smoothedFpsRef.current <= 0.0001) {
          smoothedFpsRef.current = boundedFps;
        } else {
          smoothedFpsRef.current = smoothedFpsRef.current + (boundedFps - smoothedFpsRef.current) * alpha;
        }
        fps = smoothedFpsRef.current;
      }
      onCameraTelemetryRef.current?.({
        location: camera.getLocation(),
        forward: camera.forwardDir(),
      });
      onPerformanceTelemetryRef.current?.({ fps, frameIntervalMs, frameTimeMs });
    }, 120);

    const engine = new RendererEngine(canvas, undefined, camera, {
      webGpuOnly: forceWebGpu,
    });
    engineRef.current = engine;
    setEngineInstanceVersion((current) => current + 1);

    let disposed = false;

    void engine
      .start()
      .then((backend) => {
        if (!disposed) {
          onBackendReadyRef.current?.(backend);
        }
      })
      .catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : forceWebGpu
              ? 'Renderer failed to start with WebGPU.'
              : 'Renderer failed to start with WebGPU and WebGL2.';
        setFatalError(message);
      });
    return () => {
      disposed = true;
      cameraRef.current = null;
      engineRef.current = null;
      touchController.dispose();
      mouseController.dispose();
      keyboardController.dispose();
      window.clearInterval(telemetryTimer);
      engine.dispose();
    };
  }, [forceWebGpu]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    const camera = cameraRef.current;
    if (camera) {
      if (demoSelection === 'pointLights') {
        camera.setLocation([22.0, 22.0, 10.0]);
        camera.lookAt([0, 3.8, -8.0]);
      } else {
        camera.setLocation([6.5, 6.5, 1.0]);
        camera.lookAt([0, 0.8, -5.5]);
      }
    }

    let disposed = false;
    let disposeDemo: (() => void) | null = null;

    if (demoSelection === 'pointLights') {
      const controller = startCityDemo((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      });
      disposeDemo = controller.dispose;
    } else {
      void createBasicDemoScene()
        .then((result) => {
          if (disposed) {
            result.dispose();
            return;
          }
          engine.setScene(result.scene);
          disposeDemo = result.dispose;
        })
        .catch((error: unknown) => {
          console.warn('Basic demo scene failed to initialize.', error);
        });
    }

    return () => {
      disposed = true;
      disposeDemo?.();
    };
  }, [demoSelection, engineInstanceVersion]);

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
