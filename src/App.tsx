import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { useGameSocket, type SocketState } from './stunner/network/useGameSocket';
import { CanvasStage, type CameraTelemetry } from './stunner/renderer/CanvasStage';
import type { SandboxDemo } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import {
  buildRuntimeRendererConfig,
  createDefaultRuntimeToggles,
  DEBUG_VIEWS,
  QUALITY_PRESETS,
  type DebugView,
  type RuntimeFeatureToggles,
} from './stunner/renderer/debug/RuntimeControls';
import type { QualityPreset } from './stunner/renderer/config/RendererConfig';
const DEFAULT_SOCKET_URL = 'ws://localhost:8080/ws';
const SANDBOX_DEMOS: SandboxDemo[] = ['basic', 'physics'];

const formatVec3 = (value: [number, number, number]): string => {
  return `${value[0].toFixed(2)}, ${value[1].toFixed(2)}, ${value[2].toFixed(2)}`;
};

const formatSocketState = (socketState: SocketState): string => {
  if (socketState === 'open') {
    return 'Connected';
  }
  if (socketState === 'connecting') {
    return 'Connecting';
  }
  if (socketState === 'closed') {
    return 'Closed';
  }
  return 'Error';
};

const App = () => {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('high');
  const [debugView, setDebugView] = useState<DebugView>('off');
  const [featureToggles, setFeatureToggles] = useState<RuntimeFeatureToggles>(
    createDefaultRuntimeToggles(),
  );
  const [bloomStrength, setBloomStrength] = useState(0.9);
  const [dofFocusDistance, setDofFocusDistance] = useState(9);
  const [dofAmount, setDofAmount] = useState(1);
  const [motionBlurIntensity, setMotionBlurIntensity] = useState(0.42);
  const [motionBlurShutterAngle, setMotionBlurShutterAngle] = useState(150);
  const [ssrStage, setSsrStage] = useState<0 | 1 | 2>(0);
  const [keyLightAzimuthDeg, setKeyLightAzimuthDeg] = useState(150);
  const [keyLightElevationDeg, setKeyLightElevationDeg] = useState(55);
  const rendererConfig = useMemo(() => {
    const baseConfig = buildRuntimeRendererConfig(
      qualityPreset,
      debugView,
      featureToggles,
      keyLightAzimuthDeg,
      keyLightElevationDeg,
    );
    return {
      ...baseConfig,
      bloom: {
        ...baseConfig.bloom,
        intensity: bloomStrength,
      },
      depthOfField: {
        ...baseConfig.depthOfField,
        focusDistance: dofFocusDistance,
        aperture: Math.max(0, baseConfig.depthOfField.aperture * dofAmount),
      },
      motionBlur: {
        ...baseConfig.motionBlur,
        intensity: motionBlurIntensity,
        shutterAngle: motionBlurShutterAngle,
      },
      screenSpaceReflections: {
        ...baseConfig.screenSpaceReflections,
        stage: ssrStage,
      },
    };
  }, [
    qualityPreset,
    debugView,
    featureToggles,
    bloomStrength,
    dofFocusDistance,
    dofAmount,
    motionBlurIntensity,
    motionBlurShutterAngle,
    ssrStage,
    keyLightAzimuthDeg,
    keyLightElevationDeg,
  ]);
  const socketUrl = import.meta.env.VITE_GAME_WS_URL ?? DEFAULT_SOCKET_URL;
  const { socketState, lastMessage, receivedAt, sendJson } = useGameSocket(socketUrl);
  const [renderBackend, setRenderBackend] = useState<RenderBackend>('webgl2');
  const [sandboxDemo, setSandboxDemo] = useState<SandboxDemo>('basic');
  const [hudClicks, setHudClicks] = useState(0);
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
  const handlePing = useCallback(() => {
    setHudClicks((current) => current + 1);
    sendJson({
      type: 'ping',
      sentAt: Date.now(),
    });
  }, [sendJson]);
  const toggleFeature = useCallback((key: keyof RuntimeFeatureToggles) => {
    setFeatureToggles((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);
  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        onCameraTelemetry={handleCameraTelemetry}
        rendererConfig={rendererConfig}
        demoSelection={sandboxDemo}
        forceWebGpu={sandboxDemo === 'physics'}
      />

      <aside className="hud" aria-label="Game overlay controls">
        <h1>Render Sandbox</h1>

        <dl>
          <div>
            <dt>Backend</dt>
            <dd>{renderBackend.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Socket</dt>
            <dd>{formatSocketState(socketState)}</dd>
          </div>
          <div>
            <dt>Last Packet</dt>
            <dd>{receivedAt ? new Date(receivedAt).toLocaleTimeString() : 'N/A'}</dd>
          </div>
          <div>
            <dt>HUD Updates</dt>
            <dd>{hudClicks}</dd>
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

        <div className="control-group">
          <label htmlFor="light-azimuth">Light Azimuth: {keyLightAzimuthDeg.toFixed(0)}deg</label>
          <input
            id="light-azimuth"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={keyLightAzimuthDeg}
            onChange={(event) => setKeyLightAzimuthDeg(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="light-elevation">Light Elevation: {keyLightElevationDeg.toFixed(0)}deg</label>
          <input
            id="light-elevation"
            type="range"
            min={10}
            max={85}
            step={1}
            value={keyLightElevationDeg}
            onChange={(event) => setKeyLightElevationDeg(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="bloom-strength">Bloom Strength: {bloomStrength.toFixed(2)}</label>
          <input
            id="bloom-strength"
            type="range"
            min={0}
            max={2.5}
            step={0.01}
            value={bloomStrength}
            onChange={(event) => setBloomStrength(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="dof-focus-distance">DoF Focus Distance: {dofFocusDistance.toFixed(1)}</label>
          <input
            id="dof-focus-distance"
            type="range"
            min={0.5}
            max={60}
            step={0.1}
            value={dofFocusDistance}
            onChange={(event) => setDofFocusDistance(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="dof-amount">DoF Amount: {dofAmount.toFixed(2)}</label>
          <input
            id="dof-amount"
            type="range"
            min={0}
            max={2.5}
            step={0.01}
            value={dofAmount}
            disabled={!featureToggles.depthOfField}
            onChange={(event) => setDofAmount(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="ssr-stage">SSR Stage</label>
          <select
            id="ssr-stage"
            value={ssrStage}
            disabled={!featureToggles.screenSpaceReflectionsExperimental}
            onChange={(event) => setSsrStage(Number(event.target.value) as 0 | 1 | 2)}
          >
            <option value={0}>0 - Disabled</option>
            <option value={1}>1 - Pass-through pass</option>
            <option value={2}>2 - Copy + pass-through</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="motion-blur-intensity">Motion Blur Intensity: {motionBlurIntensity.toFixed(2)}</label>
          <input
            id="motion-blur-intensity"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={motionBlurIntensity}
            onChange={(event) => setMotionBlurIntensity(Number(event.target.value))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="motion-blur-shutter">Motion Blur Shutter: {motionBlurShutterAngle.toFixed(0)}deg</label>
          <input
            id="motion-blur-shutter"
            type="range"
            min={0}
            max={360}
            step={1}
            value={motionBlurShutterAngle}
            onChange={(event) => setMotionBlurShutterAngle(Number(event.target.value))}
          />
        </div>

        <div className="feature-toggles">
          <button type="button" onClick={() => toggleFeature('shadows')}>
            Shadows: {featureToggles.shadows ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('ambientOcclusion')}>
            AO: {featureToggles.ambientOcclusion ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('bloom')}>
            Bloom: {featureToggles.bloom ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('depthOfField')}>
            DoF: {featureToggles.depthOfField ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('colorGrading')}>
            Grading: {featureToggles.colorGrading ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('motionBlur')}>
            Motion Blur: {featureToggles.motionBlur ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('screenSpaceReflections')}>
            SSR: {featureToggles.screenSpaceReflections ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('screenSpaceReflectionsExperimental')}>
            SSR Experimental: {featureToggles.screenSpaceReflectionsExperimental ? 'On' : 'Off'}
          </button>
          <button type="button" onClick={() => toggleFeature('fog')}>
            Fog: {featureToggles.fog ? 'On' : 'Off'}
          </button>
        </div>

        <p className="message-preview">{lastMessage}</p>

        <button type="button" onClick={handlePing}>
          Send Ping
        </button>
      </aside>
    </main>
  );
};
export default App;
