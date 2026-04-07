# Transparent Materials And Refraction

Agent target: configure physically plausible glass-like surfaces using the existing WebGPU material pipeline.

## Source of truth

- `src/stunner/renderer/mesh/MaterialTypes.ts`
- `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Material fields (PBR)

Use these `PbrMaterial` fields for transparent dielectric behavior:

- `transparent`: enables transparent pass routing and blend path.
- `baseColor.a`: controls opacity. Lower alpha increases transmission.
- `refractionStrength`: scales transmission/refraction contribution.
- `ior`: index of refraction, used for dielectric Fresnel/transmission split.
- `refractionSteps`: max steps used by screen-space background search.
- `refractionDepthBias`: depth acceptance tolerance for refracted background hits.

## Pipeline behavior notes

- Transparent meshes are rendered in the transparent scene pipeline and sorted back-to-front.
- Transparent color is alpha-blended, but `normal` and `matBuf` are written without blend in transparent passes so composite sees full per-surface transmission/refraction state.
- Transmission/refraction metadata is packed into scene G-buffer targets (`normal` and `matBuf`).
- Composite SSR/refraction decisions read transmission/roughness/metallic/IOR data from G-buffer fields; clear-coat parameters are not read directly in composite.
- Final composite applies dielectric reflection + refraction mixing:
  - Reflection uses SSR/probe blending and Fresnel weighting.
  - Refraction warps scene color behind the surface using screen-space marching.
  - Dielectric SSR uses confidence from SSR pass plus a small glass floor to avoid disappearing highlights on low-confidence transparent hits.
  - When refraction march cannot confidently find background, composite falls back to transmitted scene color to avoid dark-tinted glass.
- Transparent meshes are skipped by shadow-map casting passes.

## Practical tuning guidance

- Start glass with:
  - `transparent: true`
  - `baseColor.a` in `0.08 - 0.2`
  - `roughness` in `0.01 - 0.08`
  - `ior` in `1.45 - 1.6`
  - `refractionStrength` in `1.0 - 1.4`
- Increase `refractionSteps` when background detail pops or breaks on curved surfaces.
- Increase `refractionDepthBias` slightly if refraction misses the expected background.
- Enable SSR (`enabled`, `experimentalEnabled`, `stage >= 1`) for stronger scene-driven reflections.

## Troubleshooting notes (current engine behavior)

- If glass has weak reflections even with SSR enabled:
  - Keep transparent-glass clear-coat at `0` unless you explicitly want that look.
  - Increasing `metallic` toward `1` can noticeably increase visible SSR contribution for this art-directed glass path.
- If glass looks too dark:
  - Lower `roughness` and/or `metallic`, or raise `baseColor.a` transmission.
  - Verify `refractionDepthBias` is not excessively high for the scene scale.
