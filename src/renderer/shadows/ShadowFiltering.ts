import type { ShadowFilter } from '../config/RendererConfig'
import type { RenderLight } from '../lights/LightTypes'
import type { ResolvedShadowSettings } from './ShadowConfiguration'

export type ShadowKernelTap = {
  x: number
  y: number
  weight: number
}

export type LightShadowOverride = {
  lightId: number
  filter?: ShadowFilter
  mapResolution?: number
  depthBias?: number
  normalBias?: number
  enabled?: boolean
}

export type LightShadowRuntimeSettings = {
  lightId: number
  enabled: boolean
  filter: ShadowFilter
  mapResolution: number
  depthBias: number
  normalBias: number
}

export function getShadowKernel(filter: ShadowFilter): ShadowKernelTap[] {
  if (filter === 'hard') {
    return [{ x: 0, y: 0, weight: 1 }]
  }

  if (filter === 'pcf-3x3') {
    const taps: ShadowKernelTap[] = []
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        taps.push({ x, y, weight: 1 / 9 })
      }
    }
    return taps
  }

  const taps: ShadowKernelTap[] = []
  let weightSum = 0
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const distance = Math.hypot(x, y)
      const weight = Math.max(0, 1 - distance / 3.2)
      taps.push({ x, y, weight })
      weightSum += weight
    }
  }

  if (weightSum <= 0) {
    return [{ x: 0, y: 0, weight: 1 }]
  }

  return taps.map((tap) => ({
    ...tap,
    weight: tap.weight / weightSum,
  }))
}

function baseSettingsForLight(
  light: RenderLight,
  shadow: ResolvedShadowSettings,
): {
  mapResolution: number
  filter: ShadowFilter
  depthBias: number
  normalBias: number
} {
  if (light.type === 'directional') {
    return {
      mapResolution: shadow.directional.mapResolution,
      filter: shadow.directional.filter,
      depthBias: shadow.directional.depthBias,
      normalBias: shadow.directional.normalBias,
    }
  }

  if (light.type === 'spot') {
    return {
      mapResolution: shadow.spot.mapResolution,
      filter: shadow.spot.filter,
      depthBias: shadow.spot.depthBias,
      normalBias: shadow.spot.normalBias,
    }
  }

  if (light.type === 'point') {
    return {
      mapResolution: shadow.point.mapResolution,
      filter: shadow.point.filter,
      depthBias: shadow.point.depthBias,
      normalBias: shadow.point.normalBias,
    }
  }

  return {
    mapResolution: shadow.area.mapResolution,
    filter: shadow.area.filter,
    depthBias: shadow.area.depthBias,
    normalBias: shadow.area.normalBias,
  }
}

export function resolvePerLightShadowSettings(
  lights: RenderLight[],
  shadow: ResolvedShadowSettings,
  overrides: LightShadowOverride[] = [],
): LightShadowRuntimeSettings[] {
  const overrideMap = new Map<number, LightShadowOverride>()
  for (const entry of overrides) {
    overrideMap.set(entry.lightId, entry)
  }

  const resolved: LightShadowRuntimeSettings[] = []

  for (const light of lights) {
    const base = baseSettingsForLight(light, shadow)
    const override = overrideMap.get(light.id)

    resolved.push({
      lightId: light.id,
      enabled: override?.enabled ?? light.castsShadows,
      filter: override?.filter ?? base.filter,
      mapResolution: override?.mapResolution ?? base.mapResolution,
      depthBias: override?.depthBias ?? base.depthBias,
      normalBias: override?.normalBias ?? base.normalBias,
    })
  }

  return resolved
}
