import { createRendererConfig, type RendererConfig } from './config/RendererConfig';
import { Camera } from '../camera/Camera';
import { RendererMetricsStore, type FrameMetrics } from './metrics/RendererMetrics';
import { createDemoLights } from './lights/LightFactory';
import type { RenderLight } from './lights/LightTypes';
import { PostProcessingGraph } from './post/PostProcessingGraph';
import { WebGpuPostGraph } from './post/WebGpuPostGraph';
import type { RenderScene } from './mesh/SceneTypes';
export type RenderBackend = 'webgpu' | 'webgl2';
type GpuContext = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
};

type RendererEngineOptions = {
  webGpuOnly?: boolean;
};

export class RendererEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private config: RendererConfig;
  private backend: RenderBackend | null = null;
  private gpu: GpuContext | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private running = false;
  private animationFrameId = 0;
  private startTime = 0;
  private frameIndex = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly metrics = new RendererMetricsStore();
  private lights: RenderLight[] = [];
  private scene: RenderScene | null = null;
  private cpuPostGraph: PostProcessingGraph | null = null;
  private webGpuPostGraph: WebGpuPostGraph | null = null;
  private lastTimestamp = 0;
  private readonly options: RendererEngineOptions;
  constructor(
    canvas: HTMLCanvasElement,
    config?: RendererConfig,
    camera?: Camera,
    options?: RendererEngineOptions,
  ) {
    this.canvas = canvas;
    this.camera = camera ?? new Camera({ location: [0, 1.2, 1.5] });
    this.config = config ?? createRendererConfig('high');
    this.lights = createDemoLights(this.config);
    this.options = options ?? {};
  }
  updateConfig(config: RendererConfig): void {
    this.config = config;
    this.lights = createDemoLights(this.config);
  }
  setScene(scene: RenderScene): void {
    this.scene = scene;
    if (this.webGpuPostGraph) {
      this.webGpuPostGraph.setScene(scene);
    }
  }
  getConfig(): RendererConfig {
    return this.config;
  }
  getLatestFrameMetrics(): FrameMetrics | null {
    return this.metrics.latest();
  }
  async start(): Promise<RenderBackend> {
    if (this.running && this.backend) {
      return this.backend;
    }
    const initialized = await this.initializeBackend();
    if (!initialized || !this.backend) {
      throw new Error('No supported rendering backend found (WebGPU or WebGL2).');
    }
    this.running = true;
    this.startTime = performance.now();
    this.lastTimestamp = this.startTime;
    this.frameIndex = 0;
    this.observeResize();
    this.resize();
    if (this.backend === 'webgpu' && this.gpu) {
      this.webGpuPostGraph = new WebGpuPostGraph(
        this.gpu.device,
        this.gpu.context,
        this.gpu.format,
        this.camera,
      );
      this.webGpuPostGraph.resize(this.canvas.width, this.canvas.height);
      if (this.scene) {
        this.webGpuPostGraph.setScene(this.scene);
      }
      this.cpuPostGraph = null;
    } else {
      this.cpuPostGraph = new PostProcessingGraph(null);
      this.webGpuPostGraph = null;
    }
    this.animationFrameId = requestAnimationFrame(this.loop);
    return this.backend;
  }
  dispose(): void {
    this.running = false;
    if (this.animationFrameId !== 0) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleWindowResize);
    this.gpu = null;
    this.gl = null;
    this.cpuPostGraph = null;
    this.webGpuPostGraph = null;
    this.backend = null;
  }
  private async initializeBackend(): Promise<boolean> {
    if (this.options.webGpuOnly) {
      return this.initializeWebGpu();
    }
    if (await this.initializeWebGpu()) {
      return true;
    }
    return this.initializeWebGl2();
  }
  private async initializeWebGpu(): Promise<boolean> {
    const gpuApi = navigator.gpu;
    if (!gpuApi) {
      return false;
    }
    const adapter = await gpuApi.requestAdapter();
    if (!adapter) {
      return false;
    }
    const device = await adapter.requestDevice();
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      return false;
    }
    const format = gpuApi.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    });
    this.gpu = { device, context, format };
    this.backend = 'webgpu';
    return true;
  }
  private initializeWebGl2(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      return false;
    }
    gl.disable(gl.DEPTH_TEST);
    this.gl = gl;
    this.backend = 'webgl2';
    return true;
  }
  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.canvas);
    window.addEventListener('resize', this.handleWindowResize);
  }
  private readonly handleWindowResize = (): void => {
    this.resize();
  };
  private resize(): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    this.camera.setAspectRatio(width / height);
    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
    if (this.webGpuPostGraph) {
      this.webGpuPostGraph.resize(width, height);
    }
  }
  private readonly loop = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const frameStart = performance.now();
    const deltaTimeMs = Math.max(0, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    const elapsedSeconds = (timestamp - this.startTime) / 1000;
    const passTimings = this.drawFrame(elapsedSeconds, deltaTimeMs);
    const frameTimeMs = performance.now() - frameStart;
    this.metrics.addFrame({
      frameIndex: this.frameIndex,
      frameIntervalMs: deltaTimeMs,
      frameTimeMs,
      passTimings,
    });
    this.frameIndex += 1;
    this.animationFrameId = requestAnimationFrame(this.loop);
  };
  private drawFrame(timeSeconds: number, deltaTimeMs: number): FrameMetrics['passTimings'] {
    if (this.backend === 'webgpu' && this.webGpuPostGraph) {
      return this.webGpuPostGraph.render(this.config, timeSeconds);
    }
    if (this.backend === 'webgl2' && this.gl && this.cpuPostGraph) {
      const pipeline = this.cpuPostGraph.execute(this.config, this.frameIndex, deltaTimeMs, {
        lights: this.lights,
        timeSeconds,
        viewportWidth: this.canvas.width,
        viewportHeight: this.canvas.height,
        cameraLocation: this.camera.getLocation(),
        cameraForward: this.camera.forwardDir(),
        shadowOcclusionHint: this.estimateSceneShadowOcclusionHint(),
      });
      const clearStart = performance.now();
      this.gl.clearColor(pipeline.finalColor[0], pipeline.finalColor[1], pipeline.finalColor[2], 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      const timings = [...pipeline.timings];
      timings.push({
        passName: 'final-clear',
        cpuTimeMs: performance.now() - clearStart,
      });
      return timings;
    }
    return [];
  }

  private estimateSceneShadowOcclusionHint(): number {
    if (!this.scene || this.scene.meshes.length === 0 || !this.config.shadows.enabled) {
      return 0;
    }

    let receiverY = Number.POSITIVE_INFINITY;
    let receiverFound = false;
    const casters: Array<{ x: number; y: number; z: number; radius: number }> = [];

    for (const mesh of this.scene.meshes) {
      const transform = mesh.transform;
      if (!transform) {
        continue;
      }

      const x = transform[12];
      const y = transform[13];
      const z = transform[14];
      const scaleX = Math.hypot(transform[0], transform[1], transform[2]);
      const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
      const scaleZ = Math.hypot(transform[8], transform[9], transform[10]);
      const radius = Math.max(0.01, Math.max(scaleX, scaleY, scaleZ));

      const isFlatSurface = scaleY < Math.max(0.08, scaleX * 0.2) && scaleY < Math.max(0.08, scaleZ * 0.2);
      if (isFlatSurface && y < receiverY) {
        receiverY = y;
        receiverFound = true;
      }

      if (!mesh.material.transparent) {
        casters.push({ x, y, z, radius });
      }
    }

    if (!receiverFound || casters.length === 0) {
      return 0;
    }

    let occlusion = 0;
    for (const caster of casters) {
      const height = caster.y - receiverY;
      if (height <= 0.06) {
        continue;
      }

      const cameraDx = this.camera.getLocation()[0] - caster.x;
      const cameraDz = this.camera.getLocation()[2] - caster.z;
      const cameraDistance = Math.hypot(cameraDx, cameraDz);
      const distanceFactor = 1 / (1 + cameraDistance * 0.08);
      const heightFactor = Math.max(0, 1 - height * 0.22);
      const sizeFactor = Math.min(1, caster.radius * 0.65);
      occlusion += heightFactor * sizeFactor * distanceFactor;
    }

    return Math.max(0, Math.min(1, occlusion * 0.6));
  }
}
