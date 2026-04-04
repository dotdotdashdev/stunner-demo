import {
  type Aabb,
  type PhysicsWorldSettings,
  type Vec3,
  aabbOverlaps,
  clamp01,
  createDefaultPhysicsWorldSettings,
  vec3Add,
  vec3ClampMagnitude,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
} from './types';
import {
  type PhysicsCollider,
  blendColliderMaterial,
} from './colliders';
import {
  applyBodyForce,
  clearBodyAccumulators,
  createPhysicsBody,
  getBodyAabb,
  getBodyApproximateRadius,
  getBodyApproximateVolume,
  integrateBody,
  type PhysicsBody,
  type PhysicsBodyConfig,
} from './body';

export type PhysicsContact = {
  bodyAId: string;
  bodyBId: string;
  point: Vec3;
  normal: Vec3;
  penetration: number;
  relativeVelocityAlongNormal: number;
  supportHalfExtentX: number;
  supportHalfExtentZ: number;
  sensorOnly: boolean;
};

export type PhysicsStepResult = {
  deltaTime: number;
  substeps: number;
  bodyCount: number;
  activePairCount: number;
  contacts: PhysicsContact[];
};

type CandidatePair = {
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  aabbA: Aabb;
  aabbB: Aabb;
};

const POSITION_CORRECTION_PERCENT = 0.7;
const POSITION_CORRECTION_SLOP = 0.002;
const VELOCITY_SLEEP_THRESHOLD = 0.01;

const computePairContact = (
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
  aabbA: Aabb,
  aabbB: Aabb,
): PhysicsContact | null => {
  const overlapX = Math.min(aabbA.max[0], aabbB.max[0]) - Math.max(aabbA.min[0], aabbB.min[0]);
  const overlapY = Math.min(aabbA.max[1], aabbB.max[1]) - Math.max(aabbA.min[1], aabbB.min[1]);
  const overlapZ = Math.min(aabbA.max[2], aabbB.max[2]) - Math.max(aabbA.min[2], aabbB.min[2]);

  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
    return null;
  }

  let penetration = overlapX;
  let normal: Vec3 = bodyA.position[0] < bodyB.position[0] ? [1, 0, 0] : [-1, 0, 0];

  if (overlapY < penetration) {
    penetration = overlapY;
    normal = bodyA.position[1] < bodyB.position[1] ? [0, 1, 0] : [0, -1, 0];
  }

  if (overlapZ < penetration) {
    penetration = overlapZ;
    normal = bodyA.position[2] < bodyB.position[2] ? [0, 0, 1] : [0, 0, -1];
  }

  const contactPoint: Vec3 = [
    (Math.max(aabbA.min[0], aabbB.min[0]) + Math.min(aabbA.max[0], aabbB.max[0])) * 0.5,
    (Math.max(aabbA.min[1], aabbB.min[1]) + Math.min(aabbA.max[1], aabbB.max[1])) * 0.5,
    (Math.max(aabbA.min[2], aabbB.min[2]) + Math.min(aabbA.max[2], aabbB.max[2])) * 0.5,
  ];
  const relativeVelocity = vec3Sub(bodyB.velocity, bodyA.velocity);
  const relativeVelocityAlongNormal = vec3Dot(relativeVelocity, normal);

  let sensorOnly = false;
  for (const colliderA of bodyA.colliders) {
    for (const colliderB of bodyB.colliders) {
      if (colliderA.isSensor || colliderB.isSensor) {
        sensorOnly = true;
      }
    }
  }

  return {
    bodyAId: bodyA.id,
    bodyBId: bodyB.id,
    point: contactPoint,
    normal,
    penetration,
    relativeVelocityAlongNormal,
    supportHalfExtentX: Math.max(0.001, overlapX * 0.5),
    supportHalfExtentZ: Math.max(0.001, overlapZ * 0.5),
    sensorOnly,
  };
};

const applySupportInstability = (
  contacts: PhysicsContact[],
  bodies: Map<string, PhysicsBody>,
  deltaTime: number,
): void => {
  for (const contact of contacts) {
    if (contact.sensorOnly) {
      continue;
    }

    const bodyA = bodies.get(contact.bodyAId);
    const bodyB = bodies.get(contact.bodyBId);
    if (!bodyA || !bodyB) {
      continue;
    }

    const processBody = (
      body: PhysicsBody,
      supportCenterX: number,
      supportCenterZ: number,
      supportHalfExtentX: number,
      supportHalfExtentZ: number,
    ): void => {
      if (body.mode !== 'dynamic') {
        return;
      }

      const dx = body.position[0] - supportCenterX;
      const dz = body.position[2] - supportCenterZ;
      const marginX = supportHalfExtentX * 0.9;
      const marginZ = supportHalfExtentZ * 0.9;
      const overflowX = Math.max(0, Math.abs(dx) - marginX);
      const overflowZ = Math.max(0, Math.abs(dz) - marginZ);
      if (overflowX <= 0 && overflowZ <= 0) {
        return;
      }

      const horizontal = vec3Normalize([dx, 0, dz]);
      const instability = Math.min(1, (overflowX + overflowZ) * 1.75);
      const accel = 5.5 * instability;
      body.velocity = vec3Add(body.velocity, vec3Scale(horizontal, accel * deltaTime));
      body.isSleeping = false;
    };

    if (contact.normal[1] < -0.5) {
      processBody(
        bodyA,
        contact.point[0],
        contact.point[2],
        contact.supportHalfExtentX,
        contact.supportHalfExtentZ,
      );
    }

    if (contact.normal[1] > 0.5) {
      processBody(
        bodyB,
        contact.point[0],
        contact.point[2],
        contact.supportHalfExtentX,
        contact.supportHalfExtentZ,
      );
    }
  }
};

const resolveContactVelocity = (
  contact: PhysicsContact,
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
): void => {
  if (contact.sensorOnly) {
    return;
  }
  if (bodyA.inverseMass + bodyB.inverseMass <= 0) {
    return;
  }

  const pairMaterial = blendBodyMaterial(bodyA.colliders, bodyB.colliders);
  const restitution = Math.max(bodyA.restitution, bodyB.restitution, pairMaterial.restitution);
  const friction = Math.max(
    0,
    Math.min(1, Math.sqrt(Math.max(0, bodyA.friction * bodyB.friction * pairMaterial.friction))),
  );

  const relativeVelocity = vec3Sub(bodyB.velocity, bodyA.velocity);
  const velocityAlongNormal = vec3Dot(relativeVelocity, contact.normal);
  if (velocityAlongNormal > 0) {
    return;
  }

  const impulseScalar =
    (-(1 + restitution) * velocityAlongNormal) /
    Math.max(1e-6, bodyA.inverseMass + bodyB.inverseMass);
  const impulse = vec3Scale(contact.normal, impulseScalar);

  if (bodyA.mode === 'dynamic') {
    bodyA.velocity = vec3Sub(bodyA.velocity, vec3Scale(impulse, bodyA.inverseMass));
  }
  if (bodyB.mode === 'dynamic') {
    bodyB.velocity = vec3Add(bodyB.velocity, vec3Scale(impulse, bodyB.inverseMass));
  }

  const postRelativeVelocity = vec3Sub(bodyB.velocity, bodyA.velocity);
  const normalProjection = vec3Scale(contact.normal, vec3Dot(postRelativeVelocity, contact.normal));
  const tangentRaw = vec3Sub(postRelativeVelocity, normalProjection);
  const tangent = vec3Normalize(tangentRaw);

  const tangentImpulseScalar =
    -vec3Dot(postRelativeVelocity, tangent) /
    Math.max(1e-6, bodyA.inverseMass + bodyB.inverseMass);
  const maxFrictionImpulse = impulseScalar * friction;
  const frictionImpulseScalar = Math.max(
    -maxFrictionImpulse,
    Math.min(maxFrictionImpulse, tangentImpulseScalar),
  );

  const frictionImpulse = vec3Scale(tangent, frictionImpulseScalar);
  if (bodyA.mode === 'dynamic') {
    bodyA.velocity = vec3Sub(bodyA.velocity, vec3Scale(frictionImpulse, bodyA.inverseMass));
  }
  if (bodyB.mode === 'dynamic') {
    bodyB.velocity = vec3Add(bodyB.velocity, vec3Scale(frictionImpulse, bodyB.inverseMass));
  }
};

const resolveContactPosition = (
  contact: PhysicsContact,
  bodyA: PhysicsBody,
  bodyB: PhysicsBody,
): void => {
  if (contact.sensorOnly) {
    return;
  }
  const inverseMassSum = bodyA.inverseMass + bodyB.inverseMass;
  if (inverseMassSum <= 0) {
    return;
  }

  const correctionMagnitude =
    (Math.max(contact.penetration - POSITION_CORRECTION_SLOP, 0) * POSITION_CORRECTION_PERCENT) /
    inverseMassSum;
  const correction = vec3Scale(contact.normal, correctionMagnitude);

  if (bodyA.mode === 'dynamic') {
    bodyA.position = vec3Sub(bodyA.position, vec3Scale(correction, bodyA.inverseMass));
  }
  if (bodyB.mode === 'dynamic') {
    bodyB.position = vec3Add(bodyB.position, vec3Scale(correction, bodyB.inverseMass));
  }
};

const blendBodyMaterial = (
  collidersA: PhysicsCollider[],
  collidersB: PhysicsCollider[],
) => {
  let blended = blendColliderMaterial(collidersA[0].material, collidersB[0].material);
  for (const colliderA of collidersA) {
    for (const colliderB of collidersB) {
      blended = blendColliderMaterial(blended, blendColliderMaterial(colliderA.material, colliderB.material));
    }
  }
  return blended;
};

export class PhysicsSolver {
  private readonly bodies = new Map<string, PhysicsBody>();
  private settings: PhysicsWorldSettings;

  constructor(settings?: Partial<PhysicsWorldSettings>) {
    this.settings = {
      ...createDefaultPhysicsWorldSettings(),
      ...(settings ?? {}),
      liquid: {
        ...createDefaultPhysicsWorldSettings().liquid,
        ...(settings?.liquid ?? {}),
      },
    };
  }

  addBody(bodyConfig: PhysicsBody | PhysicsBodyConfig): PhysicsBody {
    const body = isPhysicsBody(bodyConfig) ? bodyConfig : createPhysicsBody(bodyConfig);
    this.bodies.set(body.id, body);
    return body;
  }

  removeBody(bodyId: string): boolean {
    return this.bodies.delete(bodyId);
  }

  clearBodies(): void {
    this.bodies.clear();
  }

  getBody(bodyId: string): PhysicsBody | null {
    return this.bodies.get(bodyId) ?? null;
  }

  listBodies(): PhysicsBody[] {
    return [...this.bodies.values()];
  }

  getSettings(): PhysicsWorldSettings {
    return this.settings;
  }

  updateSettings(settings: Partial<PhysicsWorldSettings>): PhysicsWorldSettings {
    this.settings = {
      ...this.settings,
      ...settings,
      liquid: {
        ...this.settings.liquid,
        ...(settings.liquid ?? {}),
      },
    };
    return this.settings;
  }

  step(deltaTime: number): PhysicsStepResult {
    if (deltaTime <= 0) {
      return {
        deltaTime,
        substeps: 0,
        bodyCount: this.bodies.size,
        activePairCount: 0,
        contacts: [],
      };
    }

    const substeps = Math.max(1, Math.floor(this.settings.substeps));
    const dt = deltaTime / substeps;
    let activePairCount = 0;
    const contacts: PhysicsContact[] = [];

    for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
      this.applyGlobalForces(dt);
      for (const body of this.bodies.values()) {
        integrateBody(body, dt);
      }

      const pairs = this.collectBroadphasePairs();
      activePairCount += pairs.length;
      const stepContacts = this.generateContacts(pairs);
      contacts.push(...stepContacts);
      const contactingBodyIds = new Set<string>();
      for (const contact of stepContacts) {
        if (contact.sensorOnly) {
          continue;
        }
        contactingBodyIds.add(contact.bodyAId);
        contactingBodyIds.add(contact.bodyBId);
      }

      for (let iteration = 0; iteration < this.settings.solverIterations; iteration += 1) {
        for (const contact of stepContacts) {
          const bodyA = this.bodies.get(contact.bodyAId);
          const bodyB = this.bodies.get(contact.bodyBId);
          if (!bodyA || !bodyB) {
            continue;
          }
          resolveContactVelocity(contact, bodyA, bodyB);
        }
      }

      for (let iteration = 0; iteration < this.settings.positionIterations; iteration += 1) {
        for (const contact of stepContacts) {
          const bodyA = this.bodies.get(contact.bodyAId);
          const bodyB = this.bodies.get(contact.bodyBId);
          if (!bodyA || !bodyB) {
            continue;
          }
          resolveContactPosition(contact, bodyA, bodyB);
        }
      }

      applySupportInstability(stepContacts, this.bodies, dt);

      this.updateSleepState(contactingBodyIds);
    }

    return {
      deltaTime,
      substeps,
      bodyCount: this.bodies.size,
      activePairCount,
      contacts,
    };
  }

  private applyGlobalForces(deltaTime: number): void {
    const gravity = this.settings.gravity;
    const airDrag = Math.max(0, this.settings.airDrag);

    for (const body of this.bodies.values()) {
      if (body.mode !== 'dynamic') {
        clearBodyAccumulators(body);
        continue;
      }

      if (body.isSleeping) {
        continue;
      }

      applyBodyForce(body, vec3Scale(gravity, body.mass));

      const dragForce = vec3Scale(body.velocity, -airDrag * body.mass);
      applyBodyForce(body, dragForce);

      if (this.settings.liquid.enabled) {
        this.applyLiquidForces(body, deltaTime);
      }
    }
  }

  private applyLiquidForces(body: PhysicsBody, deltaTime: number): void {
    const liquid = this.settings.liquid;
    const radius = getBodyApproximateRadius(body);
    const volume = getBodyApproximateVolume(body);

    const bodyTop = body.position[1] + radius;
    const bodyBottom = body.position[1] - radius;
    const fluidTop = liquid.fluidLevel + Math.max(0, liquid.surfaceThickness);
    const depthSpan = Math.max(1e-5, bodyTop - bodyBottom);
    const overlap = clamp01((fluidTop - bodyBottom) / depthSpan);

    if (overlap <= 0) {
      return;
    }

    const gravityDirection = vec3Normalize(vec3Scale(this.settings.gravity, -1));
    const gravityMagnitude = Math.max(0, vec3Length(this.settings.gravity));
    const buoyancyMagnitude = liquid.density * volume * gravityMagnitude * overlap;
    const buoyancy = vec3Scale(gravityDirection, buoyancyMagnitude);
    applyBodyForce(body, buoyancy);

    const flowJitter: Vec3 = [
      Math.sin(body.position[1] * 0.73 + body.position[2] * 0.41) * liquid.turbulence,
      Math.cos(body.position[0] * 0.66 + body.position[2] * 0.28) * liquid.turbulence * 0.35,
      Math.sin(body.position[0] * 0.37 + body.position[1] * 0.22) * liquid.turbulence,
    ];
    const effectiveFlow = vec3Add(liquid.flowVelocity, flowJitter);
    const relativeVelocity = vec3Sub(body.velocity, effectiveFlow);
    const viscousFactor = Math.max(0, liquid.linearDrag * (1 + liquid.viscosity * 0.65));
    const fluidDrag = vec3Scale(relativeVelocity, -viscousFactor * overlap * body.mass);
    applyBodyForce(body, fluidDrag);

    const angularDragFactor = Math.max(0, 1 - liquid.angularDrag * overlap * deltaTime);
    body.angularVelocity = vec3Scale(body.angularVelocity, angularDragFactor);
    body.velocity = vec3ClampMagnitude(body.velocity, 180);
  }

  private collectBroadphasePairs(): CandidatePair[] {
    const bodies = [...this.bodies.values()];
    const pairs: CandidatePair[] = [];

    for (let i = 0; i < bodies.length; i += 1) {
      const bodyA = bodies[i];
      const aabbA = getBodyAabb(bodyA);
      for (let j = i + 1; j < bodies.length; j += 1) {
        const bodyB = bodies[j];
        if (bodyA.mode !== 'dynamic' && bodyB.mode !== 'dynamic') {
          continue;
        }
        const aabbB = getBodyAabb(bodyB);
        if (!aabbOverlaps(aabbA, aabbB)) {
          continue;
        }
        pairs.push({
          bodyA,
          bodyB,
          aabbA,
          aabbB,
        });
      }
    }

    return pairs;
  }

  private generateContacts(pairs: CandidatePair[]): PhysicsContact[] {
    const contacts: PhysicsContact[] = [];
    for (const pair of pairs) {
      const contact = computePairContact(pair.bodyA, pair.bodyB, pair.aabbA, pair.aabbB);
      if (!contact) {
        continue;
      }
      contacts.push(contact);
    }
    return contacts;
  }

  private updateSleepState(contactingBodyIds: Set<string>): void {
    for (const body of this.bodies.values()) {
      if (body.mode !== 'dynamic') {
        body.isSleeping = false;
        continue;
      }
      const hasContact = contactingBodyIds.has(body.id);
      if (!hasContact) {
        body.isSleeping = false;
        continue;
      }
      const speed = vec3Length(body.velocity) + vec3Length(body.angularVelocity) * 0.25;
      body.isSleeping = speed < VELOCITY_SLEEP_THRESHOLD;
      if (body.isSleeping) {
        body.velocity = [0, 0, 0];
        body.angularVelocity = [0, 0, 0];
      }
    }
  }
}

const isPhysicsBody = (value: PhysicsBody | PhysicsBodyConfig): value is PhysicsBody => {
  return (value as PhysicsBody).inverseMass !== undefined;
};
