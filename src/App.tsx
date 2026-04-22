import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
  CanvasStage,
  type CameraTelemetry,
  type CanvasStageCameraControls,
  type ExampleTelemetry,
  type PerformanceTelemetry,
  type SandboxExample,
} from './components/CanvasStage';
import { createRendererConfig, type RendererConfig } from '@stunner/core/renderer/config/RendererConfig';
import {
  RendererHud,
  type CameraSettings,
} from '@stunner/react';
import type { PointLightsExampleOptions } from './examples/pointLights';
import type { ModelsAndMaterialsExampleOptions } from './examples/modelsAndMaterials';
import type { FlockingExampleOptions } from './examples/flocking';
import type { CrowdExampleOptions } from './examples/crowd';
import type { SponzaExampleOptions } from './examples/sponza';
import type { BrainStemDracoExampleOptions } from './examples/brainStemDraco';
import type { HillsExampleOptions } from './examples/hills';
import {
  DEFAULT_PORSCHE_OPTIONS,
  type PorscheExampleOptions,
} from './examples/usd/porsche';
import {
  DEFAULT_CROWD_OPTIONS,
  DEFAULT_BRAIN_STEM_DRACO_OPTIONS,
  DEFAULT_FLOCKING_OPTIONS,
  DEFAULT_HILLS_OPTIONS,
  DEFAULT_MODELS_AND_MATERIALS_OPTIONS,
  DEFAULT_POINT_LIGHTS_OPTIONS,
  DEFAULT_SPONZA_OPTIONS,
  ExampleParametersHud,
  hasExampleParameterControls,
} from './examples/hud/ExampleParametersHud';
import { ExampleSelectorHud } from './examples/hud/ExampleSelectorHud';

const App = () => {
  const [sandboxExample, setSandboxExample] = useState<SandboxExample>('modelsAndMaterials');
  const [rendererConfig, setRendererConfig] = useState<RendererConfig>(createRendererConfig('high'));
  const [perfTelemetry, setPerfTelemetry] = useState<PerformanceTelemetry>({
    fps: 0,
    frameIntervalMs: 0,
    frameTimeMs: 0,
    cpuUsagePercent: null,
    cpuMemoryMb: null,
    gpuUsagePercent: null,
    gpuMemoryMb: null,
  });
  const [cameraTelemetry, setCameraTelemetry] = useState<CameraTelemetry>({
    location: [0, 0, 0],
    forward: [0, 0, -1],
    fovDegrees: 60,
    interpolationSpeed: 0.333,
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
  const [sponzaOptions] = useState<SponzaExampleOptions>(
    DEFAULT_SPONZA_OPTIONS,
  );
  const [brainStemDracoOptions, setBrainStemDracoOptions] = useState<BrainStemDracoExampleOptions>(
    DEFAULT_BRAIN_STEM_DRACO_OPTIONS,
  );
  const [porscheOptions, setPorscheOptions] = useState<PorscheExampleOptions>(
    DEFAULT_PORSCHE_OPTIONS,
  );
  const [hillsOptions, setHillsOptions] = useState<HillsExampleOptions>(
    DEFAULT_HILLS_OPTIONS,
  );
  const [exampleLoadingProgress, setExampleLoadingProgress] = useState<number | null>(null);
  const [hudsVisible, setHudsVisible] = useState(true);
  const settingsFileStem = sandboxExample;

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

  const handleExampleLoadingProgress = useCallback((progress: number | null) => {
    if (progress === null) {
      setExampleLoadingProgress(null);
      return;
    }
    if (!Number.isFinite(progress)) {
      setExampleLoadingProgress(0);
      return;
    }
    setExampleLoadingProgress(Math.max(0, Math.min(1, progress)));
  }, []);

  const cameraControlsRef = useRef<CanvasStageCameraControls | null>(null);

  const handleGetCurrentCamera = useCallback((): CameraSettings | null => {
    const telemetry = cameraControlsRef.current?.getCamera();
    if (!telemetry) {
      return null;
    }
    return {
      position: telemetry.location,
      forward: telemetry.forward,
      fovDegrees: telemetry.fovDegrees,
      interpolationSpeed: telemetry.interpolationSpeed,
    };
  }, []);

  const handleApplyCameraSettings = useCallback((camera: CameraSettings) => {
    cameraControlsRef.current?.setCamera({
      location: camera.position,
      forward: camera.forward,
      fovDegrees: camera.fovDegrees,
      interpolationSpeed: camera.interpolationSpeed,
      snap: camera.snap,
    });
  }, []);

  return (
    <main className="app-shell">
      <CanvasStage
        key={`stage-${sandboxExample}`}
        className="game-canvas"
        onCameraTelemetry={handleCameraTelemetry}
        onPerformanceTelemetry={handlePerformanceTelemetry}
        onExampleTelemetry={handleExampleTelemetry}
        onExampleLoadingProgress={handleExampleLoadingProgress}
        rendererConfig={rendererConfig}
        exampleSelection={sandboxExample}
        modelsAndMaterialsOptions={modelsAndMaterialsOptions}
        pointLightsOptions={pointLightsOptions}
        flockingOptions={flockingOptions}
        crowdOptions={crowdOptions}
        sponzaOptions={sponzaOptions}
        brainStemDracoOptions={brainStemDracoOptions}
        porscheOptions={porscheOptions}
        hillsOptions={hillsOptions}
        cameraControlsRef={cameraControlsRef}
      />

      {exampleLoadingProgress !== null ? (
        <div className="example-loading-overlay" aria-live="polite" aria-label="Loading example model">
          <div className="example-loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exampleLoadingProgress * 100)}>
            <div
              className="example-loading-fill"
              style={{ height: `${Math.round(exampleLoadingProgress * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div
        className={`hud-visibility-layer${hudsVisible ? '' : ' is-hidden'}`}
        aria-hidden={!hudsVisible}
      >
        <RendererHud
          key={`renderer-hud-${sandboxExample}`}
          perfTelemetry={perfTelemetry}
          cameraTelemetry={cameraTelemetry}
          onRendererConfigChange={handleRendererConfigChange}
          autoImportSettingsUrl={`/settings/${settingsFileStem}.json`}
          getCurrentCamera={handleGetCurrentCamera}
          onCameraChange={handleApplyCameraSettings}
        />

        <div className="example-hud-stack" aria-label="Example controls stack">
          <ExampleSelectorHud
            sandboxExample={sandboxExample}
            onSelectExample={setSandboxExample}
          />

          {hasExampleParameterControls(sandboxExample) ? (
            <ExampleParametersHud
              sandboxExample={sandboxExample}
              exampleTelemetry={exampleTelemetry}
              modelsAndMaterialsOptions={modelsAndMaterialsOptions}
              pointLightsOptions={pointLightsOptions}
              flockingOptions={flockingOptions}
              crowdOptions={crowdOptions}
              brainStemDracoOptions={brainStemDracoOptions}
              porscheOptions={porscheOptions}
              hillsOptions={hillsOptions}
              setModelsAndMaterialsOptions={setModelsAndMaterialsOptions}
              setPointLightsOptions={setPointLightsOptions}
              setFlockingOptions={setFlockingOptions}
              setCrowdOptions={setCrowdOptions}
              setBrainStemDracoOptions={setBrainStemDracoOptions}
              setPorscheOptions={setPorscheOptions}
              setHillsOptions={setHillsOptions}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default App;
