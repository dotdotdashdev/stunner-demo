import { memo, useEffect, useRef, useState } from 'react'
import { RenderEngine, type RenderBackend } from './RenderEngine'

type CanvasStageProps = {
  className?: string
  onBackendReady?: (backend: RenderBackend) => void
}

export const CanvasStage = memo(function CanvasStage({
  className,
  onBackendReady,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fatalError, setFatalError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new RenderEngine(canvas)
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
      engine.dispose()
    }
  }, [onBackendReady])

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
