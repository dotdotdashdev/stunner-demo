import type { Dispatch, SetStateAction } from 'react';
import type { ExampleTelemetry, SandboxExample } from '../../components/CanvasStage';
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
import {
  CROWD_BODY_COUNT_MAX,
  CROWD_BODY_COUNT_MIN,
  CROWD_COLLISION_RADIUS_MAX,
  CROWD_COLLISION_RADIUS_MIN,
  DEFAULT_CROWD_OPTIONS as DEFAULT_CROWD_EXAMPLE_OPTIONS,
  type CrowdExampleOptions,
} from '../crowd';
import {
  DEFAULT_SPONZA_OPTIONS as DEFAULT_SPONZA_EXAMPLE_OPTIONS,
  type SponzaExampleOptions,
} from '../sponza';
import {
  DEFAULT_BRAIN_STEM_DRACO_OPTIONS as DEFAULT_BRAIN_STEM_DRACO_EXAMPLE_OPTIONS,
  type BrainStemDracoExampleOptions,
} from '../brainStemDraco';
import {
  DEFAULT_PORSCHE_OPTIONS as DEFAULT_PORSCHE_EXAMPLE_OPTIONS,
  type PorscheExampleOptions,
} from '../usd/porsche';
import { ExampleSlider } from './ExampleSlider';

export const DEFAULT_POINT_LIGHTS_OPTIONS: PointLightsExampleOptions = {
  pointLightCount: 64,
  pointLightSpeed: 1.0,
  pointLightsCastShadows: false,
  pointLightRange: 4,
  pointLightIntensity: 10,
};

export const DEFAULT_MODELS_AND_MATERIALS_OPTIONS: ModelsAndMaterialsExampleOptions = {
  animationPlaybackSpeed: 1.8,
  orbitSpeedRadPerSec: 0.18,
  rotationSpeedRadPerSec: 0.36,
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
  shadowMapBiasOverride: 0.0026,
  shadowMapSoftnessOverride: 0.45,
  particleScaleMin: 0.11,
  particleScaleMax: 0.21,
};

export const DEFAULT_CROWD_OPTIONS: CrowdExampleOptions = {
  ...DEFAULT_CROWD_EXAMPLE_OPTIONS,
};

export const DEFAULT_SPONZA_OPTIONS: SponzaExampleOptions = {
  ...DEFAULT_SPONZA_EXAMPLE_OPTIONS,
};

export const DEFAULT_BRAIN_STEM_DRACO_OPTIONS: BrainStemDracoExampleOptions = {
  ...DEFAULT_BRAIN_STEM_DRACO_EXAMPLE_OPTIONS,
};

export const DEFAULT_PORSCHE_OPTIONS: PorscheExampleOptions = {
  ...DEFAULT_PORSCHE_EXAMPLE_OPTIONS,
};

type ExampleParametersHudProps = {
  sandboxExample: SandboxExample;
  exampleTelemetry: ExampleTelemetry;
  modelsAndMaterialsOptions: ModelsAndMaterialsExampleOptions;
  pointLightsOptions: PointLightsExampleOptions;
  flockingOptions: FlockingExampleOptions;
  crowdOptions: CrowdExampleOptions;
  brainStemDracoOptions: BrainStemDracoExampleOptions;
  porscheOptions: PorscheExampleOptions;
  setModelsAndMaterialsOptions: Dispatch<SetStateAction<ModelsAndMaterialsExampleOptions>>;
  setPointLightsOptions: Dispatch<SetStateAction<PointLightsExampleOptions>>;
  setFlockingOptions: Dispatch<SetStateAction<FlockingExampleOptions>>;
  setCrowdOptions: Dispatch<SetStateAction<CrowdExampleOptions>>;
  setBrainStemDracoOptions: Dispatch<SetStateAction<BrainStemDracoExampleOptions>>;
  setPorscheOptions: Dispatch<SetStateAction<PorscheExampleOptions>>;
};

export const hasExampleParameterControls = (sandboxExample: SandboxExample): boolean => {
  return (
    sandboxExample !== 'sponza' &&
    sandboxExample !== 'train' &&
    sandboxExample !== 'city'
  );
};

export const ExampleParametersHud = ({
  sandboxExample,
  exampleTelemetry,
  modelsAndMaterialsOptions,
  pointLightsOptions,
  flockingOptions,
  crowdOptions,
  brainStemDracoOptions,
  porscheOptions,
  setModelsAndMaterialsOptions,
  setPointLightsOptions,
  setFlockingOptions,
  setCrowdOptions,
  setBrainStemDracoOptions,
  setPorscheOptions,
}: ExampleParametersHudProps) => {
  if (!hasExampleParameterControls(sandboxExample)) {
    return null;
  }

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
            id="models-orbit-speed"
            label="Orbit speed"
            min={-1.5}
            max={1.5}
            step={0.01}
            value={modelsAndMaterialsOptions.orbitSpeedRadPerSec ?? 0.18}
            onChange={(value) => {
              setModelsAndMaterialsOptions((current) => ({
                ...current,
                orbitSpeedRadPerSec: Math.max(-1.5, Math.min(1.5, value)),
              }));
            }}
          />
          <ExampleSlider
            id="models-rotation-speed"
            label="Helmet rotation speed"
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

      {sandboxExample === 'crowd' || sandboxExample === 'crowdCompute' ? (
        <section className="example-controls" aria-label="Crowd controls">
          <ExampleSlider
            id="crowd-body-count"
            label="Body count"
            min={CROWD_BODY_COUNT_MIN}
            max={CROWD_BODY_COUNT_MAX}
            step={1}
            value={crowdOptions.bodyCount}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                bodyCount: Math.max(
                  CROWD_BODY_COUNT_MIN,
                  Math.min(CROWD_BODY_COUNT_MAX, Math.round(value)),
                ),
              }));
            }}
          />
          <ExampleSlider
            id="crowd-collision-radius"
            label="Collision radius"
            min={CROWD_COLLISION_RADIUS_MIN}
            max={CROWD_COLLISION_RADIUS_MAX}
            step={0.01}
            value={crowdOptions.collisionRadius}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                collisionRadius: Math.max(
                  CROWD_COLLISION_RADIUS_MIN,
                  Math.min(CROWD_COLLISION_RADIUS_MAX, value),
                ),
              }));
            }}
          />
          <ExampleSlider
            id="crowd-turn-rate"
            label="Turn rate"
            min={0.2}
            max={8}
            step={0.01}
            value={crowdOptions.turnRate}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                turnRate: Math.max(0.2, Math.min(8, value)),
              }));
            }}
          />
          <label className="checkbox-row" htmlFor="crowd-cel-shading-enabled">
            <input
              id="crowd-cel-shading-enabled"
              type="checkbox"
              checked={crowdOptions.celShadingEnabled}
              onChange={(event) => {
                const checked = event.target.checked;
                setCrowdOptions((current) => ({
                  ...current,
                  celShadingEnabled: checked,
                }));
              }}
            />
            <span>Enable cel shading</span>
          </label>
          <ExampleSlider
            id="crowd-cel-bands"
            label="Cel band count"
            min={2}
            max={8}
            step={1}
            value={crowdOptions.celBandCount}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                celBandCount: Math.max(2, Math.min(8, Math.round(value))),
              }));
            }}
          />
          <ExampleSlider
            id="crowd-cel-edge-strength"
            label="Cel edge strength"
            min={0}
            max={2}
            step={0.01}
            value={crowdOptions.celEdgeStrength}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                celEdgeStrength: Math.max(0, Math.min(2, value)),
              }));
            }}
          />
          <ExampleSlider
            id="crowd-cel-outline-darkness"
            label="Cel outline darkness"
            min={0}
            max={1}
            step={0.01}
            value={crowdOptions.celOutlineDarkness}
            onChange={(value) => {
              setCrowdOptions((current) => ({
                ...current,
                celOutlineDarkness: Math.max(0, Math.min(1, value)),
              }));
            }}
          />
          <button
            type="button"
            className="example-reset-button"
            onClick={() => {
              setCrowdOptions(DEFAULT_CROWD_OPTIONS);
            }}
          >
            Reset Crowd
          </button>
        </section>
      ) : null}

      {sandboxExample === 'brainStemDraco' ? (
        <section className="example-controls" aria-label="BrainStemDraco controls">
          <ExampleSlider
            id="brainStemDraco-animation-speed"
            label="Animation speed"
            min={0}
            max={2}
            step={0.01}
            value={brainStemDracoOptions.animationSpeed}
            onChange={(value) => {
              setBrainStemDracoOptions((current) => ({
                ...current,
                animationSpeed: Math.max(0, Math.min(2, value)),
              }));
            }}
          />
          <button
            type="button"
            className="example-reset-button"
            onClick={() => {
              setBrainStemDracoOptions(DEFAULT_BRAIN_STEM_DRACO_OPTIONS);
            }}
          >
            Reset BrainStemDraco
          </button>
        </section>
      ) : null}

      {sandboxExample === 'porsche' ? (
        <section className="example-controls" aria-label="Porsche controls">
          <label className="select-row" htmlFor="porsche-sky-texture">
            <span>Sky texture</span>
            <select
              id="porsche-sky-texture"
              value={porscheOptions.skyTexture}
              onChange={(event) => {
                const next = event.target.value as PorscheExampleOptions['skyTexture'];
                setPorscheOptions((current) => ({ ...current, skyTexture: next }));
              }}
            >
              <option value="sky-1">sky-1.png</option>
              <option value="sky-2">sky-2.png</option>
              <option value="sky-3">sky-3.png</option>
            </select>
          </label>
          <label className="select-row" htmlFor="porsche-sky-blend-mode">
            <span>Sky blend mode</span>
            <select
              id="porsche-sky-blend-mode"
              value={porscheOptions.skyBlendMode}
              onChange={(event) => {
                const next = event.target.value as PorscheExampleOptions['skyBlendMode'];
                setPorscheOptions((current) => ({ ...current, skyBlendMode: next }));
              }}
            >
              <option value="alpha">Alpha (over)</option>
              <option value="additive">Additive</option>
              <option value="multiply">Multiply</option>
            </select>
          </label>
          <ExampleSlider
            id="porsche-sky-intensity"
            label="Sky intensity"
            min={0}
            max={4}
            step={0.01}
            value={porscheOptions.skyIntensity}
            onChange={(value) => {
              setPorscheOptions((current) => ({
                ...current,
                skyIntensity: Math.max(0, Math.min(4, value)),
              }));
            }}
          />
          <ExampleSlider
            id="porsche-sky-blend"
            label="Sky blend (1=replace, 0=procedural)"
            min={0}
            max={1}
            step={0.01}
            value={porscheOptions.skyBlendAmount}
            onChange={(value) => {
              setPorscheOptions((current) => ({
                ...current,
                skyBlendAmount: Math.max(0, Math.min(1, value)),
              }));
            }}
          />
          <button
            type="button"
            className="example-reset-button"
            onClick={() => {
              setPorscheOptions(DEFAULT_PORSCHE_OPTIONS);
            }}
          >
            Reset Porsche
          </button>
        </section>
      ) : null}

    </aside>
  );
};
