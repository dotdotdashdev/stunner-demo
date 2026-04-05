# Stunner Context Brief

This document is a quick-start brief for coding agents working in this repository.

## Engine Role

Stunner is a highly optimized cinematic renderer for the web.

It is not a full game engine. It can be used as:

- the rendering subsystem of a larger game engine;
- a standalone renderer for interactive or cinematic web experiences;
- the rendering layer in a game-like web application.

## Read Documentation First

Before implementing features, review the docs in `documentation/` to understand the renderer architecture, constraints, and tuning model.

At minimum, inspect docs related to the feature you are adding (for example clustered lighting, post-processing passes, shadows, quality controls, and runtime controls).

## Feature Implementation Strategy

When users request new features, prioritize techniques that align with the engine's optimization model.

Example: if users request many objects with different material variants, avoid one-draw-per-object approaches. Prefer batch-friendly paths such as:

- instanced drawing;
- material libraries / indexed material tables;
- shared geometry and texture-array workflows;
- minimizing pipeline switches and per-draw CPU overhead.

## Extreme Customization Policy

For aggressive visual customization, do not modify core engine pipeline structure by default.

Prefer shader replacement via `WebGpuPostGraphShaderOverrides` (passed through renderer options) so custom WGSL can replace stage shaders while preserving pipeline stability.

Recommended workflow:

1. Locate the default shader in `WebGpuPostGraph.ts`.
2. Copy the full default shader source for the target pass.
3. Inject only the required custom logic.
4. Provide the modified shader through overrides.
5. Keep bindings, entry points, and expected data contracts compatible unless explicitly adding a supported engine feature.

Important limits:

- radical uniform-buffer layout changes may break compatibility;
- radical instanced attribute layout changes may break compatibility;
- large binding-layout changes may require engine feature work.

If a request requires those kinds of structural changes, recommend implementing a formal engine feature rather than a risky ad-hoc override.

## Code Formatting Rules

These rules define the preferred JavaScript/TypeScript style for this project.

### Function Style

- Use arrow-function `const` declarations for functions.
- Avoid `function` declarations.

```ts
const formatSocketState = (socketState: SocketState): string => {
  if (socketState === 'open') {
    return 'Connected';
  }
  if (socketState === 'connecting') {
    return 'Connecting';
  }
  if (socketState === 'closed') {
    return 'Closed';
  }
  return 'Error';
};
```

### Braces

- Always use curly braces for `if`, `else`, `for`, `while`, and other control blocks.
- Never use single-line bodies without braces.

```ts
if (isReady) {
  start();
}
```

### Semicolons

- End statements with semicolons.

```ts
const retries = 3;
const connected = true;
```

### ESLint Enforcement

These preferences are enforced by ESLint with:

- `curly: ['error', 'all']`
- `semi: ['error', 'always']`
- `func-style: ['error', 'expression', { allowArrowFunctions: true }]`
