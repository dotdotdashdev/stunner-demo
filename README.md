# Stunner Engine

Stunner is a highly optimized cinematic renderer for the web.

It is not a full game engine, but it can be used as the rendering subsystem for a game engine or standalone game-like experience.

View the demo here: https://stunner.makethingsdostuff.com/

<img width="1280" height="720" alt="stunner0" src="https://github.com/user-attachments/assets/164d3e00-0d75-4a8d-9643-699871cc398c" />
<img width="1280" height="720" alt="stunner1" src="https://github.com/user-attachments/assets/40ea140e-c3cd-47a2-a348-f3f34557dea2" />
<img width="1280" height="720" alt="stunner2" src="https://github.com/user-attachments/assets/5dbc8d50-2e74-4942-a4e3-447153f2d741" />
<img width="1280" height="720" alt="stunner3" src="https://github.com/user-attachments/assets/7c64cc28-3403-4583-a64a-db444bf4e4ff" />
<img width="1280" height="720" alt="stunner4" src="https://github.com/user-attachments/assets/06773ebe-335a-4ef1-a6a1-7b5c65ce9999" />
<img width="1280" height="720" alt="stunner5" src="https://github.com/user-attachments/assets/5856d8d3-cc67-45bf-9e66-19a6d26b5f4c" />
<img width="1280" height="720" alt="stunner6" src="https://github.com/user-attachments/assets/0d145544-48aa-408c-b167-5a97d37ead9c" />
<img width="1280" height="720" alt="stunner7" src="https://github.com/user-attachments/assets/46f592ed-0e92-4859-bd06-68bde4b644ca" />
<img width="1280" height="720" alt="stunner8" src="https://github.com/user-attachments/assets/c6d4b73c-03a7-4526-96d5-2738e5dacb6f" />
<img width="1280" height="720" alt="stunner9" src="https://github.com/user-attachments/assets/e695ecfc-9119-4cc2-bda7-4d1e489c1e6e" />
<img width="1280" height="720" alt="stunner10" src="https://github.com/user-attachments/assets/7d31c56a-c071-4ea0-b502-0e6dc37664c9" />
<img width="1280" height="720" alt="stunner11" src="https://github.com/user-attachments/assets/9d30178c-567a-4157-bc58-7d7da716f6e9" />

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

## Spacecraft Example Asset (Git LFS)

The Spacecraft example loads a large GLB model from `public/models/spacecraft/landscape.glb`. That asset is stored with Git LFS, so you may need to install and initialize LFS before the example can display correctly.

1. Install Git LFS if it is not already available:

```bash
# macOS
brew install git-lfs

# Windows (PowerShell)
winget install GitHub.GitLFS

# Linux (Debian/Ubuntu)
sudo apt install git-lfs
```

2. Initialize Git LFS once in this repository:

```bash
git lfs install
```

3. Pull the actual large files after cloning or when updating the repository:

```bash
git lfs pull
```

If the model still does not appear, confirm that `public/models/spacecraft/landscape.glb` exists locally and restart the dev server.

## Draco Example Notes

- The Draco example exposes an animation speed control in the example parameters HUD (`0..2`).
- Recent WebGPU black-model regressions were traced to unsafe shader normalization on degenerate normal/tangent inputs.
	The active fix is in the core WebGPU scene shaders, not a permanent Draco material override.

## USD Example

- Loads any of several USDZ assets from `public/models/usd/` (Porsche 911,
	Train, three Procedural City variants) via the optional
	`@dotdotdash/stunner-usd` addon and applies the resulting `RenderScene`.
- Switch models from the example parameters HUD; the prior model's
	USDZ-internal texture blob URLs are revoked once the new scene is live.
- Assets without authored `UsdLux` lights fall back to the renderer's
	default directional key for visibility.
- Per-example settings live in `public/settings/<example>.json`.
- See `packages/stunner-core/documentation/usd-package.md` (in the sibling
	`stunner` repo) for the supported USD subset.

## Local Library Iteration

This demo is configured to resolve `@dotdotdash/stunner-core` and `@dotdotdash/stunner-react` from the sibling repository at `../stunner/packages/*/src` when the `STUNNER_SOURCE` environment variable is set to `local`.

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

## Static Deploy (S3 + CloudFront)

This app produces a static `dist/` bundle and can be hosted from an S3 bucket behind CloudFront.

1. Build using the installed library source (recommended for CI/deploy):

```powershell
$env:STUNNER_SOURCE = 'installed'
npm run build
```

2. Upload the `dist/` output to S3:

```powershell
aws s3 sync dist/ s3://<your-bucket-name>/ --delete
```

3. Configure CloudFront:

- Default root object: `index.html`
- SPA fallback: route 403/404 errors to `/index.html` (HTTP 200)
- Enable compression

4. Set cache policy (recommended):

- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- `assets/*` and other hashed static files: `Cache-Control: public, max-age=31536000, immutable`

If you use AWS CLI for cache headers, upload HTML and hashed assets separately so they can use different cache settings.
