import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { mountDesertUi, timeOfDayFromSunElevation, tucsonSolarPosition } from './uiOverlay.js';
import { mulberry32, rngRange } from './random.js';
import { buildSky } from './sky.js';
import { generateRock } from './rocks.js';
import { generateSaguaro } from './plants/saguaro.js';
import { generateBarrelCactus } from './plants/barrelCactus.js';
import { generateJumpingCholla } from './plants/jumpingCholla.js';
import { generatePaloVerde } from './plants/paloVerde.js';
import { generateMesquite } from './plants/mesquite.js';
import { generatePricklyPear } from './plants/pricklyPear.js';
import { generateOcotillo } from './plants/ocotillo.js';
import { generateCreosote } from './plants/creosote.js';
import { createCactusSpineMaterial } from './materials/cactusSpineMaterial.js';
import { createCreosoteMaterial } from './materials/creosoteMaterial.js';
import { createOcotilloMaterial } from './materials/ocotilloMaterial.js';
import { createRockMaterial } from './materials/rockMaterial.js';
import { createTerrainMaterial } from './materials/terrainMaterial.js';
import { createTreeMaterial } from './materials/treeMaterial.js';
import { createSunLensFlare } from './lensFlare.js';
import { createProportionOracle } from './proportions.js';
import { createRainOverlay } from './rainOverlay.js';

// ---------- Renderer / scene boilerplate ----------
const app = document.getElementById('app');
const uiRoot = document.getElementById('ui-root');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe0b58f, 0.008);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(18, 9, 22);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 220;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 1.5, 0);
const rainOverlay = createRainOverlay(scene, camera);

const CAMERA_TERRAIN_CLEARANCE = 1.15;
const TARGET_TERRAIN_CLEARANCE = 0.2;
const CAMERA_COLLISION_RADIUS = 0.85;
const CAMERA_COLLIDER_CELL_SIZE = 12;
const CAMERA_COLLIDER_CONFIG = {
  paloVerde: { radiusScale: 0.62, minRadius: 0.45 },
  mesquite: { radiusScale: 0.62, minRadius: 0.45 },
  saguaro: { radiusScale: 0.78, minRadius: 0.35 },
  barrel: { radiusScale: 0.82, minRadius: 0.35 },
  jumpingCholla: { radiusScale: 0.88, minRadius: 0.45 },
  pricklyPear: { radiusScale: 0.82, minRadius: 0.35 },
  ocotillo: { radiusScale: 0.42, minRadius: 0.3 },
  boulders: { radiusScale: 0.95, minRadius: 0.35 },
};
const cameraColliders = [];
const cameraColliderGrid = new Map();
const nearbyColliderScratch = [];
const cameraConstraintDelta = new THREE.Vector3();
const cameraFallbackPush = new THREE.Vector3();
let cameraColliderMaxRadius = 0;

const plantLodLevels = [
  { name: 'near', distance: 45, detailScale: 1, castShadow: true },
  { name: 'mid', distance: 95, detailScale: 0.72, castShadow: false },
  { name: 'far', distance: Infinity, detailScale: 0.48, castShadow: false },
];

const TERRAIN_CULL_DISTANCE = 420;
const DEFAULT_SCATTER_CULL_CELL = { size: 80, minInstances: 64 };
const SCATTER_CULL_CELL = {
  paloVerde: { size: 120, minInstances: 96 },
  mesquite: { size: 120, minInstances: 96 },
  saguaro: { size: 96, minInstances: 64 },
  barrel: { size: 64, minInstances: 48 },
  jumpingCholla: { size: 80, minInstances: 48 },
  pricklyPear: { size: 64, minInstances: 48 },
  ocotillo: { size: 96, minInstances: 64 },
  creosote: { size: 56, minInstances: 48 },
  pebbles: { size: 48, minInstances: 48 },
  boulders: { size: 80, minInstances: 32 },
};
const SCATTER_CULL_DISTANCE = {
  paloVerde: 300,
  mesquite: 300,
  saguaro: 320,
  barrel: 210,
  jumpingCholla: 240,
  pricklyPear: 210,
  ocotillo: 240,
  creosote: 145,
  pebbles: 55,
  boulders: 260,
};
const DEFAULT_SCATTER_CULL_DISTANCE = 240;
const PLANT_INSPECTION_STAGE_KEYS = new Set([
  'paloVerde',
  'mesquite',
  'saguaro',
  'barrel',
  'jumpingCholla',
  'pricklyPear',
  'ocotillo',
  'creosote',
]);
const PLANT_INSPECTION_ANIMATION_SECONDS = 0.58;
const PLANT_INSPECTION_ROTATE_SPEED = 0.012;
const cullingProjectionMatrix = new THREE.Matrix4();
const cullingFrustum = new THREE.Frustum();
const VISIBILITY_CULL_INTERVAL_MS = 90;
const VISIBILITY_CULL_MOVE_EPSILON_SQ = 0.35 * 0.35;
const VISIBILITY_CULL_ROTATE_EPSILON = 0.0015;
const visibilityCullPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
const visibilityCullQuaternion = new THREE.Quaternion();
let visibilityCullDirty = true;
let lastVisibilityCullAt = -Infinity;
const SHADOW_UPDATE_TARGET_EPSILON_SQ = 3.5 * 3.5;
const shadowTargetPosition = new THREE.Vector3(Infinity, Infinity, Infinity);

// ---------- Keyboard flight controls ----------
const flightKeys = new Set();
const flightDirection = new THREE.Vector3();
const flightForward = new THREE.Vector3();
const flightRight = new THREE.Vector3();
const flightDelta = new THREE.Vector3();
const flightSpeed = 22;
let inspectedPlant = null;

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function setFlightKey(event, isPressed) {
  if (isTypingTarget(event.target)) return;

  switch (event.code) {
    case 'KeyW':
    case 'KeyS':
    case 'KeyA':
    case 'KeyD':
    case 'Space':
    case 'ShiftLeft':
    case 'ShiftRight':
      if (isPressed) {
        flightKeys.add(event.code);
      } else {
        flightKeys.delete(event.code);
      }
      break;
    default:
      return;
  }

  event.preventDefault();
}

function updateFlight(deltaSeconds) {
  if (inspectedPlant) return;

  const isShiftPressed = flightKeys.has('ShiftLeft') || flightKeys.has('ShiftRight');

  flightDirection.set(0, 0, 0);
  if (flightKeys.has('KeyW')) flightDirection[isShiftPressed ? 'y' : 'z'] += 1;
  if (flightKeys.has('KeyS')) flightDirection[isShiftPressed ? 'y' : 'z'] -= 1;
  if (flightKeys.has('Space')) flightDirection.y += isShiftPressed ? -1 : 1;
  if (flightKeys.has('KeyD')) flightDirection.x += 1;
  if (flightKeys.has('KeyA')) flightDirection.x -= 1;
  if (flightDirection.lengthSq() === 0) return;

  flightDirection.normalize();
  camera.getWorldDirection(flightForward);
  flightRight.crossVectors(flightForward, camera.up).normalize();

  flightDelta
    .copy(flightForward)
    .multiplyScalar(flightDirection.z)
    .addScaledVector(flightRight, flightDirection.x)
    .addScaledVector(camera.up, flightDirection.y)
    .multiplyScalar(flightSpeed * deltaSeconds);

  camera.position.add(flightDelta);
  controls.target.add(flightDelta);
}

window.addEventListener('keydown', event => setFlightKey(event, true));
window.addEventListener('keyup', event => setFlightKey(event, false));
window.addEventListener('blur', () => {
  flightKeys.clear();
});

// ---------- Sky + lights ----------
const skyCtl = buildSky(scene, renderer);
freezeStaticTransform(skyCtl.sky);
freezeStaticTransform(skyCtl.sunsetDome);
freezeStaticTransform(skyCtl.mountains);

const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 8;
sun.shadow.camera.far = 170;
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.00022;
sun.shadow.normalBias = 0.035;
sun.shadow.radius = 2.2;
scene.add(sun);
scene.add(sun.target);

const moonLight = new THREE.DirectionalLight(0xaec0ff, 0);
moonLight.castShadow = false;
scene.add(moonLight);
scene.add(moonLight.target);
const sunLensFlare = createSunLensFlare(scene);

// Sky-bounce ambient: soft blue from above, warm desert albedo from below.
const hemi = new THREE.HemisphereLight(0xb8d8ff, 0xb98260, 0.42);
scene.add(hemi);
const moonAmbient = new THREE.HemisphereLight(0x718aff, 0x050713, 0.0);
scene.add(moonAmbient);
const skyFill = new THREE.DirectionalLight(0xb9d6ff, 0.0);
skyFill.castShadow = false;
scene.add(skyFill);
scene.add(skyFill.target);
const sandBounce = new THREE.DirectionalLight(0xd9a66e, 0.0);
sandBounce.castShadow = false;
scene.add(sandBounce);
scene.add(sandBounce.target);

const sunWarmColor = new THREE.Color(0xff9a56);
const sunCoolColor = new THREE.Color(0xfff2d6);
const sunNightColor = new THREE.Color(0x2c3f7a);
const sunColor = new THREE.Color();
const fogWarmColor = new THREE.Color(0xc9865a);
const fogVioletColor = new THREE.Color(0x4f3a55);
const fogCoolColor = new THREE.Color(0xc8d4dd);
const fogNightColor = new THREE.Color(0x11182d);
const fogRainColor = new THREE.Color(0x5d6870);
const fogColor = new THREE.Color();
const fogSunsetSunColor = new THREE.Color(0xc86f45);
const fogSunsetShadowColor = new THREE.Color(0x211824);
const hemiSunsetColor = new THREE.Color(0x7b8ac4);
const hemiNightColor = new THREE.Color(0x10183b);
const hemiGroundSunsetColor = new THREE.Color(0xd07658);
const hemiGroundNightColor = new THREE.Color(0x080814);
const moonAmbientSkyColor = new THREE.Color(0x718aff);
const moonAmbientHighColor = new THREE.Color(0xb0beff);
const moonAmbientGroundColor = new THREE.Color(0x04050d);
const moonLightHighColor = new THREE.Color(0xd8e1ff);
const skyFillDayColor = new THREE.Color(0xb9d6ff);
const skyFillTwilightColor = new THREE.Color(0xb7a0d4);
const skyFillNightColor = new THREE.Color(0x273c82);
const sandBounceDayColor = new THREE.Color(0xd7a36b);
const sandBounceSunsetColor = new THREE.Color(0xea8959);
const sandBounceNightColor = new THREE.Color(0x15101c);
const JULY_TENTH_DAY_OF_YEAR = 191;
const environmentTexture = createAtmosphereEnvironmentTexture();
scene.environment = environmentTexture;
let currentEnvironmentIntensity = 0.16;
const directionalFogUniforms = {
  directionalFogSunViewDirection: { value: new THREE.Vector3(0, 0, -1) },
  directionalFogUpViewDirection: { value: new THREE.Vector3(0, 1, 0) },
  directionalFogSunsetAmount: { value: 0 },
  directionalFogNightAmount: { value: 0 },
  directionalFogSunColor: { value: fogSunsetSunColor.clone() },
  directionalFogShadowColor: { value: fogSunsetShadowColor.clone() },
};
const directionalFogSunViewScratch = new THREE.Vector3();
const directionalFogUpViewScratch = new THREE.Vector3(0, 1, 0);

// ---------- Shared materials ----------
const ocotilloMaterial = createOcotilloMaterial();
const treeMaterial = createTreeMaterial();
const cactusMaterial = createCactusSpineMaterial();
const creosoteMaterial = createCreosoteMaterial();
const rockMaterial = createRockMaterial();
const sharedMaterials = new Set([ocotilloMaterial, treeMaterial, cactusMaterial, creosoteMaterial, rockMaterial]);
const environmentMaterials = new Set();
registerEnvironmentMaterial(ocotilloMaterial, 0.22);
registerEnvironmentMaterial(treeMaterial, 0.30);
registerEnvironmentMaterial(cactusMaterial, 0.18);
registerEnvironmentMaterial(creosoteMaterial, 0.26);
registerEnvironmentMaterial(rockMaterial, 0.62);
const SCATTER_GEOMETRY_CACHE_LIMIT = 192;
const PERF_LOG_PREFIX = '[desert-perf]';
const scatterGeometryCache = new Map();
const cachedScatterGeometries = new Set();
const scatterGeometryRefs = new Map();

// ---------- Generation parameters ----------
let desertUi = null;
const guiControllers = [];
const DEFAULT_SIMPLE_TIME_OF_DAY = (() => {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
})();
const DEFAULT_SIMPLE_TIME_OF_YEAR = (() => {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / 86400000);
})();
const DEFAULT_SOLAR_POSITION = tucsonSolarPosition(DEFAULT_SIMPLE_TIME_OF_DAY, DEFAULT_SIMPLE_TIME_OF_YEAR);
const DEFAULT_SEASONAL_PLANTS = deriveSeasonalPlantState(DEFAULT_SIMPLE_TIME_OF_YEAR);
// NPS 2020 Saguaro Census: 21,517 saguaros across 45 200 m x 200 m plots.
// https://www.nps.gov/sagu/learn/nature/2020-saguaro-census-final-report.htm
const SAGUARO_CENSUS_DENSITY = 21517 / (45 * 200 * 200);

const params = {
  seed: 1337,

  // Terrain
  terrainSize: 140,
  terrainSegments: 360,
  hydrologySegments: 88,
  heightScale: 5.5,
  macroScale: 0.012,
  ridgeScale: 0.035,
  rippleScale: 0.16,
  washStrength: 0.6,
  fanStrength: 0.72,
  erosionStrength: 0.75,
  rockySlopeStrength: 0.38,

  // Plant densities (instances per m^2)
  saguaroEnabled: true,
  saguaroDensity: SAGUARO_CENSUS_DENSITY,
  saguaroMaxHeight: 7.0,
  saguaroArmProbability: 0.7,
  saguaroFlowering: DEFAULT_SEASONAL_PLANTS.saguaroFlowering,
  saguaroFruiting: DEFAULT_SEASONAL_PLANTS.saguaroFruiting,
  barrelEnabled: true,
  barrelDensity: 0.030,
  jumpingChollaEnabled: true,
  jumpingChollaDensity: 0.003,
  paloVerdeEnabled: true,
  paloVerdeDensity: 0.008,
  paloVerdeFlowering: DEFAULT_SEASONAL_PLANTS.paloVerdeFlowering,
  mesquiteEnabled: true,
  mesquiteDensity: 0.003,
  mesquiteSeedPods: DEFAULT_SEASONAL_PLANTS.mesquiteSeedPods,
  pricklyPearEnabled: true,
  pricklyPearDensity: 0.020,
  ocotilloEnabled: true,
  ocotilloDensity: 0.006,
  ocotilloFlowering: DEFAULT_SEASONAL_PLANTS.ocotilloFlowering,
  creosoteEnabled: true,
  creosoteDensity: 0.060,

  // Rocks
  smallRockDensity: 0.18,
  largeRockDensity: 0.012,

  // Sun
  sunAzimuth: DEFAULT_SOLAR_POSITION.sunAzimuth,
  sunElevation: DEFAULT_SOLAR_POSITION.sunElevation,
  timeOfDay: DEFAULT_SIMPLE_TIME_OF_DAY,
  timeOfYear: DEFAULT_SIMPLE_TIME_OF_YEAR,

  // Atmosphere
  fogDensity: 0.008,
  exposure: 1.05,
  lensFlare: true,
  cloudRate: 1.0,

  regenerate: () => regenerate(),
  randomSeed: () => {
    params.seed = Math.floor(Math.random() * 1e9);
    refreshGui();
    regenerate();
  },
};

function deriveSeasonalPlantState(timeOfYear) {
  const day = Math.max(1, Math.min(365, Math.round(timeOfYear)));
  return {
    saguaroFlowering: day >= 110 && day <= 172,
    saguaroFruiting: day >= 158 && day <= 212,
    paloVerdeFlowering: day >= 74 && day <= 140,
    ocotilloFlowering: day >= 60 && day <= 161,
    mesquiteSeedPods: day >= 135 && day <= 243,
  };
}

function applySeasonalPlantState(timeOfYear) {
  const seasonalState = deriveSeasonalPlantState(timeOfYear);
  let changed = false;
  for (const [property, value] of Object.entries(seasonalState)) {
    if (params[property] === value) continue;
    params[property] = value;
    changed = true;
  }
  if (changed) updateSeasonalPlantVisibility();
  return changed;
}

function rainAmountForDate(timeOfYear) {
  return Math.round(timeOfYear) === JULY_TENTH_DAY_OF_YEAR ? 1 : 0;
}

function updateSeasonalPlantVisibility() {
  cactusMaterial.userData.setSeasonalVisibility?.({
    saguaroFlowering: params.saguaroFlowering,
    saguaroFruiting: params.saguaroFruiting,
  });
  treeMaterial.userData.setSeasonalVisibility?.({
    paloVerdeFlowering: params.paloVerdeFlowering,
    mesquiteSeedPods: params.mesquiteSeedPods,
  });
  ocotilloMaterial.userData.setSeasonalVisibility?.({
    ocotilloFlowering: params.ocotilloFlowering,
  });
}

// ---------- Scene root for procedural content ----------
let world = new THREE.Group();
scene.add(world);
let buildGeneration = 0;
let progressHideTimer = 0;
let generationWorker = null;
let generationProportions = null;
let generationStartedAt = 0;
const applyQueue = [];
let applyQueueRunning = false;
const APPLY_FRAME_BUDGET_MS = 6;
const TERRAIN_CHUNK_LOAD_RADIUS = 1;
const TERRAIN_CHUNK_UNLOAD_RADIUS = 2;
const terrainChunks = new Map();
const pendingChunkKeys = new Set();
const desiredChunkKeys = new Set();
let lastChunkCenterKey = '';

function clearWorld() {
  cancelPlantInspection({ restoreOriginal: false });
  // Dispose generated geometries and one-off materials. Plant/rock materials are
  // shared at module scope and survive regeneration.
  world.traverse(obj => {
    if (obj.isMesh) {
      if (obj.geometry && cachedScatterGeometries.has(obj.geometry)) {
        releaseScatterGeometry(obj.geometry);
      } else if (obj.geometry) {
        obj.geometry.dispose();
      }
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material && !sharedMaterials.has(material)) {
          environmentMaterials.delete(material);
          material.dispose();
        }
      }
    }
  });
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
  terrain = null;
  terrainChunks.clear();
  pendingChunkKeys.clear();
  desiredChunkKeys.clear();
  lastChunkCenterKey = '';
  cameraColliders.length = 0;
  cameraColliderGrid.clear();
  cameraColliderMaxRadius = 0;
  markVisibilityCullingDirty();
  markShadowMapDirty();
}

async function regenerate() {
  const generation = ++buildGeneration;
  generationStartedAt = performance.now();
  if (generationWorker) {
    generationWorker.terminate();
    generationWorker = null;
  }
  applyQueue.length = 0;
  applyQueueRunning = false;
  generationProportions = createProportionOracle({ rootMeasurement: params.saguaroMaxHeight });
  clearWorld();
  logPerf('generation-start', {
    generation,
    seed: params.seed,
    terrainSize: params.terrainSize,
    terrainSegments: params.terrainSegments,
    paloVerdeEnabled: params.paloVerdeEnabled,
    paloVerdeDensity: params.paloVerdeDensity,
    cacheEntries: scatterGeometryCache.size,
  });
  setGenerationProgress(0, true, 'Starting generation worker');

  generationWorker = new Worker(new URL('./generationWorker.js', import.meta.url), { type: 'module' });
  generationWorker.onmessage = (event) => {
    const message = event.data;
    if (!message || message.generation !== buildGeneration) return;
    if (message.perf) logPerf('worker-message', message.perf);
    if (message.type === 'progress') {
      setGenerationProgress(message.progress, true, message.phase);
      return;
    }
    if (message.type === 'terrain') {
      enqueueApply(generation, message.phase, message.progress, () => applyTerrainData(message.chunkKey, message.terrain));
      return;
    }
    if (message.type === 'scatter') {
      enqueueApply(generation, message.phase, message.progress, createScatterApplyTask(message.chunkKey, message.stage, generationProportions));
      return;
    }
    if (message.type === 'chunkComplete') {
      pendingChunkKeys.delete(message.chunkKey);
      setGenerationProgress(message.progress, true, message.phase);
      maybeFinishGeneration(generation);
      return;
    }
    if (message.type === 'error') {
      console.error(message.message);
      setGenerationProgress(1, true, `Generation failed: ${message.message}`);
    }
  };
  generationWorker.onerror = (event) => {
    if (generation !== buildGeneration) return;
    console.error(event.message);
    setGenerationProgress(1, true, `Generation failed: ${event.message}`);
  };
  updateTerrainChunks(true);
}

// Coalesce rapid GUI changes (slider scrubbing) into one rebuild per frame.
let regenPending = false;
function scheduleRegenerate() {
  if (regenPending) return;
  regenPending = true;
  requestAnimationFrame(() => {
    regenPending = false;
    regenerate();
  });
}

// ---------- World construction ----------
let terrain;

function setGenerationProgress(progress, visible = true, phase = '') {
  if (progressHideTimer) {
    clearTimeout(progressHideTimer);
    progressHideTimer = 0;
  }
  desertUi?.setGenerationProgress(progress, visible, phase);
}

function hideGenerationProgress(generation) {
  progressHideTimer = window.setTimeout(() => {
    if (generation !== buildGeneration) return;
    desertUi?.setGenerationProgress(1, false);
  }, 300);
}

function enqueueApply(generation, phase, progress, apply) {
  applyQueue.push({ generation, phase, progress, apply });
  if (!applyQueueRunning) processApplyQueue();
}

function processApplyQueue() {
  if (applyQueueRunning) return;
  applyQueueRunning = true;
  requestAnimationFrame(() => {
    const task = applyQueue.shift();
    const deadline = performance.now() + APPLY_FRAME_BUDGET_MS;
    if (task && task.generation === buildGeneration) {
      setGenerationProgress(task.progress, true, `Rendering ${task.phase.toLowerCase()}`);
      const applyStart = performance.now();
      const complete = runApplyTask(task.apply, deadline);
      if (!complete) {
        applyQueue.unshift(task);
      } else {
        logPerf('main-apply', {
          generation: task.generation,
          phase: task.phase,
          applyMs: roundMs(performance.now() - applyStart),
          queuedAfter: applyQueue.length,
        });
      }
    }
    applyQueueRunning = false;
    if (applyQueue.length > 0) {
      processApplyQueue();
    } else {
      maybeFinishGeneration(buildGeneration);
    }
  });
}

function runApplyTask(apply, deadline) {
  if (typeof apply === 'function') {
    apply();
    return true;
  }
  if (apply && typeof apply.run === 'function') {
    return apply.run(deadline) !== false;
  }
  return true;
}

function maybeFinishGeneration(generation) {
  if (generation !== buildGeneration || pendingChunkKeys.size > 0 || applyQueue.length > 0 || applyQueueRunning) return;
  setGenerationProgress(1, true, 'Generation complete');
  hideGenerationProgress(generation);
  const t1 = performance.now();
  logPerf('generation-complete', {
    generation,
    totalMs: roundMs(t1 - generationStartedAt),
    chunks: terrainChunks.size,
    cacheEntries: scatterGeometryCache.size,
  });
}

function logPerf(event, data = {}) {
  console.info(PERF_LOG_PREFIX, JSON.stringify({ event, ...data }));
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function freezeStaticTransform(object) {
  object.traverse(child => {
    child.updateMatrix();
    child.updateMatrixWorld(true);
    child.matrixAutoUpdate = false;
    child.matrixWorldAutoUpdate = false;
  });
}

function generationParams() {
  return {
    seed: params.seed,
    terrainSize: params.terrainSize,
    terrainSegments: params.terrainSegments,
    hydrologySegments: params.hydrologySegments,
    heightScale: params.heightScale,
    macroScale: params.macroScale,
    ridgeScale: params.ridgeScale,
    rippleScale: params.rippleScale,
    washStrength: params.washStrength,
    fanStrength: params.fanStrength,
    erosionStrength: params.erosionStrength,
    rockySlopeStrength: params.rockySlopeStrength,
    saguaroEnabled: params.saguaroEnabled,
    saguaroDensity: params.saguaroDensity,
    saguaroMaxHeight: params.saguaroMaxHeight,
    saguaroArmProbability: params.saguaroArmProbability,
    barrelEnabled: params.barrelEnabled,
    barrelDensity: params.barrelDensity,
    jumpingChollaEnabled: params.jumpingChollaEnabled,
    jumpingChollaDensity: params.jumpingChollaDensity,
    paloVerdeEnabled: params.paloVerdeEnabled,
    paloVerdeDensity: params.paloVerdeDensity,
    paloVerdeFlowering: true,
    mesquiteEnabled: params.mesquiteEnabled,
    mesquiteDensity: params.mesquiteDensity,
    mesquiteSeedPods: true,
    pricklyPearEnabled: params.pricklyPearEnabled,
    pricklyPearDensity: params.pricklyPearDensity,
    ocotilloEnabled: params.ocotilloEnabled,
    ocotilloDensity: params.ocotilloDensity,
    ocotilloFlowering: true,
    creosoteEnabled: params.creosoteEnabled,
    creosoteDensity: params.creosoteDensity,
    smallRockDensity: params.smallRockDensity,
    largeRockDensity: params.largeRockDensity,
  };
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function chunkCenterForPoint(x, z) {
  const size = params.terrainSize;
  return {
    cx: Math.floor((x + size / 2) / size),
    cz: Math.floor((z + size / 2) / size),
  };
}

function createChunkCullingSphere(cx, cz) {
  const half = params.terrainSize / 2;
  const radius = Math.sqrt(half * half * 2) + params.heightScale + 24;
  return new THREE.Sphere(
    new THREE.Vector3(cx * params.terrainSize, 0, cz * params.terrainSize),
    radius,
  );
}

function updateTerrainChunks(force = false) {
  if (!generationWorker) return;
  const center = chunkCenterForPoint(camera.position.x, camera.position.z);
  const centerKey = chunkKey(center.cx, center.cz);
  if (!force && centerKey === lastChunkCenterKey) return;
  lastChunkCenterKey = centerKey;

  desiredChunkKeys.clear();
  const requests = [];
  for (let dz = -TERRAIN_CHUNK_LOAD_RADIUS; dz <= TERRAIN_CHUNK_LOAD_RADIUS; dz++) {
    for (let dx = -TERRAIN_CHUNK_LOAD_RADIUS; dx <= TERRAIN_CHUNK_LOAD_RADIUS; dx++) {
      const cx = center.cx + dx;
      const cz = center.cz + dz;
      const key = chunkKey(cx, cz);
      desiredChunkKeys.add(key);
      if (!terrainChunks.has(key) && !pendingChunkKeys.has(key)) {
        requests.push({ cx, cz, key, distance: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
  }

  requests
    .sort((a, b) => a.distance - b.distance)
    .forEach(({ cx, cz, key }) => requestTerrainChunk(cx, cz, key));

  for (const [key, chunk] of terrainChunks) {
    const distance = Math.max(Math.abs(chunk.cx - center.cx), Math.abs(chunk.cz - center.cz));
    if (distance > TERRAIN_CHUNK_UNLOAD_RADIUS) unloadTerrainChunk(key);
  }
}

function requestTerrainChunk(cx, cz, key = chunkKey(cx, cz)) {
  if (!generationWorker || terrainChunks.has(key) || pendingChunkKeys.has(key)) return;
  const group = new THREE.Group();
  group.name = `terrain-chunk-${key}`;
  terrainChunks.set(key, {
    key,
    cx,
    cz,
    group,
    terrain: null,
    cullingSphere: createChunkCullingSphere(cx, cz),
    cullables: [],
  });
  world.add(group);
  freezeStaticTransform(group);
  pendingChunkKeys.add(key);
  setGenerationProgress(0, true, `Generating terrain chunk ${key}`);
  generationWorker.postMessage({
    type: 'generateChunk',
    generation: buildGeneration,
    chunk: {
      key,
      cx,
      cz,
      size: params.terrainSize,
    },
    params: generationParams(),
    lodLevels: plantLodLevels,
  });
}

function unloadTerrainChunk(key) {
  const chunk = terrainChunks.get(key);
  if (!chunk) return;
  chunk.group.traverse(obj => {
    if (obj.isMesh) {
      if (obj.geometry && cachedScatterGeometries.has(obj.geometry)) {
        releaseScatterGeometry(obj.geometry);
      } else if (obj.geometry) {
        obj.geometry.dispose();
      }
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material && !sharedMaterials.has(material)) {
          environmentMaterials.delete(material);
          material.dispose();
        }
      }
    }
  });
  world.remove(chunk.group);
  terrainChunks.delete(key);
  pendingChunkKeys.delete(key);
  removeChunkCameraColliders(key);
  markVisibilityCullingDirty();
  markShadowMapDirty();
}

function createTerrainHeightSampler(data) {
  const positions = data.positions;
  const segments = data.segments;
  const gridStride = segments + 1;
  const minX = data.originX - data.size / 2;
  const minZ = data.originZ - data.size / 2;
  const gridStep = data.size / segments;

  return (x, z) => {
    const gx = THREE.MathUtils.clamp((x - minX) / gridStep, 0, segments);
    const gz = THREE.MathUtils.clamp((z - minZ) / gridStep, 0, segments);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(segments, x0 + 1);
    const z1 = Math.min(segments, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const i00 = z0 * gridStride + x0;
    const i10 = z0 * gridStride + x1;
    const i01 = z1 * gridStride + x0;
    const i11 = z1 * gridStride + x1;
    const h0 = THREE.MathUtils.lerp(positions[i00 * 3 + 1], positions[i10 * 3 + 1], tx);
    const h1 = THREE.MathUtils.lerp(positions[i01 * 3 + 1], positions[i11 * 3 + 1], tx);
    return THREE.MathUtils.lerp(h0, h1, tz);
  };
}

function terrainHeightAt(x, z) {
  const center = chunkCenterForPoint(x, z);
  const chunk = terrainChunks.get(chunkKey(center.cx, center.cz));
  if (chunk?.terrain?.sampleHeight) return chunk.terrain.sampleHeight(x, z);
  return null;
}

function addCameraColliders(stageKey, geometry, matrices, chunkKeyForCollider = null) {
  const config = CAMERA_COLLIDER_CONFIG[stageKey];
  if (!config || matrices.length === 0) return;
  if (!geometry.boundingBox) geometry.computeBoundingBox();

  const box = geometry.boundingBox;
  if (!box) return;

  const localRadius = Math.max(
    Math.abs(box.min.x),
    Math.abs(box.max.x),
    Math.abs(box.min.z),
    Math.abs(box.max.z),
  );
  const localMinY = box.min.y;
  const localMaxY = box.max.y;

  for (let i = 0; i < matrices.length; i += 16) {
    const sx = Math.hypot(matrices[i], matrices[i + 1], matrices[i + 2]);
    const sy = Math.hypot(matrices[i + 4], matrices[i + 5], matrices[i + 6]);
    const sz = Math.hypot(matrices[i + 8], matrices[i + 9], matrices[i + 10]);
    const xzScale = Math.max(sx, sz);
    const yScale = sy || xzScale || 1;
    const objectRadius = Math.max(
      config.minRadius ?? 0,
      localRadius * xzScale * (config.radiusScale ?? 1),
    );

    const collider = {
      chunkKey: chunkKeyForCollider,
      x: matrices[i + 12],
      z: matrices[i + 14],
      minY: matrices[i + 13] + localMinY * yScale - CAMERA_COLLISION_RADIUS,
      maxY: matrices[i + 13] + localMaxY * yScale + CAMERA_COLLISION_RADIUS,
      radius: objectRadius + CAMERA_COLLISION_RADIUS,
    };
    cameraColliders.push(collider);
    indexCameraCollider(collider);
  }
}

function indexCameraCollider(collider) {
  cameraColliderMaxRadius = Math.max(cameraColliderMaxRadius, collider.radius);
  const key = cameraColliderCellKey(collider.x, collider.z);
  let cell = cameraColliderGrid.get(key);
  if (!cell) {
    cell = [];
    cameraColliderGrid.set(key, cell);
  }
  cell.push(collider);
}

function cameraColliderCellKey(x, z) {
  return `${Math.floor(x / CAMERA_COLLIDER_CELL_SIZE)},${Math.floor(z / CAMERA_COLLIDER_CELL_SIZE)}`;
}

function removeChunkCameraColliders(chunkKeyForCollider) {
  for (let i = cameraColliders.length - 1; i >= 0; i--) {
    if (cameraColliders[i].chunkKey === chunkKeyForCollider) cameraColliders.splice(i, 1);
  }
  rebuildCameraColliderGrid();
}

function rebuildCameraColliderGrid() {
  cameraColliderGrid.clear();
  cameraColliderMaxRadius = 0;
  for (const collider of cameraColliders) indexCameraCollider(collider);
}

function nearbyCameraColliders(position) {
  nearbyColliderScratch.length = 0;
  if (cameraColliders.length === 0) return nearbyColliderScratch;
  const queryRadius = Math.max(cameraColliderMaxRadius, CAMERA_COLLISION_RADIUS);
  const minCellX = Math.floor((position.x - queryRadius) / CAMERA_COLLIDER_CELL_SIZE);
  const maxCellX = Math.floor((position.x + queryRadius) / CAMERA_COLLIDER_CELL_SIZE);
  const minCellZ = Math.floor((position.z - queryRadius) / CAMERA_COLLIDER_CELL_SIZE);
  const maxCellZ = Math.floor((position.z + queryRadius) / CAMERA_COLLIDER_CELL_SIZE);

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const cell = cameraColliderGrid.get(`${cellX},${cellZ}`);
      if (cell) nearbyColliderScratch.push(...cell);
    }
  }

  return nearbyColliderScratch;
}

function constrainCameraToWorld() {
  cameraConstraintDelta.set(0, 0, 0);
  resolveTerrainCollision(camera.position, CAMERA_TERRAIN_CLEARANCE, cameraConstraintDelta);

  if (cameraConstraintDelta.lengthSq() > 0) {
    camera.position.add(cameraConstraintDelta);
    controls.target.add(cameraConstraintDelta);
  }

  resolveObjectCollisions();

  cameraConstraintDelta.set(0, 0, 0);
  resolveTerrainCollision(camera.position, CAMERA_TERRAIN_CLEARANCE, cameraConstraintDelta);
  if (cameraConstraintDelta.lengthSq() > 0) {
    camera.position.add(cameraConstraintDelta);
    controls.target.add(cameraConstraintDelta);
  }

  clampTargetAboveTerrain();
}

function resolveTerrainCollision(position, clearance, delta) {
  const terrainY = terrainHeightAt(position.x, position.z);
  if (terrainY === null) return;

  const minY = terrainY + clearance;
  if (position.y < minY) delta.y += minY - position.y;
}

function resolveObjectCollisions() {
  for (let pass = 0; pass < 2; pass++) {
    cameraConstraintDelta.set(0, 0, 0);

    for (const collider of nearbyCameraColliders(camera.position)) {
      if (camera.position.y < collider.minY || camera.position.y > collider.maxY) continue;

      const dx = camera.position.x - collider.x;
      const dz = camera.position.z - collider.z;
      const distanceSq = dx * dx + dz * dz;
      const minDistance = collider.radius;
      if (distanceSq >= minDistance * minDistance) continue;

      const distance = Math.sqrt(distanceSq);
      let nx = 1;
      let nz = 0;
      if (distance > 0.0001) {
        nx = dx / distance;
        nz = dz / distance;
      } else {
        cameraFallbackPush.subVectors(camera.position, controls.target);
        cameraFallbackPush.y = 0;
        if (cameraFallbackPush.lengthSq() > 0.0001) {
          cameraFallbackPush.normalize();
          nx = cameraFallbackPush.x;
          nz = cameraFallbackPush.z;
        }
      }

      const push = minDistance - distance;
      cameraConstraintDelta.x += nx * push;
      cameraConstraintDelta.z += nz * push;
    }

    if (cameraConstraintDelta.lengthSq() === 0) return;
    camera.position.add(cameraConstraintDelta);
    controls.target.add(cameraConstraintDelta);
  }
}

function clampTargetAboveTerrain() {
  const terrainY = terrainHeightAt(controls.target.x, controls.target.z);
  if (terrainY === null) return;
  controls.target.y = Math.max(controls.target.y, terrainY + TARGET_TERRAIN_CLEARANCE);
}

function applyTerrainData(chunkKeyForTerrain, data) {
  const chunk = terrainChunks.get(chunkKeyForTerrain);
  if (!chunk) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setAttribute('terrainDetail', new THREE.BufferAttribute(data.terrainDetail, 4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();

  const terrainMaterial = registerEnvironmentMaterial(createTerrainMaterial(), 0.46);
  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.culling = {
    sphere: chunk.cullingSphere,
    maxDistance: TERRAIN_CULL_DISTANCE,
  };
  terrain = {
    mesh,
    size: data.size,
    sampleHeight: createTerrainHeightSampler(data),
  };
  chunk.terrain = terrain;
  chunk.cullables.push(mesh);
  chunk.group.add(mesh);
  freezeStaticTransform(mesh);
  markVisibilityCullingDirty();
  markShadowMapDirty();
  constrainCameraToWorld();
}

function createScatterApplyTask(chunkKeyForStage, stage, proportions) {
  const chunk = terrainChunks.get(chunkKeyForStage);
  if (!chunk) return { run: () => true };
  const stageStart = performance.now();
  const config = scatterRenderConfig(stage.key, proportions);
  if (!config) return { run: () => true };
  const stats = {
    generation: buildGeneration,
    chunkKey: chunkKeyForStage,
    key: stage.key,
    buckets: stage.buckets.length,
    cullCells: 0,
    instances: 0,
    vertices: 0,
    triangles: 0,
    cacheHits: 0,
    cacheMisses: 0,
    geometryMs: 0,
    colliderMs: 0,
  };
  let bucketIndex = 0;
  let activeBucket = null;

  return {
    run(deadline = Infinity) {
      if (terrainChunks.get(chunkKeyForStage) !== chunk) return true;
      let didWork = false;

      while (bucketIndex < stage.buckets.length || activeBucket) {
        if (!activeBucket) {
          const bucket = stage.buckets[bucketIndex++];
          const instanceCount = bucket.matrices.length / 16;
          if (instanceCount === 0) continue;

          const lodLevels = bucketLodLevels(bucket);
          const geometryResults = lodLevels.map(level => {
            const variantOpts = {
              ...level.variantOpts,
              proportions,
            };
            return {
              level,
              ...getScatterGeometry(stage.key, config, {
                ...bucket,
                lodName: level.name,
                variantOpts: level.variantOpts,
              }, variantOpts, proportions),
            };
          });

          stats.instances += instanceCount;
          for (const geometryResult of geometryResults) {
            const geometry = geometryResult.geometry;
            stats.vertices += geometry.attributes.position?.count ?? 0;
            stats.triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3;
            stats.geometryMs += geometryResult.generateMs;
            if (geometryResult.cacheHit) {
              stats.cacheHits++;
            } else {
              stats.cacheMisses++;
            }
          }

          const cullCells = splitScatterMatricesForCulling(stage.key, bucket.matrices);
          stats.cullCells += cullCells.length;
          activeBucket = {
            bucket,
            lodLevels,
            geometryResults,
            cullCells,
            cellIndex: 0,
            collidersAdded: false,
          };
          didWork = true;
          if (performance.now() >= deadline) return false;
        }

        while (activeBucket.cellIndex < activeBucket.cullCells.length) {
          const matrices = activeBucket.cullCells[activeBucket.cellIndex++];
          const cell = createScatterLodCell(
            stage.key,
            config,
            activeBucket.bucket,
            activeBucket.lodLevels,
            activeBucket.geometryResults,
            matrices,
          );
          if (cell) {
            chunk.cullables.push(cell);
            chunk.group.add(cell);
            freezeStaticTransform(cell);
          }
          didWork = true;
          if (performance.now() >= deadline) return false;
        }

        if (!activeBucket.collidersAdded) {
          const colliderStart = performance.now();
          addCameraColliders(stage.key, activeBucket.geometryResults[0].geometry, activeBucket.bucket.matrices, chunkKeyForStage);
          stats.colliderMs += performance.now() - colliderStart;
          activeBucket.collidersAdded = true;
          didWork = true;
        }

        activeBucket = null;
        if (didWork && performance.now() >= deadline) return false;
      }

      constrainCameraToWorld();
      pruneScatterGeometryCache();
      markVisibilityCullingDirty();
      markShadowMapDirty();
      stats.totalMs = roundMs(performance.now() - stageStart);
      stats.geometryMs = roundMs(stats.geometryMs);
      stats.colliderMs = roundMs(stats.colliderMs);
      stats.triangles = Math.round(stats.triangles);
      logPerf('main-scatter-apply-detail', stats);
      return true;
    },
  };
}

function bucketLodLevels(bucket) {
  if (bucket.lodLevels?.length) return bucket.lodLevels;
  return [{
    name: bucket.lodName ?? 'full',
    distance: Infinity,
    castShadow: bucket.castShadow,
    receiveShadow: bucket.receiveShadow,
    variantOpts: bucket.variantOpts,
  }];
}

function createScatterLodCell(stageKey, config, bucket, lodLevels, geometryResults, matrices) {
  const instanceCount = matrices.length / 16;
  if (instanceCount === 0) return null;

  const group = new THREE.Group();
  group.name = `${stageKey}-cell`;
  const lodMeshes = [];
  let cullingSphere = null;

  for (let lodIdx = 0; lodIdx < geometryResults.length; lodIdx++) {
    const { geometry, level } = geometryResults[lodIdx];
    const inst = new THREE.InstancedMesh(geometry, config.material, instanceCount);
    inst.castShadow = level.castShadow ?? bucket.castShadow ?? config.castShadow ?? true;
    inst.receiveShadow = level.receiveShadow ?? bucket.receiveShadow ?? config.receiveShadow ?? true;
    inst.visible = lodIdx === 0;
    inst.userData.lod = level.name;
    inst.userData.stageKey = stageKey;
    inst.instanceMatrix.array.set(matrices);
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    retainScatterGeometry(geometry);
    if (!cullingSphere && inst.boundingSphere) {
      cullingSphere = inst.boundingSphere.clone();
      cullingSphere.radius += 4;
    }
    lodMeshes.push(inst);
    group.add(inst);
  }

  group.userData.culling = {
    sphere: cullingSphere,
    maxDistance: scatterCullDistance(stageKey),
    lodLevels,
    lodDistanceSq: lodLevels.map(level => {
      const distance = level.distance ?? Infinity;
      return Number.isFinite(distance) ? distance * distance : Infinity;
    }),
    lodMeshes,
  };
  return group;
}

function splitScatterMatricesForCulling(stageKey, matrices) {
  const instanceCount = matrices.length / 16;
  const config = SCATTER_CULL_CELL[stageKey] ?? DEFAULT_SCATTER_CULL_CELL;
  if (instanceCount < config.minInstances) return [matrices];

  const cells = new Map();
  for (let i = 0; i < matrices.length; i += 16) {
    const cellX = Math.floor(matrices[i + 12] / config.size);
    const cellZ = Math.floor(matrices[i + 14] / config.size);
    const key = `${cellX},${cellZ}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = [];
      cells.set(key, cell);
    }
    for (let e = 0; e < 16; e++) cell.push(matrices[i + e]);
  }

  if (cells.size <= 1) return [matrices];
  return Array.from(cells.values(), cell => new Float32Array(cell));
}

function scatterCullDistance(stageKey) {
  return SCATTER_CULL_DISTANCE[stageKey] ?? DEFAULT_SCATTER_CULL_DISTANCE;
}

function markVisibilityCullingDirty() {
  visibilityCullDirty = true;
}

function updateVisibilityCulling(now = performance.now()) {
  const moved = camera.position.distanceToSquared(visibilityCullPosition) > VISIBILITY_CULL_MOVE_EPSILON_SQ;
  const rotated = 1 - Math.abs(camera.quaternion.dot(visibilityCullQuaternion)) > VISIBILITY_CULL_ROTATE_EPSILON;
  const due = now - lastVisibilityCullAt >= VISIBILITY_CULL_INTERVAL_MS;
  if (!visibilityCullDirty && (!due || (!moved && !rotated))) return;

  camera.updateMatrixWorld();
  cullingProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  cullingFrustum.setFromProjectionMatrix(cullingProjectionMatrix);

  for (const chunk of terrainChunks.values()) {
    const chunkVisible = isCullingSphereVisible(chunk.cullingSphere, TERRAIN_CULL_DISTANCE);
    chunk.group.visible = chunkVisible;
    if (!chunkVisible) continue;

    for (const object of chunk.cullables) {
      const culling = object.userData.culling;
      const visible = !culling || isCullingSphereVisible(culling.sphere, culling.maxDistance);
      object.visible = visible;
      if (visible && culling?.lodMeshes) updateCullableLod(culling);
    }
  }

  visibilityCullPosition.copy(camera.position);
  visibilityCullQuaternion.copy(camera.quaternion);
  visibilityCullDirty = false;
  lastVisibilityCullAt = now;
}

function updateCullableLod(culling) {
  const activeLod = chooseCullableLod(culling);
  for (let i = 0; i < culling.lodMeshes.length; i++) {
    culling.lodMeshes[i].visible = i === activeLod;
  }
}

function chooseCullableLod(culling) {
  if (!culling.sphere) return 0;
  const center = culling.sphere.center;
  const dx = camera.position.x - center.x;
  const dy = camera.position.y - center.y;
  const dz = camera.position.z - center.z;
  const distanceSq = dx * dx + dy * dy + dz * dz;
  const lodDistanceSq = culling.lodDistanceSq;
  for (let i = 0; i < culling.lodLevels.length; i++) {
    if (!lodDistanceSq || distanceSq <= lodDistanceSq[i]) return i;
  }
  return culling.lodLevels.length - 1;
}

function isCullingSphereVisible(sphere, maxDistance = Infinity) {
  if (!sphere) return true;
  if (Number.isFinite(maxDistance)) {
    const maxVisibleDistance = maxDistance + sphere.radius;
    const dx = camera.position.x - sphere.center.x;
    const dy = camera.position.y - sphere.center.y;
    const dz = camera.position.z - sphere.center.z;
    if (dx * dx + dy * dy + dz * dz > maxVisibleDistance * maxVisibleDistance) {
      return false;
    }
  }
  return cullingFrustum.intersectsSphere(sphere);
}

function getScatterGeometry(stageKey, config, bucket, variantOpts, proportions) {
  const cacheKey = scatterGeometryCacheKey(stageKey, bucket, proportions);
  const cached = scatterGeometryCache.get(cacheKey);
  if (cached) {
    scatterGeometryCache.delete(cacheKey);
    scatterGeometryCache.set(cacheKey, cached);
    return { geometry: cached, cacheHit: true, generateMs: 0 };
  }

  const generateStart = performance.now();
  const geometry = config.generator(mulberry32(bucket.variantSeed), variantOpts);
  const generateMs = performance.now() - generateStart;
  scatterGeometryCache.set(cacheKey, geometry);
  cachedScatterGeometries.add(geometry);
  return { geometry, cacheHit: false, generateMs };
}

function retainScatterGeometry(geometry) {
  scatterGeometryRefs.set(geometry, (scatterGeometryRefs.get(geometry) ?? 0) + 1);
}

function releaseScatterGeometry(geometry) {
  const refs = scatterGeometryRefs.get(geometry) ?? 0;
  if (refs <= 1) {
    scatterGeometryRefs.delete(geometry);
    return;
  }
  scatterGeometryRefs.set(geometry, refs - 1);
}

function scatterGeometryCacheKey(stageKey, bucket, proportions) {
  return JSON.stringify({
    stageKey,
    seed: bucket.variantSeed,
    lod: bucket.lodName,
    root: proportions.rootMeasurement,
    opts: bucket.variantOpts,
  });
}

function pruneScatterGeometryCache() {
  let scanned = 0;
  while (scatterGeometryCache.size > SCATTER_GEOMETRY_CACHE_LIMIT && scanned < scatterGeometryCache.size) {
    const oldestKey = scatterGeometryCache.keys().next().value;
    const oldestGeometry = scatterGeometryCache.get(oldestKey);
    scatterGeometryCache.delete(oldestKey);
    if ((scatterGeometryRefs.get(oldestGeometry) ?? 0) > 0) {
      scatterGeometryCache.set(oldestKey, oldestGeometry);
      scanned++;
      continue;
    }
    cachedScatterGeometries.delete(oldestGeometry);
    oldestGeometry.dispose();
  }
}

function scatterRenderConfig(key, proportions) {
  switch (key) {
    case 'paloVerde':
      return { generator: generatePaloVerde, material: treeMaterial };
    case 'mesquite':
      return { generator: generateMesquite, material: treeMaterial };
    case 'saguaro':
      return { generator: generateSaguaro, material: cactusMaterial };
    case 'barrel':
      return { generator: generateBarrelCactus, material: cactusMaterial };
    case 'jumpingCholla':
      return { generator: generateJumpingCholla, material: cactusMaterial };
    case 'pricklyPear':
      return { generator: generatePricklyPear, material: cactusMaterial };
    case 'ocotillo':
      return { generator: generateOcotillo, material: ocotilloMaterial };
    case 'creosote':
      return { generator: generateCreosote, material: creosoteMaterial, castShadow: false };
    case 'pebbles':
      return {
        generator: (rng, opts = {}) => generateRock(rng, {
          size: rngRange(rng, proportions.rocks.pebbleSize[0], proportions.rocks.pebbleSize[1]),
          detailScale: opts.detailScale ?? 0.55,
        }),
        material: rockMaterial,
        castShadow: false,
      };
    case 'boulders':
      return {
        generator: (rng, opts = {}) => generateRock(rng, {
          size: rngRange(rng, proportions.rocks.boulderSize[0], proportions.rocks.boulderSize[1]),
          detailScale: opts.detailScale ?? 0.9,
        }),
        material: rockMaterial,
      };
    default:
      return null;
  }
}

// ---------- Plant inspection ----------
const plantInspectionRaycaster = new THREE.Raycaster();
const plantInspectionPointer = new THREE.Vector2();
const plantInspectionTargets = [];
const plantInspectionInstanceMatrix = new THREE.Matrix4();
const plantInspectionWorldMatrix = new THREE.Matrix4();
const plantInspectionHiddenMatrix = new THREE.Matrix4();
const plantInspectionHiddenPosition = new THREE.Vector3();
const plantInspectionHiddenQuaternion = new THREE.Quaternion();
const plantInspectionHiddenScale = new THREE.Vector3(0.0001, 0.0001, 0.0001);
const plantInspectionForward = new THREE.Vector3();
const plantInspectionRight = new THREE.Vector3();
const plantInspectionUp = new THREE.Vector3();
const plantInspectionLocalCenter = new THREE.Vector3();
const plantInspectionDesiredCenter = new THREE.Vector3();
const plantInspectionOffset = new THREE.Vector3();
const plantInspectionTargetPosition = new THREE.Vector3();
const plantInspectionTargetScale = new THREE.Vector3();
const plantInspectionYAxis = new THREE.Vector3(0, 1, 0);
const plantInspectionRotationQuaternion = new THREE.Quaternion();
let plantInspectionDragPointerId = null;
let plantInspectionDragLastX = 0;

renderer.domElement.addEventListener('contextmenu', onPlantContextMenu);
renderer.domElement.addEventListener('pointerdown', onPlantInspectionPointerDown);
window.addEventListener('pointermove', onPlantInspectionPointerMove);
window.addEventListener('pointerup', onPlantInspectionPointerUp);
window.addEventListener('pointercancel', onPlantInspectionPointerUp);

function onPlantContextMenu(event) {
  const pick = pickPlantFromEvent(event);
  if (!pick) return;

  event.preventDefault();
  event.stopPropagation();
  inspectPlant(pick);
}

function onPlantInspectionPointerDown(event) {
  if (!inspectedPlant || inspectedPlant.phase === 'closing' || event.button !== 0) return;
  event.preventDefault();
  plantInspectionDragPointerId = event.pointerId;
  plantInspectionDragLastX = event.clientX;
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function onPlantInspectionPointerMove(event) {
  if (!inspectedPlant || plantInspectionDragPointerId !== event.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - plantInspectionDragLastX;
  plantInspectionDragLastX = event.clientX;
  inspectedPlant.rotationY += dx * PLANT_INSPECTION_ROTATE_SPEED;
}

function onPlantInspectionPointerUp(event) {
  if (plantInspectionDragPointerId !== event.pointerId) return;
  renderer.domElement.releasePointerCapture?.(event.pointerId);
  plantInspectionDragPointerId = null;
}

function pickPlantFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  plantInspectionPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  plantInspectionPointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  plantInspectionRaycaster.setFromCamera(plantInspectionPointer, camera);

  plantInspectionTargets.length = 0;
  world.traverse(object => {
    if (
      object.isInstancedMesh &&
      PLANT_INSPECTION_STAGE_KEYS.has(object.userData.stageKey) &&
      isVisibleInScene(object)
    ) {
      plantInspectionTargets.push(object);
    }
  });

  const hits = plantInspectionRaycaster.intersectObjects(plantInspectionTargets, false);
  for (const hit of hits) {
    if (hit.instanceId === undefined || hit.instanceId === null) continue;
    const cell = findScatterCell(hit.object);
    const lodMeshes = cell?.userData?.culling?.lodMeshes;
    return {
      mesh: hit.object,
      cell,
      lodMeshes: lodMeshes?.length ? lodMeshes : [hit.object],
      instanceId: hit.instanceId,
      speciesKey: hit.object.userData.stageKey,
    };
  }

  return null;
}

function isVisibleInScene(object) {
  let cursor = object;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent;
  }
  return true;
}

function findScatterCell(object) {
  let cursor = object.parent;
  while (cursor) {
    if (cursor.userData?.culling?.lodMeshes) return cursor;
    cursor = cursor.parent;
  }
  return null;
}

function inspectPlant(pick) {
  cancelPlantInspection({ restoreOriginal: true });

  const sourceMesh = pick.lodMeshes[0] ?? pick.mesh;
  if (!sourceMesh?.geometry) return;
  if (!sourceMesh.geometry.boundingBox) sourceMesh.geometry.computeBoundingBox();

  sourceMesh.getMatrixAt(pick.instanceId, plantInspectionInstanceMatrix);
  plantInspectionWorldMatrix.multiplyMatrices(sourceMesh.matrixWorld, plantInspectionInstanceMatrix);

  const sourcePosition = new THREE.Vector3();
  const sourceQuaternion = new THREE.Quaternion();
  const sourceScale = new THREE.Vector3();
  plantInspectionWorldMatrix.decompose(sourcePosition, sourceQuaternion, sourceScale);

  const originalMatrices = pick.lodMeshes.map(mesh => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(pick.instanceId, matrix);
    return { mesh, matrix };
  });
  hidePlantInstance(originalMatrices, pick.instanceId);

  const clone = new THREE.Mesh(sourceMesh.geometry, sourceMesh.material);
  clone.castShadow = sourceMesh.castShadow;
  clone.receiveShadow = sourceMesh.receiveShadow;
  clone.frustumCulled = false;
  clone.position.copy(sourcePosition);
  clone.quaternion.copy(sourceQuaternion);
  clone.scale.copy(sourceScale);
  scene.add(clone);

  inspectedPlant = {
    speciesKey: pick.speciesKey,
    clone,
    instanceId: pick.instanceId,
    originalMatrices,
    sourcePosition,
    sourceQuaternion,
    sourceScale,
    targetPosition: new THREE.Vector3(),
    targetScale: new THREE.Vector3(),
    targetQuaternion: sourceQuaternion.clone(),
    baseQuaternion: sourceQuaternion.clone(),
    rotationY: 0,
    closeStartPosition: new THREE.Vector3(),
    closeStartQuaternion: new THREE.Quaternion(),
    closeStartScale: new THREE.Vector3(),
    phase: 'opening',
    t: 0,
    previousControlsEnabled: controls.enabled,
  };

  controls.enabled = false;
  flightKeys.clear();
  desertUi?.setPlantInspection({
    speciesKey: pick.speciesKey,
    onClose: closePlantInspection,
  });
  markShadowMapDirty();
}

function hidePlantInstance(originalMatrices, instanceId) {
  for (const { mesh, matrix } of originalMatrices) {
    matrix.decompose(
      plantInspectionHiddenPosition,
      plantInspectionHiddenQuaternion,
      plantInspectionTargetScale,
    );
    plantInspectionHiddenMatrix.compose(
      plantInspectionHiddenPosition,
      plantInspectionHiddenQuaternion,
      plantInspectionHiddenScale,
    );
    mesh.setMatrixAt(instanceId, plantInspectionHiddenMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function restorePlantInstance(plant) {
  for (const { mesh, matrix } of plant.originalMatrices) {
    if (!mesh?.instanceMatrix) continue;
    mesh.setMatrixAt(plant.instanceId, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function closePlantInspection() {
  if (!inspectedPlant || inspectedPlant.phase === 'closing') return;
  desertUi?.setPlantInspection(null);
  inspectedPlant.phase = 'closing';
  inspectedPlant.t = 0;
  inspectedPlant.closeStartPosition.copy(inspectedPlant.clone.position);
  inspectedPlant.closeStartQuaternion.copy(inspectedPlant.clone.quaternion);
  inspectedPlant.closeStartScale.copy(inspectedPlant.clone.scale);
}

function cancelPlantInspection({ restoreOriginal = true } = {}) {
  if (!inspectedPlant) return;
  desertUi?.setPlantInspection(null);
  if (restoreOriginal) restorePlantInstance(inspectedPlant);
  scene.remove(inspectedPlant.clone);
  inspectedPlant.clone = null;
  controls.enabled = inspectedPlant.previousControlsEnabled;
  inspectedPlant = null;
  plantInspectionDragPointerId = null;
  markShadowMapDirty();
}

function updatePlantInspection(deltaSeconds) {
  if (!inspectedPlant) return;

  if (inspectedPlant.phase === 'closing') {
    inspectedPlant.t = Math.min(1, inspectedPlant.t + deltaSeconds / PLANT_INSPECTION_ANIMATION_SECONDS);
    const eased = easeInOutCubic(inspectedPlant.t);
    inspectedPlant.clone.position.lerpVectors(
      inspectedPlant.closeStartPosition,
      inspectedPlant.sourcePosition,
      eased,
    );
    inspectedPlant.clone.quaternion.slerpQuaternions(
      inspectedPlant.closeStartQuaternion,
      inspectedPlant.sourceQuaternion,
      eased,
    );
    inspectedPlant.clone.scale.lerpVectors(
      inspectedPlant.closeStartScale,
      inspectedPlant.sourceScale,
      eased,
    );

    if (inspectedPlant.t >= 1) {
      const completed = inspectedPlant;
      restorePlantInstance(completed);
      scene.remove(completed.clone);
      controls.enabled = completed.previousControlsEnabled;
      inspectedPlant = null;
      markShadowMapDirty();
    }
    return;
  }

  computePlantInspectionTarget(inspectedPlant);
  if (inspectedPlant.phase === 'opening') {
    inspectedPlant.t = Math.min(1, inspectedPlant.t + deltaSeconds / PLANT_INSPECTION_ANIMATION_SECONDS);
    const eased = easeOutCubic(inspectedPlant.t);
    inspectedPlant.clone.position.lerpVectors(
      inspectedPlant.sourcePosition,
      inspectedPlant.targetPosition,
      eased,
    );
    inspectedPlant.clone.quaternion.slerpQuaternions(
      inspectedPlant.sourceQuaternion,
      inspectedPlant.targetQuaternion,
      eased,
    );
    inspectedPlant.clone.scale.lerpVectors(
      inspectedPlant.sourceScale,
      inspectedPlant.targetScale,
      eased,
    );
    if (inspectedPlant.t >= 1) inspectedPlant.phase = 'open';
    return;
  }

  inspectedPlant.clone.position.copy(inspectedPlant.targetPosition);
  inspectedPlant.clone.quaternion.copy(inspectedPlant.targetQuaternion);
  inspectedPlant.clone.scale.copy(inspectedPlant.targetScale);
}

function computePlantInspectionTarget(plant) {
  const box = plant.clone.geometry.boundingBox;
  const height = Math.max(0.5, (box.max.y - box.min.y) * plant.sourceScale.y);
  const displayBoost = THREE.MathUtils.clamp(3.1 / height, 1, 2.35);
  const displayHeight = height * displayBoost;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = THREE.MathUtils.clamp(displayHeight / (2 * Math.tan(fov / 2) * 0.62), 4.2, 16);
  const viewportHeight = 2 * distance * Math.tan(fov / 2);
  const viewportWidth = viewportHeight * camera.aspect;

  camera.getWorldDirection(plantInspectionForward).normalize();
  plantInspectionRight.crossVectors(plantInspectionForward, camera.up).normalize();
  plantInspectionUp.crossVectors(plantInspectionRight, plantInspectionForward).normalize();
  box.getCenter(plantInspectionLocalCenter);
  plantInspectionRotationQuaternion.setFromAxisAngle(plantInspectionYAxis, plant.rotationY);
  plant.targetQuaternion.copy(plant.baseQuaternion).multiply(plantInspectionRotationQuaternion);

  plantInspectionDesiredCenter
    .copy(camera.position)
    .addScaledVector(plantInspectionForward, distance)
    .addScaledVector(plantInspectionRight, -Math.min(viewportWidth * 0.16, 3.0))
    .addScaledVector(plantInspectionUp, viewportHeight * 0.02);

  plantInspectionTargetScale.copy(plant.sourceScale).multiplyScalar(displayBoost);
  plantInspectionOffset
    .copy(plantInspectionLocalCenter)
    .multiply(plantInspectionTargetScale)
    .applyQuaternion(plant.targetQuaternion);

  plantInspectionTargetPosition
    .copy(plantInspectionDesiredCenter)
    .sub(plantInspectionOffset);

  plant.targetPosition.copy(plantInspectionTargetPosition);
  plant.targetScale.copy(plantInspectionTargetScale);
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---------- Sun update ----------
function updateSun() {
  const rain01 = rainAmountForDate(params.timeOfYear);
  skyCtl.setRainAmount(rain01);
  const dir = skyCtl.update({ azimuth: params.sunAzimuth, elevation: params.sunElevation });
  rainOverlay.setActive(rain01 > 0);
  updateRendererExposure(rain01);
  updateLightAnchors(dir);
  markShadowMapDirty();
  desertUi?.setSunControls({
    timeOfDay: params.timeOfDay,
    timeOfYear: params.timeOfYear,
    sunAzimuth: params.sunAzimuth,
  });
  // Warm color near horizon, cooler higher up, then dim after sunset.
  const elev01 = THREE.MathUtils.clamp(params.sunElevation / 60, 0, 1);
  const daylight01 = THREE.MathUtils.smoothstep(params.sunElevation, -4, 8);
  const night01 = 1 - THREE.MathUtils.smoothstep(params.sunElevation, -18, -2);
  const sunset01 =
    (1 - THREE.MathUtils.smoothstep(params.sunElevation, 12, 45)) *
    (1 - night01);
  sunColor.copy(sunWarmColor).lerp(sunCoolColor, elev01 * 0.85).lerp(sunNightColor, night01);
  sun.color.copy(sunColor);
  const daylightIntensity = THREE.MathUtils.lerp(0.85, 3.35, Math.pow(elev01, 0.72)) + sunset01 * 0.24;
  sun.intensity = THREE.MathUtils.lerp(0.0, daylightIntensity, daylight01) * THREE.MathUtils.lerp(1.0, 0.34, rain01);

  const moonAltitude01 = THREE.MathUtils.smoothstep(skyCtl.moon.y, 0.02, 0.42);
  const moonPresence = night01 * moonAltitude01;
  moonLight.intensity = THREE.MathUtils.lerp(0.0, 0.24, moonPresence) * THREE.MathUtils.lerp(1.0, 0.42, rain01);
  moonLight.color.set(0xaec0ff).lerp(moonLightHighColor, moonAltitude01 * 0.42);
  moonAmbient.intensity = THREE.MathUtils.lerp(0.0, 0.16, moonPresence) * THREE.MathUtils.lerp(1.0, 0.56, rain01);
  moonAmbient.color.copy(moonAmbientSkyColor).lerp(moonAmbientHighColor, moonAltitude01 * 0.24);
  moonAmbient.groundColor.copy(moonAmbientGroundColor);
  skyFill.intensity = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(0.055, 0.18, daylight01),
    THREE.MathUtils.lerp(0.025, 0.055, moonPresence),
    night01,
  ) * THREE.MathUtils.lerp(1.0, 0.62, rain01);
  skyFill.color.copy(skyFillDayColor)
    .lerp(skyFillTwilightColor, sunset01 * 0.62)
    .lerp(skyFillNightColor, night01);
  skyFill.position.copy(skyCtl.sun).multiplyScalar(-44).addScaledVector(camera.up, 24).add(controls.target);
  skyFill.target.position.copy(controls.target);
  sandBounce.intensity = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(0.035, 0.18, daylight01) * THREE.MathUtils.lerp(1.18, 0.78, elev01),
    0.0,
    night01,
  ) * THREE.MathUtils.lerp(1.0, 0.32, rain01);
  sandBounce.color.copy(sandBounceDayColor)
    .lerp(sandBounceSunsetColor, sunset01 * 0.72)
    .lerp(sandBounceNightColor, night01);
  updateSandBounceAnchor(dir);

  // Keep the base fog darker at sunset; material shaders add the sunward glow directionally.
  fogColor.copy(fogWarmColor)
    .lerp(fogCoolColor, elev01 * 0.42)
    .lerp(fogVioletColor, sunset01 * 0.58)
    .lerp(fogNightColor, night01)
    .lerp(fogRainColor, rain01 * 0.76);
  scene.fog.color.copy(fogColor);
  const dayFogDensity = THREE.MathUtils.lerp(1.28, 0.84, elev01);
  const sunsetFogDensity = THREE.MathUtils.lerp(dayFogDensity, 0.78, sunset01);
  scene.fog.density = params.fogDensity * THREE.MathUtils.lerp(sunsetFogDensity, 0.62, night01) * THREE.MathUtils.lerp(1.0, 2.35, rain01);
  directionalFogUniforms.directionalFogSunsetAmount.value = sunset01;
  directionalFogUniforms.directionalFogNightAmount.value = night01;
  directionalFogUniforms.directionalFogSunColor.value.copy(fogSunsetSunColor).lerp(fogNightColor, night01 * 0.55);
  directionalFogUniforms.directionalFogShadowColor.value.copy(fogSunsetShadowColor).lerp(fogNightColor, night01 * 0.72);
  updateDirectionalFogViewUniforms();
  hemi.intensity = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(0.10, 0.42, daylight01),
    0.055,
    night01,
  ) * THREE.MathUtils.lerp(1.0, 0.68, rain01);
  hemi.color.set(0xb8d8ff)
    .lerp(hemiSunsetColor, sunset01 * 0.35)
    .lerp(hemiNightColor, night01);
  hemi.groundColor.set(0xb98260)
    .lerp(hemiGroundSunsetColor, sunset01 * 0.45)
    .lerp(hemiGroundNightColor, night01);
  updateAtmosphereEnvironment({ elev01, daylight01, sunset01, night01 });
  setEnvironmentIntensity(THREE.MathUtils.lerp(0.06, 0.22, daylight01) * (1 - night01 * 0.45) * THREE.MathUtils.lerp(1.0, 0.58, rain01));
  updateLensFlare();
}

function updateRendererExposure(rain01 = rainAmountForDate(params.timeOfYear)) {
  renderer.toneMappingExposure = params.exposure * THREE.MathUtils.lerp(1.0, 0.82, rain01);
}

function updateLightAnchors(sunDirection = skyCtl.sun) {
  sun.target.position.copy(controls.target);
  sun.position.copy(sunDirection).multiplyScalar(80).add(controls.target);
  moonLight.target.position.copy(controls.target);
  moonLight.position.copy(skyCtl.moon).multiplyScalar(80).add(controls.target);
  skyFill.target.position.copy(controls.target);
  skyFill.position.copy(sunDirection).multiplyScalar(-44).addScaledVector(camera.up, 24).add(controls.target);
  updateSandBounceAnchor(sunDirection);
  updateShadowCameraFootprint();
}

function updateSandBounceAnchor(sunDirection = skyCtl.sun) {
  const horizontalSun = new THREE.Vector3(sunDirection.x, 0, sunDirection.z);
  if (horizontalSun.lengthSq() < 0.0001) horizontalSun.set(0, 0, 1);
  horizontalSun.normalize();
  sandBounce.position.copy(controls.target)
    .addScaledVector(horizontalSun, -30)
    .addScaledVector(camera.up, -16);
  sandBounce.target.position.copy(controls.target).addScaledVector(camera.up, 12);
}

function updateShadowCameraFootprint() {
  const lowSun = 1 - THREE.MathUtils.smoothstep(params.sunElevation, 8, 34);
  const span = THREE.MathUtils.lerp(34, 52, lowSun);
  const shadowCamera = sun.shadow.camera;
  if (shadowCamera.left === -span) return;
  shadowCamera.left = -span;
  shadowCamera.right = span;
  shadowCamera.top = span;
  shadowCamera.bottom = -span;
  shadowCamera.updateProjectionMatrix();
}

function markShadowMapDirty() {
  renderer.shadowMap.needsUpdate = true;
}

function updateShadowMapInvalidation() {
  if (controls.target.distanceToSquared(shadowTargetPosition) <= SHADOW_UPDATE_TARGET_EPSILON_SQ) return;
  shadowTargetPosition.copy(controls.target);
  markShadowMapDirty();
}

function updateLensFlare() {
  sunLensFlare.update({
    camera,
    sunDirection: skyCtl.sun,
    sunElevation: params.sunElevation,
    enabled: params.lensFlare && rainAmountForDate(params.timeOfYear) === 0,
  });
}

function updateDirectionalFogViewUniforms() {
  directionalFogSunViewScratch.copy(skyCtl.sun).transformDirection(camera.matrixWorldInverse);
  directionalFogUpViewScratch.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  directionalFogUniforms.directionalFogSunViewDirection.value.copy(directionalFogSunViewScratch);
  directionalFogUniforms.directionalFogUpViewDirection.value.copy(directionalFogUpViewScratch);
}

function installDirectionalFog(material) {
  if (material.userData.directionalFogInstalled) return material;
  material.userData.directionalFogInstalled = true;
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, rendererArg) => {
    previousOnBeforeCompile(shader, rendererArg);
    shader.uniforms.directionalFogSunViewDirection = directionalFogUniforms.directionalFogSunViewDirection;
    shader.uniforms.directionalFogUpViewDirection = directionalFogUniforms.directionalFogUpViewDirection;
    shader.uniforms.directionalFogSunsetAmount = directionalFogUniforms.directionalFogSunsetAmount;
    shader.uniforms.directionalFogNightAmount = directionalFogUniforms.directionalFogNightAmount;
    shader.uniforms.directionalFogSunColor = directionalFogUniforms.directionalFogSunColor;
    shader.uniforms.directionalFogShadowColor = directionalFogUniforms.directionalFogShadowColor;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 directionalFogSunViewDirection;
uniform vec3 directionalFogUpViewDirection;
uniform float directionalFogSunsetAmount;
uniform float directionalFogNightAmount;
uniform vec3 directionalFogSunColor;
uniform vec3 directionalFogShadowColor;

vec3 directionalFogColor(vec3 baseFogColor) {
  vec3 viewRay = normalize(-vViewPosition);
  float sunFacing = dot(viewRay, normalize(directionalFogSunViewDirection)) * 0.5 + 0.5;
  float worldHorizon = 1.0 - smoothstep(0.035, 0.48, abs(dot(viewRay, normalize(directionalFogUpViewDirection))));
  float sunsetFog = directionalFogSunsetAmount * worldHorizon * (1.0 - directionalFogNightAmount);
  float sunwardGlow = smoothstep(0.48, 1.0, sunFacing);
  float shadowSide = 1.0 - smoothstep(0.18, 0.72, sunFacing);
  vec3 duskFog = mix(baseFogColor, directionalFogShadowColor, shadowSide * 0.78);
  duskFog = mix(duskFog, directionalFogSunColor, sunwardGlow * 0.46);
  return mix(baseFogColor, duskFog, sunsetFog);
}`,
      )
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, directionalFogColor(fogColor), fogFactor );
#endif`,
      );
  };
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => {
    const baseKey = previousCacheKey ? previousCacheKey() : '';
    return `${baseKey}|directional-fog-v1`;
  };
  material.needsUpdate = true;
  return material;
}

function registerEnvironmentMaterial(material, scale = 1) {
  installDirectionalFog(material);
  material.userData.environmentScale = scale;
  environmentMaterials.add(material);
  material.envMapIntensity = currentEnvironmentIntensity * scale;
  return material;
}

function setEnvironmentIntensity(intensity) {
  currentEnvironmentIntensity = intensity;
  for (const material of environmentMaterials) {
    material.envMapIntensity = intensity * (material.userData.environmentScale ?? 1);
  }
}

function createAtmosphereEnvironmentTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d', { alpha: false });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.userData.context = context;
  return texture;
}

function updateAtmosphereEnvironment({ elev01, daylight01, sunset01, night01 }) {
  const context = environmentTexture.userData.context;
  if (!context) return;

  const zenith = new THREE.Color(0x6f9ed4)
    .lerp(new THREE.Color(0x355586), sunset01 * 0.28)
    .lerp(new THREE.Color(0x080c20), night01);
  const horizon = new THREE.Color(0xf4bd83)
    .lerp(new THREE.Color(0xf08d5b), sunset01 * 0.48)
    .lerp(new THREE.Color(0x171a35), night01);
  const ground = new THREE.Color(0xb98557)
    .lerp(new THREE.Color(0x9a5d4f), sunset01 * 0.34)
    .lerp(new THREE.Color(0x090812), night01);
  const upperLift = THREE.MathUtils.lerp(0.74, 1.18, daylight01) * THREE.MathUtils.lerp(1.0, 0.34, night01);
  const groundLift = THREE.MathUtils.lerp(0.50, 0.86, elev01) * THREE.MathUtils.lerp(1.0, 0.24, night01);

  const gradient = context.createLinearGradient(0, 0, 0, context.canvas.height);
  gradient.addColorStop(0.00, canvasColor(zenith, upperLift));
  gradient.addColorStop(0.42, canvasColor(horizon, 1.0 + sunset01 * 0.18));
  gradient.addColorStop(0.55, canvasColor(horizon, 0.78));
  gradient.addColorStop(1.00, canvasColor(ground, groundLift));
  context.fillStyle = gradient;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  environmentTexture.needsUpdate = true;
}

function canvasColor(color, intensity = 1) {
  const r = Math.round(THREE.MathUtils.clamp(color.r * intensity, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g * intensity, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b * intensity, 0, 1) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- GUI ----------
function trackGuiController(controller) {
  guiControllers.push(controller);
  return controller;
}

function addGuiControl(folder, property, ...args) {
  return trackGuiController(folder.add(params, property, ...args));
}

function refreshGui() {
  for (const controller of guiControllers) {
    controller.updateDisplay();
  }
}

const gui = new GUI({ title: 'Desert generator' });
gui.domElement.style.display = 'none';
gui.domElement.style.top = '74px';

const fGen = gui.addFolder('General');
addGuiControl(fGen, 'seed').name('seed').onFinishChange(regenerate);
addGuiControl(fGen, 'randomSeed').name('random seed');
addGuiControl(fGen, 'regenerate').name('regenerate');

const fTer = gui.addFolder('Terrain');
addGuiControl(fTer, 'terrainSize', 60, 240, 10).onChange(scheduleRegenerate);
addGuiControl(fTer, 'terrainSegments', 120, 480, 1).onChange(scheduleRegenerate).name('render resolution');
addGuiControl(fTer, 'hydrologySegments', 24, 160, 1).onChange(scheduleRegenerate).name('water resolution');
addGuiControl(fTer, 'heightScale', 0.5, 12, 0.1).onChange(scheduleRegenerate).name('height');
addGuiControl(fTer, 'macroScale', 0.003, 0.04, 0.001).onChange(scheduleRegenerate).name('hill scale');
addGuiControl(fTer, 'ridgeScale', 0.01, 0.2, 0.005).onChange(scheduleRegenerate).name('ridge scale');
addGuiControl(fTer, 'rippleScale', 0.05, 1.0, 0.05).onChange(scheduleRegenerate).name('ripple scale');
addGuiControl(fTer, 'washStrength', 0, 1.5, 0.05).onChange(scheduleRegenerate).name('wash depth');
addGuiControl(fTer, 'fanStrength', 0, 1.8, 0.05).onChange(scheduleRegenerate).name('alluvial fans');
addGuiControl(fTer, 'erosionStrength', 0, 1.5, 0.05).onChange(scheduleRegenerate).name('erosion');
addGuiControl(fTer, 'rockySlopeStrength', 0, 1.4, 0.05).onChange(scheduleRegenerate).name('rock faces');
fTer.close();

const fSag = gui.addFolder('Saguaros');
addGuiControl(fSag, 'saguaroEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fSag, 'saguaroDensity', 0, 0.05, 0.001).onChange(scheduleRegenerate).name('density');
addGuiControl(fSag, 'saguaroMaxHeight', 3, 12, 0.1).onChange(scheduleRegenerate).name('max height');
addGuiControl(fSag, 'saguaroArmProbability', 0, 1, 0.05).onChange(scheduleRegenerate).name('arm chance');
addGuiControl(fSag, 'saguaroFlowering').onChange(updateSeasonalPlantVisibility).name('flowering');
addGuiControl(fSag, 'saguaroFruiting').onChange(updateSeasonalPlantVisibility).name('red fruit');

const fBar = gui.addFolder('Barrel cacti');
addGuiControl(fBar, 'barrelEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fBar, 'barrelDensity', 0, 0.1, 0.002).onChange(scheduleRegenerate).name('density');

const fCholla = gui.addFolder('Jumping cholla');
addGuiControl(fCholla, 'jumpingChollaEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fCholla, 'jumpingChollaDensity', 0, 0.04, 0.001).onChange(scheduleRegenerate).name('density');

const fPV = gui.addFolder('Palo verde');
addGuiControl(fPV, 'paloVerdeEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fPV, 'paloVerdeDensity', 0, 0.04, 0.001).onChange(scheduleRegenerate).name('density');
addGuiControl(fPV, 'paloVerdeFlowering').onChange(updateSeasonalPlantVisibility).name('flowering (spring)');

const fMesquite = gui.addFolder('Mesquite');
addGuiControl(fMesquite, 'mesquiteEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fMesquite, 'mesquiteDensity', 0, 0.025, 0.001).onChange(scheduleRegenerate).name('density');
addGuiControl(fMesquite, 'mesquiteSeedPods').onChange(updateSeasonalPlantVisibility).name('seed pods');

const fPP = gui.addFolder('Prickly pear');
addGuiControl(fPP, 'pricklyPearEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fPP, 'pricklyPearDensity', 0, 0.08, 0.002).onChange(scheduleRegenerate).name('density');

const fOco = gui.addFolder('Ocotillo');
addGuiControl(fOco, 'ocotilloEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fOco, 'ocotilloDensity', 0, 0.03, 0.001).onChange(scheduleRegenerate).name('density');
addGuiControl(fOco, 'ocotilloFlowering').onChange(updateSeasonalPlantVisibility).name('blooming');

const fCre = gui.addFolder('Creosote');
addGuiControl(fCre, 'creosoteEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fCre, 'creosoteDensity', 0, 0.2, 0.005).onChange(scheduleRegenerate).name('density');

const fRock = gui.addFolder('Rocks');
addGuiControl(fRock, 'smallRockDensity', 0, 0.6, 0.01).onChange(scheduleRegenerate).name('pebbles');
addGuiControl(fRock, 'largeRockDensity', 0, 0.05, 0.002).onChange(scheduleRegenerate).name('boulders');

const fSun = gui.addFolder('Sun & atmosphere');
addGuiControl(fSun, 'sunAzimuth', 0, 360, 1).onChange(updateSun).name('azimuth');
addGuiControl(fSun, 'sunElevation', -18, 80, 0.5).onChange(value => {
  params.timeOfDay = timeOfDayFromSunElevation(value, params.timeOfDay);
  updateSun();
}).name('elevation');
addGuiControl(fSun, 'fogDensity', 0, 0.02, 0.0005).onChange(updateSun).name('fog');
addGuiControl(fSun, 'exposure', 0.4, 1.6, 0.05).onChange(() => updateRendererExposure()).name('exposure');
addGuiControl(fSun, 'lensFlare').onChange(updateLensFlare).name('lens flare');
addGuiControl(fSun, 'cloudRate', 0, 5, 0.05).name('cloud rate');

// ---------- UI overlay ----------
let simpleControlsActive = true;

function setFullControlsVisible(isVisible) {
  simpleControlsActive = !isVisible;
  gui.domElement.style.display = isVisible ? '' : 'none';
  if (simpleControlsActive) {
    applySeasonalPlantState(params.timeOfYear);
  } else {
    updateSeasonalPlantVisibility();
  }
  refreshGui();
}

let timeRate = 1;
let timeIsPlaying = false;

desertUi = mountDesertUi(uiRoot, {
  initialTimeOfDay: params.timeOfDay,
  initialTimeOfYear: params.timeOfYear,
  initialSunAzimuth: params.sunAzimuth,
  onControlModeChange: setFullControlsVisible,
  onSunControlsChange: ({ timeOfDay, timeOfYear, sunAzimuth, sunElevation }) => {
    params.timeOfDay = timeOfDay;
    params.timeOfYear = timeOfYear;
    params.sunAzimuth = sunAzimuth;
    params.sunElevation = sunElevation;
    if (simpleControlsActive) {
      applySeasonalPlantState(timeOfYear);
    } else {
      updateSeasonalPlantVisibility();
    }
    updateSun();
    refreshGui();
  },
  onPlaybackChange: ({ isPlaying, rate }) => {
    timeIsPlaying = isPlaying;
    timeRate = rate;
  },
});

// ---------- First build + animation loop ----------
updateSeasonalPlantVisibility();
updateSun();
let lastTick = performance.now();
let cloudTime = 0;

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  markVisibilityCullingDirty();
}
window.addEventListener('resize', onResize);

function tick() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  const cloudMultiplier = timeIsPlaying ? timeRate : 1;
  cloudTime += deltaSeconds * params.cloudRate * cloudMultiplier;
  skyCtl.updateTime(cloudTime);
  updateFlight(deltaSeconds);
  updateTerrainChunks();
  controls.update();
  updateLightAnchors();
  updateShadowMapInvalidation();
  constrainCameraToWorld();
  updateVisibilityCulling(now);
  updatePlantInspection(deltaSeconds);
  updateLensFlare();
  updateDirectionalFogViewUniforms();
  rainOverlay.update(deltaSeconds);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
regenerate();
