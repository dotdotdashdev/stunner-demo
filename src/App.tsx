import { useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  CanvasStage,
  type CameraTelemetry,
  type ExampleTelemetry,
  type PerformanceTelemetry,
  type SandboxExample,
} from './components/CanvasStage';
import type { RenderBackend } from '@stunner/core/renderer/RendererEngine';
import { createRendererConfig, type RendererConfig } from '@stunner/core/renderer/config/RendererConfig';
import { RendererHud } from '@stunner/react';
import type { PointLightsExampleOptions } from './examples/pointLights';
import type { ModelsAndMaterialsExampleOptions } from './examples/modelsAndMaterials';
import type { FlockingExampleOptions } from './examples/flocking';
import type { CrowdExampleOptions } from './examples/crowd';
import type { SponzaExampleOptions } from './examples/sponza';
import {
  DEFAULT_CROWD_OPTIONS,
  DEFAULT_FLOCKING_OPTIONS,
  DEFAULT_MODELS_AND_MATERIALS_OPTIONS,
  DEFAULT_POINT_LIGHTS_OPTIONS,
  DEFAULT_SPONZA_OPTIONS,
  ExampleParametersHud,
} from './examples/hud/ExampleParametersHud';
import { ExampleSelectorHud } from './examples/hud/ExampleSelectorHud';

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
  const [sponzaOptions, setSponzaOptions] = useState<SponzaExampleOptions>(
    DEFAULT_SPONZA_OPTIONS,
  );
  const [hudsVisible, setHudsVisible] = useState(true);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isShiftH = event.shiftKey && (event.key === 'H' || event.key === 'h');
      if (!isShiftH || event.repeat) {
        return;
      }
      setHudsVisible((current) => !current);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

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
        sponzaOptions={sponzaOptions}
      />

      {hudsVisible ? (
        <>
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
              sponzaOptions={sponzaOptions}
              setModelsAndMaterialsOptions={setModelsAndMaterialsOptions}
              setPointLightsOptions={setPointLightsOptions}
              setFlockingOptions={setFlockingOptions}
              setCrowdOptions={setCrowdOptions}
              setSponzaOptions={setSponzaOptions}
            />
          </div>
        </>
      ) : null}
    </main>
  );
};

export default App;
