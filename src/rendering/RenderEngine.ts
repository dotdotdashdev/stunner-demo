export type RenderBackend = 'webgpu' | 'webgl2'

type GpuContext = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export class RenderEngine {
  private readonly canvas: HTMLCanvasElement
  private backend: RenderBackend | null = null
  private gpu: GpuContext | null = null
  private gl: WebGL2RenderingContext | null = null
  private running = false
  private animationFrameId = 0
  private startTime = 0
  private resizeObserver: ResizeObserver | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
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

    const elapsedSeconds = (timestamp - this.startTime) / 1000
    this.drawFrame(elapsedSeconds)
    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  private drawFrame(timeSeconds: number): void {
    if (this.backend === 'webgpu' && this.gpu) {
      const tone = 0.14 + Math.sin(timeSeconds * 0.8) * 0.03
      const commandEncoder = this.gpu.device.createCommandEncoder()
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.gpu.context.getCurrentTexture().createView(),
            clearValue: { r: tone, g: tone + 0.05, b: 0.22, a: 1 },
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
      const tone = 0.13 + Math.sin(timeSeconds * 0.8) * 0.03
      this.gl.clearColor(tone, tone + 0.05, 0.22, 1)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    }
  }
}
