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
import type { RenderBackend } from '@stunner/core/renderer/RendererEngine';
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
import {
  DEFAULT_PORSCHE_OPTIONS,
  type PorscheExampleOptions,
} from './examples/usd/porsche';
import {
  DEFAULT_CROWD_OPTIONS,
  DEFAULT_BRAIN_STEM_DRACO_OPTIONS,
  DEFAULT_FLOCKING_OPTIONS,
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
  const [preferredRenderBackend, setPreferredRenderBackend] = useState<RenderBackend>('webgpu');
  const [activeRenderBackend, setActiveRenderBackend] = useState<RenderBackend | null>(null);
  const [backendReloadToken, setBackendReloadToken] = useState(0);
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
  const [crowdComputeOptions, setCrowdComputeOptions] = useState<CrowdExampleOptions>(
    DEFAULT_CROWD_OPTIONS,
  );
  const [sponzaOptions, setSponzaOptions] = useState<SponzaExampleOptions>(
    DEFAULT_SPONZA_OPTIONS,
  );
  const [brainStemDracoOptions, setBrainStemDracoOptions] = useState<BrainStemDracoExampleOptions>(
    DEFAULT_BRAIN_STEM_DRACO_OPTIONS,
  );
  const [porscheOptions, setPorscheOptions] = useState<PorscheExampleOptions>(
    DEFAULT_PORSCHE_OPTIONS,
  );
  const [exampleLoadingProgress, setExampleLoadingProgress] = useState<number | null>(null);
  const [hudsVisible, setHudsVisible] = useState(true);
  const requiresWebGpuBackend = sandboxExample === 'flocking' || sandboxExample === 'crowdCompute';
  const availableRenderBackends: RenderBackend[] = requiresWebGpuBackend
    ? ['webgpu']
    : ['webgpu', 'webgl2'];
  const settingsFileStem = `${sandboxExample}.${preferredRenderBackend}`;
  const backendSelectionHint = requiresWebGpuBackend
    ? 'This example uses compute stages which require WebGPU.'
    : null;

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

  useEffect(() => {
    if (requiresWebGpuBackend && preferredRenderBackend !== 'webgpu') {
      setPreferredRenderBackend('webgpu');
    }
  }, [preferredRenderBackend, requiresWebGpuBackend]);

  const handleBackendReady = useCallback((backend: RenderBackend) => {
    setActiveRenderBackend((current) => {
      if (current === backend) {
        return current;
      }
      if (current !== null) {
        setModelsAndMaterialsOptions(DEFAULT_MODELS_AND_MATERIALS_OPTIONS);
        setPointLightsOptions(DEFAULT_POINT_LIGHTS_OPTIONS);
        setFlockingOptions(DEFAULT_FLOCKING_OPTIONS);
        setCrowdOptions(DEFAULT_CROWD_OPTIONS);
        setCrowdComputeOptions(DEFAULT_CROWD_OPTIONS);
        setSponzaOptions(DEFAULT_SPONZA_OPTIONS);
        setBrainStemDracoOptions(DEFAULT_BRAIN_STEM_DRACO_OPTIONS);
        setPorscheOptions(DEFAULT_PORSCHE_OPTIONS);
        setBackendReloadToken((token) => token + 1);
      }
      return backend;
    });
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
    };
  }, []);

  const handleApplyCameraSettings = useCallback((camera: CameraSettings) => {
    cameraControlsRef.current?.setCamera({
      location: camera.position,
      forward: camera.forward,
    });
  }, []);

  return (
    <main className="app-shell">
      <CanvasStage
        key={`stage-${sandboxExample}-${preferredRenderBackend}-${backendReloadToken}`}
        className="game-canvas"
        onBackendReady={handleBackendReady}
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
        crowdComputeOptions={crowdComputeOptions}
        sponzaOptions={sponzaOptions}
        brainStemDracoOptions={brainStemDracoOptions}
        porscheOptions={porscheOptions}
        preferredBackend={preferredRenderBackend}
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
          key={`renderer-hud-${sandboxExample}-${preferredRenderBackend}-${backendReloadToken}`}
          renderBackend={preferredRenderBackend}
          activeRenderBackend={activeRenderBackend ?? preferredRenderBackend}
          availableRenderBackends={availableRenderBackends}
          backendSelectionHint={backendSelectionHint}
          perfTelemetry={perfTelemetry}
          cameraTelemetry={cameraTelemetry}
          onRendererConfigChange={handleRendererConfigChange}
          onRenderBackendChange={setPreferredRenderBackend}
          autoImportSettingsUrl={`/settings/${settingsFileStem}.json?backend=${preferredRenderBackend}&reload=${backendReloadToken}`}
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
              crowdOptions={sandboxExample === 'crowdCompute' ? crowdComputeOptions : crowdOptions}
              brainStemDracoOptions={brainStemDracoOptions}
              porscheOptions={porscheOptions}
              setModelsAndMaterialsOptions={setModelsAndMaterialsOptions}
              setPointLightsOptions={setPointLightsOptions}
              setFlockingOptions={setFlockingOptions}
              setCrowdOptions={sandboxExample === 'crowdCompute' ? setCrowdComputeOptions : setCrowdOptions}
              setBrainStemDracoOptions={setBrainStemDracoOptions}
              setPorscheOptions={setPorscheOptions}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
};

export default App;
