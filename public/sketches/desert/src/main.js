import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { mulberry32, rngRange, subSeed } from './random.js';
import { buildTerrain } from './terrain.js';
import { buildSky } from './sky.js';
import { generateRock } from './rocks.js';
import { scatterPlants } from './scatter.js';
import { generateSaguaro } from './plants/saguaro.js';
import { generateBarrelCactus } from './plants/barrelCactus.js';
import { generatePaloVerde } from './plants/paloVerde.js';
import { generateMesquite } from './plants/mesquite.js';
import { generatePricklyPear } from './plants/pricklyPear.js';
import { generateOcotillo } from './plants/ocotillo.js';
import { generateCreosote } from './plants/creosote.js';
import { createCactusSpineMaterial } from './materials/cactusSpineMaterial.js';
import { createRockMaterial } from './materials/rockMaterial.js';
import { createTreeMaterial } from './materials/treeMaterial.js';
import { createSunLensFlare } from './lensFlare.js';
import { createProportionOracle } from './proportions.js';

// ---------- Renderer / scene boilerplate ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

const plantLodLevels = [
  { name: 'near', distance: 45, detailScale: 1, castShadow: true },
  { name: 'mid', distance: 95, detailScale: 0.72, castShadow: true },
  { name: 'far', distance: Infinity, detailScale: 0.48, castShadow: false },
];

// ---------- Keyboard flight controls ----------
const flightKeys = new Set();
const flightDirection = new THREE.Vector3();
const flightForward = new THREE.Vector3();
const flightRight = new THREE.Vector3();
const flightDelta = new THREE.Vector3();
const flightSpeed = 22;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const placementPos = new THREE.Vector3();
const placementQuat = new THREE.Quaternion();
const placementScale = new THREE.Vector3();
const placementTilt = new THREE.Euler();
const placementTiltQuat = new THREE.Quaternion();

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
  const isShiftPressed = flightKeys.has('ShiftLeft') || flightKeys.has('ShiftRight');

  flightDirection.set(0, 0, 0);
  if (flightKeys.has('KeyW')) flightDirection[isShiftPressed ? 'y' : 'z'] += 1;
  if (flightKeys.has('KeyS')) flightDirection[isShiftPressed ? 'y' : 'z'] -= 1;
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

const sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);
const sunLensFlare = createSunLensFlare(scene);

// Sky-bounce ambient — warm orange ground, hazy blue sky
const hemi = new THREE.HemisphereLight(0xb8d8ff, 0xb98260, 0.6);
scene.add(hemi);

// ---------- Shared materials ----------
const plantMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.7,
  metalness: 0.0,
  side: THREE.DoubleSide,
});
const treeMaterial = createTreeMaterial();
const cactusMaterial = createCactusSpineMaterial();
const rockMaterial = createRockMaterial();
const sharedMaterials = new Set([plantMaterial, treeMaterial, cactusMaterial, rockMaterial]);

// ---------- Generation parameters ----------
const params = {
  seed: 1337,

  // Terrain
  terrainSize: 140,
  terrainSegments: 220,
  heightScale: 5.5,
  macroScale: 0.012,
  ridgeScale: 0.06,
  rippleScale: 0.35,
  washStrength: 0.6,
  fanStrength: 0.9,
  erosionStrength: 0.75,
  rockySlopeStrength: 0.65,

  // Plant densities (instances per m^2)
  saguaroDensity: 0.012,
  saguaroMaxHeight: 7.0,
  saguaroArmProbability: 0.7,
  barrelDensity: 0.030,
  paloVerdeDensity: 0.008,
  paloVerdeFlowering: false,
  mesquiteDensity: 0.003,
  mesquiteSeedPods: true,
  pricklyPearDensity: 0.020,
  ocotilloDensity: 0.006,
  ocotilloFlowering: false,
  creosoteDensity: 0.060,

  // Rocks
  smallRockDensity: 0.18,
  largeRockDensity: 0.012,

  // Sun
  sunAzimuth: 145,
  sunElevation: 7,

  // Atmosphere
  fogDensity: 0.008,
  exposure: 1.05,
  lensFlare: true,
  cloudRate: 1.0,

  regenerate: () => regenerate(),
  randomSeed: () => { params.seed = Math.floor(Math.random() * 1e9); gui.controllers.forEach(c => c.updateDisplay()); regenerate(); },
};

// ---------- Scene root for procedural content ----------
let world = new THREE.Group();
scene.add(world);

function clearWorld() {
  // Dispose generated geometries and one-off materials. Plant/rock materials are
  // shared at module scope and survive regeneration.
  world.traverse(obj => {
    if (obj.isMesh) {
      if (obj.geometry) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material && !sharedMaterials.has(material)) material.dispose();
      }
    }
  });
  scene.remove(world);
  world = new THREE.Group();
  scene.add(world);
}

function regenerate() {
  const t0 = performance.now();
  clearWorld();
  buildWorld();
  const t1 = performance.now();
  console.log(`regenerate: ${(t1 - t0).toFixed(0)}ms`);
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

function buildWorld() {
  const proportions = createProportionOracle({ rootMeasurement: params.saguaroMaxHeight });

  // Terrain
  terrain = buildTerrain({
    size: params.terrainSize,
    segments: params.terrainSegments,
    heightScale: params.heightScale,
    macroScale: params.macroScale,
    ridgeScale: params.ridgeScale,
    rippleScale: params.rippleScale,
    washStrength: params.washStrength,
    fanStrength: params.fanStrength,
    erosionStrength: params.erosionStrength,
    rockySlopeStrength: params.rockySlopeStrength,
  }, subSeed(params.seed, 1));
  world.add(terrain.mesh);
  terrain.mesh.castShadow = false;
  terrain.mesh.receiveShadow = true;

  const nursePlants = [];
  const matureSaguaroZones = [];
  const resourceZones = [];
  const registerPlantZone = (mat, {
    kind,
    canopyRadius = 0,
    rootRadius,
    resourceUse = 0.5,
  }) => {
    mat.decompose(placementPos, placementQuat, placementScale);
    const zone = {
      x: placementPos.x,
      z: placementPos.z,
      radius: rootRadius * placementScale.x,
      strength: resourceUse,
      kind,
    };
    resourceZones.push(zone);
    if (canopyRadius > 0) {
      nursePlants.push({
        x: placementPos.x,
        z: placementPos.z,
        radius: canopyRadius * placementScale.x,
        rootRadius: zone.radius,
        kind,
      });
    }
  };

  // Palo verde — terrain/wash first, then nurse shade for young saguaros.
  scatterPlants({
    generator: generatePaloVerde,
    generatorOpts: {
      flowering: params.paloVerdeFlowering,
      proportions,
    },
    material: treeMaterial,
    terrain,
    densityPerArea: params.paloVerdeDensity,
    maxSlope: 1.0,
    scaleRange: [0.84, 1.12],
    variantCount: 8,
    seed: subSeed(params.seed, 4),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 14,
    candidateFilter: (ctx) => acceptPaloVerdeCandidate(ctx, resourceZones, proportions),
    onPlace: (mat) => registerPlantZone(mat, {
      kind: 'paloVerde',
      canopyRadius: proportions.paloVerde.canopyRadius,
      rootRadius: proportions.paloVerde.rootRadius,
      resourceUse: 0.52,
    }),
  });

  // Mesquite — darker wash trees with broader shade and stronger water demand.
  scatterPlants({
    generator: generateMesquite,
    generatorOpts: {
      seedPods: params.mesquiteSeedPods,
      proportions,
    },
    material: treeMaterial,
    terrain,
    densityPerArea: params.mesquiteDensity,
    maxSlope: 0.75,
    scaleRange: [0.74, 1.08],
    variantCount: 7,
    seed: subSeed(params.seed, 10),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 12,
    candidateFilter: (ctx) => acceptMesquiteCandidate(ctx, resourceZones, proportions),
    onPlace: (mat) => registerPlantZone(mat, {
      kind: 'mesquite',
      canopyRadius: proportions.mesquite.canopyRadius,
      rootRadius: proportions.mesquite.rootRadius,
      resourceUse: 0.78,
    }),
  });

  // Saguaros — seedlings cluster under nurse plants; old plants claim root space.
  scatterPlants({
    generator: generateSaguaro,
    generatorOpts: (rng) => ({
      proportions,
      armProbability: params.saguaroArmProbability,
      age: Math.pow(rng(), 0.68),
    }),
    material: cactusMaterial,
    terrain,
    densityPerArea: params.saguaroDensity,
    maxSlope: 0.9,
    scaleRange: [0.92, 1.08],
    variantCount: 12,
    seed: subSeed(params.seed, 2),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 24,
    candidateFilter: (ctx) => acceptSaguaroCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions),
    onPlace: (mat, rng, i, ctx) => {
      const age = ctx.variantOpts.age ?? 0.5;
      const height = estimateSaguaroHeight(age, proportions) * ctx.scale;
      if (age < 0.62) return;
      matureSaguaroZones.push({
        x: ctx.x,
        z: ctx.z,
        age,
        radius: Math.max(proportions.ecology.minMatureSaguaroCanopy, height * THREE.MathUtils.lerp(0.55, 0.95, age)),
      });
      resourceZones.push({
        x: ctx.x,
        z: ctx.z,
        radius: Math.max(proportions.ecology.minMatureSaguaroRoot, height * THREE.MathUtils.lerp(0.62, 0.92, age)),
        strength: THREE.MathUtils.lerp(0.42, 0.82, age),
        kind: 'saguaro',
      });
    },
  });

  // Barrel cactus — south-facing tilt, all slopes ok
  scatterPlants({
    generator: generateBarrelCactus,
    generatorOpts: {
      proportions,
    },
    material: cactusMaterial,
    terrain,
    densityPerArea: params.barrelDensity,
    maxSlope: 1.4,
    scaleRange: [0.85, 1.25],
    variantCount: 6,
    seed: subSeed(params.seed, 3),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 12,
    candidateFilter: (ctx) => acceptBarrelCactusCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions),
    onPlace: (mat, rng) => {
      // Lean ~10-25 deg toward the south (positive +Z in our scene).
      const tilt = THREE.MathUtils.degToRad(8 + rng() * 16);
      placementTiltQuat.setFromAxisAngle(X_AXIS, tilt);
      mat.decompose(placementPos, placementQuat, placementScale);
      placementQuat.multiply(placementTiltQuat);
      mat.compose(placementPos, placementQuat, placementScale);
    },
  });

  // Prickly pear — tolerates more terrain
  scatterPlants({
    generator: generatePricklyPear,
    generatorOpts: { proportions },
    material: cactusMaterial,
    terrain,
    densityPerArea: params.pricklyPearDensity,
    maxSlope: 1.4,
    scaleRange: [0.85, 1.4],
    variantCount: 6,
    seed: subSeed(params.seed, 5),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 12,
    candidateFilter: (ctx) => acceptPricklyPearCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions),
  });

  // Ocotillo — likes rocky runoff slopes more than wash bottoms.
  scatterPlants({
    generator: generateOcotillo,
    generatorOpts: { flowering: params.ocotilloFlowering, proportions },
    material: plantMaterial,
    terrain,
    densityPerArea: params.ocotilloDensity,
    maxSlope: 2.0,
    scaleRange: [0.8, 1.2],
    variantCount: 6,
    seed: subSeed(params.seed, 6),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 10,
    candidateFilter: (ctx) => acceptOcotilloCandidate(ctx, matureSaguaroZones, resourceZones, proportions),
  });

  // Creosote — dry open interfluves, thinned near active washes and strong roots.
  scatterPlants({
    generator: generateCreosote,
    generatorOpts: { proportions },
    material: plantMaterial,
    terrain,
    densityPerArea: params.creosoteDensity,
    maxSlope: 1.6,
    scaleRange: [0.7, 1.3],
    variantCount: 6,
    seed: subSeed(params.seed, 7),
    parent: world,
    lodLevels: plantLodLevels,
    lodOrigin: camera.position,
    attemptMultiplier: 10,
    candidateFilter: (ctx) => acceptCreosoteCandidate(ctx, matureSaguaroZones, resourceZones, proportions),
  });

  // Small rocks (pebble scatter)
  scatterPlants({
    generator: (rng) => generateRock(rng, { size: rngRange(rng, proportions.rocks.pebbleSize[0], proportions.rocks.pebbleSize[1]) }),
    material: rockMaterial,
    terrain,
    densityPerArea: params.smallRockDensity,
    maxSlope: 4.0,
    scaleRange: [0.7, 1.4],
    variantCount: 8,
    seed: subSeed(params.seed, 8),
    parent: world,
    castShadow: false,
    onPlace: (mat, rng) => {
      // Sink rocks slightly so they look settled in the dirt.
      mat.decompose(placementPos, placementQuat, placementScale);
      placementPos.y -= rngRange(rng, proportions.rocks.pebbleSink[0], proportions.rocks.pebbleSink[1]);
      placementTilt.set(rngRangeSigned(rng, 0.28), 0, rngRangeSigned(rng, 0.28));
      placementQuat.multiply(placementTiltQuat.setFromEuler(placementTilt));
      mat.compose(placementPos, placementQuat, placementScale);
    },
  });

  // Big rocks (boulders)
  scatterPlants({
    generator: (rng) => generateRock(rng, { size: rngRange(rng, proportions.rocks.boulderSize[0], proportions.rocks.boulderSize[1]) }),
    material: rockMaterial,
    terrain,
    densityPerArea: params.largeRockDensity,
    maxSlope: 4.0,
    scaleRange: [0.8, 1.5],
    variantCount: 6,
    seed: subSeed(params.seed, 9),
    parent: world,
    onPlace: (mat, rng) => {
      mat.decompose(placementPos, placementQuat, placementScale);
      placementPos.y -= rngRange(rng, proportions.rocks.boulderSink[0], proportions.rocks.boulderSink[1]);
      placementTilt.set(rngRangeSigned(rng, 0.18), 0, rngRangeSigned(rng, 0.18));
      placementQuat.multiply(placementTiltQuat.setFromEuler(placementTilt));
      mat.compose(placementPos, placementQuat, placementScale);
    },
  });
}

function rngRangeSigned(rng, maxAbs) {
  return (rng() * 2 - 1) * maxAbs;
}

function estimateSaguaroHeight(age, proportions) {
  return proportions.saguaro.heightForAge(age);
}

function distance2D(x0, z0, x1, z1) {
  return Math.hypot(x0 - x1, z0 - z1);
}

function nearestPoint(x, z, points) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const point of points) {
    const distance = distance2D(x, z, point.x, point.z);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest ? { point: nearest, distance: nearestDistance } : null;
}

function matureSaguaroPressure(x, z, zones, padding = 0) {
  let pressure = 0;
  for (const zone of zones) {
    const d = distance2D(x, z, zone.x, zone.z);
    const reach = zone.radius + padding;
    if (d >= reach) continue;
    pressure = Math.max(pressure, 1 - d / reach);
  }
  return pressure;
}

function resourcePressure(x, z, zones, {
  padding = 0,
  kinds = null,
  ignoreKind = null,
} = {}) {
  let pressure = 0;
  for (const zone of zones) {
    if (kinds && !kinds.includes(zone.kind)) continue;
    if (ignoreKind && zone.kind === ignoreKind) continue;
    const d = distance2D(x, z, zone.x, zone.z);
    const reach = zone.radius + padding;
    if (reach <= 0 || d >= reach) continue;
    pressure = Math.max(pressure, (1 - d / reach) * zone.strength);
  }
  return THREE.MathUtils.clamp(pressure, 0, 1);
}

function terrainWater(ctx) {
  const info = ctx.terrainInfo;
  if (!info) {
    const moisture = THREE.MathUtils.clamp(0.34 - ctx.slope * 0.08 - ctx.height * 0.025, 0, 1);
    return {
      moisture,
      flow: moisture,
      runoff: THREE.MathUtils.clamp(ctx.slope * 0.25, 0, 1),
      wash: 0,
      gravel: 0,
      basin: 0,
      shoulder: 0,
    };
  }
  return {
    moisture: info.soilMoisture,
    flow: info.flowAccumulation,
    runoff: info.runoff,
    wash: info.washProximity,
    gravel: info.washGravel,
    basin: info.basin,
    shoulder: info.shoulder,
  };
}

function chanceFromScore(ctx, score) {
  return ctx.rng() < THREE.MathUtils.clamp(score, 0.02, 0.98);
}

function acceptPaloVerdeCandidate(ctx, resourceZones, proportions) {
  const water = terrainWater(ctx);
  const washMargin = water.wash * (1 - water.gravel * 0.72);
  const treePressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: proportions.ecology.treeCompetitionPadding,
    kinds: ['paloVerde', 'mesquite'],
  });
  if (water.flow > 0.9 && water.gravel > 0.62) return ctx.rng() < 0.12;
  if (water.moisture < 0.12) return ctx.rng() < 0.22;
  const score =
    0.24 +
    water.moisture * 0.58 +
    washMargin * 0.26 +
    water.basin * 0.12 -
    water.runoff * 0.26 -
    treePressure * 0.64;
  return chanceFromScore(ctx, score);
}

function acceptSaguaroCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions) {
  const age = ctx.variantOpts.age ?? 0.5;
  const height = estimateSaguaroHeight(age, proportions) * ctx.scale;
  const rootPadding = Math.max(proportions.ecology.minSaguaroRootPadding, height * 0.35);
  const water = terrainWater(ctx);
  if (matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, rootPadding) > 0) return false;
  if (water.flow > 0.82 && water.gravel > 0.48) return ctx.rng() < 0.05;
  if (water.moisture > 0.76) return ctx.rng() < 0.12;
  if (water.runoff > 0.78 && age < 0.34) return ctx.rng() < 0.10;

  const saguaroPressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: rootPadding,
    kinds: ['saguaro'],
  });
  if (saguaroPressure > 0.12) return false;

  const treePressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: age < 0.62 ? proportions.ecology.immatureSaguaroTreePadding : rootPadding * 0.7,
    kinds: ['paloVerde', 'mesquite'],
  });
  if (age >= 0.62 && treePressure > 0.35) return ctx.rng() < THREE.MathUtils.lerp(0.44, 0.06, treePressure);

  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  if (age < 0.34) {
    if (water.moisture < 0.08 && !nurse) return ctx.rng() < 0.01;
    if (!nurse) return ctx.rng() < 0.02;
    const canopy = nurse.point.radius;
    if (nurse.distance < canopy * 0.18) return ctx.rng() < 0.45;
    if (nurse.distance < canopy) return ctx.rng() < 0.96;
    if (nurse.distance < canopy + proportions.ecology.youngSaguaroNurseEdge) return ctx.rng() < 0.32;
    return ctx.rng() < 0.025;
  }

  if (age < 0.62) {
    if (!nurse) return ctx.rng() < 0.22;
    const canopy = nurse.point.radius;
    if (nurse.distance < canopy * 1.25) return ctx.rng() < 0.78;
    if (nurse.distance < canopy + proportions.ecology.juvenileSaguaroNurseEdge) return ctx.rng() < 0.45;
    return ctx.rng() < 0.24;
  }

  if (!nurse) return ctx.rng() < 0.52;
  const canopy = nurse.point.radius;
  if (nurse.distance < canopy * 0.55) return ctx.rng() < 0.38;
  if (nurse.distance < canopy + proportions.ecology.matureSaguaroNurseEdge) return ctx.rng() < 0.62;
  return ctx.rng() < 0.46;
}

function acceptBarrelCactusCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions) {
  const water = terrainWater(ctx);
  if (water.moisture > 0.72 || (water.flow > 0.78 && water.gravel > 0.42)) return ctx.rng() < 0.10;
  if (water.moisture < 0.06 && water.runoff < 0.28) return ctx.rng() < 0.34;

  const pressure = matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, proportions.ecology.barrelSaguaroPadding);
  if (pressure > 0.72) return ctx.rng() < 0.04;
  if (pressure > 0.18) return ctx.rng() < THREE.MathUtils.lerp(0.72, 0.12, pressure);
  const rootPressure = resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.barrelRootPadding });
  if (rootPressure > 0.76) return ctx.rng() < 0.06;
  if (rootPressure > 0.28) return ctx.rng() < THREE.MathUtils.lerp(0.74, 0.18, rootPressure);

  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  if (!nurse) return true;
  const canopy = nurse.point.radius;
  if (nurse.distance < canopy * 0.65) return ctx.rng() < 0.25;
  if (nurse.distance < canopy + proportions.ecology.barrelNurseEdge) return ctx.rng() < 0.58;
  return true;
}

function acceptPricklyPearCandidate(ctx, nursePlants, matureSaguaroZones, resourceZones, proportions) {
  const water = terrainWater(ctx);
  if (water.flow > 0.9 && water.gravel > 0.62) return ctx.rng() < 0.18;
  if (water.moisture < 0.05) return ctx.rng() < 0.24;

  const pressure = matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, proportions.ecology.pricklyPearSaguaroPadding);
  if (pressure > 0.70) return ctx.rng() < 0.07;
  if (pressure > 0.25) return ctx.rng() < THREE.MathUtils.lerp(0.80, 0.20, pressure);
  const rootPressure = resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.pricklyPearRootPadding });
  if (rootPressure > 0.82) return ctx.rng() < 0.08;

  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  const waterScore = 0.52 + water.moisture * 0.32 + water.wash * (1 - water.gravel) * 0.18 - rootPressure * 0.24;
  if (!nurse) return chanceFromScore(ctx, waterScore);
  const canopy = nurse.point.radius;
  if (nurse.distance < canopy * 0.25) return ctx.rng() < 0.45;
  if (nurse.distance < canopy + proportions.ecology.pricklyPearNurseEdge) return ctx.rng() < 0.9;
  return chanceFromScore(ctx, waterScore);
}

function acceptMesquiteCandidate(ctx, resourceZones, proportions) {
  const water = terrainWater(ctx);
  const treePressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: proportions.ecology.mesquiteCompetitionPadding,
    kinds: ['paloVerde', 'mesquite'],
  });
  if (treePressure > 0.7) return ctx.rng() < 0.05;
  if (water.moisture < 0.24 && water.flow < 0.32) return ctx.rng() < 0.08;

  // Mesquite favors flatter wash margins and bajada toes more than exposed slopes.
  let score =
    0.12 +
    water.moisture * 0.62 +
    water.flow * 0.46 +
    water.gravel * 0.18 -
    water.runoff * 0.32 -
    treePressure * 0.58;
  if (ctx.slope > 0.55) score *= 0.35;
  if (ctx.height > 1.1) score *= 0.52;
  if (ctx.height < -0.8) score += 0.12;
  return chanceFromScore(ctx, score);
}

function acceptOpenPlantCandidate(ctx, matureSaguaroZones, resourceZones, proportions, competitionTolerance = 0.3) {
  const pressure = matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, proportions.ecology.openPlantSaguaroPadding);
  const rootPressure = Math.max(
    pressure,
    resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.openPlantRootPadding }),
  );
  if (rootPressure <= competitionTolerance) return true;
  return ctx.rng() < THREE.MathUtils.lerp(0.65, 0.06, rootPressure);
}

function acceptOcotilloCandidate(ctx, matureSaguaroZones, resourceZones, proportions) {
  const water = terrainWater(ctx);
  if (water.flow > 0.72 && water.gravel > 0.34) return ctx.rng() < 0.16;
  const open = acceptOpenPlantCandidate(ctx, matureSaguaroZones, resourceZones, proportions, 0.42);
  if (!open) return false;
  const rockyRunoffScore =
    0.18 +
    ctx.slope * 0.24 +
    water.runoff * 0.54 +
    water.shoulder * 0.22 -
    water.moisture * 0.22;
  return chanceFromScore(ctx, rockyRunoffScore);
}

function acceptCreosoteCandidate(ctx, matureSaguaroZones, resourceZones, proportions) {
  const water = terrainWater(ctx);
  if (water.flow > 0.78 || water.moisture > 0.7) return ctx.rng() < 0.10;
  const open = acceptOpenPlantCandidate(ctx, matureSaguaroZones, resourceZones, proportions, 0.22);
  if (!open) return false;
  const dryOpenScore =
    0.72 -
    water.moisture * 0.42 -
    water.wash * 0.18 -
    water.runoff * 0.10 +
    water.basin * 0.10;
  return chanceFromScore(ctx, dryOpenScore);
}

// ---------- Sun update ----------
function updateSun() {
  const dir = skyCtl.update({ azimuth: params.sunAzimuth, elevation: params.sunElevation });
  // Place the directional light far along the sun direction.
  sun.position.copy(dir).multiplyScalar(80);
  sun.target.position.set(0, 0, 0);
  // Warm color near horizon, cooler higher up.
  const elev01 = THREE.MathUtils.clamp(params.sunElevation / 60, 0, 1);
  const sunset01 = 1 - THREE.MathUtils.smoothstep(params.sunElevation, 12, 45);
  const warm = new THREE.Color(0xff9a56);
  const cool = new THREE.Color(0xfff2d6);
  const lightCol = warm.clone().lerp(cool, elev01 * 0.85);
  sun.color.copy(lightCol);
  sun.intensity = THREE.MathUtils.lerp(1.15, 2.65, elev01) + sunset01 * 0.28;

  // Match fog to the sky's hazy ground band.
  const fogWarm = new THREE.Color(0xe9a171);
  const fogViolet = new THREE.Color(0xb199b6);
  const fogCool = new THREE.Color(0xc8d4dd);
  const fogColor = fogWarm.clone().lerp(fogViolet, sunset01 * 0.22).lerp(fogCool, elev01 * 0.42);
  scene.fog.color.copy(fogColor);
  scene.fog.density = params.fogDensity * THREE.MathUtils.lerp(1.28, 0.84, elev01);
  hemi.intensity = THREE.MathUtils.lerp(0.46, 0.68, elev01);
  hemi.color.set(0xb8d8ff).lerp(new THREE.Color(0x7b8ac4), sunset01 * 0.35);
  hemi.groundColor.set(0xb98260).lerp(new THREE.Color(0xd07658), sunset01 * 0.45);
  updateLensFlare();
}

function updateLensFlare() {
  sunLensFlare.update({
    camera,
    sunDirection: skyCtl.sun,
    sunElevation: params.sunElevation,
    enabled: params.lensFlare,
  });
}

// ---------- GUI ----------
const gui = new GUI({ title: 'Desert generator' });

const fGen = gui.addFolder('General');
fGen.add(params, 'seed').name('seed').onFinishChange(regenerate);
fGen.add(params, 'randomSeed').name('🎲 random seed');
fGen.add(params, 'regenerate').name('↻ regenerate');

const fTer = gui.addFolder('Terrain');
fTer.add(params, 'terrainSize', 60, 240, 10).onChange(scheduleRegenerate);
fTer.add(params, 'heightScale', 0.5, 12, 0.1).onChange(scheduleRegenerate).name('height');
fTer.add(params, 'macroScale', 0.003, 0.04, 0.001).onChange(scheduleRegenerate).name('hill scale');
fTer.add(params, 'ridgeScale', 0.01, 0.2, 0.005).onChange(scheduleRegenerate).name('ridge scale');
fTer.add(params, 'rippleScale', 0.05, 1.0, 0.05).onChange(scheduleRegenerate).name('ripple scale');
fTer.add(params, 'washStrength', 0, 1.5, 0.05).onChange(scheduleRegenerate).name('wash depth');
fTer.add(params, 'fanStrength', 0, 1.8, 0.05).onChange(scheduleRegenerate).name('alluvial fans');
fTer.add(params, 'erosionStrength', 0, 1.5, 0.05).onChange(scheduleRegenerate).name('erosion');
fTer.add(params, 'rockySlopeStrength', 0, 1.4, 0.05).onChange(scheduleRegenerate).name('rock faces');
fTer.close();

const fSag = gui.addFolder('Saguaros');
fSag.add(params, 'saguaroDensity', 0, 0.05, 0.001).onChange(scheduleRegenerate).name('density');
fSag.add(params, 'saguaroMaxHeight', 3, 12, 0.1).onChange(scheduleRegenerate).name('max height');
fSag.add(params, 'saguaroArmProbability', 0, 1, 0.05).onChange(scheduleRegenerate).name('arm chance');

const fBar = gui.addFolder('Barrel cacti');
fBar.add(params, 'barrelDensity', 0, 0.1, 0.002).onChange(scheduleRegenerate).name('density');

const fPV = gui.addFolder('Palo verde');
fPV.add(params, 'paloVerdeDensity', 0, 0.04, 0.001).onChange(scheduleRegenerate).name('density');
fPV.add(params, 'paloVerdeFlowering').onChange(scheduleRegenerate).name('flowering (spring)');

const fMesquite = gui.addFolder('Mesquite');
fMesquite.add(params, 'mesquiteDensity', 0, 0.025, 0.001).onChange(scheduleRegenerate).name('density');
fMesquite.add(params, 'mesquiteSeedPods').onChange(scheduleRegenerate).name('seed pods');

const fPP = gui.addFolder('Prickly pear');
fPP.add(params, 'pricklyPearDensity', 0, 0.08, 0.002).onChange(scheduleRegenerate).name('density');

const fOco = gui.addFolder('Ocotillo');
fOco.add(params, 'ocotilloDensity', 0, 0.03, 0.001).onChange(scheduleRegenerate).name('density');
fOco.add(params, 'ocotilloFlowering').onChange(scheduleRegenerate).name('blooming');

const fCre = gui.addFolder('Creosote');
fCre.add(params, 'creosoteDensity', 0, 0.2, 0.005).onChange(scheduleRegenerate).name('density');

const fRock = gui.addFolder('Rocks');
fRock.add(params, 'smallRockDensity', 0, 0.6, 0.01).onChange(scheduleRegenerate).name('pebbles');
fRock.add(params, 'largeRockDensity', 0, 0.05, 0.002).onChange(scheduleRegenerate).name('boulders');

const fSun = gui.addFolder('Sun & atmosphere');
fSun.add(params, 'sunAzimuth', 0, 360, 1).onChange(updateSun).name('azimuth');
fSun.add(params, 'sunElevation', -3, 80, 0.5).onChange(updateSun).name('elevation');
fSun.add(params, 'fogDensity', 0, 0.02, 0.0005).onChange(updateSun).name('fog');
fSun.add(params, 'exposure', 0.4, 1.6, 0.05).onChange(v => { renderer.toneMappingExposure = v; }).name('exposure');
fSun.add(params, 'lensFlare').onChange(updateLensFlare).name('lens flare');
fSun.add(params, 'cloudRate', 0, 5, 0.05).name('cloud rate');

// ---------- First build + animation loop ----------
updateSun();
buildWorld();
document.getElementById('loading').classList.add('hidden');
let lastTick = performance.now();
let cloudTime = 0;

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function tick() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  cloudTime += deltaSeconds * params.cloudRate;
  skyCtl.updateTime(cloudTime);
  updateFlight(deltaSeconds);
  controls.update();
  updateLensFlare();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
