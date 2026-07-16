import type { RendererEngineOptions, RendererFrameHookContext } from '@dotdotdash/stunner-core/renderer/RendererEngine';
import type { RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import { createGSplatWebGpuStage } from '@dotdotdash/stunner-gsplat';
import type { Camera } from '@dotdotdash/stunner-core/camera/Camera';

export type GsplatExampleOptions = {
  rotationSpeedRadPerSec?: number;
};

export type GsplatExampleController = {
  engineOptions: RendererEngineOptions;
  setRotationSpeed: (speed: number) => void;
  dispose: () => void;
};

// The published demo uses the compact SOG asset. `@dotdotdash/stunner-gsplat`
// also supports loading a raw PLY file, or a ZIP archive containing one
// (via its own ZipReader) -- `createGSplatWebGpuStage` dispatches on the
// URL's file extension (`.sog` / `.ply` / `.zip`). This was used to
// validate the renderer's per-splat math against an uncompressed reference
// asset (see `/models/sog/shell-1.ply` and `shell-1.zip`, the same model).
const GSPLAT_ASSET_URL = '/models/sog/shell-1.sog';

// The shell-1.sog capture's own orientation doesn't match how we want to
// frame it in this example (it loads upside down relative to our camera
// setup), so we rotate the whole splat cloud 180 degrees about the X axis
// here. This is asset-specific framing, not a SOG-format or renderer
// concern, which is why it's applied at the call site rather than inside
// @dotdotdash/stunner-gsplat.
const GSPLAT_MODEL_ROTATION: readonly [number, number, number, number] = [1, 0, 0, 0];

type Quat = readonly [number, number, number, number];

const quatFromYAxisAngle = (radians: number): Quat => {
  const half = radians * 0.5;
  return [0, Math.sin(half), 0, Math.cos(half)];
};

// Hamilton product a*b, both (x, y, z, w). Applying `a` after `b` (i.e. the
// combined rotation rotates by `b` first, then `a`).
const quatMultiply = (a: Quat, b: Quat): Quat => {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
};

export const startGsplatExample = (
  onSceneReady: (scene: RenderScene) => void,
  camera: Camera,
  options?: GsplatExampleOptions,
): GsplatExampleController => {
  const scene: RenderScene = { meshes: [], lights: [] };
  onSceneReady(scene);

  const stage = createGSplatWebGpuStage(GSPLAT_ASSET_URL, {
    camera,
    name: 'gsplat-stage',
    modelRotation: GSPLAT_MODEL_ROTATION,
  });

  let rotationSpeedRadPerSec = Number.isFinite(options?.rotationSpeedRadPerSec)
    ? (options!.rotationSpeedRadPerSec as number)
    : 0;
  let yawRadians = 0;

  const beforeFrame = (context: RendererFrameHookContext): void => {
    const deltaSeconds = Math.max(0, context.deltaTimeMs) / 1000;
    yawRadians += rotationSpeedRadPerSec * deltaSeconds;
    // Apply the slow yaw spin *after* the static upright correction, so the
    // model keeps spinning about its own (now-vertical) up axis rather than
    // the pre-correction capture axis.
    stage.setModelRotation(quatMultiply(quatFromYAxisAngle(yawRadians), GSPLAT_MODEL_ROTATION));
  };

  return {
    engineOptions: {
      webGpuStages: [stage],
      frameHooks: {
        beforeFrame,
      },
    },
    setRotationSpeed: (speed) => {
      if (!Number.isFinite(speed)) {
        return;
      }
      rotationSpeedRadPerSec = speed;
    },
    dispose: () => {
      stage.dispose();
    },
  };
};
