import type { RendererConfig } from '../config/RendererConfig';
import { RenderGraph } from '../graph/RenderGraph';
import type { RenderPassTimingResult } from '../graph/RenderGraphTypes';
import type { RenderLight, Vec3 } from '../lights/LightTypes';
import {
  evaluateClusteredLighting,
  type ClusteredLightingResult,
} from '../shading/ClusteredLightingEvaluator';
import { evaluateAmbientOcclusion, type AmbientOcclusionResult } from './AmbientOcclusion';
import { evaluateBloom, type BloomResult } from './Bloom';
import { evaluateDepthOfField, type DepthOfFieldResult } from './DepthOfField';
import { applyColorGrading } from './ColorGrading';
export type PostProcessFrameInput = {
  lights: RenderLight[];
  timeSeconds: number;
  viewportWidth: number;
  viewportHeight: number;
};
export type PostProcessFrameResult = {
  finalColor: Vec3;
  timings: RenderPassTimingResult[];
  lighting: ClusteredLightingResult;
  ao: AmbientOcclusionResult | null;
  bloom: BloomResult | null;
  dof: DepthOfFieldResult | null;
};
type PostProcessState = {
  input: PostProcessFrameInput | null;
};
const clamp01 = (value: number): number => {
  return Math.min(1, Math.max(0, value));
};
export class PostProcessingGraph {
  private readonly graph: RenderGraph;
  private readonly state: PostProcessState = {
    input: null,
  };
  constructor(device: GPUDevice | null) {
    this.graph = new RenderGraph(device);
    this.registerPasses();
  }
  execute(
    config: RendererConfig,
    frameIndex: number,
    deltaTimeMs: number,
    input: PostProcessFrameInput,
  ): PostProcessFrameResult {
    this.state.input = input;
    const timings = this.graph.executeSync(config, {
      frameIndex,
      deltaTimeMs,
    });
    const resources = this.graph.getLastResources();
    if (!resources) {
      throw new Error('Render graph did not expose a frame resource store.');
    }
    const lighting = resources.get<ClusteredLightingResult>('lighting-result');
    const finalColor = resources.get<Vec3>('final-color');
    if (!lighting || !finalColor) {
      throw new Error('Post-processing graph did not produce clustered lighting output.');
    }
    return {
      finalColor,
      timings,
      lighting,
      ao: resources.get<AmbientOcclusionResult>('ao-result') ?? null,
      bloom: resources.get<BloomResult>('bloom-result') ?? null,
      dof: resources.get<DepthOfFieldResult>('dof-result') ?? null,
    };
  }
  private registerPasses(): void {
    this.graph.addPass({
      name: 'scene-prepass',
      writes: [
        { name: 'scene-depth', usage: 'write' },
        { name: 'scene-normal-alignment', usage: 'write' },
        { name: 'scene-local-contrast', usage: 'write' },
        { name: 'scene-highlight', usage: 'write' },
      ],
      execute: (context) => {
        if (!this.state.input) {
          return;
        }
        const sceneDepth = 6 + (Math.sin(this.state.input.timeSeconds * 0.3) * 0.5 + 0.5) * 14;
        const normalAlignment =
          0.55 + (Math.cos(this.state.input.timeSeconds * 0.25) * 0.5 + 0.5) * 0.4;
        const localContrast =
          0.45 + (Math.sin(this.state.input.timeSeconds * 0.5) * 0.5 + 0.5) * 0.5;
        const highlight = 0.4 + (Math.sin(this.state.input.timeSeconds * 0.7) * 0.5 + 0.5) * 0.6;
        context.resources.set('scene-depth', sceneDepth);
        context.resources.set('scene-normal-alignment', normalAlignment);
        context.resources.set('scene-local-contrast', localContrast);
        context.resources.set('scene-highlight', highlight);
      },
    });
    this.graph.addPass({
      name: 'clustered-lighting',
      reads: [{ name: 'scene-depth', usage: 'read' }],
      writes: [
        { name: 'lighting-result', usage: 'write' },
        { name: 'hdr-color', usage: 'write' },
      ],
      execute: (context) => {
        if (!this.state.input) {
          return;
        }
        const lighting = evaluateClusteredLighting(
          this.state.input.lights,
          context.config,
          this.state.input.viewportWidth,
          this.state.input.viewportHeight,
          this.state.input.timeSeconds,
        );
        context.resources.set('lighting-result', lighting);
        context.resources.set('hdr-color', lighting.color);
      },
    });
    this.graph.addPass({
      name: 'ambient-occlusion',
      enabled: (config) => config.ambientOcclusion.enabled,
      reads: [
        { name: 'scene-depth', usage: 'read' },
        { name: 'scene-normal-alignment', usage: 'read' },
        { name: 'scene-local-contrast', usage: 'read' },
        { name: 'hdr-color', usage: 'read' },
      ],
      writes: [
        { name: 'ao-result', usage: 'write' },
        { name: 'hdr-color', usage: 'write' },
      ],
      execute: (context) => {
        const depth = context.resources.get<number>('scene-depth');
        const normalAlignment = context.resources.get<number>('scene-normal-alignment');
        const localContrast = context.resources.get<number>('scene-local-contrast');
        const hdrColor = context.resources.get<Vec3>('hdr-color');
        if (
          depth === undefined ||
          normalAlignment === undefined ||
          localContrast === undefined ||
          !hdrColor
        ) {
          return;
        }
        const ao = evaluateAmbientOcclusion(context.config.ambientOcclusion, {
          depth,
          normalAlignment,
          localContrast,
        });
        context.resources.set('ao-result', ao);
        context.resources.set('hdr-color', [
          hdrColor[0] * ao.occlusion,
          hdrColor[1] * ao.occlusion,
          hdrColor[2] * ao.occlusion,
        ] satisfies Vec3);
      },
    });
    this.graph.addPass({
      name: 'ambient-occlusion-bypass',
      enabled: (config) => !config.ambientOcclusion.enabled,
      reads: [{ name: 'hdr-color', usage: 'read' }],
      execute: (context) => {
        if (!context.resources.has('ao-result')) {
          context.resources.set('ao-result', null);
        }
      },
    });
    this.graph.addPass({
      name: 'bloom',
      enabled: (config) => config.bloom.enabled,
      reads: [{ name: 'hdr-color', usage: 'read' }],
      writes: [
        { name: 'bloom-result', usage: 'write' },
        { name: 'hdr-color', usage: 'write' },
      ],
      execute: (context) => {
        if (!this.state.input) {
          return;
        }
        const hdrColor = context.resources.get<Vec3>('hdr-color');
        if (!hdrColor) {
          return;
        }
        const bloom = evaluateBloom(context.config.bloom, {
          color: hdrColor,
          viewportWidth: this.state.input.viewportWidth,
          viewportHeight: this.state.input.viewportHeight,
        });
        context.resources.set('bloom-result', bloom);
        const boost = bloom.extractWeight * bloom.intensity * 0.25;
        context.resources.set('hdr-color', [
          clamp01(hdrColor[0] + boost),
          clamp01(hdrColor[1] + boost * 0.9),
          clamp01(hdrColor[2] + boost * 0.8),
        ] satisfies Vec3);
      },
    });
    this.graph.addPass({
      name: 'depth-of-field',
      enabled: (config) => config.depthOfField.enabled,
      reads: [
        { name: 'scene-depth', usage: 'read' },
        { name: 'scene-highlight', usage: 'read' },
        { name: 'hdr-color', usage: 'read' },
      ],
      writes: [
        { name: 'dof-result', usage: 'write' },
        { name: 'hdr-color', usage: 'write' },
      ],
      execute: (context) => {
        const depth = context.resources.get<number>('scene-depth');
        const highlight = context.resources.get<number>('scene-highlight');
        const hdrColor = context.resources.get<Vec3>('hdr-color');
        if (depth === undefined || highlight === undefined || !hdrColor) {
          return;
        }
        const dof = evaluateDepthOfField(context.config.depthOfField, {
          depth,
          highlight,
        });
        context.resources.set('dof-result', dof);
        const blend = clamp01(
          dof.bokehWeight * 0.3 +
            (dof.coc / Math.max(0.001, context.config.depthOfField.maxCoC)) * 0.2,
        );
        const target: Vec3 = [hdrColor[0] * 0.92, hdrColor[1] * 0.94, hdrColor[2]];
        context.resources.set('hdr-color', [
          hdrColor[0] * (1 - blend) + target[0] * blend,
          hdrColor[1] * (1 - blend) + target[1] * blend,
          hdrColor[2] * (1 - blend) + target[2] * blend,
        ] satisfies Vec3);
      },
    });
    this.graph.addPass({
      name: 'color-grading',
      enabled: (config) => config.colorGrading.enabled,
      reads: [{ name: 'hdr-color', usage: 'read' }],
      writes: [{ name: 'final-color', usage: 'write' }],
      execute: (context) => {
        const hdrColor = context.resources.get<Vec3>('hdr-color');
        if (!hdrColor) {
          return;
        }
        context.resources.set(
          'final-color',
          applyColorGrading(hdrColor, context.config.colorGrading),
        );
      },
    });
    this.graph.addPass({
      name: 'color-grading-bypass',
      enabled: (config) => !config.colorGrading.enabled,
      reads: [{ name: 'hdr-color', usage: 'read' }],
      writes: [{ name: 'final-color', usage: 'write' }],
      execute: (context) => {
        const hdrColor = context.resources.get<Vec3>('hdr-color');
        if (!hdrColor) {
          return;
        }
        context.resources.set('final-color', hdrColor);
      },
    });
  }
}
