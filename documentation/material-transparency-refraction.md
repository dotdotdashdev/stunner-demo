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
- Transmission/refraction metadata is packed into scene G-buffer targets (`normal` and `matBuf`).
- Final composite applies dielectric reflection + refraction mixing:
  - Reflection uses SSR/probe blending and Fresnel weighting.
  - Refraction warps scene color behind the surface using screen-space marching.
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
