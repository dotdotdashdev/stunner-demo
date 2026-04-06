import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { CanvasStage, type CameraTelemetry, type PerformanceTelemetry, type SandboxDemo } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import { createRendererConfig, type RendererConfig } from './stunner/renderer/config/RendererConfig';
import { RendererHud } from './stunner/hud/RendererHud';

const SANDBOX_DEMOS: SandboxDemo[] = ['basic', 'pointLights', 'flocking'];

const createFlockingRendererConfig = (): RendererConfig => {
  const config = createRendererConfig('high');
  config.shadows.enabled = false;
  config.ambientOcclusion.enabled = false;
  config.bloom.enabled = false;
  config.depthOfField.enabled = false;
  config.colorGrading.enabled = false;
  config.motionBlur.enabled = false;
  config.screenSpaceReflections.enabled = false;
  config.screenSpaceReflections.experimentalEnabled = false;
  config.screenSpaceReflections.stage = 0;
  config.fog.enabled = false;
  config.visibility.frustumCullingEnabled = true;
  config.clustered.debugView = 'off';
  return config;
};

const App = () => {
  const [sandboxDemo, setSandboxDemo] = useState<SandboxDemo>('basic');
  const [rendererConfig, setRendererConfig] = useState<RendererConfig>(createRendererConfig('high'));
  const [renderBackend, setRenderBackend] = useState<RenderBackend>('webgl2');
  const [perfTelemetry, setPerfTelemetry] = useState<PerformanceTelemetry>({
    fps: 0,
    frameIntervalMs: 0,
    frameTimeMs: 0,
  });
  const [cameraTelemetry, setCameraTelemetry] = useState<CameraTelemetry>({
    location: [0, 0, 0],
    forward: [0, 0, -1],
  });

  const handleBackendReady = useCallback((backend: RenderBackend) => {
    setRenderBackend(backend);
  }, []);

  const handleCameraTelemetry = useCallback((telemetry: CameraTelemetry) => {
    setCameraTelemetry(telemetry);
  }, []);

  const handlePerformanceTelemetry = useCallback((telemetry: PerformanceTelemetry) => {
    setPerfTelemetry(telemetry);
  }, []);

  const handleRendererConfigChange = useCallback((nextConfig: RendererConfig) => {
    setRendererConfig(nextConfig);
  }, []);

  const activeRendererConfig = useMemo(() => {
    if (sandboxDemo === 'flocking') {
      return createFlockingRendererConfig();
    }
    return rendererConfig;
  }, [rendererConfig, sandboxDemo]);

  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        onCameraTelemetry={handleCameraTelemetry}
        onPerformanceTelemetry={handlePerformanceTelemetry}
        rendererConfig={activeRendererConfig}
        demoSelection={sandboxDemo}
      />

      <RendererHud
        renderBackend={renderBackend}
        perfTelemetry={perfTelemetry}
        cameraTelemetry={cameraTelemetry}
        onRendererConfigChange={handleRendererConfigChange}
      />

      <aside className="demo-hud" aria-label="Demo selector">
        <label htmlFor="sandbox-demo">Demo</label>
        <select
          id="sandbox-demo"
          value={sandboxDemo}
          onChange={(event) => setSandboxDemo(event.target.value as SandboxDemo)}
        >
          {SANDBOX_DEMOS.map((demo) => (
            <option key={demo} value={demo}>
              {demo}
            </option>
          ))}
        </select>
      </aside>
    </main>
  );
};

export default App;
