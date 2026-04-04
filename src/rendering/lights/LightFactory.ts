import type { RendererConfig } from '../config/RendererConfig'
import type { RenderLight } from './LightTypes'

function clampCount(requested: number, budget: number): number {
  return Math.max(0, Math.min(requested, budget))
}

export function createDemoLights(config: RendererConfig): RenderLight[] {
  const lights: RenderLight[] = []
  let id = 1

  const directionalCount = clampCount(1, config.lights.maxDirectionalLights)
  for (let index = 0; index < directionalCount; index += 1) {
    lights.push({
      id: id++,
      type: 'directional',
      color: [1, 0.96, 0.9],
      intensity: 1.35,
      direction: [0.25, -1, -0.2],
      castsShadows: true,
      shadowIndex: index,
    })
  }

  const pointCount = clampCount(6, config.lights.maxPointLights)
  for (let index = 0; index < pointCount; index += 1) {
    const angle = (Math.PI * 2 * index) / Math.max(1, pointCount)
    lights.push({
      id: id++,
      type: 'point',
      color: [0.4 + 0.6 * Math.abs(Math.cos(angle)), 0.5, 1],
      intensity: 35,
      position: [Math.cos(angle) * 8, 2.5, -12 + Math.sin(angle) * 6],
      range: 14,
      castsShadows: index % 2 === 0,
      shadowIndex: index,
    })
  }

  const spotCount = clampCount(2, config.lights.maxSpotLights)
  for (let index = 0; index < spotCount; index += 1) {
    lights.push({
      id: id++,
      type: 'spot',
      color: [1, 0.92, 0.7],
      intensity: 24,
      position: [-6 + index * 12, 7, -14],
      direction: [0.1 * (index === 0 ? 1 : -1), -1, 0],
      range: 24,
      innerConeCos: 0.92,
      outerConeCos: 0.8,
      castsShadows: true,
      shadowIndex: index,
    })
  }

  const areaCount = clampCount(2, config.lights.maxAreaLights)
  for (let index = 0; index < areaCount; index += 1) {
    lights.push({
      id: id++,
      type: 'area',
      color: [0.7, 0.9, 1],
      intensity: 9,
      position: [-4 + index * 8, 3.2, -10],
      direction: [0, -0.6, -0.8],
      right: [1, 0, 0],
      up: [0, 1, 0],
      size: [2.2, 1.6],
      shape: 'rect',
      range: 18,
      castsShadows: false,
      shadowIndex: -1,
    })
  }

  return lights
}
