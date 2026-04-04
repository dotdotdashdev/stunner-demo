import type { RendererConfig } from '../config/RendererConfig'
import type {
  RenderGraphFrameContext,
  RenderPass,
  RenderPassExecutionContext,
  RenderPassTimingResult,
  RenderResourceDescriptor,
} from './RenderGraphTypes'

export class RenderGraph {
  private readonly device: GPUDevice | null
  private readonly passes = new Map<string, RenderPass>()

  constructor(device: GPUDevice | null) {
    this.device = device
  }

  addPass(pass: RenderPass): void {
    if (this.passes.has(pass.name)) {
      throw new Error(`Render pass '${pass.name}' is already registered.`)
    }

    this.passes.set(pass.name, pass)
  }

  removePass(passName: string): void {
    this.passes.delete(passName)
  }

  clear(): void {
    this.passes.clear()
  }

  listPasses(): string[] {
    return Array.from(this.passes.keys())
  }

  listResources(): RenderResourceDescriptor[] {
    const resources: RenderResourceDescriptor[] = []

    for (const pass of this.passes.values()) {
      if (pass.creates) {
        resources.push(...pass.creates)
      }
    }

    return resources
  }

  async execute(
    config: RendererConfig,
    frame: RenderGraphFrameContext,
  ): Promise<RenderPassTimingResult[]> {
    const timings: RenderPassTimingResult[] = []

    for (const pass of this.passes.values()) {
      if (pass.enabled && !pass.enabled(config)) {
        continue
      }

      const context: RenderPassExecutionContext = {
        device: this.device,
        config,
        frameIndex: frame.frameIndex,
        deltaTimeMs: frame.deltaTimeMs,
      }

      const startTime = performance.now()
      await pass.execute(context)
      timings.push({
        passName: pass.name,
        cpuTimeMs: performance.now() - startTime,
      })
    }

    return timings
  }
}
