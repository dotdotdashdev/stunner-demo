import { Camera, type Vec3 } from './Camera';

export type MouseControllerOptions = {
  lookSpeed?: number;
  panSpeed?: number;
  wheelSpeed?: number;
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

export class MouseController {
  private readonly camera: Camera;
  private readonly element: HTMLElement;
  private readonly lookSpeed: number;
  private readonly panSpeed: number;
  private readonly wheelSpeed: number;

  private lastX = 0;
  private lastY = 0;
  private hasLastPointer = false;

  private readonly onMouseMoveBound: (event: MouseEvent) => void;
  private readonly onMouseEnterBound: (event: MouseEvent) => void;
  private readonly onMouseLeaveBound: (event: MouseEvent) => void;
  private readonly onWheelBound: (event: WheelEvent) => void;
  private readonly onContextMenuBound: (event: MouseEvent) => void;

  constructor(camera: Camera, element: HTMLElement, options: MouseControllerOptions = {}) {
    this.camera = camera;
    this.element = element;
    this.lookSpeed = options.lookSpeed ?? 0.0035;
    this.panSpeed = options.panSpeed ?? 0.01;
    this.wheelSpeed = options.wheelSpeed ?? 0.002;

    this.onMouseMoveBound = (event: MouseEvent): void => {
      this.onMouseMove(event);
    };
    this.onMouseEnterBound = (event: MouseEvent): void => {
      this.onMouseEnter(event);
    };
    this.onMouseLeaveBound = (): void => {
      this.hasLastPointer = false;
    };
    this.onWheelBound = (event: WheelEvent): void => {
      this.onWheel(event);
    };
    this.onContextMenuBound = (event: MouseEvent): void => {
      event.preventDefault();
    };

    this.element.addEventListener('mouseenter', this.onMouseEnterBound);
    this.element.addEventListener('mouseleave', this.onMouseLeaveBound);
    this.element.addEventListener('mousemove', this.onMouseMoveBound);
    this.element.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenuBound);
  }

  dispose(): void {
    this.element.removeEventListener('mouseenter', this.onMouseEnterBound);
    this.element.removeEventListener('mouseleave', this.onMouseLeaveBound);
    this.element.removeEventListener('mousemove', this.onMouseMoveBound);
    this.element.removeEventListener('wheel', this.onWheelBound);
    this.element.removeEventListener('contextmenu', this.onContextMenuBound);
  }

  private onMouseEnter(event: MouseEvent): void {
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.hasLastPointer = true;
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.hasLastPointer) {
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.hasLastPointer = true;
      return;
    }

    const deltaX = event.clientX - this.lastX;
    const deltaY = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    const leftButtonDown = (event.buttons & 1) !== 0;
    const rightOrMiddleDown = (event.buttons & (2 | 4)) !== 0;

    if (leftButtonDown) {
      this.applyLookDelta(deltaX, deltaY);
      return;
    }

    if (rightOrMiddleDown) {
      this.applyPanDelta(deltaX, deltaY);
    }
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const location = this.camera.getLocation();
    const forward = this.camera.forwardDir();
    const next = addScaled(location, forward, -event.deltaY * this.wheelSpeed);
    this.camera.setLocation(next);
  }

  private applyLookDelta(deltaX: number, deltaY: number): void {
    const rotation = this.camera.getRotationEuler();
    const pitch = clampPitch(rotation[0] - deltaY * this.lookSpeed);
    const yaw = rotation[1] + deltaX * this.lookSpeed;
    this.camera.setRotationEuler([pitch, yaw, rotation[2]]);
  }

  private applyPanDelta(deltaX: number, deltaY: number): void {
    const location = this.camera.getLocation();
    const right = this.camera.rightDir();
    const up = this.camera.upDir();

    let next = addScaled(location, right, deltaX * this.panSpeed);
    next = addScaled(next, up, -deltaY * this.panSpeed);
    this.camera.setLocation(next);
  }
}
