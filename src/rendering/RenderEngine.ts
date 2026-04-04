import {
  createRendererConfig,
  type RendererConfig,
} from './config/RendererConfig'
import {
  RendererMetricsStore,
  type FrameMetrics,
} from './metrics/RendererMetrics'
import { createDemoLights } from './lights/LightFactory'
import type { RenderLight } from './lights/LightTypes'
import { PostProcessingGraph } from './post/PostProcessingGraph'

export type RenderBackend = 'webgpu' | 'webgl2'

type GpuContext = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export class RenderEngine {
  private readonly canvas: HTMLCanvasElement
  private config: RendererConfig
  private backend: RenderBackend | null = null
  private gpu: GpuContext | null = null
  private gl: WebGL2RenderingContext | null = null
  private running = false
  private animationFrameId = 0
  private startTime = 0
  private frameIndex = 0
  private resizeObserver: ResizeObserver | null = null
  private readonly metrics = new RendererMetricsStore()
  private lights: RenderLight[] = []
  private postGraph: PostProcessingGraph | null = null
  private lastTimestamp = 0

  constructor(canvas: HTMLCanvasElement, config?: RendererConfig) {
    this.canvas = canvas
    this.config = config ?? createRendererConfig('high')
    this.lights = createDemoLights(this.config)
  }

  updateConfig(config: RendererConfig): void {
    this.config = config
    this.lights = createDemoLights(this.config)
  }

  getConfig(): RendererConfig {
    return this.config
  }

  getLatestFrameMetrics(): FrameMetrics | null {
    return this.metrics.latest()
  }

  async start(): Promise<RenderBackend> {
    if (this.running && this.backend) {
      return this.backend
    }

    const initialized = await this.initializeBackend()
    if (!initialized || !this.backend) {
      throw new Error('No supported rendering backend found (WebGPU or WebGL2).')
    }

    this.running = true
    this.startTime = performance.now()
    this.lastTimestamp = this.startTime
    this.frameIndex = 0
    this.observeResize()
    this.resize()

    this.postGraph = new PostProcessingGraph(
      this.backend === 'webgpu' && this.gpu ? this.gpu.device : null,
    )

    this.animationFrameId = requestAnimationFrame(this.loop)

    return this.backend
  }

  dispose(): void {
    this.running = false

    if (this.animationFrameId !== 0) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = 0
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    window.removeEventListener('resize', this.handleWindowResize)

    this.gpu = null
    this.gl = null
    this.postGraph = null
    this.backend = null
  }

  private async initializeBackend(): Promise<boolean> {
    if (await this.initializeWebGpu()) {
      return true
    }

    return this.initializeWebGl2()
  }

  private async initializeWebGpu(): Promise<boolean> {
    const gpuApi = navigator.gpu
    if (!gpuApi) {
      return false
    }

    const adapter = await gpuApi.requestAdapter()
    if (!adapter) {
      return false
    }

    const device = await adapter.requestDevice()
    const context = this.canvas.getContext('webgpu')
    if (!context) {
      return false
    }

    const format = gpuApi.getPreferredCanvasFormat()
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    })

    this.gpu = { device, context, format }
    this.backend = 'webgpu'

    return true
  }

  private initializeWebGl2(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    })

    if (!gl) {
      return false
    }

    gl.disable(gl.DEPTH_TEST)

    this.gl = gl
    this.backend = 'webgl2'

    return true
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })

    this.resizeObserver.observe(this.canvas)
    window.addEventListener('resize', this.handleWindowResize)
  }

  private readonly handleWindowResize = (): void => {
    this.resize()
  }

  private resize(): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio))

    if (this.canvas.width === width && this.canvas.height === height) {
      return
    }

    this.canvas.width = width
    this.canvas.height = height

    if (this.gl) {
      this.gl.viewport(0, 0, width, height)
    }
  }

  private readonly loop = (timestamp: number): void => {
    if (!this.running) {
      return
    }

    const frameStart = performance.now()
    const deltaTimeMs = Math.max(0, timestamp - this.lastTimestamp)
    this.lastTimestamp = timestamp

    const elapsedSeconds = (timestamp - this.startTime) / 1000
    const passTimings = this.drawFrame(elapsedSeconds, deltaTimeMs)
    const frameTimeMs = performance.now() - frameStart

    this.metrics.addFrame({
      frameIndex: this.frameIndex,
      frameTimeMs,
      passTimings,
    })

    this.frameIndex += 1
    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  private drawFrame(timeSeconds: number, deltaTimeMs: number): FrameMetrics['passTimings'] {
    if (!this.postGraph) {
      return []
    }

    const pipeline = this.postGraph.execute(
      this.config,
      this.frameIndex,
      deltaTimeMs,
      {
        lights: this.lights,
        timeSeconds,
        viewportWidth: this.canvas.width,
        viewportHeight: this.canvas.height,
      },
    )

    const clearStart = performance.now()
    if (this.backend === 'webgpu' && this.gpu) {
      const commandEncoder = this.gpu.device.createCommandEncoder()
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.gpu.context.getCurrentTexture().createView(),
            clearValue: {
              r: pipeline.finalColor[0],
              g: pipeline.finalColor[1],
              b: pipeline.finalColor[2],
              a: 1,
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.end()
      this.gpu.device.queue.submit([commandEncoder.finish()])
      const timings = [...pipeline.timings]
      timings.push({
        passName: 'final-clear',
        cpuTimeMs: performance.now() - clearStart,
      })
      return timings
    }

    if (this.backend === 'webgl2' && this.gl) {
      this.gl.clearColor(
        pipeline.finalColor[0],
        pipeline.finalColor[1],
        pipeline.finalColor[2],
        1,
      )
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
      const timings = [...pipeline.timings]
      timings.push({
        passName: 'final-clear',
        cpuTimeMs: performance.now() - clearStart,
      })
      return timings
    }

    return pipeline.timings
  }
}
