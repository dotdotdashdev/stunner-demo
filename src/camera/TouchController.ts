import { Camera, type Vec3 } from './Camera';

export type TouchControllerOptions = {
  rotationSpeed?: number;
  zoomSpeed?: number;
};

const addScaled = (base: Vec3, direction: Vec3, scale: number): Vec3 => {
  return [
    base[0] + direction[0] * scale,
    base[1] + direction[1] * scale,
    base[2] + direction[2] * scale,
  ];
};

const clampPitch = (pitch: number): number => {
  const limit = Math.PI * 0.5 - 0.001;
  return Math.max(-limit, Math.min(limit, pitch));
};

const distance = (a: Touch, b: Touch): number => {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
};

export class TouchController {
  private readonly camera: Camera;
  private readonly element: HTMLElement;
  private readonly rotationSpeed: number;
  private readonly zoomSpeed: number;

  private prevOneFingerX = 0;
  private prevOneFingerY = 0;
  private prevPinchDistance = 0;

  private readonly onTouchStartBound: (event: TouchEvent) => void;
  private readonly onTouchMoveBound: (event: TouchEvent) => void;
  private readonly onTouchEndBound: (event: TouchEvent) => void;

  constructor(camera: Camera, element: HTMLElement, options: TouchControllerOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.rotationSpeed = options.rotationSpeed ?? 0.004;
    this.zoomSpeed = options.zoomSpeed ?? 0.01;

    this.onTouchStartBound = (event: TouchEvent): void => {
      this.onTouchStart(event);
    };
    this.onTouchMoveBound = (event: TouchEvent): void => {
      this.onTouchMove(event);
    };
    this.onTouchEndBound = (event: TouchEvent): void => {
      this.onTouchEnd(event);
    };

    this.element.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
    this.element.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
    this.element.addEventListener('touchend', this.onTouchEndBound, { passive: false });
    this.element.addEventListener('touchcancel', this.onTouchEndBound, { passive: false });
  }

  dispose(): void {
    this.element.removeEventListener('touchstart', this.onTouchStartBound);
    this.element.removeEventListener('touchmove', this.onTouchMoveBound);
    this.element.removeEventListener('touchend', this.onTouchEndBound);
    this.element.removeEventListener('touchcancel', this.onTouchEndBound);
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.prevOneFingerX = event.touches[0].clientX;
      this.prevOneFingerY = event.touches[0].clientY;
    }

    if (event.touches.length === 2) {
      this.prevPinchDistance = distance(event.touches[0], event.touches[1]);
    }
  }

  private onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.prevOneFingerX;
      const deltaY = touch.clientY - this.prevOneFingerY;
      this.prevOneFingerX = touch.clientX;
      this.prevOneFingerY = touch.clientY;
      this.applyLookDelta(deltaX, deltaY);
      return;
    }

    if (event.touches.length === 2) {
      event.preventDefault();
      const currentDistance = distance(event.touches[0], event.touches[1]);
      const deltaDistance = currentDistance - this.prevPinchDistance;
      this.prevPinchDistance = currentDistance;
      this.applyZoom(-deltaDistance * this.zoomSpeed);
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.prevOneFingerX = event.touches[0].clientX;
      this.prevOneFingerY = event.touches[0].clientY;
    }

    if (event.touches.length < 2) {
      this.prevPinchDistance = 0;
    }
  }

  private applyLookDelta(deltaX: number, deltaY: number): void {
    const rotation = this.camera.getRotationEuler();
    const pitch = clampPitch(rotation[0] - deltaY * this.rotationSpeed);
    const yaw = rotation[1] + deltaX * this.rotationSpeed;
    this.camera.setRotationEuler([pitch, yaw, rotation[2]]);
  }

  private applyZoom(delta: number): void {
    const location = this.camera.getLocation();
    const forward = this.camera.forwardDir();
    const nextLocation = addScaled(location, forward, delta);
    this.camera.setLocation(nextLocation);
  }
}
