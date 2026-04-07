import { loadGltfSceneFromUrl } from '../stunner/renderer/mesh/GltfLoader';
import type { RenderScene } from '../stunner/renderer/mesh/SceneTypes';

const SPONZA_MODEL_URL = '/models/sponza/Sponza.gltf';
const DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG = -8;
const DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG = 33;
const DEFAULT_DIRECTIONAL_LIGHT_INTENSITY = 15;
const DEFAULT_DIRECTIONAL_LIGHT_SOURCE_SIZE = 0.1;

export type SponzaExampleOptions = {
  directionalLightAzimuthDeg: number;
  directionalLightElevationDeg: number;
  directionalLightIntensity: number;
  directionalLightSourceSize: number;
};

export const DEFAULT_SPONZA_OPTIONS: SponzaExampleOptions = {
  directionalLightAzimuthDeg: DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG,
  directionalLightElevationDeg: DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG,
  directionalLightIntensity: DEFAULT_DIRECTIONAL_LIGHT_INTENSITY,
  directionalLightSourceSize: DEFAULT_DIRECTIONAL_LIGHT_SOURCE_SIZE,
};

const directionFromAnglesDeg = (
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] => {
  const azimuthRadians = (azimuthDeg * Math.PI) / 180;
  const elevationRadians = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevationRadians);
  return [
    Math.cos(azimuthRadians) * horizontal,
    Math.sin(elevationRadians),
    Math.sin(azimuthRadians) * horizontal,
  ];
};

const sanitizeSponzaOptions = (
  candidate?: Partial<SponzaExampleOptions>,
): SponzaExampleOptions => {
  return {
    directionalLightAzimuthDeg: Math.max(
      -180,
      Math.min(180, candidate?.directionalLightAzimuthDeg ?? DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG),
    ),
    directionalLightElevationDeg: Math.max(
      -89,
      Math.min(89, candidate?.directionalLightElevationDeg ?? DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG),
    ),
    directionalLightIntensity: Math.max(
      0,
      Math.min(20, candidate?.directionalLightIntensity ?? DEFAULT_DIRECTIONAL_LIGHT_INTENSITY),
    ),
    directionalLightSourceSize: Math.max(
      0,
      Math.min(1, candidate?.directionalLightSourceSize ?? DEFAULT_DIRECTIONAL_LIGHT_SOURCE_SIZE),
    ),
  };
};

export type SponzaExampleController = {
  setOptions: (options: SponzaExampleOptions) => void;
  dispose: () => void;
};

export const startSponzaExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<SponzaExampleOptions>,
): SponzaExampleController => {
  let disposed = false;
  let loadedDispose: (() => void) | null = null;
  let sceneRef: RenderScene | null = null;
  let options = sanitizeSponzaOptions(initialOptions);

  const applyDirectionalLight = (): void => {
    if (!sceneRef) {
      return;
    }
    const direction = directionFromAnglesDeg(
      options.directionalLightAzimuthDeg,
      options.directionalLightElevationDeg,
    );
    sceneRef.keyLightDirection = direction;
    sceneRef.directionalLightingIntensity = options.directionalLightIntensity;
    sceneRef.keyLightSourceSize = options.directionalLightSourceSize;
    const directionalLight = sceneRef.lights.find((light) => light.type === 'directional');
    if (directionalLight && directionalLight.type === 'directional') {
      directionalLight.direction = [-direction[0], -direction[1], -direction[2]];
      directionalLight.intensity = options.directionalLightIntensity;
    }
  };

  void loadGltfSceneFromUrl(SPONZA_MODEL_URL)
    .then((result) => {
      if (disposed) {
        result.dispose();
        return;
      }

      loadedDispose = result.dispose;
      const direction = directionFromAnglesDeg(
        options.directionalLightAzimuthDeg,
        options.directionalLightElevationDeg,
      );
      sceneRef = {
        meshes: result.meshes,
        textureLibrary: result.textureLibrary,
        directionalLightingEnabled: true,
        directionalLightingIntensity: options.directionalLightIntensity,
        keyLightDirection: direction,
        keyLightSourceSize: options.directionalLightSourceSize,
        lights: [
          {
            id: 1,
            type: 'directional',
            direction: [-direction[0], -direction[1], -direction[2]],
            color: [1.0, 0.98, 0.95],
            intensity: options.directionalLightIntensity,
            castsShadows: true,
            shadowIndex: 0,
          },
        ],
      };
      applyScene(sceneRef);
    })
    .catch((error: unknown) => {
      console.warn('Sponza example failed to load.', error);
    });

  return {
    setOptions: (nextOptions) => {
      options = sanitizeSponzaOptions(nextOptions);
      applyDirectionalLight();
      if (sceneRef) {
        applyScene(sceneRef);
      }
    },
    dispose: () => {
      disposed = true;
      if (loadedDispose) {
        loadedDispose();
        loadedDispose = null;
      }
      sceneRef = null;
    },
  };
};
