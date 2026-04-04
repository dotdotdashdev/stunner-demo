export type Vec3 = [number, number, number];

export type CameraOptions = {
  location?: Vec3;
  rotationEuler?: Vec3;
  fovYRadians?: number;
  aspectRatio?: number;
  near?: number;
  far?: number;
};

const EPSILON = 1e-6;

const clampMagnitude = (value: number): number => {
  if (Math.abs(value) < EPSILON) {
    return 0;
  }
  return value;
};

const normalize = (value: Vec3): Vec3 => {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < EPSILON) {
    return [0, 0, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
};

const dot = (a: Vec3, b: Vec3): number => {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

const cross = (a: Vec3, b: Vec3): Vec3 => {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
};

const subtract = (a: Vec3, b: Vec3): Vec3 => {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
};

const multiplyMat4 = (out: Float32Array, a: Float32Array, b: Float32Array): void => {
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
};

const setPerspectiveWebGpu = (
  out: Float32Array,
  fovYRadians: number,
  aspectRatio: number,
  near: number,
  far: number,
): void => {
  const f = 1 / Math.tan(fovYRadians * 0.5);

  out[0] = f / aspectRatio;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;

  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;

  out[8] = 0;
  out[9] = 0;
  out[10] = far / (near - far);
  out[11] = -1;

  out[12] = 0;
  out[13] = 0;
  out[14] = (far * near) / (near - far);
  out[15] = 0;
};

export class Camera {
  private location: Vec3;
  private rotationEuler: Vec3;
  private fovYRadians: number;
  private aspectRatio: number;
  private near: number;
  private far: number;

  private readonly viewMatrix = new Float32Array(16);
  private readonly projectionMatrix = new Float32Array(16);
  private readonly viewProjectionMatrix = new Float32Array(16);

  private viewDirty = true;
  private projectionDirty = true;
  private viewProjectionDirty = true;

  constructor(options: CameraOptions = {}) {
    this.location = options.location ?? [0, 0, 3];
    this.rotationEuler = options.rotationEuler ?? [0, 0, 0];
    this.fovYRadians = options.fovYRadians ?? Math.PI / 3;
    this.aspectRatio = options.aspectRatio ?? 1;
    this.near = options.near ?? 0.1;
    this.far = options.far ?? 1000;

    this.validateProjection();
  }

  setLocation(location: Vec3): void {
    this.location = [location[0], location[1], location[2]];
    this.markViewDirty();
  }

  setRotationEuler(rotationEuler: Vec3): void {
    this.rotationEuler = [rotationEuler[0], rotationEuler[1], rotationEuler[2]];
    this.markViewDirty();
  }

  setFovYRadians(fovYRadians: number): void {
    if (!Number.isFinite(fovYRadians) || fovYRadians <= 0 || fovYRadians >= Math.PI) {
      throw new Error('Camera fovYRadians must be finite and between 0 and PI radians.');
    }
    this.fovYRadians = fovYRadians;
    this.markProjectionDirty();
  }

  setFovYDegrees(fovYDegrees: number): void {
    this.setFovYRadians((fovYDegrees * Math.PI) / 180);
  }

  setAspectRatio(aspectRatio: number): void {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      throw new Error('Camera aspectRatio must be a finite positive number.');
    }
    this.aspectRatio = aspectRatio;
    this.markProjectionDirty();
  }

  setNearFar(near: number, far: number): void {
    this.near = near;
    this.far = far;
    this.validateProjection();
    this.markProjectionDirty();
  }

  lookAt(target: Vec3, up: Vec3 = [0, 1, 0]): void {
    const forward = normalize(subtract(target, this.location));
    if (Math.hypot(forward[0], forward[1], forward[2]) < EPSILON) {
      return;
    }

    const yaw = Math.atan2(forward[0], -forward[2]);
    const pitch = Math.asin(Math.max(-1, Math.min(1, forward[1])));

    // Preserve roll by default to avoid surprise camera banking resets.
    const roll = this.rotationEuler[2];

    // Stabilize pitch near poles using the provided up vector when possible.
    const right = normalize(cross(forward, up));
    if (Math.hypot(right[0], right[1], right[2]) < EPSILON) {
      this.rotationEuler = [pitch, yaw, roll];
      this.markViewDirty();
      return;
    }

    this.rotationEuler = [pitch, yaw, roll];
    this.markViewDirty();
  }

  getLocation(): Vec3 {
    return [this.location[0], this.location[1], this.location[2]];
  }

  getRotationEuler(): Vec3 {
    return [this.rotationEuler[0], this.rotationEuler[1], this.rotationEuler[2]];
  }

  getFovYRadians(): number {
    return this.fovYRadians;
  }

  getAspectRatio(): number {
    return this.aspectRatio;
  }

  getNear(): number {
    return this.near;
  }

  getFar(): number {
    return this.far;
  }

  forwardDir(): Vec3 {
    const basis = this.computeBasis();
    return [basis.forward[0], basis.forward[1], basis.forward[2]];
  }

  rightDir(): Vec3 {
    const basis = this.computeBasis();
    return [basis.right[0], basis.right[1], basis.right[2]];
  }

  upDir(): Vec3 {
    const basis = this.computeBasis();
    return [basis.up[0], basis.up[1], basis.up[2]];
  }

  getViewMatrix(): Float32Array {
    this.updateViewMatrixIfNeeded();
    return this.viewMatrix;
  }

  getProjectionMatrix(): Float32Array {
    this.updateProjectionMatrixIfNeeded();
    return this.projectionMatrix;
  }

  getViewProjectionMatrix(): Float32Array {
    this.updateViewMatrixIfNeeded();
    this.updateProjectionMatrixIfNeeded();
    if (this.viewProjectionDirty) {
      multiplyMat4(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
      this.viewProjectionDirty = false;
    }
    return this.viewProjectionMatrix;
  }

  private validateProjection(): void {
    if (!Number.isFinite(this.near) || this.near <= 0) {
      throw new Error('Camera near must be a finite positive number.');
    }
    if (!Number.isFinite(this.far) || this.far <= this.near) {
      throw new Error('Camera far must be finite and greater than near.');
    }
    if (!Number.isFinite(this.aspectRatio) || this.aspectRatio <= 0) {
      throw new Error('Camera aspectRatio must be a finite positive number.');
    }
    if (!Number.isFinite(this.fovYRadians) || this.fovYRadians <= 0 || this.fovYRadians >= Math.PI) {
      throw new Error('Camera fovYRadians must be finite and between 0 and PI radians.');
    }
  }

  private markViewDirty(): void {
    this.viewDirty = true;
    this.viewProjectionDirty = true;
  }

  private markProjectionDirty(): void {
    this.projectionDirty = true;
    this.viewProjectionDirty = true;
  }

  private updateProjectionMatrixIfNeeded(): void {
    if (!this.projectionDirty) {
      return;
    }
    setPerspectiveWebGpu(
      this.projectionMatrix,
      this.fovYRadians,
      this.aspectRatio,
      this.near,
      this.far,
    );
    this.projectionDirty = false;
  }

  private updateViewMatrixIfNeeded(): void {
    if (!this.viewDirty) {
      return;
    }

    const basis = this.computeBasis();
    const forward = basis.forward;
    const right = basis.right;
    const up = basis.up;

    this.viewMatrix[0] = right[0];
    this.viewMatrix[1] = up[0];
    this.viewMatrix[2] = -forward[0];
    this.viewMatrix[3] = 0;

    this.viewMatrix[4] = right[1];
    this.viewMatrix[5] = up[1];
    this.viewMatrix[6] = -forward[1];
    this.viewMatrix[7] = 0;

    this.viewMatrix[8] = right[2];
    this.viewMatrix[9] = up[2];
    this.viewMatrix[10] = -forward[2];
    this.viewMatrix[11] = 0;

    this.viewMatrix[12] = -dot(right, this.location);
    this.viewMatrix[13] = -dot(up, this.location);
    this.viewMatrix[14] = dot(forward, this.location);
    this.viewMatrix[15] = 1;

    this.viewDirty = false;
  }

  private computeBasis(): {
    forward: Vec3;
    right: Vec3;
    up: Vec3;
  } {

    const pitch = this.rotationEuler[0];
    const yaw = this.rotationEuler[1];
    const roll = this.rotationEuler[2];

    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosRoll = Math.cos(roll);
    const sinRoll = Math.sin(roll);

    const forward: Vec3 = [
      clampMagnitude(sinYaw * cosPitch),
      clampMagnitude(sinPitch),
      clampMagnitude(-cosYaw * cosPitch),
    ];

    let right = normalize(cross(forward, [0, 1, 0]));
    if (Math.hypot(right[0], right[1], right[2]) < EPSILON) {
      right = [1, 0, 0];
    }
    let up = normalize(cross(right, forward));

    if (Math.abs(roll) > EPSILON) {
      const rolledRight: Vec3 = [
        right[0] * cosRoll + up[0] * sinRoll,
        right[1] * cosRoll + up[1] * sinRoll,
        right[2] * cosRoll + up[2] * sinRoll,
      ];
      const rolledUp: Vec3 = [
        up[0] * cosRoll - right[0] * sinRoll,
        up[1] * cosRoll - right[1] * sinRoll,
        up[2] * cosRoll - right[2] * sinRoll,
      ];
      right = normalize(rolledRight);
      up = normalize(rolledUp);
    }

    return {
      forward,
      right,
      up,
    };
  }
}
