import { Camera, type Vec3 } from './Camera';

export type KeyboardControllerOptions = {
  moveSpeed?: number;
  lookSpeed?: number;
};

const clampPitch = (pitch: number): number => {
  const limit = Math.PI * 0.5 - 0.001;
  return Math.max(-limit, Math.min(limit, pitch));
};

const addScaled = (base: Vec3, direction: Vec3, scale: number): Vec3 => {
  return [
    base[0] + direction[0] * scale,
    base[1] + direction[1] * scale,
    base[2] + direction[2] * scale,
  ];
};

export class KeyboardController {
  private readonly camera: Camera;
  private readonly moveSpeed: number;
  private readonly lookSpeed: number;

  private rafId = 0;
  private lastTimeMs = 0;
  private activeKeys = new Set<string>();

  private readonly onKeyDownBound: (event: KeyboardEvent) => void;
  private readonly onKeyUpBound: (event: KeyboardEvent) => void;

  constructor(camera: Camera, options: KeyboardControllerOptions = {}) {
    this.camera = camera;
    this.moveSpeed = options.moveSpeed ?? 4;
    this.lookSpeed = options.lookSpeed ?? 1.8;

    this.onKeyDownBound = (event: KeyboardEvent): void => {
      this.onKeyDown(event);
    };
    this.onKeyUpBound = (event: KeyboardEvent): void => {
      this.onKeyUp(event);
    };

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);

    this.lastTimeMs = performance.now();
    this.rafId = requestAnimationFrame((timeMs) => {
      this.tick(timeMs);
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.activeKeys.clear();
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.activeKeys.add(event.key);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.activeKeys.delete(event.key);
  }

  private tick(timeMs: number): void {
    const deltaSeconds = Math.min(0.1, Math.max(0, (timeMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = timeMs;

    this.updateLook(deltaSeconds);
    this.updateMovement(deltaSeconds);

    this.rafId = requestAnimationFrame((nextTimeMs) => {
      this.tick(nextTimeMs);
    });
  }

  private updateMovement(deltaSeconds: number): void {
    let moveForward = 0;
    let moveRight = 0;

    if (this.activeKeys.has('w') || this.activeKeys.has('W')) {
      moveForward += 1;
    }
    if (this.activeKeys.has('s') || this.activeKeys.has('S')) {
      moveForward -= 1;
    }
    if (this.activeKeys.has('d') || this.activeKeys.has('D')) {
      moveRight += 1;
    }
    if (this.activeKeys.has('a') || this.activeKeys.has('A')) {
      moveRight -= 1;
    }

    if (moveForward === 0 && moveRight === 0) {
      return;
    }

    const location = this.camera.getLocation();
    const forward = this.camera.forwardDir();
    const right = this.camera.rightDir();

    const step = this.moveSpeed * deltaSeconds;
    let next = addScaled(location, forward, moveForward * step);
    next = addScaled(next, right, moveRight * step);
    this.camera.setLocation(next);
  }

  private updateLook(deltaSeconds: number): void {
    let lookYaw = 0;
    let lookPitch = 0;

    if (this.activeKeys.has('ArrowLeft')) {
      lookYaw -= 1;
    }
    if (this.activeKeys.has('ArrowRight')) {
      lookYaw += 1;
    }
    if (this.activeKeys.has('ArrowUp')) {
      lookPitch += 1;
    }
    if (this.activeKeys.has('ArrowDown')) {
      lookPitch -= 1;
    }

    if (lookYaw === 0 && lookPitch === 0) {
      return;
    }

    const rotation = this.camera.getRotationEuler();
    const deltaLook = this.lookSpeed * deltaSeconds;
    const pitch = clampPitch(rotation[0] + lookPitch * deltaLook);
    const yaw = rotation[1] + lookYaw * deltaLook;
    this.camera.setRotationEuler([pitch, yaw, rotation[2]]);
  }
}
