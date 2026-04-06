import { useCallback, useState } from 'react';
import './App.css';
import { CanvasStage, type CameraTelemetry, type PerformanceTelemetry, type SandboxExample } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import { createRendererConfig, type RendererConfig } from './stunner/renderer/config/RendererConfig';
import { RendererHud } from './stunner/hud/RendererHud';
import type { CityExampleOptions } from './example/city';
import {
  FLOCKING_PARTICLE_COUNT_MAX,
  FLOCKING_PARTICLE_COUNT_MIN,
  type FlockingExampleOptions,
} from './example/flocking';

const SANDBOX_EXAMPLES: SandboxExample[] = ['basic', 'pointLights', 'flocking'];

const DEFAULT_POINT_LIGHTS_OPTIONS: CityExampleOptions = {
  pointLightCount: 200,
  pointLightSpeed: 1.0,
};

const DEFAULT_FLOCKING_OPTIONS: FlockingExampleOptions = {
  cohesionWeight: 0.36,
  alignmentWeight: 0.44,
  separationWeight: 0.65,
  centerWeight: 0.28,
  flowWeight: 0.22,
  neighborSamples: 4,
  minSpeed: 1.0,
  maxSpeed: 6.5,
  bounds: 14.0,
  particleCount: 10_000,
  directionalLightIntensity: 4.8,
  particleScaleMin: 0.11,
  particleScaleMax: 0.21,
};

type ExampleSliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

const ExampleSlider = ({ id, label, value, min, max, step, onChange }: ExampleSliderProps) => {
  return (
    <div className="example-control-row">
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

const App = () => {
  const [sandboxExample, setSandboxExample] = useState<SandboxExample>('basic');
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
  const [pointLightsOptions, setPointLightsOptions] = useState<CityExampleOptions>(
    DEFAULT_POINT_LIGHTS_OPTIONS,
  );
  const [flockingOptions, setFlockingOptions] = useState<FlockingExampleOptions>(
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

  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        onCameraTelemetry={handleCameraTelemetry}
        onPerformanceTelemetry={handlePerformanceTelemetry}
        rendererConfig={rendererConfig}
        exampleSelection={sandboxExample}
        pointLightsOptions={pointLightsOptions}
        flockingOptions={flockingOptions}
      />

      <RendererHud
        renderBackend={renderBackend}
        perfTelemetry={perfTelemetry}
        cameraTelemetry={cameraTelemetry}
        onRendererConfigChange={handleRendererConfigChange}
      />

      <aside className="example-hud" aria-label="Example selector">
        <label htmlFor="sandbox-example">Example</label>
        <select
          id="sandbox-example"
          value={sandboxExample}
          onChange={(event) => setSandboxExample(event.target.value as SandboxExample)}
        >
          {SANDBOX_EXAMPLES.map((example) => (
            <option key={example} value={example}>
              {example}
            </option>
          ))}
        </select>

        {sandboxExample === 'pointLights' ? (
          <section className="example-controls" aria-label="Point lights controls">
            <ExampleSlider
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
            <ExampleSlider
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
              className="example-reset-button"
              onClick={() => {
                setPointLightsOptions(DEFAULT_POINT_LIGHTS_OPTIONS);
              }}
            >
              Reset Point Lights
            </button>
          </section>
        ) : null}

        {sandboxExample === 'flocking' ? (
          <section className="example-controls" aria-label="Flocking controls">
            <ExampleSlider
              id="flock-particle-count"
              label="Particle count"
              min={FLOCKING_PARTICLE_COUNT_MIN}
              max={FLOCKING_PARTICLE_COUNT_MAX}
              step={10}
              value={flockingOptions.particleCount}
              onChange={(value) => {
                setFlockingOptions((current) => ({
                  ...current,
                  particleCount: Math.max(
                    FLOCKING_PARTICLE_COUNT_MIN,
                    Math.min(FLOCKING_PARTICLE_COUNT_MAX, Math.round(value)),
                  ),
                }));
              }}
            />
            <ExampleSlider
              id="flock-cohesion"
              label="Cohesion"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.cohesionWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, cohesionWeight: value }))}
            />
            <ExampleSlider
              id="flock-alignment"
              label="Alignment"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.alignmentWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, alignmentWeight: value }))}
            />
            <ExampleSlider
              id="flock-separation"
              label="Separation"
              min={0}
              max={3}
              step={0.01}
              value={flockingOptions.separationWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, separationWeight: value }))}
            />
            <ExampleSlider
              id="flock-centering"
              label="Centering"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.centerWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, centerWeight: value }))}
            />
            <ExampleSlider
              id="flock-flow"
              label="Flow"
              min={0}
              max={2}
              step={0.01}
              value={flockingOptions.flowWeight}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, flowWeight: value }))}
            />
            <ExampleSlider
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
            <ExampleSlider
              id="flock-min-speed"
              label="Min speed"
              min={0.05}
              max={12}
              step={0.01}
              value={flockingOptions.minSpeed}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, minSpeed: value }))}
            />
            <ExampleSlider
              id="flock-max-speed"
              label="Max speed"
              min={0.1}
              max={16}
              step={0.01}
              value={flockingOptions.maxSpeed}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, maxSpeed: value }))}
            />
            <ExampleSlider
              id="flock-bounds"
              label="Bounds"
              min={4}
              max={30}
              step={0.1}
              value={flockingOptions.bounds}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, bounds: value }))}
            />
            <ExampleSlider
              id="flock-directional-light-intensity"
              label="Directional light intensity"
              min={0}
              max={20}
              step={0.05}
              value={flockingOptions.directionalLightIntensity}
              onChange={(value) => {
                setFlockingOptions((current) => ({
                  ...current,
                  directionalLightIntensity: Math.max(0, Math.min(20, value)),
                }));
              }}
            />
            <ExampleSlider
              id="flock-size-min"
              label="Particle size min"
              min={0.01}
              max={0.5}
              step={0.005}
              value={flockingOptions.particleScaleMin}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, particleScaleMin: value }))}
            />
            <ExampleSlider
              id="flock-size-max"
              label="Particle size max"
              min={0.02}
              max={0.9}
              step={0.005}
              value={flockingOptions.particleScaleMax}
              onChange={(value) => setFlockingOptions((current) => ({ ...current, particleScaleMax: value }))}
            />
            <button
              type="button"
              className="example-reset-button"
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
