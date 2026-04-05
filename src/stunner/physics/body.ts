import {
  type Aabb,
  type Vec3,
  mergeAabb,
  vec3Add,
  vec3ClampMagnitude,
  vec3Scale,
} from './types';
import {
  type PhysicsCollider,
  createDefaultColliderMaterial,
  getColliderAabb,
  getColliderApproximateRadius,
  getColliderApproximateVolume,
} from './colliders';

export type PhysicsBodyMode = 'dynamic' | 'static' | 'kinematic';

export type PhysicsBodyConfig = {
  id?: string;
  colliders: PhysicsCollider[];
  mass?: number;
  mode?: PhysicsBodyMode;
  position?: Vec3;
  rotationEuler?: Vec3;
  velocity?: Vec3;
  angularVelocity?: Vec3;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  isSleeping?: boolean;
};

export type PhysicsBody = {
  id: string;
  mode: PhysicsBodyMode;
  colliders: PhysicsCollider[];
  mass: number;
  inverseMass: number;
  inverseInertiaScalar: number;
  position: Vec3;
  rotationEuler: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  accumulatedForce: Vec3;
  accumulatedImpulse: Vec3;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  isSleeping: boolean;
};

let bodyIdCounter = 0;

const nextBodyId = (): string => {
  bodyIdCounter += 1;
  return `body-${bodyIdCounter}`;
};

export const createPhysicsBody = (config: PhysicsBodyConfig): PhysicsBody => {
  if (config.colliders.length === 0) {
    throw new Error('PhysicsBody requires at least one collider.');
  }

  const computedMass = Math.max(0, config.mass ?? estimateBodyMass(config.colliders));
  const mode =
    config.mode ?? (computedMass <= 0 ? 'static' : 'dynamic');
  const mass = mode === 'dynamic' ? Math.max(0.0001, computedMass) : 0;
  const radius = Math.max(0.0001, estimateBodyRadius(config.colliders));
  const inertia = mode === 'dynamic' ? 0.4 * mass * radius * radius : 0;

  return {
    id: config.id ?? nextBodyId(),
    mode,
    colliders: config.colliders,
    mass,
    inverseMass: mode === 'dynamic' ? 1 / mass : 0,
    inverseInertiaScalar: mode === 'dynamic' ? 1 / Math.max(1e-6, inertia) : 0,
    position: config.position ?? [0, 0, 0],
    rotationEuler: config.rotationEuler ?? [0, 0, 0],
    velocity: config.velocity ?? [0, 0, 0],
    angularVelocity: config.angularVelocity ?? [0, 0, 0],
    accumulatedForce: [0, 0, 0],
    accumulatedImpulse: [0, 0, 0],
    friction: Math.max(0, Math.min(1, config.friction ?? 0.45)),
    restitution: Math.max(0, Math.min(1, config.restitution ?? 0.1)),
    linearDamping: Math.max(0, config.linearDamping ?? 0.03),
    angularDamping: Math.max(0, config.angularDamping ?? 0.08),
    isSleeping: config.isSleeping ?? false,
  };
};

export const estimateBodyMass = (colliders: PhysicsCollider[]): number => {
  let totalMass = 0;
  for (const collider of colliders) {
    const materialDensity = collider.material.density ?? createDefaultColliderMaterial().density;
    totalMass += getColliderApproximateVolume(collider) * Math.max(0.0001, materialDensity);
  }
  return Math.max(0.0001, totalMass);
};

const estimateBodyRadius = (colliders: PhysicsCollider[]): number => {
  let radius = 0;
  for (const collider of colliders) {
    radius = Math.max(radius, getColliderApproximateRadius(collider));
  }
  return radius;
};

export const applyBodyForce = (body: PhysicsBody, force: Vec3): void => {
  body.accumulatedForce = vec3Add(body.accumulatedForce, force);
};

export const applyBodyImpulse = (body: PhysicsBody, impulse: Vec3): void => {
  body.accumulatedImpulse = vec3Add(body.accumulatedImpulse, impulse);
};

export const clearBodyAccumulators = (body: PhysicsBody): void => {
  body.accumulatedForce = [0, 0, 0];
  body.accumulatedImpulse = [0, 0, 0];
};

export const getBodyApproximateRadius = (body: PhysicsBody): number => {
  let radius = 0;
  for (const collider of body.colliders) {
    radius = Math.max(radius, getColliderApproximateRadius(collider));
  }
  return Math.max(0.0001, radius);
};

export const getBodyApproximateVolume = (body: PhysicsBody): number => {
  let total = 0;
  for (const collider of body.colliders) {
    total += getColliderApproximateVolume(collider);
  }
  return Math.max(0.0001, total);
};

export const getBodyAabb = (body: PhysicsBody): Aabb => {
  let merged: Aabb | null = null;
  for (const collider of body.colliders) {
    const colliderBounds = getColliderAabb(collider, body.position, body.rotationEuler);
    merged = merged ? mergeAabb(merged, colliderBounds) : colliderBounds;
  }
  return (
    merged ?? {
      min: [...body.position] as Vec3,
      max: [...body.position] as Vec3,
    }
  );
};

export const integrateBody = (body: PhysicsBody, dt: number): void => {
  if (body.mode !== 'dynamic' || body.isSleeping) {
    clearBodyAccumulators(body);
    return;
  }

  const impulseDelta = vec3Scale(body.accumulatedImpulse, body.inverseMass);
  body.velocity = vec3Add(body.velocity, impulseDelta);

  const acceleration = vec3Scale(body.accumulatedForce, body.inverseMass);
  body.velocity = vec3Add(body.velocity, vec3Scale(acceleration, dt));
  body.velocity = vec3Scale(body.velocity, Math.max(0, 1 - body.linearDamping * dt));
  body.velocity = vec3ClampMagnitude(body.velocity, 18);

  body.position = vec3Add(body.position, vec3Scale(body.velocity, dt));
  body.rotationEuler = vec3Add(body.rotationEuler, vec3Scale(body.angularVelocity, dt));
  body.angularVelocity = vec3Scale(
    body.angularVelocity,
    Math.max(0, 1 - body.angularDamping * dt),
  );
  body.angularVelocity = vec3ClampMagnitude(body.angularVelocity, 10);

  clearBodyAccumulators(body);
};
