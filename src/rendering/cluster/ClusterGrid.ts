import type { ClusteredConfig } from '../config/RendererConfig'

export type ZSlicePolicy = 'logarithmic' | 'hybrid-log'

export type ClusterGridInfo = {
  clustersX: number
  clustersY: number
  clustersZ: number
  clusterCount: number
  tileSizeX: number
  tileSizeY: number
}

export type ClusterGridBuildParams = {
  viewportWidth: number
  viewportHeight: number
  nearPlane: number
  farPlane: number
  config: ClusteredConfig
}

export function createClusterGridInfo(
  viewportWidth: number,
  viewportHeight: number,
  config: ClusteredConfig,
): ClusterGridInfo {
  const clustersX = Math.max(1, Math.ceil(viewportWidth / config.tileSizeX))
  const clustersY = Math.max(1, Math.ceil(viewportHeight / config.tileSizeY))
  const clustersZ = Math.max(1, config.zSlices)

  return {
    clustersX,
    clustersY,
    clustersZ,
    clusterCount: clustersX * clustersY * clustersZ,
    tileSizeX: config.tileSizeX,
    tileSizeY: config.tileSizeY,
  }
}

export function getClusterIndex(
  x: number,
  y: number,
  z: number,
  grid: ClusterGridInfo,
): number {
  return x + y * grid.clustersX + z * grid.clustersX * grid.clustersY
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function depthToSlice(
  viewSpaceDepth: number,
  nearPlane: number,
  farPlane: number,
  sliceCount: number,
  policy: ZSlicePolicy,
): number {
  const depth = clamp(viewSpaceDepth, nearPlane, farPlane)
  const clampedNear = Math.max(nearPlane, 0.0001)
  const clampedFar = Math.max(farPlane, clampedNear + 0.0001)

  if (policy === 'logarithmic') {
    const logNear = Math.log(clampedNear)
    const logFar = Math.log(clampedFar)
    const normalized = (Math.log(depth) - logNear) / (logFar - logNear)
    return clamp(Math.floor(normalized * sliceCount), 0, sliceCount - 1)
  }

  const linearNormalized = (depth - clampedNear) / (clampedFar - clampedNear)
  const logNear = Math.log(clampedNear)
  const logFar = Math.log(clampedFar)
  const logNormalized = (Math.log(depth) - logNear) / (logFar - logNear)
  const hybrid = linearNormalized * 0.25 + logNormalized * 0.75

  return clamp(Math.floor(hybrid * sliceCount), 0, sliceCount - 1)
}

export function buildClusterGrid(
  params: ClusterGridBuildParams,
  policy: ZSlicePolicy = 'hybrid-log',
) {
  const grid = createClusterGridInfo(
    params.viewportWidth,
    params.viewportHeight,
    params.config,
  )

  return {
    grid,
    policy,
    nearPlane: params.nearPlane,
    farPlane: params.farPlane,
    toSlice: (viewSpaceDepth: number) =>
      depthToSlice(
        viewSpaceDepth,
        params.nearPlane,
        params.farPlane,
        grid.clustersZ,
        policy,
      ),
  }
}
