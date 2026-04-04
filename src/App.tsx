import { useCallback, useMemo, useState } from 'react';
import './App.css';
import { useGameSocket, type SocketState } from './stunner/network/useGameSocket';
import { CanvasStage, type CameraTelemetry } from './stunner/renderer/CanvasStage';
import type { SandboxDemo } from './stunner/renderer/CanvasStage';
import type { RenderBackend } from './stunner/renderer/RendererEngine';
import {
  buildRuntimeRendererConfig,
  createDefaultRuntimeToggles,
  DEMO_MODEL_FORMATS,
  DEBUG_VIEWS,
  QUALITY_PRESETS,
  type DebugView,
  type DemoModelFormat,
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
  const [motionBlurIntensity, setMotionBlurIntensity] = useState(0.42);
  const [motionBlurShutterAngle, setMotionBlurShutterAngle] = useState(150);
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
      motionBlur: {
        ...baseConfig.motionBlur,
        intensity: motionBlurIntensity,
        shutterAngle: motionBlurShutterAngle,
      },
    };
  }, [
    qualityPreset,
    debugView,
    featureToggles,
    motionBlurIntensity,
    motionBlurShutterAngle,
    keyLightAzimuthDeg,
    keyLightElevationDeg,
  ]);
  const socketUrl = import.meta.env.VITE_GAME_WS_URL ?? DEFAULT_SOCKET_URL;
  const { socketState, lastMessage, receivedAt, sendJson } = useGameSocket(socketUrl);
  const [renderBackend, setRenderBackend] = useState<RenderBackend>('webgl2');
  const [demoModelFormat, setDemoModelFormat] = useState<DemoModelFormat>('both');
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
        demoModelFormat={demoModelFormat}
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
            <dt>Preset</dt>
            <dd>{qualityPreset.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Debug</dt>
            <dd>{debugView.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Demo</dt>
            <dd>{sandboxDemo.toUpperCase()}</dd>
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
          <label htmlFor="model-format">Model Type</label>
          <select
            id="model-format"
            value={demoModelFormat}
            onChange={(event) => setDemoModelFormat(event.target.value as DemoModelFormat)}
            disabled={sandboxDemo !== 'basic'}
          >
            {DEMO_MODEL_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
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
