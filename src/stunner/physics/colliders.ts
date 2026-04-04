import {
  type Aabb,
  type Vec3,
  clamp01,
} from './types';

export type ColliderAxis = 'x' | 'y' | 'z';

export type PhysicsColliderMaterial = {
  friction: number;
  restitution: number;
  density: number;
};

export type SphereColliderShape = {
  type: 'sphere';
  radius: number;
  center: Vec3;
};

export type CylinderColliderShape = {
  type: 'cylinder';
  radius: number;
  height: number;
  axis: ColliderAxis;
  center: Vec3;
};

export type BoxColliderShape = {
  type: 'box';
  halfExtents: Vec3;
  center: Vec3;
};

export type ConvexMeshColliderShape = {
  type: 'convexMesh';
  vertices: Vec3[];
  center: Vec3;
};

export type PhysicsColliderShape =
  | SphereColliderShape
  | CylinderColliderShape
  | BoxColliderShape
  | ConvexMeshColliderShape;

export type PhysicsCollider = {
  id: string;
  shape: PhysicsColliderShape;
  material: PhysicsColliderMaterial;
  isSensor: boolean;
};

let colliderIdCounter = 0;

const nextColliderId = (): string => {
  colliderIdCounter += 1;
  return `collider-${colliderIdCounter}`;
};

export const createDefaultColliderMaterial = (): PhysicsColliderMaterial => {
  return {
    friction: 0.45,
    restitution: 0.1,
    density: 1,
  };
};

export const createSphereCollider = (config: {
  radius: number;
  center?: Vec3;
  material?: Partial<PhysicsColliderMaterial>;
  isSensor?: boolean;
  id?: string;
}): PhysicsCollider => {
  const material = {
    ...createDefaultColliderMaterial(),
    ...(config.material ?? {}),
  };
  return {
    id: config.id ?? nextColliderId(),
    shape: {
      type: 'sphere',
      radius: Math.max(0.0001, config.radius),
      center: config.center ?? [0, 0, 0],
    },
    material,
    isSensor: config.isSensor ?? false,
  };
};

export const createCylinderCollider = (config: {
  radius: number;
  height: number;
  axis?: ColliderAxis;
  center?: Vec3;
  material?: Partial<PhysicsColliderMaterial>;
  isSensor?: boolean;
  id?: string;
}): PhysicsCollider => {
  const material = {
    ...createDefaultColliderMaterial(),
    ...(config.material ?? {}),
  };
  return {
    id: config.id ?? nextColliderId(),
    shape: {
      type: 'cylinder',
      radius: Math.max(0.0001, config.radius),
      height: Math.max(0.0001, config.height),
      axis: config.axis ?? 'y',
      center: config.center ?? [0, 0, 0],
    },
    material,
    isSensor: config.isSensor ?? false,
  };
};

export const createBoxCollider = (config: {
  halfExtents: Vec3;
  center?: Vec3;
  material?: Partial<PhysicsColliderMaterial>;
  isSensor?: boolean;
  id?: string;
}): PhysicsCollider => {
  const material = {
    ...createDefaultColliderMaterial(),
    ...(config.material ?? {}),
  };
  return {
    id: config.id ?? nextColliderId(),
    shape: {
      type: 'box',
      halfExtents: [
        Math.max(0.0001, config.halfExtents[0]),
        Math.max(0.0001, config.halfExtents[1]),
        Math.max(0.0001, config.halfExtents[2]),
      ],
      center: config.center ?? [0, 0, 0],
    },
    material,
    isSensor: config.isSensor ?? false,
  };
};

export const createConvexMeshCollider = (config: {
  vertices: Vec3[];
  center?: Vec3;
  material?: Partial<PhysicsColliderMaterial>;
  isSensor?: boolean;
  id?: string;
}): PhysicsCollider => {
  if (config.vertices.length < 4) {
    throw new Error('Convex mesh collider requires at least 4 vertices.');
  }
  const material = {
    ...createDefaultColliderMaterial(),
    ...(config.material ?? {}),
  };
  return {
    id: config.id ?? nextColliderId(),
    shape: {
      type: 'convexMesh',
      vertices: config.vertices,
      center: config.center ?? [0, 0, 0],
    },
    material,
    isSensor: config.isSensor ?? false,
  };
};

export const getColliderApproximateRadius = (collider: PhysicsCollider): number => {
  if (collider.shape.type === 'sphere') {
    return collider.shape.radius;
  }
  if (collider.shape.type === 'cylinder') {
    return Math.max(collider.shape.radius, collider.shape.height * 0.5);
  }
  if (collider.shape.type === 'box') {
    const [x, y, z] = collider.shape.halfExtents;
    return Math.hypot(x, y, z);
  }
  let maxDistance = 0;
  for (const vertex of collider.shape.vertices) {
    const distance = Math.hypot(vertex[0], vertex[1], vertex[2]);
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }
  return Math.max(0.0001, maxDistance);
};

export const getColliderApproximateVolume = (collider: PhysicsCollider): number => {
  if (collider.shape.type === 'sphere') {
    return (4 / 3) * Math.PI * collider.shape.radius ** 3;
  }
  if (collider.shape.type === 'cylinder') {
    return Math.PI * collider.shape.radius ** 2 * collider.shape.height;
  }
  if (collider.shape.type === 'box') {
    return (
      collider.shape.halfExtents[0] *
      collider.shape.halfExtents[1] *
      collider.shape.halfExtents[2] *
      8
    );
  }
  const bounds = getConvexMeshLocalBounds(collider.shape.vertices);
  const extents: Vec3 = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  return Math.max(0.0001, extents[0] * extents[1] * extents[2] * 0.65);
};

const getConvexMeshLocalBounds = (vertices: Vec3[]): Aabb => {
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

export const getColliderAabb = (collider: PhysicsCollider, worldPosition: Vec3): Aabb => {
  if (collider.shape.type === 'sphere') {
    const cx = worldPosition[0] + collider.shape.center[0];
    const cy = worldPosition[1] + collider.shape.center[1];
    const cz = worldPosition[2] + collider.shape.center[2];
    const r = collider.shape.radius;
    return {
      min: [cx - r, cy - r, cz - r],
      max: [cx + r, cy + r, cz + r],
    };
  }

  if (collider.shape.type === 'cylinder') {
    const cx = worldPosition[0] + collider.shape.center[0];
    const cy = worldPosition[1] + collider.shape.center[1];
    const cz = worldPosition[2] + collider.shape.center[2];
    const r = collider.shape.radius;
    const halfHeight = collider.shape.height * 0.5;
    if (collider.shape.axis === 'x') {
      return {
        min: [cx - halfHeight, cy - r, cz - r],
        max: [cx + halfHeight, cy + r, cz + r],
      };
    }
    if (collider.shape.axis === 'z') {
      return {
        min: [cx - r, cy - r, cz - halfHeight],
        max: [cx + r, cy + r, cz + halfHeight],
      };
    }
    return {
      min: [cx - r, cy - halfHeight, cz - r],
      max: [cx + r, cy + halfHeight, cz + r],
    };
  }

  if (collider.shape.type === 'box') {
    const cx = worldPosition[0] + collider.shape.center[0];
    const cy = worldPosition[1] + collider.shape.center[1];
    const cz = worldPosition[2] + collider.shape.center[2];
    const hx = collider.shape.halfExtents[0];
    const hy = collider.shape.halfExtents[1];
    const hz = collider.shape.halfExtents[2];
    return {
      min: [cx - hx, cy - hy, cz - hz],
      max: [cx + hx, cy + hy, cz + hz],
    };
  }

  const meshBounds = getConvexMeshLocalBounds(collider.shape.vertices);
  const center = collider.shape.center;
  return {
    min: [
      worldPosition[0] + center[0] + meshBounds.min[0],
      worldPosition[1] + center[1] + meshBounds.min[1],
      worldPosition[2] + center[2] + meshBounds.min[2],
    ],
    max: [
      worldPosition[0] + center[0] + meshBounds.max[0],
      worldPosition[1] + center[1] + meshBounds.max[1],
      worldPosition[2] + center[2] + meshBounds.max[2],
    ],
  };
};

export const blendColliderMaterial = (
  a: PhysicsColliderMaterial,
  b: PhysicsColliderMaterial,
): PhysicsColliderMaterial => {
  return {
    friction: clamp01(Math.sqrt(Math.max(0, a.friction * b.friction))),
    restitution: clamp01(Math.max(a.restitution, b.restitution)),
    density: Math.max(0.0001, (a.density + b.density) * 0.5),
  };
};
