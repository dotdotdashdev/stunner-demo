export type RigInstanceState = {
  animationTimeSeconds: number;
  playbackSpeed: number;
  clipIndex: number;
  skeletonPaletteOffset: number;
  skeletonJointCount: number;
  _pad0?: number;
  _pad1?: number;
  _pad2?: number;
};

export const RIG_INSTANCE_STATE_FLOAT_COUNT = 8;

export const createRigInstanceStateLayout = (
  shaderLocation: number = 11,
): GPUVertexBufferLayout => {
  return {
    arrayStride: RIG_INSTANCE_STATE_FLOAT_COUNT * 4,
    stepMode: 'instance',
    attributes: [
      {
        shaderLocation,
        offset: 0,
        format: 'float32x4',
      },
      {
        shaderLocation: shaderLocation + 1,
        offset: 16,
        format: 'float32x4',
      },
    ],
  };
};

export const packRigInstanceStates = (states: RigInstanceState[]): Float32Array => {
  const packed = new Float32Array(states.length * RIG_INSTANCE_STATE_FLOAT_COUNT);
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index];
    const base = index * RIG_INSTANCE_STATE_FLOAT_COUNT;
    packed[base + 0] = state.animationTimeSeconds;
    packed[base + 1] = state.playbackSpeed;
    packed[base + 2] = state.clipIndex;
    packed[base + 3] = state.skeletonPaletteOffset;
    packed[base + 4] = state.skeletonJointCount;
    packed[base + 5] = state._pad0 ?? 0;
    packed[base + 6] = state._pad1 ?? 0;
    packed[base + 7] = state._pad2 ?? 0;
  }
  return packed;
};
