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

## Draco Example Notes

- The Draco example exposes an animation speed control in the example parameters HUD (`0..2`).
- Recent WebGPU black-model regressions were traced to unsafe shader normalization on degenerate normal/tangent inputs.
	The active fix is in the core WebGPU scene shaders, not a permanent Draco material override.

## USD Example

- Loads any of several USDZ assets from `public/models/usd/` (Porsche 911,
	Train, three Procedural City variants, World of Metal) via the optional
	`@stunner/usd` addon and applies the resulting `RenderScene`.
- Switch models from the example parameters HUD; the prior model's
	USDZ-internal texture blob URLs are revoked once the new scene is live.
- Assets without authored `UsdLux` lights fall back to the renderer's
	default directional key for visibility.
- Per-backend settings live in `public/settings/usd.webgpu.json` and
	`usd.webgl2.json`.
- See `packages/stunner-core/documentation/usd-package.md` (in the sibling
	`stunner` repo) for the supported USD subset and the WebGPU vs WebGL2
	limitations matrix.

## Local Library Iteration

This demo is configured to resolve `@stunner/core` and `@stunner/react` from the sibling repository at `../stunner/packages/*/src` when the `STUNNER_SOURCE` environment variable is set to `local`.

That means when you edit source in the `stunner` repo, Vite in `stunner-demo` picks those changes up directly.

Expected folder layout:

```text
<parent>
	stunner/
	stunner-demo/
```

You can switch between local and installed library sources using :

- `local` (default): use sibling `../stunner/packages/*`
- `installed`: use `node_modules/stunner/packages/*`
