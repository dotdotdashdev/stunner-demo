import type { Dispatch, SetStateAction } from 'react';
import type { ExampleTelemetry, SandboxExample } from '../../stunner/renderer/CanvasStage';
import type { ModelsAndMaterialsExampleOptions } from '../modelsAndMaterials';
import {
  POINT_LIGHTS_MAX_EFFECTIVE_COUNT,
  type PointLightsExampleOptions,
} from '../pointLights';
import {
  FLOCKING_PARTICLE_COUNT_MAX,
  FLOCKING_PARTICLE_COUNT_MIN,
  type FlockingExampleOptions,
} from '../flocking';
import { ExampleSlider } from './ExampleSlider';

export const DEFAULT_POINT_LIGHTS_OPTIONS: PointLightsExampleOptions = {
  pointLightCount: 64,
  pointLightSpeed: 1.0,
  pointLightsCastShadows: false,
  pointLightRange: 4,
  pointLightIntensity: 10,
};

export const DEFAULT_MODELS_AND_MATERIALS_OPTIONS: ModelsAndMaterialsExampleOptions = {
  animationPlaybackSpeed: 1.0,
  rotationSpeedRadPerSec: 0.18,
  directionalLightAzimuthDeg: 27,
  directionalLightElevationDeg: 56,
  directionalLightIntensity: 1.0,
  glassRefractionBend: 1.52,
  glassRefractionThickness: 1.0,
  glassRefractionSteps: 6,
  glassRefractionDepthBias: 0.0015,
};

export const DEFAULT_FLOCKING_OPTIONS: FlockingExampleOptions = {
  cohesionWeight: 0.62,
  alignmentWeight: 0.95,
  separationWeight: 0.42,
  centerWeight: 0.88,
  flowWeight: 0.06,
  neighborSamples: 9,
  minSpeed: 1.6,
  maxSpeed: 4.2,
  bounds: 9.5,
  particleCount: 10_000,
  directionalLightIntensity: 4.8,
  shadowMapBiasOverride: 0.0026,
  shadowMapSoftnessOverride: 0.45,
  particleScaleMin: 0.11,
  particleScaleMax: 0.21,
};

type ExampleParametersHudProps = {
  sandboxExample: SandboxExample;
  exampleTelemetry: ExampleTelemetry;
  modelsAndMaterialsOptions: ModelsAndMaterialsExampleOptions;
  pointLightsOptions: PointLightsExampleOptions;
  flockingOptions: FlockingExampleOptions;
  setModelsAndMaterialsOptions: Dispatch<SetStateAction<ModelsAndMaterialsExampleOptions>>;
  setPointLightsOptions: Dispatch<SetStateAction<PointLightsExampleOptions>>;
  setFlockingOptions: Dispatch<SetStateAction<FlockingExampleOptions>>;
};

export const ExampleParametersHud = ({
  sandboxExample,
  exampleTelemetry,
  modelsAndMaterialsOptions,
  pointLightsOptions,
  flockingOptions,
  setModelsAndMaterialsOptions,
  setPointLightsOptions,
  setFlockingOptions,
}: ExampleParametersHudProps) => {
  return (
    <aside className="example-hud example-params-hud" aria-label="Example parameters">
      {sandboxExample === 'pointLights' ? (
        <section className="example-controls" aria-label="Point lights controls">
          <ExampleSlider
            id="point-light-count"
            label="Point light count"
            min={1}
            max={POINT_LIGHTS_MAX_EFFECTIVE_COUNT}
            step={1}
            value={pointLightsOptions.pointLightCount}
            onChange={(value) => {
              setPointLightsOptions((current) => ({
                ...current,
                pointLightCount: Math.max(1, Math.min(POINT_LIGHTS_MAX_EFFECTIVE_COUNT, Math.round(value))),
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
          <ExampleSlider
            id="point-light-range"
            label="Point light range"
            min={0.5}
            max={20}
            step={0.05}
            value={pointLightsOptions.pointLightRange}
            onChange={(value) => {
              setPointLightsOptions((current) => ({
                ...current,
                pointLightRange: Math.max(0.5, Math.min(20, value)),
              }));
            }}
          />
          <ExampleSlider
            id="point-light-intensity"
            label="Point light intensity"
            min={0}
            max={30}
            step={0.05}
            value={pointLightsOptions.pointLightIntensity}
            onChange={(value) => {
              setPointLightsOptions((current) => ({
                ...current,
                pointLightIntensity: Math.max(0, Math.min(30, value)),
              }));
            }}
          />
          <label className="checkbox-row" htmlFor="point-lights-cast-shadows">
            <input
              id="point-lights-cast-shadows"
              type="checkbox"
              checked={pointLightsOptions.pointLightsCastShadows}
              onChange={(event) => {
                const checked = event.target.checked;
                setPointLightsOptions((current) => ({
                  ...current,
                  pointLightsCastShadows: checked,
                }));
              }}
            />
            <span>Point lights cast shadows</span>
          </label>
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

      {sandboxExample === 'modelsAndMaterials' ? (
        <section className="example-controls" aria-label="Models and materials controls">
          <ExampleSlider
            id="models-animation-speed"
            label={exampleTelemetry ? `Animation speed (${exampleTelemetry.clipName})` : 'Animation speed'}
            min={0}
            max={3}
            step={0.01}
            value={modelsAndMaterialsOptions.animationPlaybackSpeed ?? 1}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                animationPlaybackSpeed: Math.max(0, Math.min(3, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-rotation-speed"
            label="Rotation speed"
            min={-1.5}
            max={1.5}
            step={0.01}
            value={modelsAndMaterialsOptions.rotationSpeedRadPerSec ?? 0.18}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                rotationSpeedRadPerSec: Math.max(-1.5, Math.min(1.5, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-light-azimuth"
            label="Light azimuth"
            min={-180}
            max={180}
            step={1}
            value={modelsAndMaterialsOptions.directionalLightAzimuthDeg ?? 27}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                directionalLightAzimuthDeg: Math.max(-180, Math.min(180, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-light-elevation"
            label="Light elevation"
            min={-89}
            max={89}
            step={1}
            value={modelsAndMaterialsOptions.directionalLightElevationDeg ?? 56}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                directionalLightElevationDeg: Math.max(-89, Math.min(89, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-light-intensity"
            label="Light intensity"
            min={0}
            max={4}
            step={0.01}
            value={modelsAndMaterialsOptions.directionalLightIntensity ?? 1}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                directionalLightIntensity: Math.max(0, Math.min(4, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-glass-bend"
            label="Glass bend (IOR)"
            min={1}
            max={2.5}
            step={0.01}
            value={modelsAndMaterialsOptions.glassRefractionBend ?? 1.52}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                glassRefractionBend: Math.max(1, Math.min(2.5, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-glass-thickness"
            label="Glass thickness"
            min={0}
            max={2}
            step={0.01}
            value={modelsAndMaterialsOptions.glassRefractionThickness ?? 1}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                glassRefractionThickness: Math.max(0, Math.min(2, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-glass-steps"
            label="Glass thickness steps"
            min={1}
            max={12}
            step={1}
            value={modelsAndMaterialsOptions.glassRefractionSteps ?? 6}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                glassRefractionSteps: Math.max(1, Math.min(12, Math.round(value))),
              }));
            }}
          />
          <ExampleSlider
            id="models-glass-depth-bias"
            label="Glass depth bias"
            min={0.0005}
            max={0.04}
            step={0.0001}
            value={modelsAndMaterialsOptions.glassRefractionDepthBias ?? 0.0015}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                glassRefractionDepthBias: Math.max(0.0005, Math.min(0.04, value)),
              }));
            }}
          />
          <button
            type="button"
            className="example-reset-button"
            onClick={() => {
              setModelsAndMaterialsOptions(DEFAULT_MODELS_AND_MATERIALS_OPTIONS);
            }}
          >
            Reset Models and Materials
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
            id="flock-shadow-bias"
            label="Shadow map bias"
            min={0}
            max={0.02}
            step={0.0001}
            value={flockingOptions.shadowMapBiasOverride}
            onChange={(value) => {
              setFlockingOptions((current) => ({
                ...current,
                shadowMapBiasOverride: Math.max(0, Math.min(0.02, value)),
              }));
            }}
          />
          <ExampleSlider
            id="flock-shadow-softness"
            label="Shadow map softness"
            min={0}
            max={4}
            step={0.01}
            value={flockingOptions.shadowMapSoftnessOverride}
            onChange={(value) => {
              setFlockingOptions((current) => ({
                ...current,
                shadowMapSoftnessOverride: Math.max(0, Math.min(4, value)),
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

      {sandboxExample === 'crowd' ? (
        <section className="example-controls" aria-label="Crowd controls">
          <p className="example-empty-state">No crowd controls yet.</p>
        </section>
      ) : null}
    </aside>
  );
};
