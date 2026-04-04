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
import { evaluateClusteredLighting } from './shading/ClusteredLightingEvaluator'

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
    this.frameIndex = 0
    this.observeResize()
    this.resize()
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
    const elapsedSeconds = (timestamp - this.startTime) / 1000
    this.drawFrame(elapsedSeconds)
    const frameTimeMs = performance.now() - frameStart

    this.metrics.addFrame({
      frameIndex: this.frameIndex,
      frameTimeMs,
      passTimings: [
        {
          passName: 'clear',
          cpuTimeMs: frameTimeMs,
        },
      ],
    })

    this.frameIndex += 1
    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  private drawFrame(timeSeconds: number): void {
    const lighting = evaluateClusteredLighting(
      this.lights,
      this.config,
      this.canvas.width,
      this.canvas.height,
      timeSeconds,
    )

    if (this.backend === 'webgpu' && this.gpu) {
      const commandEncoder = this.gpu.device.createCommandEncoder()
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.gpu.context.getCurrentTexture().createView(),
            clearValue: {
              r: lighting.color[0],
              g: lighting.color[1],
              b: lighting.color[2],
              a: 1,
            },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      })
      pass.end()
      this.gpu.device.queue.submit([commandEncoder.finish()])
      return
    }

    if (this.backend === 'webgl2' && this.gl) {
      this.gl.clearColor(lighting.color[0], lighting.color[1], lighting.color[2], 1)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    }
  }
}
