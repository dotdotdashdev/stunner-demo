import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './RendererHud.css';
import type { CameraTelemetry, PerformanceTelemetry } from '../renderer/CanvasStage';
import type { RenderBackend } from '../renderer/RendererEngine';
import {
  DEBUG_VIEWS,
  QUALITY_PRESETS,
  type DebugView,
} from '../renderer/debug/RuntimeControls';
import {
  createRendererConfig,
  type AmbientOcclusionConfig,
  type BloomConfig,
  type ColorGradingConfig,
  type DepthOfFieldConfig,
  type EnvironmentConfig,
  type FogConfig,
  type MotionBlurConfig,
  type QualityPreset,
  type RendererConfig,
  type ScreenSpaceReflectionsConfig,
  type ShadowConfig,
  type ShadowFilter,
  type ShadowTechnique,
  type Tonemapper,
  type VisibilityConfig,
} from '../renderer/config/RendererConfig';

const SHADOW_FILTERS: ShadowFilter[] = ['hard', 'pcf-3x3', 'pcf-5x5'];
const SHADOW_TECHNIQUES: ShadowTechnique[] = ['approximate', 'shadow-map'];
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
  environment: EnvironmentConfig;
  visibility: VisibilityConfig;
};

type SettingsPayload = {
  version: 1;
  qualityPreset: QualityPreset;
  debugView: DebugView;
  panelSettings: PanelSettings;
  sliderBounds: Record<string, SliderBounds>;
};

type RendererHudProps = {
  renderBackend: RenderBackend;
  perfTelemetry: PerformanceTelemetry;
  cameraTelemetry: CameraTelemetry;
  onRendererConfigChange: (config: RendererConfig) => void;
  autoImportSettingsUrl?: string | null;
};

const DEFAULT_SLIDER_BOUNDS: Record<string, SliderBounds> = {
  shadowFilterIndex: { min: 0, max: SHADOW_FILTERS.length - 1, step: 1 },
  shadowAtlasSizeIndex: { min: 0, max: SHADOW_ATLAS_SIZES.length - 1, step: 1 },
  shadowCascadeCount: { min: 1, max: 4, step: 1 },
  shadowDirectionalResolutionIndex: { min: 0, max: SHADOW_DIRECTIONAL_RESOLUTIONS.length - 1, step: 1 },
  shadowSpotResolutionIndex: { min: 0, max: SHADOW_SPOT_RESOLUTIONS.length - 1, step: 1 },
  shadowPointResolutionIndex: { min: 0, max: SHADOW_POINT_RESOLUTIONS.length - 1, step: 1 },
  shadowMapBias: { min: 0, max: 0.02, step: 0.0001 },
  shadowMapSoftness: { min: 0, max: 4, step: 0.01 },
  shadowMapStrength: { min: 0, max: 1, step: 0.01 },
  pointShadowStrength: { min: 0, max: 2.5, step: 0.01 },
  pointShadowSoftness: { min: 0.1, max: 0.95, step: 0.01 },
  spotShadowStrength: { min: 0, max: 2.5, step: 0.01 },
  spotShadowSoftness: { min: 0.1, max: 0.95, step: 0.01 },
  areaShadowStrength: { min: 0, max: 2.5, step: 0.01 },
  areaShadowSoftness: { min: 0.1, max: 0.95, step: 0.01 },
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
  envHorizonBlendStart: { min: -1, max: 1, step: 0.001 },
  envHorizonBlendEnd: { min: -1, max: 1, step: 0.001 },
  envHorizonFogInfluence: { min: 0, max: 1, step: 0.001 },
  envGroundLift: { min: 0, max: 0.2, step: 0.001 },
  envSkyAboveR: { min: 0, max: 1, step: 0.001 },
  envSkyAboveG: { min: 0, max: 1, step: 0.001 },
  envSkyAboveB: { min: 0, max: 1, step: 0.001 },
  envSkyBelowR: { min: 0, max: 1, step: 0.001 },
  envSkyBelowG: { min: 0, max: 1, step: 0.001 },
  envSkyBelowB: { min: 0, max: 1, step: 0.001 },
  envFogR: { min: 0, max: 1, step: 0.001 },
  envFogG: { min: 0, max: 1, step: 0.001 },
  envFogB: { min: 0, max: 1, step: 0.001 },
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
      maxDistance: 1,
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
    environment: {
      ...base.environment,
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
  void onBoundsChange;
  return (
    <div className="slider-control">
      <label htmlFor={id}>{label}</label>
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

export const RendererHud = ({
  renderBackend,
  perfTelemetry,
  cameraTelemetry,
  onRendererConfigChange,
  autoImportSettingsUrl,
}: RendererHudProps) => {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('high');
  const [debugView, setDebugView] = useState<DebugView>('off');
  const [panelSettings, setPanelSettings] = useState<PanelSettings>(createDefaultPanelSettings());
  const [sliderBounds, setSliderBounds] = useState<Record<string, SliderBounds>>({
    ...DEFAULT_SLIDER_BOUNDS,
  });
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
  }, [debugView, panelSettings, qualityPreset, sliderBounds]);

  const applyImportedSettings = useCallback((parsed: Partial<SettingsPayload>) => {
    const legacyShadowTechniqueCandidate = (parsed as {
      panelSettings?: { shadows?: { technique?: unknown } };
    }).panelSettings?.shadows?.technique;
    const legacyShadowTechnique =
      legacyShadowTechniqueCandidate === 'approximate' || legacyShadowTechniqueCandidate === 'shadow-map'
        ? legacyShadowTechniqueCandidate
        : null;
    if (parsed.qualityPreset && QUALITY_PRESETS.includes(parsed.qualityPreset)) {
      setQualityPreset(parsed.qualityPreset);
    }
    if (parsed.debugView && DEBUG_VIEWS.includes(parsed.debugView)) {
      setDebugView(parsed.debugView);
    }
    if (parsed.panelSettings) {
      updatePanelSettings((current) => ({
        ...current,
        ...parsed.panelSettings,
        shadows: {
          ...current.shadows,
          ...parsed.panelSettings?.shadows,
          directionalTechnique:
            parsed.panelSettings?.shadows?.directionalTechnique ??
            legacyShadowTechnique ??
            current.shadows.directionalTechnique,
          pointTechnique:
            parsed.panelSettings?.shadows?.pointTechnique ??
            legacyShadowTechnique ??
            current.shadows.pointTechnique,
          spotTechnique:
            parsed.panelSettings?.shadows?.spotTechnique ??
            legacyShadowTechnique ??
            current.shadows.spotTechnique,
          areaTechnique:
            parsed.panelSettings?.shadows?.areaTechnique ??
            legacyShadowTechnique ??
            current.shadows.areaTechnique,
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
        environment: {
          ...current.environment,
          ...parsed.panelSettings?.environment,
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
  }, [updatePanelSettings]);

  const importSettings = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '{}')) as Partial<SettingsPayload>;
        applyImportedSettings(parsed);
      } catch (error: unknown) {
        console.warn('Failed to import settings JSON.', error);
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }, [applyImportedSettings]);

  useEffect(() => {
    if (!autoImportSettingsUrl) {
      return;
    }
    let cancelled = false;
    void fetch(autoImportSettingsUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.json() as Promise<Partial<SettingsPayload>>;
      })
      .then((parsed) => {
        if (cancelled || !parsed) {
          return;
        }
        applyImportedSettings(parsed);
      })
      .catch(() => {
        // Ignore missing or invalid per-example settings files.
      });
    return () => {
      cancelled = true;
    };
  }, [applyImportedSettings, autoImportSettingsUrl]);

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
      environment: {
        ...panelSettings.environment,
        horizonBlendStart: Math.min(panelSettings.environment.horizonBlendStart, panelSettings.environment.horizonBlendEnd - 0.001),
        horizonBlendEnd: Math.max(panelSettings.environment.horizonBlendEnd, panelSettings.environment.horizonBlendStart + 0.001),
        horizonFogInfluence: clamp(panelSettings.environment.horizonFogInfluence, 0, 1),
        groundLift: Math.max(0, panelSettings.environment.groundLift),
        skyColorAboveHorizon: [
          clamp(panelSettings.environment.skyColorAboveHorizon[0], 0, 1),
          clamp(panelSettings.environment.skyColorAboveHorizon[1], 0, 1),
          clamp(panelSettings.environment.skyColorAboveHorizon[2], 0, 1),
        ],
        skyColorBelowHorizon: [
          clamp(panelSettings.environment.skyColorBelowHorizon[0], 0, 1),
          clamp(panelSettings.environment.skyColorBelowHorizon[1], 0, 1),
          clamp(panelSettings.environment.skyColorBelowHorizon[2], 0, 1),
        ],
        horizonFogColor: [
          clamp(panelSettings.environment.horizonFogColor[0], 0, 1),
          clamp(panelSettings.environment.horizonFogColor[1], 0, 1),
          clamp(panelSettings.environment.horizonFogColor[2], 0, 1),
        ],
      },
      visibility: panelSettings.visibility,
    });
  }, [debugView, panelSettings, qualityPreset]);

  useEffect(() => {
    onRendererConfigChange(rendererConfig);
  }, [onRendererConfigChange, rendererConfig]);

  return (
    <aside className="settings-hud" aria-label="Renderer settings controls">
      <h1>Stunner Sandbox</h1>

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

      <details className="hud-disclosure">
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
          <details className="hud-sub-disclosure">
            <summary>Shared</summary>
            <div className="sub-disclosure-content">
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
                id="shadow-map-bias"
                label="Shadow Map Bias"
                value={panelSettings.shadows.shadowMapBias}
                bounds={sliderBounds.shadowMapBias}
                onBoundsChange={(side, value) => setBoundsValue('shadowMapBias', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    shadowMapBias: Math.max(0, value),
                  },
                }))}
              />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Directional</summary>
            <div className="sub-disclosure-content">
              <div className="control-group">
                <label htmlFor="shadow-directional-technique">Technique</label>
                <select
                  id="shadow-directional-technique"
                  value={panelSettings.shadows.directionalTechnique}
                  onChange={(event) => updatePanelSettings((current) => ({
                    ...current,
                    shadows: {
                      ...current.shadows,
                      directionalTechnique: event.target.value as ShadowTechnique,
                    },
                  }))}
                >
                  {SHADOW_TECHNIQUES.map((technique) => (
                    <option key={technique} value={technique}>
                      {technique}
                    </option>
                  ))}
                </select>
              </div>
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
                id="shadow-map-softness"
                label="Directional Softness"
                value={panelSettings.shadows.shadowMapSoftness}
                bounds={sliderBounds.shadowMapSoftness}
                onBoundsChange={(side, value) => setBoundsValue('shadowMapSoftness', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    shadowMapSoftness: Math.max(0, value),
                  },
                }))}
              />
              <SliderControl
                id="shadow-map-strength"
                label="Directional Strength"
                value={panelSettings.shadows.shadowMapStrength}
                bounds={sliderBounds.shadowMapStrength}
                onBoundsChange={(side, value) => setBoundsValue('shadowMapStrength', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    shadowMapStrength: clamp(value, 0, 1),
                  },
                }))}
              />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Point</summary>
            <div className="sub-disclosure-content">
              <div className="control-group">
                <label htmlFor="shadow-point-technique">Technique</label>
                <select
                  id="shadow-point-technique"
                  value={panelSettings.shadows.pointTechnique}
                  onChange={(event) => updatePanelSettings((current) => ({
                    ...current,
                    shadows: {
                      ...current.shadows,
                      pointTechnique: event.target.value as ShadowTechnique,
                    },
                  }))}
                >
                  {SHADOW_TECHNIQUES.map((technique) => (
                    <option key={technique} value={technique}>
                      {technique}
                    </option>
                  ))}
                </select>
              </div>
              <SliderControl
                id="shadow-point-resolution"
                label={`Resolution: ${panelSettings.shadows.pointResolution}`}
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
                id="point-shadow-strength"
                label="Strength"
                value={panelSettings.shadows.pointShadowStrength}
                bounds={sliderBounds.pointShadowStrength}
                onBoundsChange={(side, value) => setBoundsValue('pointShadowStrength', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    pointShadowStrength: clamp(value, 0, 2.5),
                  },
                }))}
              />
              <SliderControl
                id="point-shadow-softness"
                label="Softness"
                value={panelSettings.shadows.pointShadowSoftness}
                bounds={sliderBounds.pointShadowSoftness}
                onBoundsChange={(side, value) => setBoundsValue('pointShadowSoftness', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    pointShadowSoftness: clamp(value, 0.1, 0.95),
                  },
                }))}
              />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Spot</summary>
            <div className="sub-disclosure-content">
              <div className="control-group">
                <label htmlFor="shadow-spot-technique">Technique</label>
                <select
                  id="shadow-spot-technique"
                  value={panelSettings.shadows.spotTechnique}
                  onChange={(event) => updatePanelSettings((current) => ({
                    ...current,
                    shadows: {
                      ...current.shadows,
                      spotTechnique: event.target.value as ShadowTechnique,
                    },
                  }))}
                >
                  {SHADOW_TECHNIQUES.map((technique) => (
                    <option key={technique} value={technique}>
                      {technique}
                    </option>
                  ))}
                </select>
              </div>
              <SliderControl
                id="shadow-spot-resolution"
                label={`Resolution: ${panelSettings.shadows.spotResolution}`}
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
                id="spot-shadow-strength"
                label="Strength"
                value={panelSettings.shadows.spotShadowStrength}
                bounds={sliderBounds.spotShadowStrength}
                onBoundsChange={(side, value) => setBoundsValue('spotShadowStrength', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    spotShadowStrength: clamp(value, 0, 2.5),
                  },
                }))}
              />
              <SliderControl
                id="spot-shadow-softness"
                label="Softness"
                value={panelSettings.shadows.spotShadowSoftness}
                bounds={sliderBounds.spotShadowSoftness}
                onBoundsChange={(side, value) => setBoundsValue('spotShadowSoftness', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    spotShadowSoftness: clamp(value, 0.1, 0.95),
                  },
                }))}
              />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Area</summary>
            <div className="sub-disclosure-content">
              <div className="control-group">
                <label htmlFor="shadow-area-technique">Technique</label>
                <select
                  id="shadow-area-technique"
                  value={panelSettings.shadows.areaTechnique}
                  onChange={(event) => updatePanelSettings((current) => ({
                    ...current,
                    shadows: {
                      ...current.shadows,
                      areaTechnique: event.target.value as ShadowTechnique,
                    },
                  }))}
                >
                  {SHADOW_TECHNIQUES.map((technique) => (
                    <option key={technique} value={technique}>
                      {technique}
                    </option>
                  ))}
                </select>
              </div>
              <SliderControl
                id="area-shadow-strength"
                label="Strength"
                value={panelSettings.shadows.areaShadowStrength}
                bounds={sliderBounds.areaShadowStrength}
                onBoundsChange={(side, value) => setBoundsValue('areaShadowStrength', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    areaShadowStrength: clamp(value, 0, 2.5),
                  },
                }))}
              />
              <SliderControl
                id="area-shadow-softness"
                label="Softness"
                value={panelSettings.shadows.areaShadowSoftness}
                bounds={sliderBounds.areaShadowSoftness}
                onBoundsChange={(side, value) => setBoundsValue('areaShadowSoftness', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  shadows: {
                    ...current.shadows,
                    areaShadowSoftness: clamp(value, 0.1, 0.95),
                  },
                }))}
              />
            </div>
          </details>
        </div>
      </details>

      <details className="hud-disclosure">
        <summary>Ambient Occlusion</summary>
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
        <summary>Screen-Space Reflections</summary>
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
        <summary>Depth of Field</summary>
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
        <summary>Environment</summary>
        <div className="disclosure-content">
          <details className="hud-sub-disclosure">
            <summary>Horizon Shape</summary>
            <div className="sub-disclosure-content">
              <SliderControl
                id="env-horizon-blend-start"
                label="Horizon Blend Start"
                value={panelSettings.environment.horizonBlendStart}
                bounds={sliderBounds.envHorizonBlendStart}
                onBoundsChange={(side, value) => setBoundsValue('envHorizonBlendStart', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  environment: {
                    ...current.environment,
                    horizonBlendStart: Math.min(value, current.environment.horizonBlendEnd - 0.001),
                  },
                }))}
              />
              <SliderControl
                id="env-horizon-blend-end"
                label="Horizon Blend End"
                value={panelSettings.environment.horizonBlendEnd}
                bounds={sliderBounds.envHorizonBlendEnd}
                onBoundsChange={(side, value) => setBoundsValue('envHorizonBlendEnd', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  environment: {
                    ...current.environment,
                    horizonBlendEnd: Math.max(value, current.environment.horizonBlendStart + 0.001),
                  },
                }))}
              />
              <SliderControl
                id="env-horizon-fog"
                label="Horizon Fog Influence"
                value={panelSettings.environment.horizonFogInfluence}
                bounds={sliderBounds.envHorizonFogInfluence}
                onBoundsChange={(side, value) => setBoundsValue('envHorizonFogInfluence', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  environment: {
                    ...current.environment,
                    horizonFogInfluence: clamp(value, 0, 1),
                  },
                }))}
              />
              <SliderControl
                id="env-ground-lift"
                label="Ground Lift"
                value={panelSettings.environment.groundLift}
                bounds={sliderBounds.envGroundLift}
                onBoundsChange={(side, value) => setBoundsValue('envGroundLift', side, value)}
                onValueChange={(value) => updatePanelSettings((current) => ({
                  ...current,
                  environment: {
                    ...current.environment,
                    groundLift: Math.max(0, value),
                  },
                }))}
              />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Sky Above Horizon</summary>
            <div className="sub-disclosure-content">
              <SliderControl id="env-sky-above-r" label="R" value={panelSettings.environment.skyColorAboveHorizon[0]} bounds={sliderBounds.envSkyAboveR} onBoundsChange={(side, value) => setBoundsValue('envSkyAboveR', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorAboveHorizon: [clamp(value, 0, 1), current.environment.skyColorAboveHorizon[1], current.environment.skyColorAboveHorizon[2]] } }))} />
              <SliderControl id="env-sky-above-g" label="G" value={panelSettings.environment.skyColorAboveHorizon[1]} bounds={sliderBounds.envSkyAboveG} onBoundsChange={(side, value) => setBoundsValue('envSkyAboveG', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorAboveHorizon: [current.environment.skyColorAboveHorizon[0], clamp(value, 0, 1), current.environment.skyColorAboveHorizon[2]] } }))} />
              <SliderControl id="env-sky-above-b" label="B" value={panelSettings.environment.skyColorAboveHorizon[2]} bounds={sliderBounds.envSkyAboveB} onBoundsChange={(side, value) => setBoundsValue('envSkyAboveB', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorAboveHorizon: [current.environment.skyColorAboveHorizon[0], current.environment.skyColorAboveHorizon[1], clamp(value, 0, 1)] } }))} />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Sky Below Horizon</summary>
            <div className="sub-disclosure-content">
              <SliderControl id="env-sky-below-r" label="R" value={panelSettings.environment.skyColorBelowHorizon[0]} bounds={sliderBounds.envSkyBelowR} onBoundsChange={(side, value) => setBoundsValue('envSkyBelowR', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorBelowHorizon: [clamp(value, 0, 1), current.environment.skyColorBelowHorizon[1], current.environment.skyColorBelowHorizon[2]] } }))} />
              <SliderControl id="env-sky-below-g" label="G" value={panelSettings.environment.skyColorBelowHorizon[1]} bounds={sliderBounds.envSkyBelowG} onBoundsChange={(side, value) => setBoundsValue('envSkyBelowG', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorBelowHorizon: [current.environment.skyColorBelowHorizon[0], clamp(value, 0, 1), current.environment.skyColorBelowHorizon[2]] } }))} />
              <SliderControl id="env-sky-below-b" label="B" value={panelSettings.environment.skyColorBelowHorizon[2]} bounds={sliderBounds.envSkyBelowB} onBoundsChange={(side, value) => setBoundsValue('envSkyBelowB', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, skyColorBelowHorizon: [current.environment.skyColorBelowHorizon[0], current.environment.skyColorBelowHorizon[1], clamp(value, 0, 1)] } }))} />
            </div>
          </details>

          <details className="hud-sub-disclosure">
            <summary>Horizon Fog Color</summary>
            <div className="sub-disclosure-content">
              <SliderControl id="env-fog-r" label="R" value={panelSettings.environment.horizonFogColor[0]} bounds={sliderBounds.envFogR} onBoundsChange={(side, value) => setBoundsValue('envFogR', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, horizonFogColor: [clamp(value, 0, 1), current.environment.horizonFogColor[1], current.environment.horizonFogColor[2]] } }))} />
              <SliderControl id="env-fog-g" label="G" value={panelSettings.environment.horizonFogColor[1]} bounds={sliderBounds.envFogG} onBoundsChange={(side, value) => setBoundsValue('envFogG', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, horizonFogColor: [current.environment.horizonFogColor[0], clamp(value, 0, 1), current.environment.horizonFogColor[2]] } }))} />
              <SliderControl id="env-fog-b" label="B" value={panelSettings.environment.horizonFogColor[2]} bounds={sliderBounds.envFogB} onBoundsChange={(side, value) => setBoundsValue('envFogB', side, value)} onValueChange={(value) => updatePanelSettings((current) => ({ ...current, environment: { ...current.environment, horizonFogColor: [current.environment.horizonFogColor[0], current.environment.horizonFogColor[1], clamp(value, 0, 1)] } }))} />
            </div>
          </details>
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
  );
};
