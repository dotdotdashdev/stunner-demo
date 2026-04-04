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

const rotatePointByEuler = (point: Vec3, rotationEuler: Vec3): Vec3 => {
  const sx = Math.sin(rotationEuler[0]);
  const cx = Math.cos(rotationEuler[0]);
  const sy = Math.sin(rotationEuler[1]);
  const cy = Math.cos(rotationEuler[1]);
  const sz = Math.sin(rotationEuler[2]);
  const cz = Math.cos(rotationEuler[2]);

  const x1 = point[0];
  const y1 = point[1] * cx - point[2] * sx;
  const z1 = point[1] * sx + point[2] * cx;

  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;

  const x3 = x2 * cz - y2 * sz;
  const y3 = x2 * sz + y2 * cz;
  const z3 = z2;

  return [x3, y3, z3];
};

export const getColliderAabb = (
  collider: PhysicsCollider,
  worldPosition: Vec3,
  rotationEuler: Vec3 = [0, 0, 0],
): Aabb => {
  if (collider.shape.type === 'sphere') {
    const rotatedCenter = rotatePointByEuler(collider.shape.center, rotationEuler);
    const cx = worldPosition[0] + rotatedCenter[0];
    const cy = worldPosition[1] + rotatedCenter[1];
    const cz = worldPosition[2] + rotatedCenter[2];
    const r = collider.shape.radius;
    return {
      min: [cx - r, cy - r, cz - r],
      max: [cx + r, cy + r, cz + r],
    };
  }

  if (collider.shape.type === 'cylinder') {
    const center = rotatePointByEuler(collider.shape.center, rotationEuler);
    const cx = worldPosition[0] + center[0];
    const cy = worldPosition[1] + center[1];
    const cz = worldPosition[2] + center[2];
    const r = collider.shape.radius;
    const halfHeight = collider.shape.height * 0.5;
    const localAxis: Vec3 =
      collider.shape.axis === 'x'
        ? [1, 0, 0]
        : collider.shape.axis === 'z'
          ? [0, 0, 1]
          : [0, 1, 0];
    const axis = rotatePointByEuler(localAxis, rotationEuler);
    const ex = Math.abs(axis[0]) * halfHeight + Math.sqrt(Math.max(0, 1 - axis[0] * axis[0])) * r;
    const ey = Math.abs(axis[1]) * halfHeight + Math.sqrt(Math.max(0, 1 - axis[1] * axis[1])) * r;
    const ez = Math.abs(axis[2]) * halfHeight + Math.sqrt(Math.max(0, 1 - axis[2] * axis[2])) * r;
    return {
      min: [cx - ex, cy - ey, cz - ez],
      max: [cx + ex, cy + ey, cz + ez],
    };
  }

  if (collider.shape.type === 'box') {
    const center = rotatePointByEuler(collider.shape.center, rotationEuler);
    const cx = worldPosition[0] + center[0];
    const cy = worldPosition[1] + center[1];
    const cz = worldPosition[2] + center[2];
    const hx = collider.shape.halfExtents[0];
    const hy = collider.shape.halfExtents[1];
    const hz = collider.shape.halfExtents[2];

    const corners: Vec3[] = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [-hx, hy, -hz],
      [hx, hy, -hz],
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [-hx, hy, hz],
      [hx, hy, hz],
    ];

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const corner of corners) {
      const rotated = rotatePointByEuler(corner, rotationEuler);
      const px = cx + rotated[0];
      const py = cy + rotated[1];
      const pz = cz + rotated[2];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      minZ = Math.min(minZ, pz);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
      maxZ = Math.max(maxZ, pz);
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  }

  const center = rotatePointByEuler(collider.shape.center, rotationEuler);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const vertex of collider.shape.vertices) {
    const rotated = rotatePointByEuler(vertex, rotationEuler);
    const px = worldPosition[0] + center[0] + rotated[0];
    const py = worldPosition[1] + center[1] + rotated[1];
    const pz = worldPosition[2] + center[2] + rotated[2];
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    minZ = Math.min(minZ, pz);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
    maxZ = Math.max(maxZ, pz);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
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
