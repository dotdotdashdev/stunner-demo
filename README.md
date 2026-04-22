# Stunner Engine

Stunner is a highly optimized cinematic renderer for the web.

It is not a full game engine, but it can be used as the rendering subsystem for a game engine or standalone game-like experience.

<img width="1280" height="720" alt="stunner0" src="https://github.com/user-attachments/assets/40ea140e-c3cd-47a2-a348-f3f34557dea2" />
<img width="1280" height="720" alt="stunner1" src="https://github.com/user-attachments/assets/5dbc8d50-2e74-4942-a4e3-447153f2d741" />
<img width="1280" height="720" alt="stunner2" src="https://github.com/user-attachments/assets/7c64cc28-3403-4583-a64a-db444bf4e4ff" />
<img width="1280" height="720" alt="stunner3" src="https://github.com/user-attachments/assets/06773ebe-335a-4ef1-a6a1-7b5c65ce9999" />
<img width="1280" height="720" alt="stunner4" src="https://github.com/user-attachments/assets/5856d8d3-cc67-45bf-9e66-19a6d26b5f4c" />
<img width="1280" height="720" alt="stunner5" src="https://github.com/user-attachments/assets/0d145544-48aa-408c-b167-5a97d37ead9c" />
<img width="1280" height="720" alt="stunner6" src="https://github.com/user-attachments/assets/46f592ed-0e92-4859-bd06-68bde4b644ca" />
<img width="1280" height="720" alt="stunner7" src="https://github.com/user-attachments/assets/c6d4b73c-03a7-4526-96d5-2738e5dacb6f" />
<img width="1280" height="720" alt="stunner8" src="https://github.com/user-attachments/assets/e695ecfc-9119-4cc2-bda7-4d1e489c1e6e" />
<img width="1280" height="720" alt="stunner9" src="https://github.com/user-attachments/assets/5d26463f-0343-49a5-8593-eadf7d8916f7" />


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
- Per-example settings live in `public/settings/<example>.json`.
- See `packages/stunner-core/documentation/usd-package.md` (in the sibling
	`stunner` repo) for the supported USD subset.

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
