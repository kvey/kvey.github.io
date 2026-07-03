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
import { mergeGeometries } from './plants/common.js';
import { createCactusSpineMaterial } from './materials/cactusSpineMaterial.js';
import { createCreosoteMaterial } from './materials/creosoteMaterial.js';
import { createOcotilloMaterial } from './materials/ocotilloMaterial.js';
import { createRockMaterial } from './materials/rockMaterial.js';
import { createTerrainMaterial } from './materials/terrainMaterial.js';
import { createTreeMaterial } from './materials/treeMaterial.js';
import { createSunLensFlare } from './lensFlare.js';
import { createProportionOracle } from './proportions.js';
import { createRainOverlay } from './rainOverlay.js';
import { installUncharted2Tonemapping } from './tonemapping.js';

installUncharted2Tonemapping(THREE);

// ---------- Renderer / scene boilerplate ----------
const app = document.getElementById('app');
const uiRoot = document.getElementById('ui-root');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.CustomToneMapping;
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
  ephemerals: { radiusScale: 0.30, minRadius: 0.12 },
  deadwood: { radiusScale: 0.70, minRadius: 0.25 },
  boulders: { radiusScale: 0.95, minRadius: 0.35 },
};
const cameraColliders = [];
const cameraColliderGrid = new Map();
const nearbyColliderScratch = [];
const cameraConstraintDelta = new THREE.Vector3();
const cameraFallbackPush = new THREE.Vector3();
let cameraColliderMaxRadius = 0;

// Only the `near` level carries the expensive per-blade mesh spines (see the
// highestLod gate in saguaro/barrel/jumpingCholla), so its distance doubles as
// the spine draw radius — keep it small so spines only appear on plants right
// next to the camera. `mid`/`far` are body-only and lean hard on lower
// tessellation to keep the triangle budget mobile-friendly.
const plantLodLevels = [
  { name: 'near', distance: 32, detailScale: 1, castShadow: true },
  { name: 'mid', distance: 78, detailScale: 0.58, castShadow: false },
  { name: 'far', distance: Infinity, detailScale: 0.26, castShadow: false },
];

const TERRAIN_CULL_DISTANCE = 420;
const DEFAULT_SCATTER_CULL_CELL = { size: 80, minInstances: 64 };
const SCATTER_CULL_CELL = {
  // LOD is chosen per cell from the distance to the cell's bounding-sphere
  // center, so cell size bounds how many instances flip to the expensive
  // `near` level together. minInstances must stay below a typical per-variant
  // bucket population (instances/chunk ÷ variantCount) or the bucket never
  // splits and the *whole chunk* pops to `near` at once — sparse stages like
  // jumpingCholla and the trees only have ~8-12 instances per bucket.
  paloVerde: { size: 64, minInstances: 8 },
  mesquite: { size: 64, minInstances: 8 },
  // Spine-bearing cacti use finer cells so per-cell LOD switches sharply near
  // the camera — the `near` cell you're standing in keeps its mesh spines while
  // neighbours a cell away drop to the body-only LOD. Half the cell diagonal
  // stays under plantLodLevels.near.distance so an adjacent plant reliably
  // resolves to the spine LOD.
  saguaro: { size: 44, minInstances: 8 },
  barrel: { size: 40, minInstances: 8 },
  jumpingCholla: { size: 44, minInstances: 4 },
  pricklyPear: { size: 48, minInstances: 8 },
  ocotillo: { size: 48, minInstances: 8 },
  creosote: { size: 56, minInstances: 48 },
  ephemerals: { size: 48, minInstances: 64 },
  deadwood: { size: 72, minInstances: 48 },
  pebbles: { size: 48, minInstances: 48 },
  boulders: { size: 80, minInstances: 32 },
};
const SCATTER_CULL_DISTANCE = {
  paloVerde: 300,
  mesquite: 300,
  saguaro: 320,
  // Small ground plants are sub-pixel well before these ranges — every metre
  // of cull radius is quadratic in far-LOD instance count.
  barrel: 150,
  jumpingCholla: 220,
  pricklyPear: 165,
  ocotillo: 220,
  creosote: 145,
  ephemerals: 125,
  deadwood: 180,
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
const LANDFORM_NAMES = Object.freeze([
  'rockySlope',
  'upperBajada',
  'wash',
  'washMargin',
  'lowerBajada',
  'sandyAlluvialFlat',
  'calicheFlat',
  'basinFlat',
]);
const SOIL_TEXTURE_NAMES = Object.freeze(['rock', 'gravel', 'wash alluvium', 'sand', 'loam', 'clay']);
const TERRAIN_DEBUG_MODES = Object.freeze(['natural', 'landform', 'soilTexture', 'runon', 'frost', 'rockCover']);
const DEBUG_OVERLAY_MODES = Object.freeze(['none', 'nurseZones', 'resourceZones', 'cloneCenters', 'all']);
const DEBUG_OVERLAY_TYPES = Object.freeze({
  treeNurse: 0,
  shrubNurse: 1,
  rockNurse: 2,
  resource: 3,
  pricklyPearPatch: 4,
  chollaColony: 5,
});
const GENERATION_STEPS = Object.freeze([
  {
    key: 'terrain',
    label: 'Terrain',
    phase: 'Shaping terrain and washes',
    explains: 'The worker builds the land surface first, including washes, bajadas, rocky slopes, soil texture, runoff, frost risk, and rock cover.',
    why: 'Every plant filter depends on those cell fields, so the ecological map has to exist before vegetation can make site decisions.',
  },
  {
    key: 'paloVerde',
    label: 'Palo verde',
    phase: 'Placing palo verde nurse trees',
    explains: 'Palo verdes are placed where runon, landform, slope, and spacing make a viable nurse-tree site.',
    why: 'Their canopy shade and root zones become high-quality nurse zones for young saguaros and annual plants.',
  },
  {
    key: 'mesquite',
    label: 'Mesquite',
    phase: 'Placing mesquite wash trees',
    explains: 'Mesquite is biased toward washes and floodplain positions, with upland shrub forms mixed in.',
    why: 'Mesquite creates strong fertility islands and shade, so later stages need its canopy and resource footprint.',
  },
  {
    key: 'ephemerals',
    label: 'Annuals',
    phase: 'Sprouting annuals under nurse trees',
    explains: 'Small seasonal flecks are seeded around tree life islands when rain and bloom state allow it.',
    why: 'These plants reveal recent rainfall and make nurse-tree resource islands visible at ground level.',
  },
  {
    key: 'creosote',
    label: 'Creosote',
    phase: 'Placing creosote matrix shrubs',
    explains: 'Creosote fills lower flats and dry bajada matrix positions while avoiding the wettest wash cores.',
    why: 'It provides weak shrub nursing and important spacing pressure before saguaros and smaller cactus stages run.',
  },
  {
    key: 'saguaro',
    label: 'Saguaros',
    phase: 'Placing saguaros',
    explains: 'Saguaros sample age cohorts, nurse protection, rock shelter, slope, frost risk, and mature-plant spacing.',
    why: 'Young saguaros usually need protection, while mature saguaros later alter local nurse metadata and resources.',
  },
  {
    key: 'ocotillo',
    label: 'Ocotillo',
    phase: 'Placing ocotillo rocky-slope accents',
    explains: 'Ocotillo is biased toward rocky slopes and upper bajadas, with seasonal leaf flush and blooms in geometry.',
    why: 'It adds a dry-slope community after the main nurse and saguaro structure is already established.',
  },
  {
    key: 'barrel',
    label: 'Barrels',
    phase: 'Placing barrel cacti',
    explains: 'Barrel cacti are placed with age stages, slope tolerance, spacing, and older leaning forms.',
    why: 'They occupy rocky and bajada micro-sites without driving the broader nurse-tree dependency graph.',
  },
  {
    key: 'pricklyPear',
    label: 'Prickly pear',
    phase: 'Placing prickly pear',
    explains: 'Prickly pear uses deterministic patch centers and local suitability to grow clumped pad colonies.',
    why: 'Patch centers keep colonies coherent across chunk edges and prevent uniform scatter.',
  },
  {
    key: 'jumpingCholla',
    label: 'Cholla',
    phase: 'Placing jumping cholla colonies',
    explains: 'Jumping cholla uses deterministic colony centers, age, fruit chains, and competition zones.',
    why: 'Colonies need to read as clustered populations, and older plants can later contribute skeletons.',
  },
  {
    key: 'deadwood',
    label: 'Deadwood',
    phase: 'Placing nurse remnants and cholla skeletons',
    explains: 'Dead nurse remnants and cholla skeletons are emitted from earlier mature-plant context.',
    why: 'This stage depends on previous stages because it represents the remains those plants leave behind.',
  },
  {
    key: 'pebbles',
    label: 'Pebbles',
    phase: 'Scattering pebble fields',
    explains: 'Small stones settle across terrain with local slope and sink adjustments.',
    why: 'Pebbles add surface texture after biological placement so they can stay cheap and visually subordinate.',
  },
  {
    key: 'boulders',
    label: 'Boulders',
    phase: 'Settling boulders',
    explains: 'Larger rocks are sunk and rotated into the terrain as the final heavy surface features.',
    why: 'They finish the scene with stable landmarks and shelter context without changing earlier plant decisions.',
  },
]);
const GENERATION_STEP_INDEX = new Map(GENERATION_STEPS.map((step, index) => [step.key, index]));
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
const terrainInspector = createTerrainInspector();
let terrainInspectorLastUpdate = -Infinity;

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
const deadwoodMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.94,
  metalness: 0,
});
const ephemeralMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  metalness: 0,
  side: THREE.DoubleSide,
  alphaTest: 0.18,
});
const debugOverlayMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.78,
  depthWrite: false,
});
const plantOutlineResolution = new THREE.Vector2();
renderer.getDrawingBufferSize(plantOutlineResolution);
const plantHoverMaskTarget = new THREE.WebGLRenderTarget(
  Math.max(1, Math.floor(plantOutlineResolution.x)),
  Math.max(1, Math.floor(plantOutlineResolution.y)),
  {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  },
);
plantHoverMaskTarget.texture.name = 'plant-hover-mask';
const plantHoverMaskMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
  fog: false,
  toneMapped: false,
});
const plantHoverOutlineMaterial = createPlantHoverOutlineMaterial(plantHoverMaskTarget.texture, plantOutlineResolution);
const chollaGlowResolution = new THREE.Vector2(
  Math.max(1, Math.floor(plantOutlineResolution.x * 0.5)),
  Math.max(1, Math.floor(plantOutlineResolution.y * 0.5)),
);
const chollaGlowMaskTarget = new THREE.WebGLRenderTarget(
  chollaGlowResolution.x,
  chollaGlowResolution.y,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  },
);
chollaGlowMaskTarget.texture.name = 'cholla-soft-spine-glow-mask';
const chollaGlowMaskMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
  fog: false,
  toneMapped: false,
});
const chollaGlowMaterial = createChollaSoftGlowMaterial(chollaGlowMaskTarget.texture, chollaGlowResolution);
const sharedMaterials = new Set([
  ocotilloMaterial,
  treeMaterial,
  cactusMaterial,
  creosoteMaterial,
  rockMaterial,
  deadwoodMaterial,
  ephemeralMaterial,
  debugOverlayMaterial,
  plantHoverMaskMaterial,
  plantHoverOutlineMaterial,
  chollaGlowMaskMaterial,
  chollaGlowMaterial,
]);
const environmentMaterials = new Set();
registerEnvironmentMaterial(ocotilloMaterial, 0.22);
registerEnvironmentMaterial(treeMaterial, 0.30);
registerEnvironmentMaterial(cactusMaterial, 0.18);
registerEnvironmentMaterial(creosoteMaterial, 0.26);
registerEnvironmentMaterial(rockMaterial, 0.62);
registerEnvironmentMaterial(deadwoodMaterial, 0.42);
registerEnvironmentMaterial(ephemeralMaterial, 0.34);
const SCATTER_GEOMETRY_CACHE_LIMIT = 192;
const PERF_LOG_PREFIX = '[desert-perf]';
const DEBUG_LOG_PREFIX = '[desert-debug]';
const scatterGeometryCache = new Map();
const cachedScatterGeometries = new Set();
const scatterGeometryRefs = new Map();

function createPlantHoverOutlineMaterial(maskTexture, resolution) {
  return new THREE.ShaderMaterial({
    name: 'plant-hover-outline',
    uniforms: {
      maskTexture: { value: maskTexture },
      outlineColor: { value: new THREE.Color(0xffe78a) },
      outlineWidth: { value: 4.0 },
      resolution: { value: resolution },
    },
    vertexShader: /* glsl */`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform sampler2D maskTexture;
uniform vec3 outlineColor;
uniform float outlineWidth;
uniform vec2 resolution;
varying vec2 vUv;

const int MAX_OUTLINE_RADIUS = 8;

void main() {
  float center = texture2D(maskTexture, vUv).r;
  if (center > 0.01) discard;

  vec2 texel = 1.0 / resolution;
  float edge = 0.0;
  for (int y = -MAX_OUTLINE_RADIUS; y <= MAX_OUTLINE_RADIUS; y++) {
    for (int x = -MAX_OUTLINE_RADIUS; x <= MAX_OUTLINE_RADIUS; x++) {
      vec2 offset = vec2(float(x), float(y));
      float distancePx = length(offset);
      if (distancePx <= 0.5 || distancePx > outlineWidth) continue;
      edge = max(edge, texture2D(maskTexture, vUv + offset * texel).r);
    }
  }

  if (edge <= 0.01) discard;
  gl_FragColor = vec4(outlineColor, 0.96);
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    lights: false,
    toneMapped: false,
  });
}

function createChollaSoftGlowMaterial(maskTexture, resolution) {
  return new THREE.ShaderMaterial({
    name: 'cholla-screen-spine-halo',
    uniforms: {
      maskTexture: { value: maskTexture },
      spineColor: { value: new THREE.Color(0xffd36a) },
      spineReach: { value: 13.0 },
      spineStrength: { value: 0.62 },
      resolution: { value: resolution },
    },
    vertexShader: /* glsl */`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform sampler2D maskTexture;
uniform vec3 spineColor;
uniform float spineReach;
uniform float spineStrength;
uniform vec2 resolution;
varying vec2 vUv;

const int MASK_RADIUS = 6;

float chollaHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float chollaSpineField(vec2 px, vec2 n) {
  vec2 t = vec2(-n.y, n.x);
  float along = dot(px, n);
  float field = 0.0;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float spacing = mix(2.1, 4.2, fi / 4.0);
    float slope = mix(-0.34, 0.34, chollaHash(fi * 31.7 + 4.1));
    float sideCoord = dot(px, t) + along * slope + fi * 17.0;
    float lane = floor(sideCoord / spacing);
    float laneHash = chollaHash(lane * 19.17 + fi * 71.31);
    float center = 0.5 + (laneHash - 0.5) * 0.62;
    float width = mix(0.055, 0.15, chollaHash(lane * 11.9 + fi * 8.3));
    float line = 1.0 - smoothstep(width, width + 0.10, abs(fract(sideCoord / spacing) - center));
    float broken = smoothstep(0.28, 0.96, chollaHash(lane * 29.41 + floor(along * 0.22) * 3.7 + fi));
    field += line * broken;
  }

  return clamp(field * 0.34, 0.0, 1.0);
}

void main() {
  float center = texture2D(maskTexture, vUv).r;
  vec2 texel = 1.0 / resolution;
  float nearby = 0.0;
  float weights = 0.0;
  float edge = 0.0;

  for (int y = -MASK_RADIUS; y <= MASK_RADIUS; y++) {
    for (int x = -MASK_RADIUS; x <= MASK_RADIUS; x++) {
      vec2 offset = vec2(float(x), float(y)) * 2.0;
      float distancePx = length(offset);
      if (distancePx <= 0.5 || distancePx > spineReach) continue;
      float mask = texture2D(maskTexture, vUv + offset * texel).r;
      float weight = exp(-distancePx * 0.24);
      nearby += mask * weight;
      weights += weight;
      edge = max(edge, abs(mask - center));
    }
  }

  nearby = weights > 0.0 ? nearby / weights : 0.0;

  float left = texture2D(maskTexture, vUv - vec2(texel.x * 2.0, 0.0)).r;
  float right = texture2D(maskTexture, vUv + vec2(texel.x * 2.0, 0.0)).r;
  float down = texture2D(maskTexture, vUv - vec2(0.0, texel.y * 2.0)).r;
  float up = texture2D(maskTexture, vUv + vec2(0.0, texel.y * 2.0)).r;
  vec2 normal = vec2(left - right, down - up);
  float normalLen = length(normal);
  normal = normalLen > 0.0001 ? normal / normalLen : normalize(vUv - vec2(0.5));

  float outsideBand = max(nearby - center * 0.38, 0.0);
  float innerFuzz = center * edge * 0.10;
  float spineField = chollaSpineField(vUv * resolution, normal);
  float grain = chollaHash(dot(floor(vUv * resolution * 0.72), vec2(13.1, 91.7)));
  float bristles = outsideBand * mix(0.12, 1.0, spineField) * smoothstep(0.04, 0.22, normalLen);
  float alpha = clamp((bristles * 1.55 + innerFuzz * mix(0.20, 0.55, grain)) * spineStrength, 0.0, 0.46);
  if (alpha <= 0.004) discard;

  vec3 base = mix(vec3(0.86, 0.62, 0.22), spineColor, 0.82);
  vec3 color = base * (0.72 + spineField * 0.55 + outsideBand * 0.25);
  gl_FragColor = vec4(color * alpha, alpha);
}`,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    fog: false,
    lights: false,
    toneMapped: false,
  });
}

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
const DEFAULT_DENSITY_PRESET = 'Tucson upland bajada';
const DENSITY_PRESETS = Object.freeze({
  'Tucson upland bajada': Object.freeze({
    saguaroDensity: SAGUARO_CENSUS_DENSITY,
    paloVerdeDensity: 0.010,
    mesquiteDensity: 0.0025,
    creosoteDensity: 0.055,
    barrelDensity: 0.026,
    pricklyPearDensity: 0.018,
    jumpingChollaDensity: 0.0035,
    ocotilloDensity: 0.007,
  }),
  'Wash corridor': Object.freeze({
    saguaroDensity: SAGUARO_CENSUS_DENSITY * 0.55,
    paloVerdeDensity: 0.014,
    mesquiteDensity: 0.010,
    creosoteDensity: 0.026,
    barrelDensity: 0.018,
    pricklyPearDensity: 0.024,
    jumpingChollaDensity: 0.002,
    ocotilloDensity: 0.004,
  }),
});
const DEFAULT_DENSITIES = DENSITY_PRESETS[DEFAULT_DENSITY_PRESET];

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
  terrainDebug: 'natural',
  debugOverlay: 'none',
  chunkEdgePadding: 1,
  logGenerationDebug: false,
  densityPreset: DEFAULT_DENSITY_PRESET,

  // Plant densities (instances per m^2)
  saguaroEnabled: true,
  saguaroDensity: DEFAULT_DENSITIES.saguaroDensity,
  saguaroMaxHeight: 7.0,
  saguaroArmProbability: 0.7,
  saguaroFlowering: DEFAULT_SEASONAL_PLANTS.saguaroFlowering,
  saguaroFruiting: DEFAULT_SEASONAL_PLANTS.saguaroFruiting,
  barrelEnabled: true,
  barrelDensity: DEFAULT_DENSITIES.barrelDensity,
  jumpingChollaEnabled: true,
  jumpingChollaDensity: DEFAULT_DENSITIES.jumpingChollaDensity,
  paloVerdeEnabled: true,
  paloVerdeDensity: DEFAULT_DENSITIES.paloVerdeDensity,
  paloVerdeFlowering: DEFAULT_SEASONAL_PLANTS.paloVerdeFlowering,
  paloVerdeSeedPods: DEFAULT_SEASONAL_PLANTS.paloVerdeSeedPods,
  mesquiteEnabled: true,
  mesquiteDensity: DEFAULT_DENSITIES.mesquiteDensity,
  mesquiteSeedPods: DEFAULT_SEASONAL_PLANTS.mesquiteSeedPods,
  mesquiteCatkins: DEFAULT_SEASONAL_PLANTS.mesquiteCatkins,
  pricklyPearEnabled: true,
  pricklyPearDensity: DEFAULT_DENSITIES.pricklyPearDensity,
  ocotilloEnabled: true,
  ocotilloDensity: DEFAULT_DENSITIES.ocotilloDensity,
  ocotilloFlowering: DEFAULT_SEASONAL_PLANTS.ocotilloFlowering,
  creosoteEnabled: true,
  creosoteDensity: DEFAULT_DENSITIES.creosoteDensity,
  recentRainDays: DEFAULT_SEASONAL_PLANTS.recentRainDays,
  monsoonRain_0_1: DEFAULT_SEASONAL_PLANTS.monsoonRain_0_1,
  winterRain_0_1: DEFAULT_SEASONAL_PLANTS.winterRain_0_1,
  postRainFlush: DEFAULT_SEASONAL_PLANTS.postRainFlush,
  monsoon: DEFAULT_SEASONAL_PLANTS.monsoon,
  springBloom: DEFAULT_SEASONAL_PLANTS.springBloom,
  preMonsoonDrought: DEFAULT_SEASONAL_PLANTS.preMonsoonDrought,
  winterCool: DEFAULT_SEASONAL_PLANTS.winterCool,
  creosoteFlowering: DEFAULT_SEASONAL_PLANTS.creosoteFlowering,
  creosoteRainFlush: DEFAULT_SEASONAL_PLANTS.creosoteRainFlush,
  ocotilloLeafFlush: DEFAULT_SEASONAL_PLANTS.ocotilloLeafFlush,
  paloVerdeLeafDensity: DEFAULT_SEASONAL_PLANTS.paloVerdeLeafDensity,
  saguaroHydration: DEFAULT_SEASONAL_PLANTS.saguaroHydration,
  barrelFlowering: DEFAULT_SEASONAL_PLANTS.barrelFlowering,
  pricklyPearFlowering: DEFAULT_SEASONAL_PLANTS.pricklyPearFlowering,
  pricklyPearFruiting: DEFAULT_SEASONAL_PLANTS.pricklyPearFruiting,
  chollaFruitChains: DEFAULT_SEASONAL_PLANTS.chollaFruitChains,

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
  const springBloom = day >= 60 && day <= 161;
  const monsoon = day >= 183 && day <= 273;
  const preMonsoonDrought = day >= 121 && day <= 181;
  const winterCool = day <= 59 || day >= 335;
  const monsoonRain = day >= 183 && day <= 273 ? 1 : 0;
  const winterRain = day >= 1 && day <= 59 || day >= 335 ? 0.65 : 0;
  const postRainFlush = rainAmountForDate(day) > 0;
  return {
    saguaroFlowering: day >= 110 && day <= 172,
    saguaroFruiting: day >= 158 && day <= 212,
    paloVerdeFlowering: day >= 74 && day <= 140,
    paloVerdeSeedPods: day >= 125 && day <= 190,
    ocotilloFlowering: day >= 60 && day <= 161,
    mesquiteSeedPods: day >= 135 && day <= 243,
    mesquiteCatkins: day >= 74 && day <= 135,
    creosoteFlowering: postRainFlush || winterRain > 0.4,
    creosoteRainFlush: postRainFlush,
    ocotilloLeafFlush: postRainFlush,
    paloVerdeLeafDensity: preMonsoonDrought ? 0.12 : monsoon || winterCool ? 0.68 : 0.42,
    saguaroHydration: monsoonRain > 0 ? 0.75 : preMonsoonDrought ? 0.12 : 0.36,
    barrelFlowering: monsoon || day >= 152 && day <= 274,
    pricklyPearFlowering: day >= 74 && day <= 151,
    pricklyPearFruiting: day >= 135 && day <= 273,
    chollaFruitChains: true,
    recentRainDays: postRainFlush ? 0 : 999,
    monsoonRain_0_1: monsoonRain,
    winterRain_0_1: winterRain,
    postRainFlush,
    monsoon,
    springBloom,
    preMonsoonDrought,
    winterCool,
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

function applyDensityPreset(name = params.densityPreset) {
  const preset = DENSITY_PRESETS[name];
  if (!preset) return;
  params.densityPreset = name;
  for (const [key, value] of Object.entries(preset)) {
    params[key] = value;
  }
  refreshGui();
  scheduleRegenerate();
}

function seasonalStateFromParams() {
  return {
    saguaroFlowering: params.saguaroFlowering,
    saguaroFruiting: params.saguaroFruiting,
    paloVerdeFlowering: params.paloVerdeFlowering,
    paloVerdeSeedPods: params.paloVerdeSeedPods,
    mesquiteSeedPods: params.mesquiteSeedPods,
    mesquiteCatkins: params.mesquiteCatkins,
    ocotilloFlowering: params.ocotilloFlowering,
    creosoteFlowering: params.creosoteFlowering,
    creosoteRainFlush: params.creosoteRainFlush,
    ocotilloLeafFlush: params.ocotilloLeafFlush,
    paloVerdeLeafDensity: params.paloVerdeLeafDensity,
    saguaroHydration: params.saguaroHydration,
    barrelFlowering: params.barrelFlowering,
    pricklyPearFlowering: params.pricklyPearFlowering,
    pricklyPearFruiting: params.pricklyPearFruiting,
    chollaFruitChains: params.chollaFruitChains,
    postRainFlush: params.postRainFlush,
    recentRainDays: params.recentRainDays,
    monsoon: params.monsoon,
    springBloom: params.springBloom,
    preMonsoonDrought: params.preMonsoonDrought,
    winterCool: params.winterCool,
    monsoonRain_0_1: params.monsoonRain_0_1,
    winterRain_0_1: params.winterRain_0_1,
  };
}

function rainAmountForDate(timeOfYear) {
  return Math.round(timeOfYear) === JULY_TENTH_DAY_OF_YEAR ? 1 : 0;
}

function updateSeasonalPlantVisibility() {
  const seasonalState = seasonalStateFromParams();
  cactusMaterial.userData.setSeasonalVisibility?.({
    seasonalState,
  });
  treeMaterial.userData.setSeasonalVisibility?.({
    seasonalState,
  });
  ocotilloMaterial.userData.setSeasonalVisibility?.({
    seasonalState,
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
let controlMode = 'simple';
let stepGenerationLimitKey = GENERATION_STEPS[GENERATION_STEPS.length - 1].key;
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
  clearPlantHoverOutline();
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
    if (message.type === 'debugOverlay') {
      enqueueApply(generation, 'debug overlays', 0.98, () => applyDebugOverlayData(message.chunkKey, message.overlay));
      return;
    }
    if (message.type === 'debug') {
      console.info(DEBUG_LOG_PREFIX, JSON.stringify(message.summary));
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
  const seasonalState = seasonalStateFromParams();
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
    chunkEdgePadding: params.chunkEdgePadding,
    logGenerationDebug: params.logGenerationDebug,
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
    mesquiteEnabled: params.mesquiteEnabled,
    mesquiteDensity: params.mesquiteDensity,
    pricklyPearEnabled: params.pricklyPearEnabled,
    pricklyPearDensity: params.pricklyPearDensity,
    ocotilloEnabled: params.ocotilloEnabled,
    ocotilloDensity: params.ocotilloDensity,
    creosoteEnabled: params.creosoteEnabled,
    creosoteDensity: params.creosoteDensity,
    seasonalState,
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
  clearPlantHoverOutline();
  chunk.group.traverse(obj => {
    if (obj.geometry) {
      if (cachedScatterGeometries.has(obj.geometry)) {
        releaseScatterGeometry(obj.geometry);
      } else {
        obj.geometry.dispose();
      }
    }
    if (obj.material) {
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

function createTerrainInfoSampler(data) {
  const positions = data.positions;
  const terrainDetail = data.terrainDetail;
  const terrainLandform = data.terrainLandform;
  const terrainDebugData = data.terrainDebugData;
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
    const nearestCol = tx < 0.5 ? x0 : x1;
    const nearestRow = tz < 0.5 ? z0 : z1;
    const nearest = nearestRow * gridStride + nearestCol;
    return {
      elevation_m: THREE.MathUtils.lerp(h0, h1, tz),
      landform: LANDFORM_NAMES[Math.round(terrainLandform?.[nearest] ?? 0)] ?? 'unknown',
      washGravel: bilerpAttribute(terrainDetail, i00, i10, i01, i11, tx, tz, 4, 0),
      shoulder: bilerpAttribute(terrainDetail, i00, i10, i01, i11, tx, tz, 4, 1),
      basin: bilerpAttribute(terrainDetail, i00, i10, i01, i11, tx, tz, 4, 2),
      slopeSignal: bilerpAttribute(terrainDetail, i00, i10, i01, i11, tx, tz, 4, 3),
      soilTexture: SOIL_TEXTURE_NAMES[Math.round(bilerpAttribute(terrainDebugData, i00, i10, i01, i11, tx, tz, 4, 0))] ?? 'unknown',
      runonIndex_0_1: bilerpAttribute(terrainDebugData, i00, i10, i01, i11, tx, tz, 4, 1),
      frostRisk_0_1: bilerpAttribute(terrainDebugData, i00, i10, i01, i11, tx, tz, 4, 2),
      rockCover_0_1: bilerpAttribute(terrainDebugData, i00, i10, i01, i11, tx, tz, 4, 3),
    };
  };
}

function bilerpAttribute(array, i00, i10, i01, i11, tx, tz, stride, offset) {
  const a00 = array[i00 * stride + offset];
  const a10 = array[i10 * stride + offset];
  const a01 = array[i01 * stride + offset];
  const a11 = array[i11 * stride + offset];
  const a0 = THREE.MathUtils.lerp(a00, a10, tx);
  const a1 = THREE.MathUtils.lerp(a01, a11, tx);
  return THREE.MathUtils.lerp(a0, a1, tz);
}

function terrainHeightAt(x, z) {
  const center = chunkCenterForPoint(x, z);
  const chunk = terrainChunks.get(chunkKey(center.cx, center.cz));
  if (chunk?.terrain?.sampleHeight) return chunk.terrain.sampleHeight(x, z);
  return null;
}

function terrainInfoAt(x, z) {
  const center = chunkCenterForPoint(x, z);
  const chunk = terrainChunks.get(chunkKey(center.cx, center.cz));
  if (chunk?.terrain?.sampleInfo) return chunk.terrain.sampleInfo(x, z);
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
  geometry.setAttribute('terrainLandform', new THREE.BufferAttribute(data.terrainLandform, 1));
  geometry.setAttribute('terrainDebugData', new THREE.BufferAttribute(data.terrainDebugData, 4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();

  const terrainMaterial = registerEnvironmentMaterial(createTerrainMaterial(), 0.46);
  terrainMaterial.userData.setTerrainDebugMode?.(params.terrainDebug);
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
    sampleInfo: createTerrainInfoSampler(data),
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
  group.userData.stageKey = stageKey;
  group.userData.stepVisible = isGenerationStepVisible(stageKey);
  group.visible = group.userData.stepVisible;
  const lodMeshes = [];
  let cullingSphere = null;

  for (let lodIdx = 0; lodIdx < geometryResults.length; lodIdx++) {
    const { geometry, level } = geometryResults[lodIdx];
    const inst = new THREE.InstancedMesh(geometry, config.material, instanceCount);
    inst.castShadow = level.castShadow ?? bucket.castShadow ?? config.castShadow ?? true;
    inst.receiveShadow = level.receiveShadow ?? bucket.receiveShadow ?? config.receiveShadow ?? true;
    inst.visible = group.userData.stepVisible && lodIdx === 0;
    inst.userData.lod = level.name;
    inst.userData.stageKey = stageKey;
    inst.userData.stepVisible = group.userData.stepVisible;
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

function applyDebugOverlayData(chunkKeyForOverlay, data) {
  const chunk = terrainChunks.get(chunkKeyForOverlay);
  if (!chunk) return true;
  if (chunk.debugOverlayGroup) {
    chunk.group.remove(chunk.debugOverlayGroup);
    disposeDebugOverlayGroup(chunk.debugOverlayGroup);
  }

  const overlayGroup = new THREE.Group();
  overlayGroup.name = `debug-overlay-${chunkKeyForOverlay}`;
  const categories = {
    nurseZones: buildDebugOverlayLines(data, type => type <= DEBUG_OVERLAY_TYPES.rockNurse),
    resourceZones: buildDebugOverlayLines(data, type => type === DEBUG_OVERLAY_TYPES.resource),
    cloneCenters: buildDebugOverlayLines(data, type => type === DEBUG_OVERLAY_TYPES.pricklyPearPatch || type === DEBUG_OVERLAY_TYPES.chollaColony),
  };
  for (const [category, line] of Object.entries(categories)) {
    if (!line) continue;
    line.userData.debugOverlayCategory = category;
    line.renderOrder = 12;
    overlayGroup.add(line);
  }
  chunk.debugOverlayGroup = overlayGroup;
  chunk.group.add(overlayGroup);
  updateDebugOverlayMode();
  markVisibilityCullingDirty();
  return true;
}

function buildDebugOverlayLines(data, includeType) {
  const zones = data?.zones;
  const stride = data?.stride ?? 5;
  if (!zones || zones.length < stride) return null;
  const segments = 48;
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < zones.length; i += stride) {
    const type = Math.round(zones[i]);
    if (!includeType(type)) continue;
    const x = zones[i + 1];
    const z = zones[i + 2];
    const radius = zones[i + 3];
    const strength = zones[i + 4];
    if (!Number.isFinite(radius) || radius <= 0) continue;
    debugOverlayColor(color, type, strength);
    const y = (terrainHeightAt(x, z) ?? 0) + 0.035;
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      positions.push(
        x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius,
        x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius,
      );
      for (let c = 0; c < 2; c++) colors.push(color.r, color.g, color.b);
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const line = new THREE.LineSegments(geometry, debugOverlayMaterial);
  line.frustumCulled = false;
  return line;
}

function debugOverlayColor(color, type, strength = 1) {
  if (type === DEBUG_OVERLAY_TYPES.treeNurse) color.setHex(0x64d19a);
  else if (type === DEBUG_OVERLAY_TYPES.shrubNurse) color.setHex(0xb8d25c);
  else if (type === DEBUG_OVERLAY_TYPES.rockNurse) color.setHex(0xc7b08a);
  else if (type === DEBUG_OVERLAY_TYPES.resource) color.setHex(0xf0a45f);
  else if (type === DEBUG_OVERLAY_TYPES.pricklyPearPatch) color.setHex(0xd078b2);
  else color.setHex(0x7eb6ff);
  color.lerp(new THREE.Color(0xffffff), THREE.MathUtils.clamp(strength, 0, 1) * 0.12);
  return color;
}

function disposeDebugOverlayGroup(group) {
  group.traverse(object => {
    if (object.geometry) object.geometry.dispose();
  });
}

function updateDebugOverlayMode() {
  for (const chunk of terrainChunks.values()) {
    const group = chunk.debugOverlayGroup;
    if (!group) continue;
    group.visible = params.debugOverlay !== 'none';
    group.traverse(object => {
      if (!object.userData?.debugOverlayCategory) return;
      object.visible = params.debugOverlay === 'all' || object.userData.debugOverlayCategory === params.debugOverlay;
    });
  }
  markVisibilityCullingDirty();
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

function isGenerationStepMode() {
  return controlMode === 'step';
}

function isGenerationStepVisible(stageKey) {
  if (!isGenerationStepMode()) return true;
  const stageIndex = GENERATION_STEP_INDEX.get(stageKey);
  if (stageIndex === undefined) return true;
  const limitIndex = GENERATION_STEP_INDEX.get(stepGenerationLimitKey) ?? GENERATION_STEPS.length - 1;
  return stageIndex <= limitIndex;
}

function applyGenerationStepVisibility() {
  clearPlantHoverOutline();
  for (const chunk of terrainChunks.values()) {
    for (const object of chunk.cullables) {
      const stageKey = object.userData?.stageKey;
      if (!stageKey) continue;
      const stepVisible = isGenerationStepVisible(stageKey);
      object.userData.stepVisible = stepVisible;
      if (!stepVisible) object.visible = false;
      const lodMeshes = object.userData?.culling?.lodMeshes;
      if (lodMeshes) {
        for (const mesh of lodMeshes) {
          mesh.userData.stepVisible = stepVisible;
          if (!stepVisible) mesh.visible = false;
        }
      }
    }
  }
  markVisibilityCullingDirty();
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
      const stepVisible = object.userData.stepVisible !== false && isGenerationStepVisible(object.userData.stageKey);
      const visible = stepVisible && (!culling || isCullingSphereVisible(culling.sphere, culling.maxDistance));
      object.visible = visible;
      if (visible && culling?.lodMeshes) {
        updateCullableLod(culling);
      } else if (!visible && culling?.lodMeshes) {
        for (const mesh of culling.lodMeshes) mesh.visible = false;
      }
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
    culling.lodMeshes[i].visible = culling.lodMeshes[i].userData.stepVisible !== false && i === activeLod;
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
    case 'ephemerals':
      return { generator: generateEphemeralFlecks, material: ephemeralMaterial, castShadow: false };
    case 'deadwood':
      return { generator: generateDeadwoodPlaceholder, material: deadwoodMaterial, castShadow: false };
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

function generateEphemeralFlecks(rng, opts = {}) {
  const detailScale = opts.detailScale ?? 1;
  const bloom = opts.bloom ?? false;
  const blades = Math.max(3, Math.round(rngRange(rng, 4, 9) * detailScale));
  const parts = [];
  const greenA = new THREE.Color(0x6f8d4d);
  const greenB = new THREE.Color(0xb5bb65);
  const flower = new THREE.Color(0xf1c84b);
  const color = new THREE.Color();

  for (let i = 0; i < blades; i++) {
    const w = rngRange(rng, 0.008, 0.018);
    const h = rngRange(rng, 0.035, 0.11) * THREE.MathUtils.lerp(0.72, 1.15, detailScale);
    const geom = new THREE.PlaneGeometry(w, h, 1, 1);
    geom.translate(0, h * 0.5, 0);
    geom.rotateY(rng() * Math.PI * 2);
    geom.rotateX(rngRange(rng, -0.28, 0.18));
    geom.translate(rngRange(rng, -0.09, 0.09), 0, rngRange(rng, -0.09, 0.09));
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    color.copy(greenA).lerp(greenB, rng());
    if (bloom && rng() < 0.20) color.lerp(flower, rngRange(rng, 0.35, 0.78));
    for (let v = 0; v < pos.count; v++) {
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geom);
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function generateDeadwoodPlaceholder(rng, opts = {}) {
  const detailScale = opts.detailScale ?? 1;
  const length = rngRange(rng, 0.34, 0.78) * THREE.MathUtils.lerp(0.82, 1.18, detailScale);
  const baseRadius = rngRange(rng, 0.022, 0.048);
  const tipRadius = baseRadius * rngRange(rng, 0.34, 0.62);
  const radial = Math.max(5, Math.round(7 * detailScale));
  const geom = new THREE.CylinderGeometry(tipRadius, baseRadius, length, radial, 3, false);
  geom.rotateZ(Math.PI * 0.5 + rngRange(rng, -0.10, 0.10));
  geom.rotateY(rngRange(rng, -0.18, 0.18));
  geom.translate(0, baseRadius * 0.62, 0);

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x6d5138);
  const gray = new THREE.Color(0xa08c72);
  const dark = new THREE.Color(0x3d3025);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const along = THREE.MathUtils.clamp(pos.getX(i) / Math.max(0.001, length) + 0.5, 0, 1);
    c.copy(base).lerp(gray, along * 0.34 + rng() * 0.10).lerp(dark, rng() * 0.18);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
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
const plantHoverPointer = { x: 0, y: 0, inside: false, dirty: false };
const plantHoverOutlineInstanceMatrix = new THREE.Matrix4();
const plantHoverOutlineWorldMatrix = new THREE.Matrix4();
const plantHoverOutlineEmptyGeometry = new THREE.BufferGeometry();
const plantHoverPreviousClearColor = new THREE.Color();
const plantHoverMaskScene = new THREE.Scene();
const plantHoverMaskMesh = new THREE.Mesh(plantHoverOutlineEmptyGeometry, plantHoverMaskMaterial);
plantHoverMaskMesh.name = 'plant-hover-mask';
plantHoverMaskMesh.castShadow = false;
plantHoverMaskMesh.receiveShadow = false;
plantHoverMaskMesh.frustumCulled = false;
plantHoverMaskMesh.matrixAutoUpdate = false;
plantHoverMaskMesh.visible = false;
plantHoverMaskScene.add(plantHoverMaskMesh);
const plantHoverOverlayScene = new THREE.Scene();
const plantHoverOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const plantHoverOverlayQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), plantHoverOutlineMaterial);
plantHoverOverlayQuad.frustumCulled = false;
plantHoverOverlayScene.add(plantHoverOverlayQuad);
const chollaGlowMaskScene = new THREE.Scene();
const chollaGlowOverlayScene = new THREE.Scene();
const chollaGlowOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const chollaGlowOverlayQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), chollaGlowMaterial);
chollaGlowOverlayQuad.frustumCulled = false;
chollaGlowOverlayScene.add(chollaGlowOverlayQuad);
const chollaGlowPreviousClearColor = new THREE.Color();
const chollaGlowMaskMeshes = new Map();
let plantHoverOutline = null;
let plantInspectionDragPointerId = null;
let plantInspectionDragLastX = 0;

renderer.domElement.addEventListener('contextmenu', onPlantContextMenu);
renderer.domElement.addEventListener('pointermove', onPlantHoverPointerMove);
renderer.domElement.addEventListener('pointerleave', onPlantHoverPointerLeave);
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

function onPlantHoverPointerMove(event) {
  plantHoverPointer.x = event.clientX;
  plantHoverPointer.y = event.clientY;
  plantHoverPointer.inside = true;
  plantHoverPointer.dirty = true;
}

function onPlantHoverPointerLeave() {
  plantHoverPointer.inside = false;
  plantHoverPointer.dirty = false;
  clearPlantHoverOutline();
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
  return pickPlantAtClientPoint(event.clientX, event.clientY);
}

function pickPlantAtClientPoint(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  plantInspectionPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  plantInspectionPointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
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

function updatePlantHoverOutline() {
  if (inspectedPlant || plantInspectionDragPointerId !== null) {
    clearPlantHoverOutline();
    return;
  }
  if (plantHoverOutline && !isVisibleInScene(plantHoverOutline.sourceMesh)) {
    plantHoverPointer.dirty = plantHoverPointer.inside;
  }
  if (!plantHoverPointer.inside) {
    clearPlantHoverOutline();
    return;
  }
  if (!plantHoverPointer.dirty) return;

  plantHoverPointer.dirty = false;
  setPlantHoverOutline(pickPlantAtClientPoint(plantHoverPointer.x, plantHoverPointer.y));
}

function setPlantHoverOutline(pick) {
  if (!pick?.mesh?.geometry || pick.instanceId === undefined || pick.instanceId === null) {
    clearPlantHoverOutline();
    return;
  }

  const sourceMesh = pick.mesh;
  const sourceGeometry = sourceMesh.geometry;
  if (
    plantHoverOutline?.sourceMesh === sourceMesh &&
    plantHoverOutline.instanceId === pick.instanceId
  ) {
    renderer.domElement.style.cursor = 'pointer';
    return;
  }

  if (plantHoverOutline?.sourceGeometry !== sourceGeometry) {
    releasePlantHoverOutlineGeometry();
    if (cachedScatterGeometries.has(sourceGeometry)) retainScatterGeometry(sourceGeometry);
  }

  sourceMesh.updateMatrixWorld(true);
  sourceMesh.getMatrixAt(pick.instanceId, plantHoverOutlineInstanceMatrix);
  plantHoverOutlineWorldMatrix.multiplyMatrices(sourceMesh.matrixWorld, plantHoverOutlineInstanceMatrix);

  plantHoverMaskMesh.geometry = sourceGeometry;
  plantHoverMaskMesh.matrix.copy(plantHoverOutlineWorldMatrix);
  plantHoverMaskMesh.visible = true;
  renderer.domElement.style.cursor = 'pointer';
  plantHoverOutline = {
    sourceMesh,
    sourceGeometry,
    instanceId: pick.instanceId,
  };
}

function clearPlantHoverOutline() {
  if (!plantHoverOutline && !plantHoverMaskMesh.visible) return;
  releasePlantHoverOutlineGeometry();
  plantHoverOutline = null;
  plantHoverMaskMesh.visible = false;
  plantHoverMaskMesh.geometry = plantHoverOutlineEmptyGeometry;
  renderer.domElement.style.cursor = '';
}

function releasePlantHoverOutlineGeometry() {
  const geometry = plantHoverOutline?.sourceGeometry;
  if (geometry && cachedScatterGeometries.has(geometry)) releaseScatterGeometry(geometry);
}

function renderPlantHoverOutline() {
  if (!plantHoverOutline || !plantHoverMaskMesh.visible) return;

  renderer.getClearColor(plantHoverPreviousClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  const previousRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(plantHoverMaskTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(plantHoverMaskScene, camera);
  renderer.setRenderTarget(previousRenderTarget);
  renderer.setClearColor(plantHoverPreviousClearColor, previousClearAlpha);

  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(plantHoverOverlayScene, plantHoverOverlayCamera);
  renderer.autoClear = previousAutoClear;
}

function renderChollaSoftGlow() {
  const seen = new Set();

  world.traverse(object => {
    if (
      object.isInstancedMesh &&
      object.userData.stageKey === 'jumpingCholla' &&
      object.visible &&
      object.count > 0 &&
      isVisibleInScene(object)
    ) {
      syncChollaGlowMaskSource(object, object.uuid, seen);
    }
  });

  if (inspectedPlant?.speciesKey === 'jumpingCholla' && inspectedPlant.clone?.visible) {
    syncChollaGlowMaskSource(inspectedPlant.clone, 'inspected-jumping-cholla', seen);
  }

  for (const [key, mesh] of chollaGlowMaskMeshes) {
    if (seen.has(key)) continue;
    chollaGlowMaskScene.remove(mesh);
    chollaGlowMaskMeshes.delete(key);
  }

  if (seen.size === 0) return;

  renderer.getClearColor(chollaGlowPreviousClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  const previousRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(chollaGlowMaskTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(chollaGlowMaskScene, camera);
  renderer.setRenderTarget(previousRenderTarget);
  renderer.setClearColor(chollaGlowPreviousClearColor, previousClearAlpha);

  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(chollaGlowOverlayScene, chollaGlowOverlayCamera);
  renderer.autoClear = previousAutoClear;
}

function syncChollaGlowMaskSource(source, key, seen) {
  const needsInstancing = source.isInstancedMesh;
  let mask = chollaGlowMaskMeshes.get(key);
  if (!mask || mask.geometry !== source.geometry || mask.isInstancedMesh !== needsInstancing) {
    if (mask) chollaGlowMaskScene.remove(mask);
    mask = needsInstancing
      ? new THREE.InstancedMesh(source.geometry, chollaGlowMaskMaterial, Math.max(1, source.count))
      : new THREE.Mesh(source.geometry, chollaGlowMaskMaterial);
    mask.name = `cholla-soft-glow-mask-${key}`;
    mask.castShadow = false;
    mask.receiveShadow = false;
    mask.frustumCulled = false;
    mask.matrixAutoUpdate = false;
    chollaGlowMaskScene.add(mask);
    chollaGlowMaskMeshes.set(key, mask);
  }

  if (needsInstancing) {
    mask.count = source.count;
    mask.instanceMatrix = source.instanceMatrix;
  }

  source.updateMatrixWorld(true);
  mask.matrix.copy(source.matrixWorld);
  mask.visible = source.visible;
  seen.add(key);
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
  clearPlantHoverOutline();

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

function updateTerrainDebugMode() {
  for (const material of environmentMaterials) {
    material.userData.setTerrainDebugMode?.(params.terrainDebug);
  }
  updateTerrainInspector(performance.now(), true);
}

function updateTerrainCameraUniforms() {
  for (const material of environmentMaterials) {
    material.userData.setTerrainCameraPosition?.(camera.position);
  }
}

function createTerrainInspector() {
  const element = document.createElement('div');
  element.style.cssText = [
    'position:fixed',
    'left:18px',
    'bottom:18px',
    'z-index:24',
    'pointer-events:none',
    'display:none',
    'min-width:220px',
    'padding:10px 12px',
    'border:1px solid rgba(255,247,234,0.22)',
    'border-radius:12px',
    'background:rgba(28,21,17,0.48)',
    'backdrop-filter:blur(18px) saturate(160%)',
    '-webkit-backdrop-filter:blur(18px) saturate(160%)',
    'box-shadow:0 10px 28px rgba(15,8,3,0.28)',
    'color:#fff8ec',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'text-shadow:0 1px 2px rgba(20,12,5,0.45)',
  ].join(';');
  document.body.appendChild(element);
  return element;
}

function updateTerrainInspector(now = performance.now(), force = false) {
  if (params.terrainDebug === 'natural') {
    terrainInspector.style.display = 'none';
    return;
  }
  if (!force && now - terrainInspectorLastUpdate < 120) return;
  terrainInspectorLastUpdate = now;
  const info = terrainInfoAt(controls.target.x, controls.target.z);
  terrainInspector.style.display = 'block';
  if (!info) {
    terrainInspector.textContent = `${params.terrainDebug}: loading`;
    return;
  }
  terrainInspector.innerHTML = [
    `<strong style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase">Target Cell</strong>`,
    `debug: ${escapeHtml(params.terrainDebug)}`,
    `landform: ${escapeHtml(info.landform)}`,
    `soil: ${escapeHtml(info.soilTexture)}`,
    `x/z: ${formatCellNumber(controls.target.x)} / ${formatCellNumber(controls.target.z)}`,
    `elevation: ${formatCellNumber(info.elevation_m)} m`,
    `wash gravel: ${formatCellNumber(info.washGravel)}`,
    `runon: ${formatCellNumber(info.runonIndex_0_1)}`,
    `frost: ${formatCellNumber(info.frostRisk_0_1)}`,
    `rock cover: ${formatCellNumber(info.rockCover_0_1)}`,
    `shoulder: ${formatCellNumber(info.shoulder)}`,
    `basin: ${formatCellNumber(info.basin)}`,
    `slope signal: ${formatCellNumber(info.slopeSignal)}`,
  ].join('<br>');
}

function formatCellNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
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
addGuiControl(fGen, 'logGenerationDebug').name('log debug JSON');
addGuiControl(fGen, 'densityPreset', Object.keys(DENSITY_PRESETS)).onChange(applyDensityPreset).name('density preset');

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
addGuiControl(fTer, 'chunkEdgePadding', 0, 8, 0.25).onChange(scheduleRegenerate).name('edge padding');
addGuiControl(fTer, 'terrainDebug', TERRAIN_DEBUG_MODES).onChange(updateTerrainDebugMode).name('debug shading');
addGuiControl(fTer, 'debugOverlay', DEBUG_OVERLAY_MODES).onChange(updateDebugOverlayMode).name('debug overlay');
fTer.close();

const fSag = gui.addFolder('Saguaros');
addGuiControl(fSag, 'saguaroEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fSag, 'saguaroDensity', 0, 0.05, 0.001).onChange(scheduleRegenerate).name('art multiplier');
addGuiControl(fSag, 'saguaroMaxHeight', 3, 12, 0.1).onChange(scheduleRegenerate).name('max height');
addGuiControl(fSag, 'saguaroArmProbability', 0, 1, 0.05).onChange(scheduleRegenerate).name('arm chance');
addGuiControl(fSag, 'saguaroFlowering').onChange(updateSeasonalPlantVisibility).name('flowering');
addGuiControl(fSag, 'saguaroFruiting').onChange(updateSeasonalPlantVisibility).name('red fruit');

const fBar = gui.addFolder('Barrel cacti');
addGuiControl(fBar, 'barrelEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fBar, 'barrelDensity', 0, 0.1, 0.002).onChange(scheduleRegenerate).name('art multiplier');

const fCholla = gui.addFolder('Jumping cholla');
addGuiControl(fCholla, 'jumpingChollaEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fCholla, 'jumpingChollaDensity', 0, 0.04, 0.001).onChange(scheduleRegenerate).name('art multiplier');

const fPV = gui.addFolder('Palo verde');
addGuiControl(fPV, 'paloVerdeEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fPV, 'paloVerdeDensity', 0, 0.04, 0.001).onChange(scheduleRegenerate).name('art multiplier');
addGuiControl(fPV, 'paloVerdeFlowering').onChange(updateSeasonalPlantVisibility).name('flowering (spring)');

const fMesquite = gui.addFolder('Mesquite');
addGuiControl(fMesquite, 'mesquiteEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fMesquite, 'mesquiteDensity', 0, 0.025, 0.001).onChange(scheduleRegenerate).name('art multiplier');
addGuiControl(fMesquite, 'mesquiteSeedPods').onChange(updateSeasonalPlantVisibility).name('seed pods');

const fPP = gui.addFolder('Prickly pear');
addGuiControl(fPP, 'pricklyPearEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fPP, 'pricklyPearDensity', 0, 0.08, 0.002).onChange(scheduleRegenerate).name('art multiplier');

const fOco = gui.addFolder('Ocotillo');
addGuiControl(fOco, 'ocotilloEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fOco, 'ocotilloDensity', 0, 0.03, 0.001).onChange(scheduleRegenerate).name('art multiplier');
addGuiControl(fOco, 'ocotilloFlowering').onChange(updateSeasonalPlantVisibility).name('blooming');

const fCre = gui.addFolder('Creosote');
addGuiControl(fCre, 'creosoteEnabled').onChange(scheduleRegenerate).name('enabled');
addGuiControl(fCre, 'creosoteDensity', 0, 0.2, 0.005).onChange(scheduleRegenerate).name('art multiplier');

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

function setControlMode(nextMode) {
  controlMode = nextMode;
  simpleControlsActive = nextMode === 'simple';
  gui.domElement.style.display = nextMode === 'full' ? '' : 'none';
  if (simpleControlsActive) {
    applySeasonalPlantState(params.timeOfYear);
  } else {
    updateSeasonalPlantVisibility();
  }
  applyGenerationStepVisibility();
  refreshGui();
}

function setGenerationStepLimit(stageKey) {
  if (!GENERATION_STEP_INDEX.has(stageKey)) return;
  stepGenerationLimitKey = stageKey;
  applyGenerationStepVisibility();
}

let timeRate = 1;
let timeIsPlaying = false;

desertUi = mountDesertUi(uiRoot, {
  initialTimeOfDay: params.timeOfDay,
  initialTimeOfYear: params.timeOfYear,
  initialSunAzimuth: params.sunAzimuth,
  generationSteps: GENERATION_STEPS,
  initialGenerationStepKey: stepGenerationLimitKey,
  onControlModeChange: setControlMode,
  onGenerationStepChange: setGenerationStepLimit,
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
  renderer.getDrawingBufferSize(plantOutlineResolution);
  plantHoverMaskTarget.setSize(
    Math.max(1, Math.floor(plantOutlineResolution.x)),
    Math.max(1, Math.floor(plantOutlineResolution.y)),
  );
  chollaGlowResolution.set(
    Math.max(1, Math.floor(plantOutlineResolution.x * 0.5)),
    Math.max(1, Math.floor(plantOutlineResolution.y * 0.5)),
  );
  chollaGlowMaskTarget.setSize(chollaGlowResolution.x, chollaGlowResolution.y);
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
  updatePlantHoverOutline();
  updatePlantInspection(deltaSeconds);
  updateTerrainInspector(now);
  updateLensFlare();
  updateDirectionalFogViewUniforms();
  updateTerrainCameraUniforms();
  rainOverlay.update(deltaSeconds);
  renderer.render(scene, camera);
  // Cholla soft-glow halo pass intentionally disabled — the new geometric
  // mode-11 fur replaces it. The chollaGlow* materials and render targets
  // are still constructed (harmless, unreferenced) so this is a one-line
  // remove rather than a sweeping cleanup.
  renderPlantHoverOutline();
  requestAnimationFrame(tick);
}
tick();
regenerate();
