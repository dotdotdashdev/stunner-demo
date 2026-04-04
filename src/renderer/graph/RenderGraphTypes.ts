import type { RendererConfig } from '../config/RendererConfig'
import type { FrameResourceStore } from './FrameResourceStore'

export type RenderResourceKind =
  | 'texture2d'
  | 'depth-texture'
  | 'buffer'
  | 'sampler'

export type RenderResourceUsage =
  | 'read'
  | 'write'
  | 'read-write'
  | 'sample'
  | 'attachment'

export type RenderResourceDescriptor = {
  name: string
  kind: RenderResourceKind
  format?: string
  width?: number
  height?: number
  mipLevels?: number
  sampleCount?: number
}

export type RenderResourceRef = {
  name: string
  usage: RenderResourceUsage
}

export type RenderPassExecutionContext = {
  device: GPUDevice | null
  config: RendererConfig
  frameIndex: number
  deltaTimeMs: number
  resources: FrameResourceStore
}

export type RenderPass = {
  name: string
  enabled?: (config: RendererConfig) => boolean
  creates?: RenderResourceDescriptor[]
  reads?: RenderResourceRef[]
  writes?: RenderResourceRef[]
  execute: (context: RenderPassExecutionContext) => void | Promise<void>
}

export type RenderGraphFrameContext = {
  frameIndex: number
  deltaTimeMs: number
}

export type RenderPassTimingResult = {
  passName: string
  cpuTimeMs: number
}
