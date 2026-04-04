import { memo, useEffect, useRef, useState } from 'react'
import { RendererEngine, type RenderBackend } from './RendererEngine'
import type { RendererConfig } from './config/RendererConfig'

type CanvasStageProps = {
  className?: string
  onBackendReady?: (backend: RenderBackend) => void
  rendererConfig?: RendererConfig
}

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
  rendererConfig,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<RendererEngine | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new RendererEngine(canvas, rendererConfig)
    engineRef.current = engine
    let disposed = false

    void engine
      .start()
      .then((backend) => {
        if (!disposed) {
          onBackendReady?.(backend)
        }
      })
      .catch((error: unknown) => {
        if (disposed) {
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Renderer failed to start with WebGPU and WebGL2.'

        setFatalError(message)
      })

    return () => {
      disposed = true
      engineRef.current = null
      engine.dispose()
    }
  }, [onBackendReady])

  useEffect(() => {
    if (!rendererConfig || !engineRef.current) {
      return
    }

    engineRef.current.updateConfig(rendererConfig)
  }, [rendererConfig])

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className={className}
        aria-label="Game rendering surface"
      />
      {fatalError ? <p className="canvas-error">{fatalError}</p> : null}
    </div>
  )
})
