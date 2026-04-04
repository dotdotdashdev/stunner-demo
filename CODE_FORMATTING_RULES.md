# Code Formatting Rules

These rules define the preferred JavaScript/TypeScript style for this project.

## Function Style

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

## Braces

- Always use curly braces for `if`, `else`, `for`, `while`, and other control blocks.
- Never use single-line bodies without braces.

```ts
if (isReady) {
  start();
}
```

## Semicolons

- End statements with semicolons.

```ts
const retries = 3;
const connected = true;
```

## ESLint Enforcement

These preferences are enforced by ESLint with:

- `curly: ['error', 'all']`
- `semi: ['error', 'always']`
- `func-style: ['error', 'expression', { allowArrowFunctions: true }]`
