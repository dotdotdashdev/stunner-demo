# Stunner Engine

Stunner is a highly optimized cinematic renderer for the web.

It is not a full game engine, but it can be used as the rendering subsystem for a game engine or standalone game-like experience.

![stunner](https://github.com/user-attachments/assets/09005c31-2ff0-429f-b32c-46ff0eca74d4)
![stunner1](https://github.com/user-attachments/assets/32da0866-0029-40fe-8948-e16ea52c9309)
![stunner2](https://github.com/user-attachments/assets/9cf7fe86-ab55-4be3-99b7-ebf15a9800a5)
![stunner3](https://github.com/user-attachments/assets/d44c0a64-009e-48c6-9fb8-5d695aa5812d)
![stunner4](https://github.com/user-attachments/assets/ca662c81-5bd2-4e1e-ba69-2e8256303fa2)

## Important Usage Note

This codebase is intentionally optimized and complex. It is designed to be used effectively by coding agents operating with project context and architecture guidance.

If you are a coding agent, read the Stunner library context first:

https://github.com/dotdotdashdev/stunner/blob/main/packages/stunner-core/documentation/context.md

## Library Dependency Source

This repository is the demo application and consumes Stunner from GitHub.

- Library repo: https://github.com/dotdotdashdev/stunner
- NPM dependency source: `stunner` from the GitHub URL in `package.json`

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Production build:

```bash
npm run build
```

## Local Library Iteration

This demo is configured to resolve `@stunner/core` and `@stunner/react` from the sibling repository at `../stunner/packages/*/src`.

That means when you edit source in the `stunner` repo, Vite in `stunner-demo` picks those changes up directly.

Expected folder layout:

```text
<parent>
	stunner/
	stunner-demo/
```

You can switch between local and installed library sources using the `STUNNER_SOURCE` environment variable:

- `local` (default): use sibling `../stunner/packages/*`
- `installed`: use `node_modules/stunner/packages/*`

Examples:

```bash
STUNNER_SOURCE=local npm run dev
```

```bash
STUNNER_SOURCE=installed npm run dev
```

Convenience scripts:

```bash
npm run dev:local
```

```bash
npm run dev:installed
```

In VS Code Run and Debug, use one of these launch configs:

- `stunner-demo: Vite + Chrome (Local stunner)`
- `stunner-demo: Vite + Chrome (Installed stunner)`
