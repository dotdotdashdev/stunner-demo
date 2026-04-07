import { useCallback, useState } from 'react';
import './App.css';
import {
  CanvasStage,
  type CameraTelemetry,
  type ExampleTelemetry,
  type PerformanceTelemetry,
  type SandboxExample,
} from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import { createRendererConfig, type RendererConfig } from './stunner/renderer/config/RendererConfig';
import { RendererHud } from './stunner/hud/RendererHud';
import type { PointLightsExampleOptions } from './example/pointLights';
import type { ModelsAndMaterialsExampleOptions } from './example/modelsAndMaterials';
import type { FlockingExampleOptions } from './example/flocking';
import type { CrowdExampleOptions } from './example/crowd';
import {
  DEFAULT_CROWD_OPTIONS,
  DEFAULT_FLOCKING_OPTIONS,
  DEFAULT_MODELS_AND_MATERIALS_OPTIONS,
  DEFAULT_POINT_LIGHTS_OPTIONS,
  ExampleParametersHud,
} from './example/hud/ExampleParametersHud';
import { ExampleSelectorHud } from './example/hud/ExampleSelectorHud';

const App = () => {
  const [sandboxExample, setSandboxExample] = useState<SandboxExample>('modelsAndMaterials');
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
  const [exampleTelemetry, setExampleTelemetry] = useState<ExampleTelemetry>(null);
  const [modelsAndMaterialsOptions, setModelsAndMaterialsOptions] = useState<ModelsAndMaterialsExampleOptions>(
    DEFAULT_MODELS_AND_MATERIALS_OPTIONS,
  );
  const [pointLightsOptions, setPointLightsOptions] = useState<PointLightsExampleOptions>(
    DEFAULT_POINT_LIGHTS_OPTIONS,
  );
  const [flockingOptions, setFlockingOptions] = useState<FlockingExampleOptions>(
    DEFAULT_FLOCKING_OPTIONS,
  );
  const [crowdOptions, setCrowdOptions] = useState<CrowdExampleOptions>(
    DEFAULT_CROWD_OPTIONS,
  );

  const handleBackendReady = useCallback((backend: RenderBackend) => {
    setRenderBackend(backend);
  }, []);

  const handleCameraTelemetry = useCallback((telemetry: CameraTelemetry) => {
    setCameraTelemetry(telemetry);
  }, []);

  const handlePerformanceTelemetry = useCallback((telemetry: PerformanceTelemetry) => {
    setPerfTelemetry(telemetry);
  }, []);

  const handleExampleTelemetry = useCallback((telemetry: ExampleTelemetry) => {
    setExampleTelemetry(telemetry);
  }, []);

  const handleRendererConfigChange = useCallback((nextConfig: RendererConfig) => {
    setRendererConfig(nextConfig);
  }, []);

  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        onCameraTelemetry={handleCameraTelemetry}
        onPerformanceTelemetry={handlePerformanceTelemetry}
        onExampleTelemetry={handleExampleTelemetry}
        rendererConfig={rendererConfig}
        exampleSelection={sandboxExample}
        modelsAndMaterialsOptions={modelsAndMaterialsOptions}
        pointLightsOptions={pointLightsOptions}
        flockingOptions={flockingOptions}
        crowdOptions={crowdOptions}
      />

      <RendererHud
        renderBackend={renderBackend}
        perfTelemetry={perfTelemetry}
        cameraTelemetry={cameraTelemetry}
        onRendererConfigChange={handleRendererConfigChange}
        autoImportSettingsUrl={`/settings/${sandboxExample}.json`}
      />

      <div className="example-hud-stack" aria-label="Example controls stack">
        <ExampleSelectorHud
          sandboxExample={sandboxExample}
          onSelectExample={setSandboxExample}
        />

        <ExampleParametersHud
          sandboxExample={sandboxExample}
          exampleTelemetry={exampleTelemetry}
          modelsAndMaterialsOptions={modelsAndMaterialsOptions}
          pointLightsOptions={pointLightsOptions}
          flockingOptions={flockingOptions}
          crowdOptions={crowdOptions}
          setModelsAndMaterialsOptions={setModelsAndMaterialsOptions}
          setPointLightsOptions={setPointLightsOptions}
          setFlockingOptions={setFlockingOptions}
          setCrowdOptions={setCrowdOptions}
        />
      </div>
    </main>
  );
};

export default App;
