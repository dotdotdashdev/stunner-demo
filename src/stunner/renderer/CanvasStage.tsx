import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '../camera/Camera';
import { KeyboardController } from '../camera/KeyboardController';
import { MouseController } from '../camera/MouseController';
import { TouchController } from '../camera/TouchController';
import { RendererEngine, type RenderBackend } from './RendererEngine';
import type { RendererConfig } from './config/RendererConfig';
import type { DemoModelFormat } from './debug/RuntimeControls';
import { createBasicDemoScene } from '../../demo/basicDemo';
import { startPhysicsDemo } from '../../demo/physicsDemo';

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
  demoSelection?: SandboxDemo;
};

export type SandboxDemo = 'basic' | 'physics';

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  onCameraTelemetry,
  rendererConfig,
  demoModelFormat = 'both',
  demoSelection = 'basic',
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<RendererEngine | null>(null);
  const onBackendReadyRef = useRef<typeof onBackendReady>(onBackendReady);
  const onCameraTelemetryRef = useRef<typeof onCameraTelemetry>(onCameraTelemetry);
  const [engineInstanceVersion, setEngineInstanceVersion] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    onBackendReadyRef.current = onBackendReady;
  }, [onBackendReady]);

  useEffect(() => {
    onCameraTelemetryRef.current = onCameraTelemetry;
  }, [onCameraTelemetry]);

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
      onCameraTelemetryRef.current?.({
        location: camera.getLocation(),
        forward: camera.forwardDir(),
      });
    }, 120);

    const engine = new RendererEngine(canvas, undefined, camera);
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
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }

    let disposed = false;
    let disposeDemo: (() => void) | null = null;

    if (demoSelection === 'physics') {
      const controller = startPhysicsDemo((scene) => {
        if (disposed) {
          return;
        }
        engine.setScene(scene);
      });
      disposeDemo = controller.dispose;
    } else {
      void createBasicDemoScene(demoModelFormat)
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
  }, [demoModelFormat, demoSelection, engineInstanceVersion]);

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
