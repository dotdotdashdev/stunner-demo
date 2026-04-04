import type { RenderLight } from '../lights/LightTypes'
import {
  depthToSlice,
  getClusterIndex,
  type ClusterGridInfo,
  type ZSlicePolicy,
} from './ClusterGrid'

export type ClusterAssignmentInput = {
  grid: ClusterGridInfo
  nearPlane: number
  farPlane: number
  zPolicy: ZSlicePolicy
  lights: RenderLight[]
}

export type ClusterLightAssignment = {
  counts: Uint32Array
  offsets: Uint32Array
  lightIndices: Uint32Array
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toDepthRange(
  light: RenderLight,
  nearPlane: number,
  farPlane: number,
): [number, number] | null {
  if (light.type === 'directional') {
    return [nearPlane, farPlane]
  }

  const viewDepth = -light.position[2]
  if (viewDepth <= 0) {
    return null
  }

  const range = Math.max(0.0001, light.range)
  const minDepth = clamp(viewDepth - range, nearPlane, farPlane)
  const maxDepth = clamp(viewDepth + range, nearPlane, farPlane)

  if (maxDepth <= nearPlane || minDepth >= farPlane) {
    return null
  }

  return [minDepth, maxDepth]
}

export function assignLightsToClusters(
  input: ClusterAssignmentInput,
): ClusterLightAssignment {
  const clusterLights: number[][] = Array.from(
    { length: input.grid.clusterCount },
    () => [],
  )

  const maxZ = input.grid.clustersZ - 1

  for (let lightIndex = 0; lightIndex < input.lights.length; lightIndex += 1) {
    const light = input.lights[lightIndex]
    const depthRange = toDepthRange(light, input.nearPlane, input.farPlane)
    if (!depthRange) {
      continue
    }

    const minSlice = clamp(
      depthToSlice(
        depthRange[0],
        input.nearPlane,
        input.farPlane,
        input.grid.clustersZ,
        input.zPolicy,
      ),
      0,
      maxZ,
    )

    const maxSlice = clamp(
      depthToSlice(
        depthRange[1],
        input.nearPlane,
        input.farPlane,
        input.grid.clustersZ,
        input.zPolicy,
      ),
      0,
      maxZ,
    )

    for (let z = minSlice; z <= maxSlice; z += 1) {
      for (let y = 0; y < input.grid.clustersY; y += 1) {
        for (let x = 0; x < input.grid.clustersX; x += 1) {
          const clusterIndex = getClusterIndex(x, y, z, input.grid)
          clusterLights[clusterIndex].push(lightIndex)
        }
      }
    }
  }

  const counts = new Uint32Array(input.grid.clusterCount)
  const offsets = new Uint32Array(input.grid.clusterCount)

  let totalLightIndices = 0
  for (let index = 0; index < clusterLights.length; index += 1) {
    offsets[index] = totalLightIndices
    counts[index] = clusterLights[index].length
    totalLightIndices += clusterLights[index].length
  }

  const lightIndices = new Uint32Array(totalLightIndices)
  let writeOffset = 0
  for (const list of clusterLights) {
    for (const lightIndex of list) {
      lightIndices[writeOffset] = lightIndex
      writeOffset += 1
    }
  }

  return {
    counts,
    offsets,
    lightIndices,
  }
}
