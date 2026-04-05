import { useCallback, useMemo, useRef, useState } from 'react';
import './App.css';
import { CanvasStage, type CameraTelemetry, type PerformanceTelemetry } from './stunner/renderer/CanvasStage';
import type { SandboxDemo } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import {
  DEBUG_VIEWS,
  QUALITY_PRESETS,
  type DebugView,
} from './stunner/renderer/debug/RuntimeControls';
import {
  createRendererConfig,
  type AmbientOcclusionConfig,
  type BloomConfig,
  type ColorGradingConfig,
  type DepthOfFieldConfig,
  type FogConfig,
  type MotionBlurConfig,
  type QualityPreset,
  type ScreenSpaceReflectionsConfig,
  type ShadowConfig,
  type ShadowFilter,
  type Tonemapper,
  type VisibilityConfig,
} from './stunner/renderer/config/RendererConfig';

const SANDBOX_DEMOS: SandboxDemo[] = ['basic', 'city'];
const SHADOW_FILTERS: ShadowFilter[] = ['hard', 'pcf-3x3', 'pcf-5x5'];
const SHADOW_ATLAS_SIZES: Array<ShadowConfig['atlasSize']> = [1024, 2048, 4096, 8192];
const SHADOW_DIRECTIONAL_RESOLUTIONS: Array<ShadowConfig['directionalResolution']> = [512, 1024, 2048, 4096];
const SHADOW_SPOT_RESOLUTIONS: Array<ShadowConfig['spotResolution']> = [256, 512, 1024, 2048];
const SHADOW_POINT_RESOLUTIONS: Array<ShadowConfig['pointResolution']> = [256, 512, 1024, 2048];
const AO_QUALITIES: AmbientOcclusionConfig['quality'][] = ['low', 'medium', 'high'];
const SSR_QUALITIES: ScreenSpaceReflectionsConfig['quality'][] = ['low', 'medium', 'high'];
const TONEMAPPERS: Tonemapper[] = ['aces', 'filmic', 'reinhard'];

type SliderBounds = {
  min: number;
  max: number;
  step: number;
};

type PanelSettings = {
  shadows: ShadowConfig;
  ambientOcclusion: AmbientOcclusionConfig;
  bloom: BloomConfig;
  screenSpaceReflections: ScreenSpaceReflectionsConfig;
  depthOfField: DepthOfFieldConfig;
  colorGrading: ColorGradingConfig;
  motionBlur: MotionBlurConfig;
  fog: FogConfig;
  visibility: VisibilityConfig;
};

type SettingsPayload = {
  version: 1;
  qualityPreset: QualityPreset;
  debugView: DebugView;
  sandboxDemo: SandboxDemo;
  panelSettings: PanelSettings;
  sliderBounds: Record<string, SliderBounds>;
};

const DEFAULT_SLIDER_BOUNDS: Record<string, SliderBounds> = {
  shadowFilterIndex: { min: 0, max: SHADOW_FILTERS.length - 1, step: 1 },
  shadowAtlasSizeIndex: { min: 0, max: SHADOW_ATLAS_SIZES.length - 1, step: 1 },
  shadowCascadeCount: { min: 1, max: 4, step: 1 },
  shadowDirectionalResolutionIndex: { min: 0, max: SHADOW_DIRECTIONAL_RESOLUTIONS.length - 1, step: 1 },
  shadowSpotResolutionIndex: { min: 0, max: SHADOW_SPOT_RESOLUTIONS.length - 1, step: 1 },
  shadowPointResolutionIndex: { min: 0, max: SHADOW_POINT_RESOLUTIONS.length - 1, step: 1 },
  shadowAzimuth: { min: -180, max: 180, step: 1 },
  shadowElevation: { min: 0, max: 90, step: 1 },
  aoQualityIndex: { min: 0, max: AO_QUALITIES.length - 1, step: 1 },
  aoSampleCount: { min: 1, max: 64, step: 1 },
  aoRadius: { min: 0.01, max: 4, step: 0.01 },
  aoIntensity: { min: 0, max: 4, step: 0.01 },
  bloomThreshold: { min: 0, max: 4, step: 0.01 },
  bloomKnee: { min: 0, max: 2, step: 0.01 },
  bloomIntensity: { min: 0, max: 4, step: 0.01 },
  bloomMipCount: { min: 1, max: 10, step: 1 },
  ssrQualityIndex: { min: 0, max: SSR_QUALITIES.length - 1, step: 1 },
  ssrStage: { min: 0, max: 2, step: 1 },
  ssrMaxSteps: { min: 1, max: 128, step: 1 },
  ssrMaxDistance: { min: 0.01, max: 2, step: 0.01 },
  ssrThickness: { min: 0.001, max: 0.2, step: 0.001 },
  ssrStride: { min: 0.1, max: 4, step: 0.01 },
  ssrResolve: { min: 0, max: 1, step: 0.01 },
  ssrRoughnessCutoff: { min: 0, max: 1, step: 0.01 },
  dofFocusDistance: { min: 0.1, max: 200, step: 0.1 },
  dofFocusRange: { min: 0.01, max: 100, step: 0.01 },
  dofAperture: { min: 0, max: 8, step: 0.01 },
  dofMaxCoC: { min: 0, max: 64, step: 0.1 },
  gradingTonemapperIndex: { min: 0, max: TONEMAPPERS.length - 1, step: 1 },
  gradingExposure: { min: -10, max: 10, step: 0.01 },
  gradingContrast: { min: 0, max: 4, step: 0.01 },
  gradingSaturation: { min: 0, max: 4, step: 0.01 },
  gradingTemperature: { min: -2, max: 2, step: 0.01 },
  gradingTint: { min: -2, max: 2, step: 0.01 },
  motionBlurIntensity: { min: 0, max: 3, step: 0.01 },
  motionBlurShutterAngle: { min: 0, max: 720, step: 1 },
  motionBlurSampleCount: { min: 1, max: 64, step: 1 },
  fogColorR: { min: 0, max: 1, step: 0.01 },
  fogColorG: { min: 0, max: 1, step: 0.01 },
  fogColorB: { min: 0, max: 1, step: 0.01 },
  fogStartDistance: { min: 0, max: 500, step: 0.1 },
  fogEndDistance: { min: 0.1, max: 1000, step: 0.1 },
  fogDensity: { min: 0, max: 1, step: 0.001 },
  fogHeightFalloff: { min: 0, max: 2, step: 0.001 },
  frustumPadding: { min: 1, max: 3, step: 0.01 },
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const clampInt = (value: number, min: number, max: number): number => {
  return Math.round(clamp(value, min, max));
};

const sanitizeBounds = (candidate: SliderBounds, fallback: SliderBounds): SliderBounds => {
  const min = Number.isFinite(candidate.min) ? candidate.min : fallback.min;
  const max = Number.isFinite(candidate.max) ? candidate.max : fallback.max;
  const step = Number.isFinite(candidate.step) && candidate.step > 0 ? candidate.step : fallback.step;
  if (min < max) {
    return { min, max, step };
  }
  return { min, max: min + step, step };
};

const sliderValueFromEvent = (value: string, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const createDefaultPanelSettings = (): PanelSettings => {
  const base = createRendererConfig('high');
  return {
    shadows: {
      ...base.shadows,
      enabled: true,
    },
    ambientOcclusion: {
      ...base.ambientOcclusion,
      enabled: true,
    },
    bloom: {
      ...base.bloom,
      enabled: true,
    },
    screenSpaceReflections: {
      ...base.screenSpaceReflections,
      enabled: true,
      experimentalEnabled: true,
      stage: 2,
    },
    depthOfField: {
      ...base.depthOfField,
      enabled: true,
    },
    colorGrading: {
      ...base.colorGrading,
      enabled: true,
    },
    motionBlur: {
      ...base.motionBlur,
      enabled: true,
    },
    fog: {
      ...base.fog,
      enabled: true,
    },
    visibility: {
      ...base.visibility,
      frustumCullingEnabled: true,
    },
  };
};

type SliderControlProps = {
  id: string;
  label: string;
  value: number;
  bounds: SliderBounds;
  onValueChange: (value: number) => void;
  onBoundsChange: (side: 'min' | 'max', value: number) => void;
};

const SliderControl = ({
  id,
  label,
  value,
  bounds,
  onValueChange,
  onBoundsChange,
}: SliderControlProps) => {
  const clampedValue = clamp(value, bounds.min, bounds.max);
  return (
    <div className="slider-control">
      <label htmlFor={id}>{label}</label>
      <div className="slider-range-row">
        <input
          type="number"
          value={bounds.min}
          step={bounds.step}
          onChange={(event) => onBoundsChange('min', sliderValueFromEvent(event.target.value, bounds.min))}
        />
        <span>to</span>
        <input
          type="number"
          value={bounds.max}
          step={bounds.step}
          onChange={(event) => onBoundsChange('max', sliderValueFromEvent(event.target.value, bounds.max))}
        />
      </div>
      <input
        id={id}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        value={clampedValue}
        onChange={(event) => onValueChange(sliderValueFromEvent(event.target.value, clampedValue))}
      />
      <input
        type="number"
        value={clampedValue}
        min={bounds.min}
        max={bounds.max}
        step={bounds.step}
        onChange={(event) => onValueChange(sliderValueFromEvent(event.target.value, clampedValue))}
      />
    </div>
  );
};

const formatVec3 = (value: [number, number, number]): string => {
  return `${value[0].toFixed(2)}, ${value[1].toFixed(2)}, ${value[2].toFixed(2)}`;
};

const App = () => {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('high');
  const [debugView, setDebugView] = useState<DebugView>('off');
  const [panelSettings, setPanelSettings] = useState<PanelSettings>(createDefaultPanelSettings());
  const [sliderBounds, setSliderBounds] = useState<Record<string, SliderBounds>>({
    ...DEFAULT_SLIDER_BOUNDS,
  });
  const [sandboxDemo, setSandboxDemo] = useState<SandboxDemo>('basic');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setBoundsValue = useCallback((key: string, side: 'min' | 'max', value: number) => {
    setSliderBounds((current) => {
      const defaultBounds = DEFAULT_SLIDER_BOUNDS[key];
      const active = current[key] ?? defaultBounds;
      if (!active || !defaultBounds || !Number.isFinite(value)) {
        return current;
      }
      const nextCandidate = {
        ...active,
        [side]: value,
      };
      const next = sanitizeBounds(nextCandidate, defaultBounds);
      return {
        ...current,
        [key]: next,
      };
    });
  }, []);

  const updatePanelSettings = useCallback((updater: (current: PanelSettings) => PanelSettings) => {
    setPanelSettings((current) => {
      return updater(current);
    });
  }, []);

  const exportSettings = useCallback(() => {
    const payload: SettingsPayload = {
      version: 1,
      qualityPreset,
      debugView,
      sandboxDemo,
      panelSettings,
      sliderBounds,
    };
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stunner-settings.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [debugView, panelSettings, qualityPreset, sandboxDemo, sliderBounds]);

  const importSettings = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '{}')) as Partial<SettingsPayload>;
        if (parsed.qualityPreset && QUALITY_PRESETS.includes(parsed.qualityPreset)) {
          setQualityPreset(parsed.qualityPreset);
        }
        if (parsed.debugView && DEBUG_VIEWS.includes(parsed.debugView)) {
          setDebugView(parsed.debugView);
        }
        if (parsed.sandboxDemo && SANDBOX_DEMOS.includes(parsed.sandboxDemo)) {
          setSandboxDemo(parsed.sandboxDemo);
        }
        if (parsed.panelSettings) {
          updatePanelSettings((current) => ({
            ...current,
            ...parsed.panelSettings,
            shadows: {
              ...current.shadows,
              ...parsed.panelSettings?.shadows,
            },
            ambientOcclusion: {
              ...current.ambientOcclusion,
              ...parsed.panelSettings?.ambientOcclusion,
            },
            bloom: {
              ...current.bloom,
              ...parsed.panelSettings?.bloom,
            },
            screenSpaceReflections: {
              ...current.screenSpaceReflections,
              ...parsed.panelSettings?.screenSpaceReflections,
            },
            depthOfField: {
              ...current.depthOfField,
              ...parsed.panelSettings?.depthOfField,
            },
            colorGrading: {
              ...current.colorGrading,
              ...parsed.panelSettings?.colorGrading,
            },
            motionBlur: {
              ...current.motionBlur,
              ...parsed.panelSettings?.motionBlur,
            },
            fog: {
              ...current.fog,
              ...parsed.panelSettings?.fog,
            },
            visibility: {
              ...current.visibility,
              ...parsed.panelSettings?.visibility,
            },
          }));
        }
        if (parsed.sliderBounds) {
          setSliderBounds((current) => {
            const next: Record<string, SliderBounds> = { ...current };
            for (const [key, defaultBounds] of Object.entries(DEFAULT_SLIDER_BOUNDS)) {
              const incoming = parsed.sliderBounds?.[key];
              if (!incoming) {
                continue;
              }
              next[key] = sanitizeBounds(incoming, defaultBounds);
            }
            return next;
          });
        }
      } catch (error: unknown) {
        console.warn('Failed to import settings JSON.', error);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }, [updatePanelSettings]);

  const rendererConfig = useMemo(() => {
    return createRendererConfig(qualityPreset, {
      clustered: {
        debugView,
      },
      shadows: panelSettings.shadows,
      ambientOcclusion: panelSettings.ambientOcclusion,
      bloom: panelSettings.bloom,
      screenSpaceReflections: {
        ...panelSettings.screenSpaceReflections,
        experimentalEnabled: panelSettings.screenSpaceReflections.enabled,
      },
      depthOfField: panelSettings.depthOfField,
      colorGrading: panelSettings.colorGrading,
      motionBlur: panelSettings.motionBlur,
      fog: {
        ...panelSettings.fog,
        startDistance: Math.min(panelSettings.fog.startDistance, panelSettings.fog.endDistance - 0.1),
        endDistance: Math.max(panelSettings.fog.endDistance, panelSettings.fog.startDistance + 0.1),
      },
      visibility: panelSettings.visibility,
    });
  }, [debugView, panelSettings, qualityPreset]);
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

  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        onCameraTelemetry={handleCameraTelemetry}
        onPerformanceTelemetry={handlePerformanceTelemetry}
        rendererConfig={rendererConfig}
        demoSelection={sandboxDemo}
      />

      <aside className="hud" aria-label="Game overlay controls">
        <h1>Render Sandbox</h1>

        <dl>
          <div>
            <dt>Backend</dt>
            <dd>{renderBackend.toUpperCase()}</dd>
          </div>
          <div>
            <dt>FPS</dt>
            <dd>{perfTelemetry.fps.toFixed(1)}</dd>
          </div>
          <div>
            <dt>Camera Pos</dt>
            <dd>{formatVec3(cameraTelemetry.location)}</dd>
          </div>
          <div>
            <dt>Camera Fwd</dt>
            <dd>{formatVec3(cameraTelemetry.forward)}</dd>
          </div>
        </dl>

        <div className="control-group">
          <label htmlFor="quality-preset">Quality Preset</label>
          <select
            id="quality-preset"
            value={qualityPreset}
            onChange={(event) => setQualityPreset(event.target.value as QualityPreset)}
          >
            {QUALITY_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="debug-view">Debug View</label>
          <select
            id="debug-view"
            value={debugView}
            onChange={(event) => setDebugView(event.target.value as DebugView)}
          >
            {DEBUG_VIEWS.map((view) => (
              <option key={view} value={view}>
                {view}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
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
        </div>

        <div className="hud-actions">
          <button type="button" onClick={exportSettings}>Export Settings JSON</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>Import Settings JSON</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={importSettings}
            className="visually-hidden"
          />
        </div>

        <details className="hud-disclosure" open>
          <summary>Shadows</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={panelSettings.shadows.enabled}
                onChange={(event) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    enabled: event.target.checked,
                  },
                }))}
              />
              <span>Enabled</span>
            </label>
            <SliderControl
              id="shadow-filter"
              label={`Filter: ${panelSettings.shadows.filter}`}
              value={SHADOW_FILTERS.indexOf(panelSettings.shadows.filter)}
              bounds={sliderBounds.shadowFilterIndex}
              onBoundsChange={(side, value) => setBoundsValue('shadowFilterIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, SHADOW_FILTERS.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    filter: SHADOW_FILTERS[index],
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-atlas"
              label={`Atlas Size: ${panelSettings.shadows.atlasSize}`}
              value={SHADOW_ATLAS_SIZES.indexOf(panelSettings.shadows.atlasSize)}
              bounds={sliderBounds.shadowAtlasSizeIndex}
              onBoundsChange={(side, value) => setBoundsValue('shadowAtlasSizeIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, SHADOW_ATLAS_SIZES.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    atlasSize: SHADOW_ATLAS_SIZES[index],
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-cascades"
              label={`Cascade Count: ${panelSettings.shadows.cascadeCount}`}
              value={panelSettings.shadows.cascadeCount}
              bounds={sliderBounds.shadowCascadeCount}
              onBoundsChange={(side, value) => setBoundsValue('shadowCascadeCount', side, value)}
              onValueChange={(value) => {
                const nextValue = clampInt(value, 1, 4) as ShadowConfig['cascadeCount'];
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    cascadeCount: nextValue,
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-directional-resolution"
              label={`Directional Resolution: ${panelSettings.shadows.directionalResolution}`}
              value={SHADOW_DIRECTIONAL_RESOLUTIONS.indexOf(panelSettings.shadows.directionalResolution)}
              bounds={sliderBounds.shadowDirectionalResolutionIndex}
              onBoundsChange={(side, value) => setBoundsValue('shadowDirectionalResolutionIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, SHADOW_DIRECTIONAL_RESOLUTIONS.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    directionalResolution: SHADOW_DIRECTIONAL_RESOLUTIONS[index],
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-spot-resolution"
              label={`Spot Resolution: ${panelSettings.shadows.spotResolution}`}
              value={SHADOW_SPOT_RESOLUTIONS.indexOf(panelSettings.shadows.spotResolution)}
              bounds={sliderBounds.shadowSpotResolutionIndex}
              onBoundsChange={(side, value) => setBoundsValue('shadowSpotResolutionIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, SHADOW_SPOT_RESOLUTIONS.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    spotResolution: SHADOW_SPOT_RESOLUTIONS[index],
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-point-resolution"
              label={`Point Resolution: ${panelSettings.shadows.pointResolution}`}
              value={SHADOW_POINT_RESOLUTIONS.indexOf(panelSettings.shadows.pointResolution)}
              bounds={sliderBounds.shadowPointResolutionIndex}
              onBoundsChange={(side, value) => setBoundsValue('shadowPointResolutionIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, SHADOW_POINT_RESOLUTIONS.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    pointResolution: SHADOW_POINT_RESOLUTIONS[index],
                  },
                }));
              }}
            />
            <SliderControl
              id="shadow-azimuth"
              label="Key Light Azimuth"
              value={panelSettings.shadows.keyLightAzimuthDeg}
              bounds={sliderBounds.shadowAzimuth}
              onBoundsChange={(side, value) => setBoundsValue('shadowAzimuth', side, value)}
              onValueChange={(value) => updatePanelSettings((current) => ({
                ...current,
                shadows: {
                  ...current.shadows,
                  keyLightAzimuthDeg: value,
                },
              }))}
            />
            <SliderControl
              id="shadow-elevation"
              label="Key Light Elevation"
              value={panelSettings.shadows.keyLightElevationDeg}
              bounds={sliderBounds.shadowElevation}
              onBoundsChange={(side, value) => setBoundsValue('shadowElevation', side, value)}
              onValueChange={(value) => updatePanelSettings((current) => ({
                ...current,
                shadows: {
                  ...current.shadows,
                  keyLightElevationDeg: value,
                },
              }))}
            />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>AO</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={panelSettings.ambientOcclusion.enabled}
                onChange={(event) => updatePanelSettings((current) => ({
                  ...current,
                  ambientOcclusion: {
                    ...current.ambientOcclusion,
                    enabled: event.target.checked,
                  },
                }))}
              />
              <span>Enabled</span>
            </label>
            <SliderControl
              id="ao-quality"
              label={`Quality: ${panelSettings.ambientOcclusion.quality}`}
              value={AO_QUALITIES.indexOf(panelSettings.ambientOcclusion.quality)}
              bounds={sliderBounds.aoQualityIndex}
              onBoundsChange={(side, value) => setBoundsValue('aoQualityIndex', side, value)}
              onValueChange={(value) => {
                const index = clampInt(value, 0, AO_QUALITIES.length - 1);
                updatePanelSettings((current) => ({
                  ...current,
                  ambientOcclusion: {
                    ...current.ambientOcclusion,
                    quality: AO_QUALITIES[index],
                  },
                }));
              }}
            />
            <SliderControl id="ao-samples" label="Sample Count" value={panelSettings.ambientOcclusion.sampleCount} bounds={sliderBounds.aoSampleCount} onBoundsChange={(side, value) => setBoundsValue('aoSampleCount', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, ambientOcclusion: { ...current.ambientOcclusion, sampleCount: Math.max(1, Math.round(value)) } }))} />
            <SliderControl id="ao-radius" label="Radius" value={panelSettings.ambientOcclusion.radius} bounds={sliderBounds.aoRadius} onBoundsChange={(side, value) => setBoundsValue('aoRadius', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, ambientOcclusion: { ...current.ambientOcclusion, radius: Math.max(0.001, value) } }))} />
            <SliderControl id="ao-intensity" label="Intensity" value={panelSettings.ambientOcclusion.intensity} bounds={sliderBounds.aoIntensity} onBoundsChange={(side, value) => setBoundsValue('aoIntensity', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, ambientOcclusion: { ...current.ambientOcclusion, intensity: Math.max(0, value) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>Bloom</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.bloom.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, bloom: { ...current.bloom, enabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="bloom-threshold" label="Threshold" value={panelSettings.bloom.threshold} bounds={sliderBounds.bloomThreshold} onBoundsChange={(side, value) => setBoundsValue('bloomThreshold', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, bloom: { ...current.bloom, threshold: value } }))} />
            <SliderControl id="bloom-knee" label="Knee" value={panelSettings.bloom.knee} bounds={sliderBounds.bloomKnee} onBoundsChange={(side, value) => setBoundsValue('bloomKnee', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, bloom: { ...current.bloom, knee: value } }))} />
            <SliderControl id="bloom-intensity" label="Intensity" value={panelSettings.bloom.intensity} bounds={sliderBounds.bloomIntensity} onBoundsChange={(side, value) => setBoundsValue('bloomIntensity', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, bloom: { ...current.bloom, intensity: Math.max(0, value) } }))} />
            <SliderControl id="bloom-mips" label="Mip Count" value={panelSettings.bloom.mipCount} bounds={sliderBounds.bloomMipCount} onBoundsChange={(side, value) => setBoundsValue('bloomMipCount', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, bloom: { ...current.bloom, mipCount: Math.max(1, Math.round(value)) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>SSR</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.screenSpaceReflections.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, enabled: event.target.checked, experimentalEnabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="ssr-quality" label={`Quality: ${panelSettings.screenSpaceReflections.quality}`} value={SSR_QUALITIES.indexOf(panelSettings.screenSpaceReflections.quality)} bounds={sliderBounds.ssrQualityIndex} onBoundsChange={(side, value) => setBoundsValue('ssrQualityIndex', side, value)} onValueChange={(value) => {
              const index = clampInt(value, 0, SSR_QUALITIES.length - 1);
              updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, quality: SSR_QUALITIES[index] } }));
            }} />
            <SliderControl id="ssr-stage" label="Stage" value={panelSettings.screenSpaceReflections.stage} bounds={sliderBounds.ssrStage} onBoundsChange={(side, value) => setBoundsValue('ssrStage', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, stage: clampInt(value, 0, 2) as ScreenSpaceReflectionsConfig['stage'] } }))} />
            <SliderControl id="ssr-steps" label="Max Steps" value={panelSettings.screenSpaceReflections.maxSteps} bounds={sliderBounds.ssrMaxSteps} onBoundsChange={(side, value) => setBoundsValue('ssrMaxSteps', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, maxSteps: Math.max(1, Math.round(value)) } }))} />
            <SliderControl id="ssr-distance" label="Max Distance" value={panelSettings.screenSpaceReflections.maxDistance} bounds={sliderBounds.ssrMaxDistance} onBoundsChange={(side, value) => setBoundsValue('ssrMaxDistance', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, maxDistance: Math.max(0.001, value) } }))} />
            <SliderControl id="ssr-thickness" label="Thickness" value={panelSettings.screenSpaceReflections.thickness} bounds={sliderBounds.ssrThickness} onBoundsChange={(side, value) => setBoundsValue('ssrThickness', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, thickness: Math.max(0.0001, value) } }))} />
            <SliderControl id="ssr-stride" label="Stride" value={panelSettings.screenSpaceReflections.stride} bounds={sliderBounds.ssrStride} onBoundsChange={(side, value) => setBoundsValue('ssrStride', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, stride: Math.max(0.0001, value) } }))} />
            <SliderControl id="ssr-resolve" label="Resolve" value={panelSettings.screenSpaceReflections.resolve} bounds={sliderBounds.ssrResolve} onBoundsChange={(side, value) => setBoundsValue('ssrResolve', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, resolve: clamp(value, 0, 1) } }))} />
            <SliderControl id="ssr-roughness" label="Roughness Cutoff" value={panelSettings.screenSpaceReflections.roughnessCutoff} bounds={sliderBounds.ssrRoughnessCutoff} onBoundsChange={(side, value) => setBoundsValue('ssrRoughnessCutoff', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, screenSpaceReflections: { ...current.screenSpaceReflections, roughnessCutoff: clamp(value, 0, 1) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>DoF</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.depthOfField.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, depthOfField: { ...current.depthOfField, enabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="dof-focus-distance" label="Focus Distance" value={panelSettings.depthOfField.focusDistance} bounds={sliderBounds.dofFocusDistance} onBoundsChange={(side, value) => setBoundsValue('dofFocusDistance', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, depthOfField: { ...current.depthOfField, focusDistance: Math.max(0.001, value) } }))} />
            <SliderControl id="dof-focus-range" label="Focus Range" value={panelSettings.depthOfField.focusRange} bounds={sliderBounds.dofFocusRange} onBoundsChange={(side, value) => setBoundsValue('dofFocusRange', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, depthOfField: { ...current.depthOfField, focusRange: Math.max(0.001, value) } }))} />
            <SliderControl id="dof-aperture" label="Aperture" value={panelSettings.depthOfField.aperture} bounds={sliderBounds.dofAperture} onBoundsChange={(side, value) => setBoundsValue('dofAperture', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, depthOfField: { ...current.depthOfField, aperture: Math.max(0, value) } }))} />
            <SliderControl id="dof-max-coc" label="Max CoC" value={panelSettings.depthOfField.maxCoC} bounds={sliderBounds.dofMaxCoC} onBoundsChange={(side, value) => setBoundsValue('dofMaxCoC', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, depthOfField: { ...current.depthOfField, maxCoC: Math.max(0, value) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>Grading</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.colorGrading.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, enabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="grading-tonemapper" label={`Tonemapper: ${panelSettings.colorGrading.tonemapper}`} value={TONEMAPPERS.indexOf(panelSettings.colorGrading.tonemapper)} bounds={sliderBounds.gradingTonemapperIndex} onBoundsChange={(side, value) => setBoundsValue('gradingTonemapperIndex', side, value)} onValueChange={(value) => {
              const index = clampInt(value, 0, TONEMAPPERS.length - 1);
              updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, tonemapper: TONEMAPPERS[index] } }));
            }} />
            <SliderControl id="grading-exposure" label="Exposure" value={panelSettings.colorGrading.exposure} bounds={sliderBounds.gradingExposure} onBoundsChange={(side, value) => setBoundsValue('gradingExposure', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, exposure: value } }))} />
            <SliderControl id="grading-contrast" label="Contrast" value={panelSettings.colorGrading.contrast} bounds={sliderBounds.gradingContrast} onBoundsChange={(side, value) => setBoundsValue('gradingContrast', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, contrast: Math.max(0, value) } }))} />
            <SliderControl id="grading-saturation" label="Saturation" value={panelSettings.colorGrading.saturation} bounds={sliderBounds.gradingSaturation} onBoundsChange={(side, value) => setBoundsValue('gradingSaturation', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, saturation: Math.max(0, value) } }))} />
            <SliderControl id="grading-temperature" label="Temperature" value={panelSettings.colorGrading.temperature} bounds={sliderBounds.gradingTemperature} onBoundsChange={(side, value) => setBoundsValue('gradingTemperature', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, temperature: value } }))} />
            <SliderControl id="grading-tint" label="Tint" value={panelSettings.colorGrading.tint} bounds={sliderBounds.gradingTint} onBoundsChange={(side, value) => setBoundsValue('gradingTint', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, colorGrading: { ...current.colorGrading, tint: value } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>Motion Blur</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.motionBlur.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, motionBlur: { ...current.motionBlur, enabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="motion-blur-intensity" label="Intensity" value={panelSettings.motionBlur.intensity} bounds={sliderBounds.motionBlurIntensity} onBoundsChange={(side, value) => setBoundsValue('motionBlurIntensity', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, motionBlur: { ...current.motionBlur, intensity: Math.max(0, value) } }))} />
            <SliderControl id="motion-blur-shutter" label="Shutter Angle" value={panelSettings.motionBlur.shutterAngle} bounds={sliderBounds.motionBlurShutterAngle} onBoundsChange={(side, value) => setBoundsValue('motionBlurShutterAngle', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, motionBlur: { ...current.motionBlur, shutterAngle: Math.max(0, value) } }))} />
            <SliderControl id="motion-blur-samples" label="Sample Count" value={panelSettings.motionBlur.sampleCount} bounds={sliderBounds.motionBlurSampleCount} onBoundsChange={(side, value) => setBoundsValue('motionBlurSampleCount', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, motionBlur: { ...current.motionBlur, sampleCount: Math.max(1, Math.round(value)) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>Fog</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.fog.enabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, enabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="fog-color-r" label="Color R" value={panelSettings.fog.color[0]} bounds={sliderBounds.fogColorR} onBoundsChange={(side, value) => setBoundsValue('fogColorR', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, color: [clamp(value, 0, 1), current.fog.color[1], current.fog.color[2]] } }))} />
            <SliderControl id="fog-color-g" label="Color G" value={panelSettings.fog.color[1]} bounds={sliderBounds.fogColorG} onBoundsChange={(side, value) => setBoundsValue('fogColorG', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, color: [current.fog.color[0], clamp(value, 0, 1), current.fog.color[2]] } }))} />
            <SliderControl id="fog-color-b" label="Color B" value={panelSettings.fog.color[2]} bounds={sliderBounds.fogColorB} onBoundsChange={(side, value) => setBoundsValue('fogColorB', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, color: [current.fog.color[0], current.fog.color[1], clamp(value, 0, 1)] } }))} />
            <SliderControl id="fog-start" label="Start Distance" value={panelSettings.fog.startDistance} bounds={sliderBounds.fogStartDistance} onBoundsChange={(side, value) => setBoundsValue('fogStartDistance', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, startDistance: Math.min(value, current.fog.endDistance - 0.1) } }))} />
            <SliderControl id="fog-end" label="End Distance" value={panelSettings.fog.endDistance} bounds={sliderBounds.fogEndDistance} onBoundsChange={(side, value) => setBoundsValue('fogEndDistance', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, endDistance: Math.max(value, current.fog.startDistance + 0.1) } }))} />
            <SliderControl id="fog-density" label="Density" value={panelSettings.fog.density} bounds={sliderBounds.fogDensity} onBoundsChange={(side, value) => setBoundsValue('fogDensity', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, density: Math.max(0, value) } }))} />
            <SliderControl id="fog-height-falloff" label="Height Falloff" value={panelSettings.fog.heightFalloff} bounds={sliderBounds.fogHeightFalloff} onBoundsChange={(side, value) => setBoundsValue('fogHeightFalloff', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, fog: { ...current.fog, heightFalloff: Math.max(0, value) } }))} />
          </div>
        </details>

        <details className="hud-disclosure">
          <summary>Frustum Culling</summary>
          <div className="disclosure-content">
            <label className="checkbox-row">
              <input type="checkbox" checked={panelSettings.visibility.frustumCullingEnabled} onChange={(event) => updatePanelSettings((current) => ({ ...current, visibility: { ...current.visibility, frustumCullingEnabled: event.target.checked } }))} />
              <span>Enabled</span>
            </label>
            <SliderControl id="frustum-padding" label="Padding" value={panelSettings.visibility.frustumCullingPadding} bounds={sliderBounds.frustumPadding} onBoundsChange={(side, value) => setBoundsValue('frustumPadding', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, visibility: { ...current.visibility, frustumCullingPadding: Math.max(1, value) } }))} />
          </div>
        </details>

      </aside>
    </main>
  );
};
export default App;
