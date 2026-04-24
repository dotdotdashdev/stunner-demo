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

/**
 * Detect actual mobile platforms (phones / tablets), not merely small viewports.
 * Prefers the User-Agent Client Hints `mobile` boolean when available, otherwise
 * falls back to a UA-string regex. Returns false in non-browser environments.
 */
const isMobilePlatform = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') {
    return uaData.mobile;
  }
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i.test(ua);
};

const SETTINGS_PLATFORM_SUFFIX: 'mobile' | 'desktop' = isMobilePlatform() ? 'mobile' : 'desktop';

const App = () => {
  const [sandboxExample, setSandboxExample] = useState<SandboxExample>('modelsAndMaterials');
  const [rendererConfig, setRendererConfig] = useState<RendererConfig>(createRendererConfig('high'));
  const [perfTelemetry, setPerfTelemetry] = useState<PerformanceTelemetry>({
    fps: 0,
    presentedFps: 0,
    frameIntervalMs: 0,
    frameTimeMs: 0,
    gpuFrameTimeMs: 0,
    cpuUsagePercent: null,
    cpuMemoryMb: null,
    gpuUsagePercent: null,
    gpuMemoryMb: null,
    canvasWidthPx: null,
    canvasHeightPx: null,
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
  const [hudsVisible, setHudsVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return !window.matchMedia('(max-width: 1024px)').matches;
  });
  const settingsFileStem = sandboxExample;

  // Load per-example, per-platform parameter defaults from
  // /settings/exampleParams/<example>.<platform>.json. The JSON shape mirrors
  // the example's options object exactly; loaded values are merged on top of
  // the in-memory defaults via the existing setters. This is a one-way load
  // (no export); the params HUD remains interactive after the load completes.
  useEffect(() => {
    let cancelled = false;
    const url = `/settings/exampleParams/${sandboxExample}.${SETTINGS_PLATFORM_SUFFIX}.json`;
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((parsed) => {
        if (cancelled || !parsed || typeof parsed !== 'object') {
          return;
        }
        switch (sandboxExample) {
          case 'pointLights':
            setPointLightsOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'modelsAndMaterials':
            setModelsAndMaterialsOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'flocking':
            setFlockingOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'crowd':
            setCrowdOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'brainStemDraco':
            setBrainStemDracoOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'porsche':
            setPorscheOptions((current) => ({ ...current, ...parsed }));
            return;
          case 'hills':
            setHillsOptions((current) => ({ ...current, ...parsed }));
            return;
          default:
            return;
        }
      })
      .catch(() => {
        // No params file for this example/platform — fall back to defaults.
      });
    return () => {
      cancelled = true;
    };
  }, [sandboxExample]);

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

  // Apply the LOD instance-density multiplier to per-example instance counts.
  // Author-supplied UI counts remain the *intent*; what reaches the engine is
  // `intent * density` clamped to each example's own MIN/MAX. When LOD is
  // disabled the multiplier is 1 and the original counts pass through.
  const lodInstanceDensity =
    rendererConfig.performance.lod.enabled ? rendererConfig.performance.lod.instanceDensity : 1;
  const scaleCount = (
    count: number,
    min: number,
    max: number,
  ): number => Math.max(min, Math.min(max, Math.round(count * lodInstanceDensity)));
  const scaledPointLightsOptions: PointLightsExampleOptions = {
    ...pointLightsOptions,
    pointLightCount: scaleCount(pointLightsOptions.pointLightCount, 1, 256),
  };
  const scaledFlockingOptions: FlockingExampleOptions = {
    ...flockingOptions,
    particleCount: scaleCount(flockingOptions.particleCount, 10, 100_000),
  };
  const scaledCrowdOptions: CrowdExampleOptions = {
    ...crowdOptions,
    bodyCount: scaleCount(crowdOptions.bodyCount, 2, 500),
  };
  const scaledHillsOptions: HillsExampleOptions = {
    ...hillsOptions,
    grassCount: scaleCount(hillsOptions.grassCount, 10_000, 2_000_000),
  };

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
        pointLightsOptions={scaledPointLightsOptions}
        flockingOptions={scaledFlockingOptions}
        crowdOptions={scaledCrowdOptions}
        sponzaOptions={sponzaOptions}
        brainStemDracoOptions={brainStemDracoOptions}
        porscheOptions={porscheOptions}
        hillsOptions={scaledHillsOptions}
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

      <button
        type="button"
        className="hud-toggle-button"
        aria-label={hudsVisible ? 'Hide HUDs' : 'Show HUDs'}
        aria-expanded={hudsVisible}
        onClick={() => setHudsVisible((current) => !current)}
      >
        {hudsVisible ? (
          <span className="hud-toggle-icon hud-toggle-icon--close" aria-hidden="true">
            <span />
            <span />
          </span>
        ) : (
          <span className="hud-toggle-icon hud-toggle-icon--gear" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation" focusable="false">
              <path d="M10.344 2.164a1.35 1.35 0 0 1 1.312-.914h.688a1.35 1.35 0 0 1 1.312.914l.336 1.33c.767.18 1.49.478 2.144.879l1.174-.708a1.35 1.35 0 0 1 1.59.205l.487.486a1.35 1.35 0 0 1 .205 1.59l-.708 1.174c.401.654.699 1.377.879 2.144l1.33.336a1.35 1.35 0 0 1 .914 1.312v.688a1.35 1.35 0 0 1-.914 1.312l-1.33.336a8.73 8.73 0 0 1-.879 2.144l.708 1.174a1.35 1.35 0 0 1-.205 1.59l-.487.486a1.35 1.35 0 0 1-1.59.205l-1.174-.708a8.73 8.73 0 0 1-2.144.879l-.336 1.33a1.35 1.35 0 0 1-1.312.914h-.688a1.35 1.35 0 0 1-1.312-.914l-.336-1.33a8.73 8.73 0 0 1-2.144-.879l-1.174.708a1.35 1.35 0 0 1-1.59-.205l-.487-.486a1.35 1.35 0 0 1-.205-1.59l.708-1.174a8.73 8.73 0 0 1-.879-2.144l-1.33-.336a1.35 1.35 0 0 1-.914-1.312v-.688A1.35 1.35 0 0 1 2.164 10.344l1.33-.336c.18-.767.478-1.49.879-2.144l-.708-1.174a1.35 1.35 0 0 1 .205-1.59l.487-.486a1.35 1.35 0 0 1 1.59-.205l1.174.708a8.73 8.73 0 0 1 2.144-.879l.336-1.33Z" />
              <circle cx="12" cy="12" r="3.1" />
            </svg>
          </span>
        )}
      </button>

      <div
        className={`hud-visibility-layer${hudsVisible ? '' : ' is-hidden'}`}
        aria-hidden={!hudsVisible}
      >
        <RendererHud
          key={`renderer-hud-${sandboxExample}`}
          perfTelemetry={perfTelemetry}
          cameraTelemetry={cameraTelemetry}
          onRendererConfigChange={handleRendererConfigChange}
          autoImportSettingsUrl={`/settings/${settingsFileStem}.${SETTINGS_PLATFORM_SUFFIX}.json`}
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
