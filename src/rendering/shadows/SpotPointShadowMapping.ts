import type { RenderLight } from '../lights/LightTypes'

export type ShadowProjectionType = 'directional' | 'spot' | 'point-face'

export type ShadowRequest = {
  lightId: number
  projection: ShadowProjectionType
  faceIndex: number
  resolution: number
}

export type ShadowAtlasSlot = {
  x: number
  y: number
  size: number
  request: ShadowRequest
}

export type ShadowAtlasPlan = {
  atlasSize: number
  slots: ShadowAtlasSlot[]
  overflowRequests: ShadowRequest[]
}

export type SpotPointShadowBuildOptions = {
  atlasSize: number
  spotResolution: number
  pointResolution: number
}

function nextPowerOfTwo(value: number): number {
  let result = 1
  while (result < value) {
    result <<= 1
  }
  return result
}

function createRequests(
  lights: RenderLight[],
  options: SpotPointShadowBuildOptions,
): ShadowRequest[] {
  const requests: ShadowRequest[] = []

  for (const light of lights) {
    if (!light.castsShadows) {
      continue
    }

    if (light.type === 'spot') {
      requests.push({
        lightId: light.id,
        projection: 'spot',
        faceIndex: 0,
        resolution: options.spotResolution,
      })
      continue
    }

    if (light.type === 'point') {
      for (let faceIndex = 0; faceIndex < 6; faceIndex += 1) {
        requests.push({
          lightId: light.id,
          projection: 'point-face',
          faceIndex,
          resolution: options.pointResolution,
        })
      }
    }
  }

  requests.sort((a, b) => b.resolution - a.resolution)
  return requests
}

export function buildSpotPointShadowAtlasPlan(
  lights: RenderLight[],
  options: SpotPointShadowBuildOptions,
): ShadowAtlasPlan {
  const atlasSize = nextPowerOfTwo(options.atlasSize)
  const requests = createRequests(lights, options)

  const slots: ShadowAtlasSlot[] = []
  const overflowRequests: ShadowRequest[] = []

  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const request of requests) {
    const size = request.resolution

    if (size > atlasSize) {
      overflowRequests.push(request)
      continue
    }

    if (cursorX + size > atlasSize) {
      cursorX = 0
      cursorY += rowHeight
      rowHeight = 0
    }

    if (cursorY + size > atlasSize) {
      overflowRequests.push(request)
      continue
    }

    slots.push({
      x: cursorX,
      y: cursorY,
      size,
      request,
    })

    cursorX += size
    rowHeight = Math.max(rowHeight, size)
  }

  return {
    atlasSize,
    slots,
    overflowRequests,
  }
}
