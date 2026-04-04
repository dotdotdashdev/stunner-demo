import { assignLightsToClusters, type ClusterLightAssignment } from '../cluster/ClusterAssignment';
import { buildClusterGrid, getClusterIndex } from '../cluster/ClusterGrid';
import type { RendererConfig } from '../config/RendererConfig';
import type { RenderLight, Vec3 } from '../lights/LightTypes';
export type ClusteredLightingResult = {
  color: Vec3;
  assignment: ClusterLightAssignment;
  activeLightCount: number;
};
const clamp01 = (value: number): number => {
  return Math.max(0, Math.min(1, value));
};
const luminance = (color: Vec3): number => {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
};
const evaluateLightContribution = (light: RenderLight, depth: number): number => {
  if (light.type === 'directional') {
    return light.intensity * 0.2;
  }
  const lightDepth = -light.position[2];
  const distance = Math.abs(depth - lightDepth);
  const attenuation = 1 / (1 + (distance * distance) / Math.max(1, light.range * light.range));
  if (light.type === 'spot') {
    return light.intensity * attenuation * 0.18;
  }
  if (light.type === 'area') {
    return light.intensity * attenuation * 0.12;
  }
  return light.intensity * attenuation * 0.16;
};
export const evaluateClusteredLighting = (
  lights: RenderLight[],
  config: RendererConfig,
  viewportWidth: number,
  viewportHeight: number,
  timeSeconds: number,
  cameraLocation: Vec3,
  cameraForward: Vec3,
  shadowOcclusionHint = 0,
): ClusteredLightingResult => {
  const nearPlane = 0.1;
  const farPlane = 200;
  const gridBundle = buildClusterGrid(
    {
      viewportWidth,
      viewportHeight,
      nearPlane,
      farPlane,
      config: config.clustered,
    },
    'hybrid-log',
  );
  const assignment = assignLightsToClusters({
    grid: gridBundle.grid,
    nearPlane,
    farPlane,
    zPolicy: gridBundle.policy,
    lights,
  });
  const sampleX = Math.max(
    0,
    Math.min(
      gridBundle.grid.clustersX - 1,
      Math.floor(
        ((cameraForward[0] * 0.5 + 0.5) * 0.75 + (Math.sin(timeSeconds * 0.4) * 0.5 + 0.5) * 0.25) *
          (gridBundle.grid.clustersX - 1),
      ),
    ),
  );
  const sampleY = Math.max(
    0,
    Math.min(
      gridBundle.grid.clustersY - 1,
      Math.floor(
        ((-cameraForward[1] * 0.5 + 0.5) * 0.75 + (Math.cos(timeSeconds * 0.3) * 0.5 + 0.5) * 0.25) *
          (gridBundle.grid.clustersY - 1),
      ),
    ),
  );
  const sampleDepth = Math.max(1, Math.min(40, -cameraLocation[2] + 10));
  const sampleZ = gridBundle.toSlice(sampleDepth);
  const clusterIndex = getClusterIndex(sampleX, sampleY, sampleZ, gridBundle.grid);
  const offset = assignment.offsets[clusterIndex];
  const count = Math.min(assignment.counts[clusterIndex], config.clustered.maxLightsPerCluster);
  let r = 0.05;
  let g = 0.08;
  let b = 0.13;
  for (let index = 0; index < count; index += 1) {
    const lightIndex = assignment.lightIndices[offset + index];
    const light = lights[lightIndex];
    if (!light) {
      continue;
    }
    const contribution = evaluateLightContribution(light, sampleDepth);
    const energy = contribution * (0.4 + luminance(light.color) * 0.6);
    r += light.color[0] * energy * 0.06;
    g += light.color[1] * energy * 0.06;
    b += light.color[2] * energy * 0.06;
  }
  if (config.clustered.debugView === 'clusters') {
    const clusterDensity = Math.min(1, count / Math.max(1, config.clustered.maxLightsPerCluster));
    return {
      color: [0.1 + clusterDensity * 0.85, 0.1, 0.35 + (1 - clusterDensity) * 0.55],
      assignment,
      activeLightCount: count,
    };
  }
  if (config.clustered.debugView === 'lights') {
    const lightHeat = Math.min(1, count / 24);
    return {
      color: [0.15 + lightHeat * 0.8, 0.2 + (1 - lightHeat) * 0.45, 0.1],
      assignment,
      activeLightCount: count,
    };
  }
  if (config.clustered.debugView === 'shadows') {
    const shadowWeight = config.shadows.enabled ? 0.85 : 0.2;
    return {
      color: [0.08, 0.18 + shadowWeight * 0.65, 0.22 + shadowWeight * 0.65],
      assignment,
      activeLightCount: count,
    };
  }
  if (config.bloom.enabled) {
    r *= 1 + config.bloom.intensity * 0.05;
    g *= 1 + config.bloom.intensity * 0.04;
    b *= 1 + config.bloom.intensity * 0.03;
  }

  if (config.shadows.enabled) {
    const occlusion = Math.max(0, Math.min(1, shadowOcclusionHint));
    const shadowFactor = 1 - occlusion * 0.35;
    r *= shadowFactor;
    g *= shadowFactor;
    b *= shadowFactor;
  }

  r += config.colorGrading.exposure * 0.02;
  g += config.colorGrading.exposure * 0.02;
  b += config.colorGrading.exposure * 0.02;
  return {
    color: [clamp01(r), clamp01(g), clamp01(b)],
    assignment,
    activeLightCount: count,
  };
};
