# Physics Simulation

This document describes the standalone physics simulation system under `src/stunner/physics`.

The physics system is intentionally **not wired into the current render sandbox demo**. It is ready for runtime integration from game/application code.

## Module Overview

- `types.ts`: world settings, liquid settings, vectors, AABB helpers.
- `colliders.ts`: configurable collider types and collider geometry helpers.
- `body.ts`: rigid body model and integration helpers.
- `solver.ts`: central `PhysicsSolver` orchestration.
- `index.ts`: public exports.

## Supported Collider Types

The solver supports these collider definitions:

- `sphere`
- `cylinder`
- `box`
- `convexMesh`

Each collider supports:

- `material.friction`
- `material.restitution`
- `material.density`
- `isSensor`

## Global Physics Settings

`PhysicsWorldSettings` controls simulation behavior:

- `gravity`: world-space gravity vector.
- `airDrag`: global linear drag in non-liquid space.
- `substeps`: simulation subdivisions per `step` call.
- `solverIterations`: velocity solve iterations.
- `positionIterations`: penetration correction iterations.
- `liquid`: global liquid model:
  - `enabled`
  - `fluidLevel`
  - `density`
  - `viscosity`
  - `linearDrag`
  - `angularDrag`
  - `flowVelocity`
  - `surfaceThickness`
  - `turbulence`

## Body Configuration

Bodies can be configured as:

- `dynamic`: affected by forces and collisions.
- `static`: infinite mass, participates in collision constraints.
- `kinematic`: currently non-integrated by force solver (external motion source).

Common body parameters:

- `mass`
- `friction`
- `restitution`
- `linearDamping`
- `angularDamping`
- `position`, `velocity`, `angularVelocity`
- `colliders`

## Usage Example

```ts
import {
  PhysicsSolver,
  createBoxCollider,
  createSphereCollider,
  createPhysicsBody,
} from '../src/stunner/physics';

const solver = new PhysicsSolver({
  gravity: [0, -9.81, 0],
  substeps: 3,
  liquid: {
    enabled: true,
    fluidLevel: 0,
    viscosity: 0.55,
    density: 1000,
    linearDrag: 4.0,
    angularDrag: 1.5,
    flowVelocity: [0.2, 0, 0.1],
    surfaceThickness: 0.4,
    turbulence: 0.1,
  },
});

const floorBody = createPhysicsBody({
  mode: 'static',
  position: [0, -1, 0],
  colliders: [
    createBoxCollider({ halfExtents: [20, 1, 20] }),
  ],
});

const dynamicBall = createPhysicsBody({
  mass: 2,
  position: [0, 4, 0],
  colliders: [
    createSphereCollider({ radius: 0.45 }),
  ],
  friction: 0.4,
  restitution: 0.2,
});

solver.addBody(floorBody);
solver.addBody(dynamicBall);

const dt = 1 / 60;
const result = solver.step(dt);
console.log(result.contacts.length, solver.getBody(dynamicBall.id)?.position);
```

## Liquid Model Notes

The liquid model is global and approximates:

- buoyancy from body volume and submersion fraction,
- drag from relative velocity against liquid flow,
- turbulence-driven local flow noise,
- angular damping while submerged.

This is intentionally a **basic liquid model** optimized for gameplay-level control, not high-fidelity fluid simulation.

## Collision/Contact Notes

The central solver performs:

1. Broadphase pair culling via world AABB overlap.
2. Narrowphase contact generation using conservative approximation.
3. Iterative velocity impulses.
4. Iterative positional correction.

Current narrowphase uses body-level conservative bounds for stability and broad compatibility with mixed collider sets. This keeps the system robust while staying lightweight.

## Integration Guidance

To integrate into runtime later:

1. Create a single solver instance per physics world.
2. Register bodies once at spawn/load.
3. Call `step(deltaSeconds)` on your fixed timestep loop.
4. Read back body transforms and apply to render entities.
5. Keep physics update independent from React UI rendering.
