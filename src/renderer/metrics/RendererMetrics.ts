export type RenderPassTiming = {
  passName: string
  cpuTimeMs: number
}

export type FrameMetrics = {
  frameIndex: number
  frameTimeMs: number
  passTimings: RenderPassTiming[]
}

const DEFAULT_HISTORY_SIZE = 180

export class RendererMetricsStore {
  private readonly maxHistory: number
  private readonly history: FrameMetrics[] = []

  constructor(maxHistory = DEFAULT_HISTORY_SIZE) {
    this.maxHistory = maxHistory
  }

  addFrame(metrics: FrameMetrics): void {
    this.history.push(metrics)

    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }
  }

  latest(): FrameMetrics | null {
    if (this.history.length === 0) {
      return null
    }

    return this.history[this.history.length - 1]
  }

  averageFrameTime(lastN = 60): number {
    if (this.history.length === 0) {
      return 0
    }

    const sampleSize = Math.min(lastN, this.history.length)
    const start = this.history.length - sampleSize
    let sum = 0

    for (let index = start; index < this.history.length; index += 1) {
      sum += this.history[index].frameTimeMs
    }

    return sum / sampleSize
  }

  snapshot(): FrameMetrics[] {
    return [...this.history]
  }
}
