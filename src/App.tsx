import { useCallback, useState } from 'react'
import './App.css'
import { useGameSocket, type SocketState } from './network/useGameSocket'
import { CanvasStage } from './rendering/CanvasStage'
import type { RenderBackend } from './rendering/RenderEngine'

const DEFAULT_SOCKET_URL = 'ws://localhost:8080/ws'

function formatSocketState(socketState: SocketState): string {
  if (socketState === 'open') return 'Connected'
  if (socketState === 'connecting') return 'Connecting'
  if (socketState === 'closed') return 'Closed'
  return 'Error'
}

function App() {
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

  return (
    <main className="app-shell">
      <CanvasStage className="game-canvas" onBackendReady={handleBackendReady} />

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
        </dl>

        <p className="message-preview">{lastMessage}</p>

        <button type="button" onClick={handlePing}>
          Send Ping
        </button>
      </aside>
    </main>
  )
}

export default App
