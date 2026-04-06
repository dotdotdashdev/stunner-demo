import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { CanvasStage, type CameraTelemetry, type PerformanceTelemetry, type SandboxDemo } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import { createRendererConfig, type RendererConfig } from './stunner/renderer/config/RendererConfig';
import { RendererHud } from './stunner/hud/RendererHud';
import type { CityDemoOptions } from './demo/cityDemo';
import type { FlockingDemoOptions } from './demo/flockingDemo';

const SANDBOX_DEMOS: SandboxDemo[] = ['basic', 'pointLights', 'flocking'];

const DEFAULT_POINT_LIGHTS_OPTIONS: CityDemoOptions = {
  pointLightCount: 200,
  pointLightSpeed: 1.0,
};

const DEFAULT_FLOCKING_OPTIONS: FlockingDemoOptions = {
  cohesionWeight: 0.36,
  alignmentWeight: 0.44,
  separationWeight: 0.65,
  centerWeight: 0.28,
  flowWeight: 0.22,
  neighborSamples: 4,
  minSpeed: 1.0,
  maxSpeed: 6.5,
  bounds: 14.0,
  particleScaleMin: 0.11,
  particleScaleMax: 0.21,
  emissiveBase: 1.2,
  emissiveVelocityBoost: 5.4,
};

type DemoSliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

const DemoSlider = ({ id, label, value, min, max, step, onChange }: DemoSliderProps) => {
  return (
    <div className="demo-control-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
};

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
  const [pointLightsOptions, setPointLightsOptions] = useState<CityDemoOptions>(
    DEFAULT_POINT_LIGHTS_OPTIONS,
  );
  const [flockingOptions, setFlockingOptions] = useState<FlockingDemoOptions>(
    DEFAULT_FLOCKING_OPTIONS,
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
        pointLightsOptions={pointLightsOptions}
        flockingOptions={flockingOptions}
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

        {sandboxDemo === 'pointLights' ? (
          <section className="demo-controls" aria-label="Point lights controls">
            <DemoSlider
              id="point-light-count"
              label="Point light count"
              min={1}
              max={1000}
              step={1}
              value={pointLightsOptions.pointLightCount}
              onChange={(value) => {
                setPointLightsOptions((current) => ({
                  ...current,
                  pointLightCount: Math.max(1, Math.min(1000, Math.round(value))),
                }));
              }}
            />
            <DemoSlider
              id="point-light-speed"
              label="Point light speed"
              min={0.05}
              max={4}
              step={0.01}
              value={pointLightsOptions.pointLightSpeed}
              onChange={(value) => {
                setPointLightsOptions((current) => ({
                  ...current,
                  pointLightSpeed: Math.max(0.05, Math.min(4, value)),
                }));
              }}
            />
            <button
              type="button"
              className="demo-reset-button"
              onClick={() => {
                setPointLightsOptions(DEFAULT_POINT_LIGHTS_OPTIONS);
              }}
            >
              Reset Point Lights
            </button>
          </section>
        ) : null}

        {sandboxDemo === 'flocking' ? (
          <section className="demo-controls" aria-label="Flocking controls">
            <DemoSlider
              id="flock-cohesion"
              label="Cohesion"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.cohesionWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, cohesionWeight: value }))}
            />
            <DemoSlider
              id="flock-alignment"
              label="Alignment"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.alignmentWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, alignmentWeight: value }))}
            />
            <DemoSlider
              id="flock-separation"
              label="Separation"
              min={0}
              max={3}
              step={0.01}
              value={flockingOptions.separationWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, separationWeight: value }))}
            />
            <DemoSlider
              id="flock-centering"
              label="Centering"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.centerWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, centerWeight: value }))}
            />
            <DemoSlider
              id="flock-flow"
              label="Flow"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.flowWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, flowWeight: value }))}
            />
            <DemoSlider
              id="flock-samples"
              label="Neighbor samples"
              min={1}
              max={16}
              step={1}
              value={flockingOptions.neighborSamples}
              onChange={(value) => {
                setFlockingOptions((current) => ({
                  ...current,
                  neighborSamples: Math.max(1, Math.min(16, Math.round(value))),
                }));
              }}
            />
            <DemoSlider
              id="flock-min-speed"
              label="Min speed"
              min={0.05}
              max={12}
              step={0.01}
              value={flockingOptions.minSpeed}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, minSpeed: value }))}
            />
            <DemoSlider
              id="flock-max-speed"
              label="Max speed"
              min={0.1}
              max={16}
              step={0.01}
              value={flockingOptions.maxSpeed}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, maxSpeed: value }))}
            />
            <DemoSlider
              id="flock-bounds"
              label="Bounds"
              min={4}
              max={30}
              step={0.1}
              value={flockingOptions.bounds}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, bounds: value }))}
            />
            <DemoSlider
              id="flock-size-min"
              label="Particle size min"
              min={0.01}
              max={0.5}
              step={0.005}
              value={flockingOptions.particleScaleMin}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, particleScaleMin: value }))}
            />
            <DemoSlider
              id="flock-size-max"
              label="Particle size max"
              min={0.02}
              max={0.9}
              step={0.005}
              value={flockingOptions.particleScaleMax}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, particleScaleMax: value }))}
            />
            <DemoSlider
              id="flock-emissive-base"
              label="Emissive base"
              min={0}
              max={8}
              step={0.01}
              value={flockingOptions.emissiveBase}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, emissiveBase: value }))}
            />
            <DemoSlider
              id="flock-emissive-velocity"
              label="Emissive velocity boost"
              min={0}
              max={20}
              step={0.01}
              value={flockingOptions.emissiveVelocityBoost}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, emissiveVelocityBoost: value }))}
            />
            <button
              type="button"
              className="demo-reset-button"
              onClick={() => {
                setFlockingOptions(DEFAULT_FLOCKING_OPTIONS);
              }}
            >
              Reset Flocking
            </button>
          </section>
        ) : null}
      </aside>
    </main>
  );
};

export default App;
