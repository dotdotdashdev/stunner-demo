import { useCallback, useMemo, useState } from 'react'
import './App.css'
import { useGameSocket, type SocketState } from './network/useGameSocket'
import { CanvasStage } from './renderer/CanvasStage'
import type { RenderBackend } from './renderer/RendererEngine'
import {
  buildRuntimeRendererConfig,
  createDefaultRuntimeToggles,
  DEBUG_VIEWS,
  QUALITY_PRESETS,
  type DebugView,
  type RuntimeFeatureToggles,
} from './renderer/debug/RuntimeControls'
import type { QualityPreset } from './renderer/config/RendererConfig'

const DEFAULT_SOCKET_URL = 'ws://localhost:8080/ws'

function formatSocketState(socketState: SocketState): string {
  if (socketState === 'open') return 'Connected'
  if (socketState === 'connecting') return 'Connecting'
  if (socketState === 'closed') return 'Closed'
  return 'Error'
}

function App() {
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('high')
  const [debugView, setDebugView] = useState<DebugView>('off')
  const [featureToggles, setFeatureToggles] = useState<RuntimeFeatureToggles>(
    createDefaultRuntimeToggles(),
  )

  const rendererConfig = useMemo(
    () => buildRuntimeRendererConfig(qualityPreset, debugView, featureToggles),
    [qualityPreset, debugView, featureToggles],
  )
  const socketUrl = import.meta.env.VITE_GAME_WS_URL ?? DEFAULT_SOCKET_URL
  const { socketState, lastMessage, receivedAt, sendJson } =
    useGameSocket(socketUrl)
  const [renderBackend, setRenderBackend] =
    useState<RenderBackend>('webgl2')
  const [hudClicks, setHudClicks] = useState(0)

  const handleBackendReady = useCallback((backend: RenderBackend) => {
    setRenderBackend(backend)
  }, [])

  const handlePing = useCallback(() => {
    setHudClicks((current) => current + 1)
    sendJson({
      type: 'ping',
      sentAt: Date.now(),
    })
  }, [sendJson])

  const toggleFeature = useCallback((key: keyof RuntimeFeatureToggles) => {
    setFeatureToggles((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }, [])

  return (
    <main className="app-shell">
      <CanvasStage
        className="game-canvas"
        onBackendReady={handleBackendReady}
        rendererConfig={rendererConfig}
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
        </div>

        <p className="message-preview">{lastMessage}</p>

        <button type="button" onClick={handlePing}>
          Send Ping
        </button>
      </aside>
    </main>
  )
}

export default App
