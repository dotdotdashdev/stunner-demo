import { memo, useEffect, useRef, useState } from 'react';
import { Camera } from '../camera/Camera';
import { KeyboardController } from '../camera/KeyboardController';
import { MouseController } from '../camera/MouseController';
import { TouchController } from '../camera/TouchController';
import { RendererEngine, type RenderBackend } from './RendererEngine';
import type { RendererConfig } from './config/RendererConfig';

export type CameraTelemetry = {
  location: [number, number, number];
  forward: [number, number, number];
};

type CanvasStageProps = {
  className?: string;
  onBackendReady?: (backend: RenderBackend) => void;
  onCameraTelemetry?: (telemetry: CameraTelemetry) => void;
  rendererConfig?: RendererConfig;
};
export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  onCameraTelemetry,
  rendererConfig,
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
      location: [0, 1.2, 1.5],
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
    let disposed = false;
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
      engine.dispose();
    };
  }, [onBackendReady, onCameraTelemetry]);
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
