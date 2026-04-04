import {
  PhysicsSolver,
  createBoxCollider,
  createConvexMeshCollider,
  createCylinderCollider,
  createPhysicsBody,
  createSphereCollider,
  type PhysicsBody,
  type PhysicsCollider,
  type Vec3,
} from '../stunner/physics';
import { createDefaultMaterial } from '../stunner/renderer/mesh/MaterialTypes';
import { createBox, createCylinder, createPlane, createSphere } from '../stunner/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  mat4Multiply,
  mat4RotationX,
  mat4Scale,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '../stunner/renderer/mesh/SceneTypes';

type DemoRenderableCollider = {
  body: PhysicsBody;
  collider: PhysicsCollider;
  materialName: string;
  baseColor: [number, number, number, number];
};

const mat4RotationZ = (radians: number): Mat4 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const out = mat4Identity();
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
};

const composeTransform = (translation: Vec3, scale: Vec3, rotation?: Mat4): Mat4 => {
  const t = mat4Translation(translation[0], translation[1], translation[2]);
  const r = rotation ?? mat4Identity();
  const s = mat4Scale(scale[0], scale[1], scale[2]);
  return mat4Multiply(mat4Multiply(t, r), s);
};

const getConvexBounds = (vertices: Vec3[]): { min: Vec3; max: Vec3 } => {
  const first = vertices[0] ?? [0, 0, 0];
  let minX = first[0];
  let minY = first[1];
  let minZ = first[2];
  let maxX = first[0];
  let maxY = first[1];
  let maxZ = first[2];

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex[0]);
    minY = Math.min(minY, vertex[1]);
    minZ = Math.min(minZ, vertex[2]);
    maxX = Math.max(maxX, vertex[0]);
    maxY = Math.max(maxY, vertex[1]);
    maxZ = Math.max(maxZ, vertex[2]);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
};

const createPhysicsWorld = (): {
  solver: PhysicsSolver;
  renderableColliders: DemoRenderableCollider[];
} => {
  const solver = new PhysicsSolver({
    gravity: [0, -9.81, 0],
    substeps: 3,
    solverIterations: 9,
    positionIterations: 4,
    liquid: {
      enabled: false,
      fluidLevel: -10,
      density: 1000,
      viscosity: 0.55,
      linearDrag: 3.8,
      angularDrag: 1.5,
      flowVelocity: [0.2, 0, 0.15],
      surfaceThickness: 0.35,
      turbulence: 0.1,
    },
  });

  const floor = createPhysicsBody({
    mode: 'static',
    position: [0, -0.55, -6],
    colliders: [createBoxCollider({ halfExtents: [10, 0.45, 10] })],
  });

  const sphereBody = createPhysicsBody({
    position: [-2.8, 4.5, -6.5],
    velocity: [0.8, 0, 0.5],
    mass: 1.8,
    colliders: [
      createSphereCollider({
        radius: 0.5,
        material: {
          density: 1.2,
          friction: 0.42,
          restitution: 0.18,
        },
      }),
    ],
  });

  const boxBody = createPhysicsBody({
    position: [-0.4, 5.2, -5.8],
    velocity: [0.25, 0, -0.4],
    mass: 2.4,
    colliders: [
      createBoxCollider({
        halfExtents: [0.5, 0.55, 0.45],
        material: {
          density: 1.35,
          friction: 0.55,
          restitution: 0.12,
        },
      }),
    ],
  });

  const cylinderBody = createPhysicsBody({
    position: [2.1, 5.8, -6.2],
    velocity: [-0.5, 0, 0.2],
    mass: 1.9,
    colliders: [
      createCylinderCollider({
        radius: 0.38,
        height: 1.25,
        axis: 'y',
        material: {
          density: 1.1,
          friction: 0.32,
          restitution: 0.22,
        },
      }),
    ],
  });

  const convexBody = createPhysicsBody({
    position: [0.9, 7.1, -6.9],
    velocity: [-0.12, 0, 0.55],
    mass: 1.4,
    colliders: [
      createConvexMeshCollider({
        vertices: [
          [-0.55, -0.4, -0.35],
          [0.6, -0.35, -0.45],
          [0.45, -0.45, 0.55],
          [-0.5, -0.25, 0.5],
          [0, 0.7, 0],
        ],
        material: {
          density: 0.95,
          friction: 0.38,
          restitution: 0.26,
        },
      }),
    ],
  });

  solver.addBody(floor);
  solver.addBody(sphereBody);
  solver.addBody(boxBody);
  solver.addBody(cylinderBody);
  solver.addBody(convexBody);

  return {
    solver,
    renderableColliders: [
      {
        body: floor,
        collider: floor.colliders[0],
        materialName: 'physics-floor',
        baseColor: [0.2, 0.3, 0.42, 1],
      },
      {
        body: sphereBody,
        collider: sphereBody.colliders[0],
        materialName: 'physics-sphere',
        baseColor: [0.92, 0.52, 0.32, 1],
      },
      {
        body: boxBody,
        collider: boxBody.colliders[0],
        materialName: 'physics-box',
        baseColor: [0.32, 0.72, 0.92, 1],
      },
      {
        body: cylinderBody,
        collider: cylinderBody.colliders[0],
        materialName: 'physics-cylinder',
        baseColor: [0.54, 0.86, 0.42, 1],
      },
      {
        body: convexBody,
        collider: convexBody.colliders[0],
        materialName: 'physics-convex',
        baseColor: [0.94, 0.84, 0.4, 1],
      },
    ],
  };
};

const toMeshInstance = (entry: DemoRenderableCollider): SceneMeshInstance => {
  const bodyPosition = entry.body.position;
  const center = entry.collider.shape.center;
  const translation: Vec3 = [
    bodyPosition[0] + center[0],
    bodyPosition[1] + center[1],
    bodyPosition[2] + center[2],
  ];

  if (entry.collider.shape.type === 'sphere') {
    return {
      geometry: createSphere({ radius: 1, widthSegments: 24, heightSegments: 18 }),
      material: createDefaultMaterial({
        name: entry.materialName,
        baseColor: entry.baseColor,
        roughness: 0.3,
      }),
      transform: composeTransform(
        translation,
        [entry.collider.shape.radius, entry.collider.shape.radius, entry.collider.shape.radius],
      ),
    };
  }

  if (entry.collider.shape.type === 'box') {
    if (entry.materialName === 'physics-floor') {
      return {
        geometry: createPlane({
          width: entry.collider.shape.halfExtents[0] * 2,
          depth: entry.collider.shape.halfExtents[2] * 2,
          widthSegments: 10,
          depthSegments: 10,
        }),
        material: createDefaultMaterial({
          name: entry.materialName,
          baseColor: entry.baseColor,
          roughness: 0.78,
        }),
        transform: mat4Translation(
          translation[0],
          translation[1] + entry.collider.shape.halfExtents[1],
          translation[2],
        ),
      };
    }

    return {
      geometry: createBox({ width: 2, height: 2, depth: 2 }),
      material: createDefaultMaterial({
        name: entry.materialName,
        baseColor: entry.baseColor,
        roughness: 0.45,
      }),
      transform: composeTransform(
        translation,
        [
          entry.collider.shape.halfExtents[0],
          entry.collider.shape.halfExtents[1],
          entry.collider.shape.halfExtents[2],
        ],
      ),
    };
  }

  if (entry.collider.shape.type === 'cylinder') {
    const rotation =
      entry.collider.shape.axis === 'x'
        ? mat4RotationZ(-Math.PI * 0.5)
        : entry.collider.shape.axis === 'z'
          ? mat4RotationX(Math.PI * 0.5)
          : mat4Identity();
    return {
      geometry: createCylinder({
        topRadius: 1,
        bottomRadius: 1,
        height: 2,
        radialSegments: 22,
        heightSegments: 1,
      }),
      material: createDefaultMaterial({
        name: entry.materialName,
        baseColor: entry.baseColor,
        roughness: 0.28,
      }),
      transform: composeTransform(
        translation,
        [entry.collider.shape.radius, entry.collider.shape.height * 0.5, entry.collider.shape.radius],
        rotation,
      ),
    };
  }

  const bounds = getConvexBounds(entry.collider.shape.vertices);
  const size: Vec3 = [
    Math.max(0.001, (bounds.max[0] - bounds.min[0]) * 0.5),
    Math.max(0.001, (bounds.max[1] - bounds.min[1]) * 0.5),
    Math.max(0.001, (bounds.max[2] - bounds.min[2]) * 0.5),
  ];
  return {
    geometry: createBox({ width: 2, height: 2, depth: 2 }),
    material: createDefaultMaterial({
      name: entry.materialName,
      baseColor: entry.baseColor,
      roughness: 0.36,
      metalness: 0.1,
    }),
    transform: composeTransform(translation, size),
  };
};

const buildPhysicsScene = (renderableColliders: DemoRenderableCollider[]): RenderScene => {
  const meshes = renderableColliders.map((entry) => toMeshInstance(entry));

  return {
    meshes,
    lights: [],
  };
};

export type PhysicsDemoController = {
  dispose: () => void;
};

export const startPhysicsDemo = (
  applyScene: (scene: RenderScene) => void,
): PhysicsDemoController => {
  const { solver, renderableColliders } = createPhysicsWorld();

  let disposed = false;
  let previousTime = performance.now();
  let accumulator = 0;
  const fixedStep = 1 / 60;

  const update = (): void => {
    if (disposed) {
      return;
    }

    const now = performance.now();
    const frameDelta = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;
    accumulator += frameDelta;

    while (accumulator >= fixedStep) {
      solver.step(fixedStep);
      accumulator -= fixedStep;
    }

    applyScene(buildPhysicsScene(renderableColliders));
    window.requestAnimationFrame(update);
  };

  applyScene(buildPhysicsScene(renderableColliders));
  window.requestAnimationFrame(update);

  return {
    dispose: () => {
      disposed = true;
    },
  };
};
