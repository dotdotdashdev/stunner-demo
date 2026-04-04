# Camera and Controllers

This project includes a non-interactive camera model and three interaction controller classes in [src/camera](../src/camera).

## Files

- [src/camera/Camera.ts](../src/camera/Camera.ts): Camera transform/projection state and matrix math.
- [src/camera/TouchController.ts](../src/camera/TouchController.ts): Touch look + pinch zoom.
- [src/camera/MouseController.ts](../src/camera/MouseController.ts): Mouse look/pan/wheel zoom.
- [src/camera/KeyboardController.ts](../src/camera/KeyboardController.ts): WASD movement + arrow-key look.

## Camera Usage

```ts
import { Camera } from '../camera/Camera';

const camera = new Camera({
  location: [0, 1.2, 1.5],
  rotationEuler: [0, 0, 0],
  fovYRadians: Math.PI / 3,
  aspectRatio: 16 / 9,
  near: 0.1,
  far: 1000,
});

camera.lookAt([0, 0.8, -5.5]);

const view = camera.getViewMatrix();
const proj = camera.getProjectionMatrix();
const viewProj = camera.getViewProjectionMatrix();
```

## Direction Vectors

The camera exposes normalized basis vectors:

- `camera.forwardDir()`
- `camera.rightDir()`
- `camera.upDir()`

Negate as needed for opposite directions (`back`, `left`, `down`).

## Controller Usage

```ts
import { Camera } from '../camera/Camera';
import { TouchController } from '../camera/TouchController';
import { MouseController } from '../camera/MouseController';
import { KeyboardController } from '../camera/KeyboardController';

const camera = new Camera();
const canvas = document.querySelector('canvas');
if (!canvas) {
  throw new Error('Canvas not found.');
}

const touch = new TouchController(camera, canvas);
const mouse = new MouseController(camera, canvas);
const keyboard = new KeyboardController(camera);

// Later during teardown:
keyboard.dispose();
mouse.dispose();
touch.dispose();
```

## Single-Controller Setups

Use these minimal variants when you do not want all input modes enabled.

### Desktop-only (Mouse + Keyboard)

```ts
import { Camera } from '../camera/Camera';
import { MouseController } from '../camera/MouseController';
import { KeyboardController } from '../camera/KeyboardController';

const camera = new Camera();
const canvas = document.querySelector('canvas');
if (!canvas) {
  throw new Error('Canvas not found.');
}

const mouse = new MouseController(camera, canvas);
const keyboard = new KeyboardController(camera);

// Later during teardown:
keyboard.dispose();
mouse.dispose();
```

### Touch-only

```ts
import { Camera } from '../camera/Camera';
import { TouchController } from '../camera/TouchController';

const camera = new Camera();
const canvas = document.querySelector('canvas');
if (!canvas) {
  throw new Error('Canvas not found.');
}

const touch = new TouchController(camera, canvas);

// Later during teardown:
touch.dispose();
```

## Control Map

### TouchController

- One finger drag: look around (pitch/yaw).
- Two-finger pinch: zoom forward/backward.

### MouseController

- Move cursor with no button pressed: look around.
- Move cursor while any mouse button is pressed: pan left/right/up/down.
- Mouse wheel: move forward/backward.

### KeyboardController

- `W` / `S`: move forward / backward.
- `A` / `D`: move left / right.
- Arrow keys: look around.

## Notes

- All controllers are independent classes and can be used individually.
- `KeyboardController` listens on `window` and runs an internal `requestAnimationFrame` loop until disposed.
- Current demo wiring is in [src/renderer/CanvasStage.tsx](../src/renderer/CanvasStage.tsx).
