import { createNoise2D } from 'https://esm.sh/simplex-noise@4.0.1';
import { PROPORTION_RATIOS, SCENE_SCALE_REFERENCE } from './proportionConstants.js';

const Y_AXIS = [0, 1, 0];
const LANDFORM_NAMES = [
  'rockySlope',
  'upperBajada',
  'wash',
  'washMargin',
  'lowerBajada',
  'sandyAlluvialFlat',
  'calicheFlat',
  'basinFlat',
];
const SOIL_TEXTURE_NAMES = ['rock', 'gravel', 'wash_alluvium', 'sand', 'loam', 'clay'];
const DEBUG_OVERLAY_TYPES = Object.freeze({
  treeNurse: 0,
  shrubNurse: 1,
  rockNurse: 2,
  resource: 3,
  pricklyPearPatch: 4,
  chollaColony: 5,
});

const PHASES = [
  ['terrain', 'Shaping terrain and washes'],
  ['paloVerde', 'Placing palo verde nurse trees'],
  ['mesquite', 'Placing mesquite wash trees'],
  ['ephemerals', 'Sprouting annuals under nurse trees'],
  ['creosote', 'Placing creosote matrix shrubs'],
  ['saguaro', 'Placing saguaros'],
  ['ocotillo', 'Placing ocotillo rocky-slope accents'],
  ['barrel', 'Placing barrel cacti'],
  ['pricklyPear', 'Placing prickly pear'],
  ['jumpingCholla', 'Placing jumping cholla colonies'],
  ['deadwood', 'Placing nurse remnants and cholla skeletons'],
  ['pebbles', 'Scattering pebble fields'],
  ['boulders', 'Settling boulders'],
];

let activeGeneration = 0;

self.onmessage = (event) => {
  if (event.data?.type !== 'generateChunk') return;
  activeGeneration = event.data.generation;
  generateChunk(event.data).catch(error => {
    if (event.data.generation !== activeGeneration) return;
    self.postMessage({
      type: 'error',
      generation: event.data.generation,
      message: error?.message ?? String(error),
    });
  });
};

async function generateChunk({ generation, params, lodLevels, chunk }) {
  const generationStart = performance.now();
  const chunkKey = chunk.key;
  const chunkSeed = hashChunkSeed(params.seed, chunk.cx, chunk.cz);
  const proportions = createWorkerProportions(params.saguaroMaxHeight);
  const seasonalState = params.seasonalState ?? {};
  const state = {
    nursePlants: [],
    treeNurses: [],
    shrubNurses: [],
    rockNurses: [],
    matureSaguaroZones: [],
    resourceZones: [],
    pricklyPearPatchCenters: [],
    chollaColonyCenters: [],
    deadwoodPlacements: [],
    ephemeralPlacements: [],
    spatialIndexes: {
      creosote: createSpatialIndex(4.0),
      barrel: createSpatialIndex(4.5),
      matureSaguaro: createSpatialIndex(12.0),
      trees: createSpatialIndex(12.0),
    },
  };

  const check = () => generation === activeGeneration;
  const phaseProgress = (index, amount, label = PHASES[index][1]) => {
    self.postMessage({
      type: 'progress',
      generation,
      chunkKey,
      phase: `${label} (${chunkKey})`,
      progress: (index + amount) / PHASES.length,
    });
  };

  phaseProgress(0, 0.03);
  const terrainStart = performance.now();
  const terrain = buildTerrainData({
    size: params.terrainSize,
    originX: chunk.cx * chunk.size,
    originZ: chunk.cz * chunk.size,
    segments: params.terrainSegments,
    hydrologySegments: params.hydrologySegments,
    heightScale: params.heightScale,
    macroScale: params.macroScale,
    ridgeScale: params.ridgeScale,
    rippleScale: params.rippleScale,
    washStrength: params.washStrength,
    fanStrength: params.fanStrength,
    erosionStrength: params.erosionStrength,
    rockySlopeStrength: params.rockySlopeStrength,
    recentRainDays: seasonalState.recentRainDays ?? 999,
    monsoonRain_0_1: seasonalState.monsoonRain_0_1 ?? 0,
    winterRain_0_1: seasonalState.winterRain_0_1 ?? 0,
  }, subSeed(params.seed, 1));
  if (!check()) return;
  const terrainMs = performance.now() - terrainStart;
  const chunkDebug = {
    generation,
    chunkKey,
    seed: params.seed,
    chunkSeed,
    landformCounts: terrain.diagnostics.landformCounts,
    patchCenters: {
      pricklyPear: 0,
      jumpingCholla: 0,
    },
    species: {},
  };
  phaseProgress(0, 1);
  self.postMessage({
    type: 'terrain',
    generation,
    chunkKey,
    phase: `${PHASES[0][1]} (${chunkKey})`,
    progress: 1 / PHASES.length,
    perf: {
      generation,
      chunkKey,
      phaseKey: 'terrain',
      phase: PHASES[0][1],
      workerMs: roundMs(terrainMs),
      elapsedMs: roundMs(performance.now() - generationStart),
      terrainVertices: terrain.transfer.positions.length / 3,
      terrainTriangles: terrain.transfer.indices.length / 3,
    },
    terrain: terrain.transfer,
  }, terrain.buffers);
  state.pricklyPearPatchCenters = buildGlobalPatchCenters({
    terrain,
    seed: subSeed(params.seed, 21),
    targetCount: Math.max(1, Math.floor(params.terrainSize * params.terrainSize * params.pricklyPearDensity / 18)),
    minDistance: 8,
    padding: Math.max(params.chunkEdgePadding ?? 1, 12),
    suitability: info => {
      const landform = info.landform;
      return Math.max(landform.lowerBajada, landform.upperBajada, landform.rockySlope * 0.65, landform.washMargin * 0.55) -
        landform.wash * info.washGravel * 0.42;
    },
  });
  chunkDebug.patchCenters.pricklyPear = state.pricklyPearPatchCenters.length;
  state.chollaColonyCenters = buildGlobalPatchCenters({
    terrain,
    seed: subSeed(params.seed, 22),
    targetCount: Math.max(1, Math.floor(params.terrainSize * params.terrainSize * params.jumpingChollaDensity / 16)),
    minDistance: 10,
    padding: Math.max(params.chunkEdgePadding ?? 1, 16),
    suitability: info => {
      const landform = info.landform;
      return Math.max(landform.lowerBajada, landform.basinFlat, landform.sandyAlluvialFlat) -
        landform.wash * info.washGravel * 0.52 -
        info.soilMoisture * 0.22;
    },
  });
  chunkDebug.patchCenters.jumpingCholla = state.chollaColonyCenters.length;
  buildRockShelterNurses(state, terrain, subSeed(chunkSeed, 23), proportions);
  chunkDebug.rockShelters = state.rockNurses.length;

  // Cacti/succulents carry the most expensive near geometry (mesh spine
  // blades, cholla fur) and read fine as sprites much sooner than the tall
  // trees do, so they get a tighter near ring and an earlier impostor
  // switch. Trees keep the shared rings — their near level is what casts
  // shadows, which stay visible farther out. Keep near <= the stage's
  // SCATTER_CULL_CELL half-diagonal in main.js or the cell the camera is in
  // may never resolve to the near LOD.
  const cactusLodLevels = (lodLevels && lodLevels.length === 3)
    ? [
      { ...lodLevels[0], distance: 24 },
      { ...lodLevels[1], distance: 62 },
      { ...lodLevels[2] },
    ]
    : lodLevels;

  const stageDefs = [
    {
      key: 'paloVerde',
      generatorOpts: rng => ({
        flowering: seasonalState.paloVerdeFlowering,
        seedPods: seasonalState.paloVerdeSeedPods,
        leafDensity: seasonalState.paloVerdeLeafDensity,
        age: Math.pow(rng(), 0.58),
      }),
      densityPerArea: params.paloVerdeEnabled ? params.paloVerdeDensity : 0,
      maxSlope: 1.0,
      scaleRange: [0.84, 1.12],
      variantCount: 3,
      seed: subSeed(chunkSeed, 4),
      geometrySeed: subSeed(params.seed, 4),
      lodLevels,
      attemptMultiplier: 14,
      candidateFilter: ctx => acceptPaloVerdeCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.58;
        const maturity = smoothstep(0.18, 0.76, age);
        registerPlantZone(state, mat, {
          kind: 'paloVerde',
          nurseType: 'tree',
          nurseQuality: 0.92,
          canopyRadius: proportions.paloVerde.canopyRadius * lerp(0.42, 1.08, maturity),
          rootRadius: proportions.paloVerde.rootRadius * lerp(0.34, 1.05, maturity),
          resourceUse: lerp(0.22, 0.58, maturity),
          shadeProtection: 0.62,
          herbivoreProtection: 0.55,
          soilIsland: 0.50,
          longTermCompetition: 0.42,
        });
        addEphemeralLifeIsland(state, ctx, rng, seasonalState, proportions, 0.72);
      },
    },
    {
      key: 'mesquite',
      generatorOpts: (rng, i) => ({
        seedPods: seasonalState.mesquiteSeedPods,
        catkins: seasonalState.mesquiteCatkins,
        age: Math.pow(rng(), 0.54),
        form: i % 5 < 3 ? 'wash_floodplain_tree' : 'upland_shrub',
      }),
      densityPerArea: params.mesquiteEnabled ? params.mesquiteDensity : 0,
      maxSlope: 0.75,
      scaleRange: [0.74, 1.08],
      variantCount: 5,
      seed: subSeed(chunkSeed, 10),
      geometrySeed: subSeed(params.seed, 10),
      lodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptMesquiteCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.58;
        const maturity = smoothstep(0.16, 0.74, age);
        registerPlantZone(state, mat, {
          kind: 'mesquite',
          nurseType: 'tree',
          nurseQuality: 1.0,
          canopyRadius: proportions.mesquite.canopyRadius * lerp(0.36, 1.10, maturity),
          rootRadius: proportions.mesquite.rootRadius * lerp(0.32, 1.08, maturity),
          resourceUse: lerp(0.30, 0.82, maturity),
          shadeProtection: 0.78,
          herbivoreProtection: 0.52,
          soilIsland: 0.86,
          longTermCompetition: 0.64,
        });
        addEphemeralLifeIsland(state, ctx, rng, seasonalState, proportions, 1.0);
      },
    },
    {
      key: 'ephemerals',
      generatorOpts: rng => ({
        age: rng(),
        bloom: seasonalState.springBloom || seasonalState.postRainFlush,
      }),
      sourcePlacements: () => state.ephemeralPlacements,
      maxSlope: 4.0,
      scaleRange: [0.8, 1.2],
      variantCount: 6,
      seed: subSeed(chunkSeed, 13),
      geometrySeed: subSeed(params.seed, 13),
      lodLevels: [
        { name: 'near', distance: 34, detailScale: 1, castShadow: false },
        { name: 'mid', distance: 80, detailScale: 0.62, castShadow: false },
        { name: 'far', distance: Infinity, detailScale: 0.36, castShadow: false },
      ],
      castShadow: false,
    },
    {
      key: 'creosote',
      generatorOpts: rng => {
        const age = Math.pow(rng(), 0.56);
        const oldGrowth = smoothstep(0.68, 1.0, age);
        return {
          age,
          cloneRing: oldGrowth > 0.42,
          cloneRingRadius: lerp(0.38, 0.72, oldGrowth),
          deadInterior: oldGrowth,
          flowering: seasonalState.creosoteFlowering,
          rainFlush: seasonalState.creosoteRainFlush,
        };
      },
      densityPerArea: params.creosoteEnabled ? params.creosoteDensity : 0,
      maxSlope: 1.6,
      scaleRange: [0.7, 1.3],
      variantCount: 6,
      seed: subSeed(chunkSeed, 7),
      geometrySeed: subSeed(params.seed, 7),
      lodLevels,
      castShadow: false,
      attemptMultiplier: 10,
      candidateFilter: ctx => acceptCreosoteCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.56;
        const maturity = smoothstep(0.12, 0.70, age);
        addSpatialPoint(state.spatialIndexes.creosote, ctx.x, ctx.z);
        registerPlantZone(state, mat, {
          kind: 'creosote',
          nurseType: 'shrub',
          nurseQuality: 0.34,
          canopyRadius: proportions.creosote.canopyRadius * lerp(0.50, 1.12, maturity),
          rootRadius: proportions.creosote.rootRadius * lerp(0.55, 1.10, maturity),
          resourceUse: lerp(0.12, 0.34, maturity),
          shadeProtection: 0.18,
          herbivoreProtection: 0.20,
          soilIsland: 0.16,
          longTermCompetition: 0.24,
        });
      },
    },
    {
      key: 'saguaro',
      generatorOpts: rng => {
        const cohort = sampleSaguaroCohort(rng, chunkSeed);
        return {
          armProbability: params.saguaroArmProbability,
          age: cohort.age,
          ageYears: cohort.ageYears,
          cohortYear: cohort.cohortYear,
          hydration: seasonalState.saguaroHydration,
        };
      },
      densityPerArea: params.saguaroEnabled ? params.saguaroDensity : 0,
      maxSlope: 0.9,
      scaleRange: [0.92, 1.08],
      variantCount: 12,
      seed: subSeed(chunkSeed, 2),
      geometrySeed: subSeed(params.seed, 2),
      lodLevels: cactusLodLevels,
      attemptMultiplier: 24,
      candidateFilter: ctx => acceptSaguaroCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        if (age < 0.62) {
          biasYoungSaguaroUnderNurse(mat, rng, ctx, state.nursePlants, proportions);
        }
        const height = estimateSaguaroHeight(age, proportions) * ctx.scale;
        if (age < 0.62) return;
        const canopyZone = {
          x: ctx.x,
          z: ctx.z,
          age,
          radius: Math.max(proportions.ecology.minMatureSaguaroCanopy, height * lerp(0.55, 0.95, age)),
        };
        state.matureSaguaroZones.push(canopyZone);
        addSpatialPoint(state.spatialIndexes.matureSaguaro, ctx.x, ctx.z, canopyZone);
        state.resourceZones.push({
          x: ctx.x,
          z: ctx.z,
          radius: Math.max(proportions.ecology.minMatureSaguaroRoot, height * lerp(0.62, 0.92, age)),
          strength: lerp(0.42, 0.82, age),
          kind: 'saguaro',
        });
        registerSaguaroNurseRemnant(state, ctx, age, height, rng, proportions);
      },
    },
    {
      key: 'ocotillo',
      generatorOpts: rng => ({
        flowering: seasonalState.ocotilloFlowering,
        leafFlush: seasonalState.ocotilloLeafFlush,
        age: Math.pow(rng(), 0.64),
      }),
      densityPerArea: params.ocotilloEnabled ? params.ocotilloDensity : 0,
      maxSlope: 2.0,
      scaleRange: [0.8, 1.2],
      variantCount: 6,
      seed: subSeed(chunkSeed, 6),
      geometrySeed: subSeed(params.seed, 6),
      lodLevels: cactusLodLevels,
      attemptMultiplier: 10,
      candidateFilter: ctx => acceptOcotilloCandidate(ctx, state.matureSaguaroZones, state.resourceZones, proportions),
    },
    {
      key: 'barrel',
      generatorOpts: rng => ({
        age: Math.pow(rng(), 0.62),
        flowering: seasonalState.barrelFlowering,
      }),
      densityPerArea: params.barrelEnabled ? params.barrelDensity : 0,
      maxSlope: 1.4,
      scaleRange: [0.85, 1.25],
      variantCount: 6,
      seed: subSeed(chunkSeed, 3),
      geometrySeed: subSeed(params.seed, 3),
      lodLevels: cactusLodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptBarrelCactusCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        const maturity = smoothstep(0.22, 0.82, age);
        const tilt = degToRad(rngRange(
          rng,
          lerp(2, 8, maturity),
          lerp(8, 26, maturity),
        ));
        const placement = decomposeMatrix(mat);
        const leanBearing = degToRad(rngRange(rng, 190, 250));
        const leanX = Math.sin(leanBearing);
        const leanZ = -Math.cos(leanBearing);
        const tiltAxis = [leanZ, 0, -leanX];
        placement.quat = multiplyQuat(quatFromAxisAngle(tiltAxis, tilt), placement.quat);
        composeMatrixInto(mat, placement.pos, placement.quat, placement.scale);
        addSpatialPoint(state.spatialIndexes.barrel, ctx.x, ctx.z);
      },
    },
    {
      key: 'pricklyPear',
      generatorOpts: rng => ({
        age: Math.pow(rng(), 0.70),
        flowering: seasonalState.pricklyPearFlowering,
        fruiting: seasonalState.pricklyPearFruiting,
      }),
      densityPerArea: params.pricklyPearEnabled ? params.pricklyPearDensity : 0,
      maxSlope: 1.4,
      scaleRange: [0.85, 1.4],
      variantCount: 6,
      seed: subSeed(chunkSeed, 5),
      geometrySeed: subSeed(params.seed, 5),
      lodLevels: cactusLodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptPricklyPearCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        const maturity = smoothstep(0.18, 0.78, age);
        state.resourceZones.push({
          x: ctx.x,
          z: ctx.z,
          radius: proportions.pricklyPear.rootRadius * lerp(0.52, 1.18, maturity) * ctx.scale,
          strength: lerp(0.16, 0.34, maturity),
          kind: 'pricklyPear',
          resourceType: 'patch',
        });
      },
    },
    {
      key: 'jumpingCholla',
      generatorOpts: rng => ({
        age: Math.pow(rng(), 0.58),
        fruitChains: seasonalState.chollaFruitChains,
      }),
      densityPerArea: params.jumpingChollaEnabled ? params.jumpingChollaDensity : 0,
      maxSlope: 1.1,
      scaleRange: [0.82, 1.18],
      variantCount: 8,
      seed: subSeed(chunkSeed, 11),
      geometrySeed: subSeed(params.seed, 11),
      lodLevels: cactusLodLevels,
      attemptMultiplier: 14,
      candidateFilter: ctx => acceptJumpingChollaCandidate(ctx, state, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        const maturity = smoothstep(0.20, 0.78, age);
        state.resourceZones.push({
          x: ctx.x,
          z: ctx.z,
          radius: proportions.jumpingCholla.rootRadius * lerp(0.48, 1.18, maturity) * ctx.scale,
          strength: lerp(0.20, 0.46, maturity),
          kind: 'jumpingCholla',
          resourceType: 'competition',
        });
        maybeAddChollaSkeleton(state, ctx, age, rng, proportions);
      },
    },
    {
      key: 'deadwood',
      generatorOpts: rng => ({
        age: rng(),
      }),
      sourcePlacements: () => state.deadwoodPlacements,
      maxSlope: 4.0,
      scaleRange: [0.85, 1.15],
      variantCount: 8,
      seed: subSeed(chunkSeed, 12),
      geometrySeed: subSeed(params.seed, 12),
      lodLevels,
      castShadow: false,
    },
    {
      key: 'pebbles',
      generatorOpts: {},
      densityPerArea: params.smallRockDensity,
      maxSlope: 4.0,
      scaleRange: [0.7, 1.4],
      variantCount: 8,
      seed: subSeed(chunkSeed, 8),
      geometrySeed: subSeed(params.seed, 8),
      castShadow: false,
      onPlace: (mat, rng) => {
        const placement = decomposeMatrix(mat);
        placement.pos[1] -= rngRange(rng, proportions.rocks.pebbleSink[0], proportions.rocks.pebbleSink[1]);
        placement.quat = multiplyQuat(placement.quat, quatFromEuler(rngRangeSigned(rng, 0.28), 0, rngRangeSigned(rng, 0.28)));
        composeMatrixInto(mat, placement.pos, placement.quat, placement.scale);
      },
    },
    {
      key: 'boulders',
      generatorOpts: {},
      densityPerArea: params.largeRockDensity,
      maxSlope: 4.0,
      scaleRange: [0.8, 1.5],
      variantCount: 6,
      seed: subSeed(chunkSeed, 9),
      geometrySeed: subSeed(params.seed, 9),
      onPlace: (mat, rng) => {
        const placement = decomposeMatrix(mat);
        placement.pos[1] -= rngRange(rng, proportions.rocks.boulderSink[0], proportions.rocks.boulderSink[1]);
        placement.quat = multiplyQuat(placement.quat, quatFromEuler(rngRangeSigned(rng, 0.18), 0, rngRangeSigned(rng, 0.18)));
        composeMatrixInto(mat, placement.pos, placement.quat, placement.scale);
      },
    },
  ];

  for (let i = 0; i < stageDefs.length; i++) {
    const phaseIndex = i + 1;
    if (!check()) return;
    phaseProgress(phaseIndex, 0.05);
    const stageStart = performance.now();
    const stage = scatterStage({
      ...stageDefs[i],
      terrain,
      phase: PHASES[phaseIndex][1],
      edgePadding: params.chunkEdgePadding ?? 1,
    });
    if (!check()) return;
    const stageMs = performance.now() - stageStart;
    chunkDebug.species[stage.key] = {
      targetCount: stage.targetCount,
      placed: stage.count,
      attempts: stage.attempts,
      acceptancePct: stage.attempts > 0 ? roundMs((stage.count / stage.attempts) * 100) : 0,
      medianSuitability: stage.diagnostics.medianSuitability,
      rejections: stage.diagnostics.rejections,
      candidateLandforms: stage.diagnostics.candidateLandforms,
      acceptedLandforms: stage.diagnostics.acceptedLandforms,
      edgePadding: stage.diagnostics.edgePadding,
    };
    phaseProgress(phaseIndex, 1);
    self.postMessage({
      type: 'scatter',
      generation,
      chunkKey,
      phase: `${PHASES[phaseIndex][1]} (${chunkKey})`,
      progress: (phaseIndex + 1) / PHASES.length,
      perf: {
        generation,
        chunkKey,
        phaseKey: stage.key,
        phase: PHASES[phaseIndex][1],
        workerMs: roundMs(stageMs),
        elapsedMs: roundMs(performance.now() - generationStart),
        targetCount: stage.targetCount,
        placed: stage.count,
        attempts: stage.attempts,
        maxAttempts: stage.maxAttempts,
        buckets: stage.buckets.length,
        acceptancePct: stage.attempts > 0 ? roundMs((stage.count / stage.attempts) * 100) : 0,
        rejections: stage.diagnostics.rejections,
        medianSuitability: stage.diagnostics.medianSuitability,
        acceptedLandforms: stage.diagnostics.acceptedLandforms,
        edgePadding: stage.diagnostics.edgePadding,
      },
      stage,
    }, stage.buffers);
  }

  const debugOverlay = buildDebugOverlayData(state);
  self.postMessage({
    type: 'debugOverlay',
    generation,
    chunkKey,
    overlay: debugOverlay.transfer,
  }, debugOverlay.buffers);

  if (params.logGenerationDebug) {
    self.postMessage({
      type: 'debug',
      generation,
      chunkKey,
      summary: chunkDebug,
    });
  }

  self.postMessage({
    type: 'chunkComplete',
    generation,
    chunkKey,
    phase: `Chunk ${chunkKey} complete`,
    progress: 1,
    perf: {
      generation,
      chunkKey,
      phaseKey: 'complete',
      phase: 'Generation complete',
      workerMs: roundMs(performance.now() - generationStart),
    },
  });
}

function scatterStage({
  key,
  generatorOpts = {},
  terrain,
  densityPerArea = 0.01,
  maxSlope = 1.0,
  minHeight = -Infinity,
  maxHeight = Infinity,
  scaleRange = [0.9, 1.15],
  yawRandom = true,
  variantCount = 6,
  seed = 1,
  geometrySeed = seed,
  castShadow = true,
  receiveShadow = true,
  lodLevels = null,
  attemptMultiplier = 6,
  candidateFilter = null,
  onPlace = null,
  sourcePlacements = null,
  edgePadding = 1,
}) {
  const rng = mulberry32(seed);
  const geometryRng = mulberry32(geometrySeed);
  const explicitPlacements = typeof sourcePlacements === 'function'
    ? sourcePlacements()
    : sourcePlacements;
  const hasExplicitPlacements = Array.isArray(explicitPlacements);
  const half = terrain.size / 2;
  const padding = Math.max(0, edgePadding);
  const minX = terrain.originX - half + padding;
  const maxX = terrain.originX + half - padding;
  const minZ = terrain.originZ - half + padding;
  const maxZ = terrain.originZ + half - padding;
  const area = terrain.size * terrain.size;
  const count = hasExplicitPlacements ? explicitPlacements.length : Math.max(0, Math.floor(area * densityPerArea));
  const levels = (lodLevels && lodLevels.length > 0)
    ? lodLevels
    : [{ name: 'full', distance: Infinity, detailScale: 1 }];

  const variants = [];
  for (let i = 0; i < variantCount; i++) {
    const baseOpts = typeof generatorOpts === 'function'
      ? generatorOpts(geometryRng, i)
      : generatorOpts;
    const variantSeed = Math.floor(geometryRng() * 0xffffffff);
    variants.push({
      seed: variantSeed,
      optsByLod: levels.map((level, lodIndex) => applyScatterLodOptions(key, {
        ...baseOpts,
        detailScale: level.detailScale ?? 1,
        lodName: level.name ?? `lod-${lodIndex}`,
      }, level)),
    });
  }

  const buckets = variants.map(() => []);
  const mat = new Array(16);
  const pos = [0, 0, 0];
  const quat = [0, 0, 0, 1];
  const scale = [1, 1, 1];
  let attempts = 0;
  let placed = 0;
  let sourceIndex = 0;
  const maxAttempts = hasExplicitPlacements ? count : count * attemptMultiplier;
  const rejectionStats = {};
  const candidateLandforms = {};
  const acceptedLandforms = {};
  const suitabilityHistogram = createSuitabilityHistogram();
  const filterCtx = {
    x: 0,
    z: 0,
    height: 0,
    slope: 0,
    terrainInfo: null,
    cell: null,
    landform: null,
    scale: 1,
    lodIndex: 0,
    lodLevel: null,
    variantIdx: 0,
    variantOpts: null,
    rng,
    placed: 0,
    attempts: 0,
    suitabilityScore: null,
    nearestScratch: { point: null, distance: Infinity },
  };
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const explicit = hasExplicitPlacements ? explicitPlacements[sourceIndex++] : null;
    if (hasExplicitPlacements && !explicit) break;
    if (explicit && (explicit.x < minX || explicit.x > maxX || explicit.z < minZ || explicit.z > maxZ)) {
      incrementCounter(rejectionStats, 'edgePadding');
      continue;
    }
    const x = explicit ? explicit.x : rngRange(rng, minX, maxX);
    const z = explicit ? explicit.z : rngRange(rng, minZ, maxZ);
    const terrainInfo = terrain.sampleInfo(x, z, 0.6);
    const primaryLandform = primaryLandformName(terrainInfo.landform);
    incrementCounter(candidateLandforms, primaryLandform);
    const h = terrainInfo.height;
    if (h < minHeight || h > maxHeight) {
      incrementCounter(rejectionStats, 'height');
      continue;
    }
    const s = terrainInfo.slope;
    if (s > maxSlope) {
      incrementCounter(rejectionStats, 'slope');
      continue;
    }
    const requestedVariantIdx = explicit?.variantIdx ?? Math.floor(rng() * variantCount);
    const variantIdx = ((requestedVariantIdx % variantCount) + variantCount) % variantCount;
    const lodIdx = 0;
    const variantOpts = variants[variantIdx].optsByLod[lodIdx];
    const sc = explicit?.scale ?? rngRange(rng, scaleRange[0], scaleRange[1]);
    if (candidateFilter) {
      filterCtx.x = x;
      filterCtx.z = z;
      filterCtx.height = h;
      filterCtx.slope = s;
      filterCtx.terrainInfo = terrainInfo;
      filterCtx.cell = terrainInfo.cell;
      filterCtx.landform = terrainInfo.landform;
      filterCtx.scale = sc;
      filterCtx.lodIndex = lodIdx;
      filterCtx.lodLevel = levels[lodIdx];
      filterCtx.variantIdx = variantIdx;
      filterCtx.variantOpts = variantOpts;
      filterCtx.placed = placed;
      filterCtx.attempts = attempts;
      filterCtx.suitabilityScore = null;
      const accepted = candidateFilter(filterCtx);
      if (filterCtx.suitabilityScore !== null) addSuitabilitySample(suitabilityHistogram, filterCtx.suitabilityScore);
      if (!accepted) {
        incrementCounter(rejectionStats, typeof accepted === 'string' ? accepted : 'candidateFilter');
        continue;
      }
    }

    const yaw = explicit?.yaw ?? (yawRandom ? rng() * Math.PI * 2 : 0);
    pos[0] = x;
    pos[1] = h;
    pos[2] = z;
    scale[0] = sc;
    scale[1] = sc;
    scale[2] = sc;
    quatFromAxisAngleInto(quat, Y_AXIS, yaw);
    composeMatrixInto(mat, pos, quat, scale);
    if (onPlace) {
      onPlace(mat, rng, placed, {
        x,
        z,
        height: h,
        slope: s,
        terrainInfo,
        scale: sc,
        lodIndex: lodIdx,
        lodLevel: levels[lodIdx],
        variantIdx,
        variantOpts,
        terrain,
      });
    }
    const bucket = buckets[variantIdx];
    for (let e = 0; e < 16; e++) bucket.push(mat[e]);
    incrementCounter(acceptedLandforms, primaryLandform);
    placed++;
  }

  const transferBuckets = [];
  const buffers = [];
  for (let variantIdx = 0; variantIdx < variants.length; variantIdx++) {
    if (buckets[variantIdx].length === 0) continue;
    const matrices = new Float32Array(buckets[variantIdx]);
    buffers.push(matrices.buffer);
    transferBuckets.push({
      variantIdx,
      castShadow,
      receiveShadow,
      variantSeed: variants[variantIdx].seed,
      variantOpts: variants[variantIdx].optsByLod[0],
      lodLevels: levels.map((level, lodIdx) => ({
        name: level.name ?? `lod-${lodIdx}`,
        distance: level.distance ?? Infinity,
        castShadow: level.castShadow ?? castShadow,
        receiveShadow: level.receiveShadow ?? receiveShadow,
        variantOpts: variants[variantIdx].optsByLod[lodIdx],
      })),
      matrices,
    });
  }

  return {
    key,
    count: placed,
    targetCount: count,
    attempts,
    maxAttempts,
    diagnostics: {
      rejections: rejectionStats,
      candidateLandforms,
      acceptedLandforms,
      medianSuitability: medianSuitabilityHistogram(suitabilityHistogram),
      edgePadding: padding,
    },
    buckets: transferBuckets,
    buffers,
  };
}

function applyScatterLodOptions(stageKey, opts, level) {
  const lodName = level.name ?? opts.lodName ?? '';
  const isFar = lodName === 'far' || (level.distance ?? Infinity) === Infinity;
  if (!isFar) return opts;
  if (stageKey === 'creosote') {
    return {
      ...opts,
      cloneRing: false,
      deadInterior: 0,
      cloneRingRadius: Math.min(opts.cloneRingRadius ?? 0.45, 0.30),
    };
  }
  if (stageKey === 'jumpingCholla' || stageKey === 'pricklyPear') {
    return {
      ...opts,
      suppressCloneDetails: true,
    };
  }
  return opts;
}

function buildDebugOverlayData(state) {
  const rows = [];
  for (const nurse of state.nursePlants) {
    const type = nurse.nurseType === 'rock'
      ? DEBUG_OVERLAY_TYPES.rockNurse
      : nurse.nurseType === 'shrub'
        ? DEBUG_OVERLAY_TYPES.shrubNurse
        : DEBUG_OVERLAY_TYPES.treeNurse;
    rows.push(type, nurse.x, nurse.z, nurse.radius ?? 0, nurse.nurseQuality ?? 1);
  }
  for (const zone of state.resourceZones) {
    rows.push(DEBUG_OVERLAY_TYPES.resource, zone.x, zone.z, zone.radius ?? 0, zone.strength ?? 1);
  }
  for (const center of state.pricklyPearPatchCenters) {
    rows.push(DEBUG_OVERLAY_TYPES.pricklyPearPatch, center.x, center.z, center.radius ?? 0, center.strength ?? 1);
  }
  for (const center of state.chollaColonyCenters) {
    rows.push(DEBUG_OVERLAY_TYPES.chollaColony, center.x, center.z, center.radius ?? 0, center.strength ?? 1);
  }
  const zones = new Float32Array(rows);
  return {
    transfer: {
      stride: 5,
      zones,
    },
    buffers: [zones.buffer],
  };
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function incrementCounter(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function createSuitabilityHistogram() {
  return {
    bins: new Uint16Array(101),
    count: 0,
  };
}

function addSuitabilitySample(histogram, value) {
  const bin = Math.max(0, Math.min(100, Math.round(clamp01(value) * 100)));
  histogram.bins[bin]++;
  histogram.count++;
}

function medianSuitabilityHistogram(histogram) {
  if (histogram.count === 0) return null;
  const target = Math.floor((histogram.count - 1) * 0.5);
  let running = 0;
  for (let i = 0; i < histogram.bins.length; i++) {
    running += histogram.bins[i];
    if (running > target) return roundMs(i / 100);
  }
  return 1;
}

function buildTerrainData(params, seed) {
  const rng = mulberry32(seed);
  const macroNoise = createNoise2D(rng);
  const ridgeNoise = createNoise2D(rng);
  const detailNoise = createNoise2D(rng);
  const warpNoise = createNoise2D(rng);
  const washNoise = createNoise2D(rng);
  const colorNoise = createNoise2D(rng);

  const {
    size = 140,
    originX = 0,
    originZ = 0,
    segments = 220,
    hydrologySegments = 88,
    heightScale = 5.5,
    macroScale = 0.012,
    ridgeScale = 0.035,
    rippleScale = 0.16,
    washStrength = 0.6,
    fanStrength = 0.72,
    erosionStrength = 0.75,
    rockySlopeStrength = 0.38,
    recentRainDays = 999,
    monsoonRain_0_1 = 0,
    winterRain_0_1 = 0,
  } = params;
  const half = size / 2;
  const minX = originX - half;
  const minZ = originZ - half;
  const gridStride = segments + 1;
  const gridStep = size / segments;
  const hydroSegments = Math.max(8, Math.floor(hydrologySegments));
  const hydroStride = hydroSegments + 1;
  const hydroStep = size / hydroSegments;

  const washCount = 5;
  const washes = [];
  for (let i = 0; i < washCount; i++) {
    const t = washCount === 1 ? 0.5 : i / (washCount - 1);
    washes.push({
      x0: (t - 0.5) * size * 0.72 + (rng() - 0.5) * size * 0.18,
      phase: rng() * Math.PI * 2,
      amp: 4.5 + rng() * 8.0,
      freq: 0.026 + rng() * 0.022,
      width: 0.9 + rng() * 1.15,
      depth: 0.5 + rng() * 0.8,
      side: rng() < 0.5 ? -1 : 1,
      spacing: size * (0.58 + rng() * 0.34),
    });
  }

  function warpedCoords(x, z) {
    const wx = x + warpNoise(x * 0.018, z * 0.018) * 8.5;
    const wz = z + warpNoise((x + 91.7) * 0.015, (z - 41.3) * 0.015) * 7.0;
    return [wx, wz];
  }

  function washNetwork(x, z) {
    const drainageNoise = fbm(washNoise, x * 0.0032, z * 0.0032, 3, 2.0, 0.55);
    const downhill = clamp01(
      0.48 +
      Math.sin((z + drainageNoise * 170) * 0.006) * 0.32 +
      drainageNoise * 0.22
    );
    let cut = 0;
    let bank = 0;
    let gravel = 0;
    let nearest = 1;
    // Loop-invariant across all 15 wash/lane iterations (depend only on the
    // vertex), so compute once instead of 15x. barNoise in particular was a
    // simplex-noise call repeated per lane — ~2M redundant samples/terrain.
    const barNoise = detailNoise(x * 0.45, z * 0.45) * 0.5 + 0.5;
    const active = smoothstep(0.05, 0.92, downhill);
    const widthDownhill = 0.7 + downhill * 1.8;
    for (const wash of washes) {
      const nearestLane = Math.round((x - wash.x0) / wash.spacing);
      const width = wash.width * widthDownhill;
      const cullDist = width * 3.5;
      for (let lane = nearestLane - 1; lane <= nearestLane + 1; lane++) {
        const baseX = wash.x0 + lane * wash.spacing;
        const lanePhase = wash.phase + lane * 1.713;
        const meander =
          Math.sin(z * wash.freq + lanePhase) * wash.amp +
          washNoise(z * 0.027 + lanePhase, baseX * 0.013) * wash.amp * 0.55;
        const center = baseX + meander * (0.45 + downhill * 0.9);
        const dist = Math.abs(x - center);
        nearest = Math.min(nearest, dist / cullDist);
        // Past ~3.5 widths the gaussian channel/bank are exp(-12)~0; skip the
        // two exp() evals for far lanes (most of them). The tributary below has
        // its own phase gate and can still fire near a meander crest.
        if (dist < cullDist) {
          // exp(-t^2) gaussian falloff. Squaring by multiply (not Math.pow,
          // ~10x slower) matters: 15 lanes x 130k terrain vertices.
          const channelT = dist / width;
          const channel = Math.exp(-(channelT * channelT));
          const bankDist = Math.abs(dist - width * 1.35);
          const cutBankT = bankDist / (width * 0.55);
          const cutBank = Math.exp(-(cutBankT * cutBankT));
          cut += channel * wash.depth * active;
          bank += cutBank * active * (0.08 + 0.06 * barNoise);
          gravel += channel * active * (0.4 + 0.6 * barNoise);
        }

        const tributaryPhase = Math.sin((z + lane * wash.spacing) * 0.008 + lanePhase);
        if (tributaryPhase > -0.25) {
          const tribProgress = smoothstep(-0.25, 0.95, tributaryPhase);
          const tribCenter = center + wash.side * tribProgress * wash.spacing * 0.32;
          const tribDist = Math.abs(x - tribCenter);
          const tribWidth = width * 0.45;
          const tribT = tribDist / tribWidth;
          const tributary = Math.exp(-(tribT * tribT)) * tribProgress;
          cut += tributary * wash.depth * 0.28;
          gravel += tributary * 0.4;
          nearest = Math.min(nearest, tribDist / (tribWidth * 4));
        }
      }
    }
    return {
      cut: Math.min(2.6, cut),
      bank: Math.min(0.65, bank),
      gravel: clamp01(gravel),
      proximity: clamp01(1 - nearest),
    };
  }

  function evaluate(x, z) {
    const [wx, wz] = warpedCoords(x, z);
    const landform = fbm(macroNoise, wx * 0.0025, wz * 0.002, 4, 2.0, 0.5);
    const longWave = Math.sin((wz + landform * 220) * 0.0048 + fbm(ridgeNoise, wx * 0.0018, wz * 0.0018, 3) * 1.8);
    const north = clamp01(0.5 + longWave * 0.34 + landform * 0.24);
    const south = 1 - north;
    const shoulder = smoothstep(0.52, 0.97, north);
    const basin = smoothstep(0.16, 0.78, south);
    const macro = fbm(macroNoise, wx * macroScale, wz * macroScale, 5, 2.0, 0.52);
    const ridge = ridgedFbm(ridgeNoise, wx * ridgeScale, wz * ridgeScale * 1.35, 3);
    const fanLobes = ridgedFbm(macroNoise, wx * 0.014, (wz + size * 0.45) * 0.024, 2);
    const slopeFaces = ridgedFbm(ridgeNoise, wx * ridgeScale * 1.15, wz * ridgeScale * 0.75, 2);
    const wash = washNetwork(wx, wz);
    const flowAccumulation = clamp01(
      wash.proximity * 0.58 +
      wash.gravel * 0.62 +
      basin * 0.18 +
      south * 0.12 -
      shoulder * 0.15
    );
    const runoff = clamp01(
      shoulder * 0.48 +
      ridge * 0.22 +
      Math.abs(macro) * 0.12 -
      wash.gravel * 0.16
    );
    const soilMoisture = clamp01(
      flowAccumulation * 0.78 +
      wash.bank * 0.38 +
      basin * 0.12 -
      runoff * 0.24
    );
    const mountainFront = shoulder * (1.2 + macro * 0.7 + ridge * rockySlopeStrength * 0.82);
    const bajada = basin * (fanLobes - 0.35) * fanStrength * 0.74 * (0.3 + north * 0.7);
    const basinTilt = (north - 0.42) * 0.9;
    const bedrock = slopeFaces * shoulder * 0.22;
    const ripple =
      detailNoise(wx * rippleScale, wz * rippleScale * 1.7) *
      (0.014 + 0.022 * basin) *
      (1 - wash.gravel * 0.55);
    const desertPavement = fbm(detailNoise, wx * 0.42, wz * 0.42, 2, 2.0, 0.42) * 0.012;
    const strata = Math.sin((mountainFront + basinTilt) * 8.0 + macro * 2.0) * shoulder * 0.018;
    const raw =
      basinTilt +
      mountainFront +
      bajada +
      bedrock +
      strata +
      ripple +
      desertPavement +
      wash.bank * fanStrength -
      wash.cut * washStrength * erosionStrength;
    return {
      height: raw * heightScale,
      wash,
      flowAccumulation,
      runoff,
      soilMoisture,
      shoulder,
      basin,
      ridge,
    };
  }

  const hydroCount = hydroStride * hydroStride;
  const hydrologyField = {
    cut: new Float32Array(hydroCount),
    bank: new Float32Array(hydroCount),
    gravel: new Float32Array(hydroCount),
    proximity: new Float32Array(hydroCount),
    flowAccumulation: new Float32Array(hydroCount),
    runoff: new Float32Array(hydroCount),
    soilMoisture: new Float32Array(hydroCount),
    shoulder: new Float32Array(hydroCount),
    basin: new Float32Array(hydroCount),
    ridge: new Float32Array(hydroCount),
  };
  for (let row = 0; row <= hydroSegments; row++) {
    const z = minZ + row * hydroStep;
    for (let col = 0; col <= hydroSegments; col++) {
      const x = minX + col * hydroStep;
      const i = row * hydroStride + col;
      const info = evaluate(x, z);
      hydrologyField.cut[i] = info.wash.cut;
      hydrologyField.bank[i] = info.wash.bank;
      hydrologyField.gravel[i] = info.wash.gravel;
      hydrologyField.proximity[i] = info.wash.proximity;
      hydrologyField.flowAccumulation[i] = info.flowAccumulation;
      hydrologyField.runoff[i] = info.runoff;
      hydrologyField.soilMoisture[i] = info.soilMoisture;
      hydrologyField.shoulder[i] = info.shoulder;
      hydrologyField.basin[i] = info.basin;
      hydrologyField.ridge[i] = info.ridge;
    }
  }

  const vertexCount = gridStride * gridStride;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const terrainDetail = new Float32Array(vertexCount * 4);
  const terrainLandform = new Float32Array(vertexCount);
  const terrainDebugData = new Float32Array(vertexCount * 4);
  const heightField = new Float32Array(vertexCount);
  const washGravel = new Float32Array(vertexCount);
  const washProximity = new Float32Array(vertexCount);
  const shoulder = new Float32Array(vertexCount);
  const basin = new Float32Array(vertexCount);
  const ridge = new Float32Array(vertexCount);
  const sand = colorFromHex(0xc6a16d);
  const sandLight = colorFromHex(0xd8bd8b);
  const desertVarnish = colorFromHex(0x715036);
  const talus = colorFromHex(0x8f6b4c);
  const dust = colorFromHex(0xb88863);
  const washBed = colorFromHex(0x9f875e);
  const caliche = colorFromHex(0xd4c39f);
  const tmpColor = [0, 0, 0];
  const landformCounts = {};

  for (let row = 0; row <= segments; row++) {
    const z = minZ + row * gridStep;
    for (let col = 0; col <= segments; col++) {
      const x = minX + col * gridStep;
      const i = row * gridStride + col;
      const info = evaluate(x, z);
      positions[i * 3] = x;
      positions[i * 3 + 1] = info.height;
      positions[i * 3 + 2] = z;
      heightField[i] = info.height;
      washGravel[i] = info.wash.gravel;
      washProximity[i] = info.wash.proximity;
      shoulder[i] = info.shoulder;
      basin[i] = info.basin;
      ridge[i] = info.ridge;
    }
  }

  for (let i = 0; i < vertexCount; i++) {
    const col = i % gridStride;
    const row = Math.floor(i / gridStride);
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    const left = row * gridStride + Math.max(0, col - 1);
    const right = row * gridStride + Math.min(segments, col + 1);
    const prev = Math.max(0, row - 1) * gridStride + col;
    const next = Math.min(segments, row + 1) * gridStride + col;
    const dx = positions[right * 3] - positions[left * 3] || gridStep;
    const dz = positions[next * 3 + 2] - positions[prev * 3 + 2] || gridStep;
    const hx = (heightField[right] - heightField[left]) / dx;
    const hz = (heightField[next] - heightField[prev]) / dz;
    const s = Math.sqrt(hx * hx + hz * hz);
    const sampledInfo = sampleHydrologyField(x, z);
    const rockCover_0_1 = clamp01(
      ridge[i] * 0.38 +
      shoulder[i] * 0.30 +
      clamp01(s * 0.82) * 0.24 +
      washGravel[i] * 0.16
    );
    const landform = classifyLandform({
      wash: {
        gravel: washGravel[i],
        proximity: washProximity[i],
        bank: sampledInfo.wash.bank,
      },
      flowAccumulation: sampledInfo.flowAccumulation,
      soilMoisture: sampledInfo.soilMoisture,
      runoff: sampledInfo.runoff,
      shoulder: shoulder[i],
      basin: basin[i],
      ridge: ridge[i],
      slope: s,
      rockCover_0_1,
    });
    const soilTexture = classifySoilTexture({
      landform,
      wash: {
        gravel: washGravel[i],
        proximity: washProximity[i],
        bank: sampledInfo.wash.bank,
      },
      basin: basin[i],
      runoff: sampledInfo.runoff,
      soilMoisture: sampledInfo.soilMoisture,
      slope: s,
      rockCover_0_1,
    });
    const runonIndex_0_1 = clamp01(sampledInfo.flowAccumulation * 0.64 + sampledInfo.soilMoisture * 0.36);
    const aspect = positiveDegrees(Math.atan2(-hx, hz) * 180 / Math.PI);
    const southAspect = Math.max(0, Math.cos((aspect - 180) * Math.PI / 180));
    const northAspect = Math.max(0, Math.cos(aspect * Math.PI / 180));
    const frostRisk_0_1 = clamp01(
      basin[i] * 0.38 +
      northAspect * 0.22 +
      clamp01((-heightField[i] + 1.8) * 0.08) +
      (1 - sampledInfo.runoff) * 0.10 -
      southAspect * 0.18 -
      shoulder[i] * 0.12
    );
    const normalLen = Math.sqrt(hx * hx + hz * hz + 1) || 1;
    normals[i * 3] = -hx / normalLen;
    normals[i * 3 + 1] = 1 / normalLen;
    normals[i * 3 + 2] = -hz / normalLen;

    const mottle = colorNoise(x * 0.55, z * 0.55) * 0.5 + 0.5;
    const dirty = colorNoise((x - 17.3) * 0.12, (z + 11.9) * 0.12) * 0.5 + 0.5;
    const paleCrust = smoothstep(0.22, 0.74, basin[i]) * (1 - washGravel[i]) * (colorNoise(x * 0.08, z * 0.08) * 0.5 + 0.5);
    colorLerpIntoBase(tmpColor, sand, sandLight, mottle * 0.45);
    colorLerpInto(tmpColor, dust, dirty * 0.28);
    colorLerpInto(tmpColor, caliche, paleCrust * 0.22);
    colorLerpInto(tmpColor, washBed, washGravel[i] * 0.62);
    colorLerpInto(tmpColor, talus, shoulder[i] * Math.min(0.6, s * 0.45));
    if (s > 0.72) colorLerpInto(tmpColor, desertVarnish, Math.min(1, (s - 0.72) * 1.2 + ridge[i] * 0.35));
    if (washProximity[i] > 0.25) multiplyColor(tmpColor, 1 - 0.03 * washProximity[i]);

    colors[i * 3] = tmpColor[0];
    colors[i * 3 + 1] = tmpColor[1];
    colors[i * 3 + 2] = tmpColor[2];
    terrainDetail[i * 4] = washGravel[i];
    terrainDetail[i * 4 + 1] = shoulder[i];
    terrainDetail[i * 4 + 2] = basin[i];
    terrainDetail[i * 4 + 3] = Math.min(1, s * 0.65);
    terrainLandform[i] = landformIndex(landform);
    terrainDebugData[i * 4] = Math.max(0, SOIL_TEXTURE_NAMES.indexOf(soilTexture));
    terrainDebugData[i * 4 + 1] = runonIndex_0_1;
    terrainDebugData[i * 4 + 2] = frostRisk_0_1;
    terrainDebugData[i * 4 + 3] = rockCover_0_1;
    incrementCounter(landformCounts, LANDFORM_NAMES[terrainLandform[i]] ?? 'unknown');
  }

  const indexCount = segments * segments * 6;
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let p = 0;
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * gridStride + col;
      const b = a + 1;
      const c = (row + 1) * gridStride + col;
      const d = c + 1;
      indices[p++] = a;
      indices[p++] = c;
      indices[p++] = b;
      indices[p++] = b;
      indices[p++] = c;
      indices[p++] = d;
    }
  }

  function sample(x, z) {
    const gx = clamp((x - minX) / gridStep, 0, segments);
    const gz = clamp((z - minZ) / gridStep, 0, segments);
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
    const h0 = lerp(heightField[i00], heightField[i10], tx);
    const h1 = lerp(heightField[i01], heightField[i11], tx);
    return lerp(h0, h1, tz);
  }

  function sampleHydrologyField(x, z) {
    const gx = clamp((x - minX) / hydroStep, 0, hydroSegments);
    const gz = clamp((z - minZ) / hydroStep, 0, hydroSegments);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(hydroSegments, x0 + 1);
    const z1 = Math.min(hydroSegments, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const i00 = z0 * hydroStride + x0;
    const i10 = z0 * hydroStride + x1;
    const i01 = z1 * hydroStride + x0;
    const i11 = z1 * hydroStride + x1;
    return {
      wash: {
        cut: sampleField(hydrologyField.cut, i00, i10, i01, i11, tx, tz),
        bank: sampleField(hydrologyField.bank, i00, i10, i01, i11, tx, tz),
        gravel: sampleField(hydrologyField.gravel, i00, i10, i01, i11, tx, tz),
        proximity: sampleField(hydrologyField.proximity, i00, i10, i01, i11, tx, tz),
      },
      flowAccumulation: sampleField(hydrologyField.flowAccumulation, i00, i10, i01, i11, tx, tz),
      runoff: sampleField(hydrologyField.runoff, i00, i10, i01, i11, tx, tz),
      soilMoisture: sampleField(hydrologyField.soilMoisture, i00, i10, i01, i11, tx, tz),
      shoulder: sampleField(hydrologyField.shoulder, i00, i10, i01, i11, tx, tz),
      basin: sampleField(hydrologyField.basin, i00, i10, i01, i11, tx, tz),
      ridge: sampleField(hydrologyField.ridge, i00, i10, i01, i11, tx, tz),
    };
  }

  function sampleInfo(x, z, eps = 0.5) {
    const info = sampleHydrologyField(x, z);
    const surfaceHeight = sample(x, z);
    const invDiameter = 1 / (2 * eps);
    const hx = (sample(x + eps, z) - sample(x - eps, z)) * invDiameter;
    const hz = (sample(x, z + eps) - sample(x, z - eps)) * invDiameter;
    const slopeMagnitude = Math.sqrt(hx * hx + hz * hz);
    const slope_deg = Math.atan(slopeMagnitude) * 180 / Math.PI;
    // Aspect is the downslope bearing: 0=N (-Z), 90=E (+X), 180=S (+Z), 270=W (-X).
    const aspect = positiveDegrees(Math.atan2(-hx, hz) * 180 / Math.PI);
    const washDistance_m = Math.max(0, (1 - info.wash.proximity) * lerp(18, 7, info.wash.gravel));
    const rockCover_0_1 = clamp01(
      info.ridge * 0.38 +
      info.shoulder * 0.30 +
      clamp01(slopeMagnitude * 0.82) * 0.24 +
      info.wash.gravel * 0.16
    );
    const runonIndex_0_1 = clamp01(info.flowAccumulation * 0.64 + info.soilMoisture * 0.36);
    const landform = classifyLandform({
      wash: info.wash,
      flowAccumulation: info.flowAccumulation,
      soilMoisture: info.soilMoisture,
      runoff: info.runoff,
      shoulder: info.shoulder,
      basin: info.basin,
      ridge: info.ridge,
      slope: slopeMagnitude,
      rockCover_0_1,
    });
    const soilTexture = classifySoilTexture({
      landform,
      wash: info.wash,
      basin: info.basin,
      runoff: info.runoff,
      soilMoisture: info.soilMoisture,
      slope: slopeMagnitude,
      rockCover_0_1,
    });
    const soilDepth_m = estimateSoilDepth({
      landform,
      soilTexture,
      slope: slopeMagnitude,
      wash: info.wash,
      basin: info.basin,
      rockCover_0_1,
    });
    const calicheDepth_m = estimateCalicheDepth({
      landform,
      soilTexture,
      wash: info.wash,
      basin: info.basin,
      rockCover_0_1,
    });
    const southAspect = Math.max(0, Math.cos((aspect - 180) * Math.PI / 180));
    const northAspect = Math.max(0, Math.cos(aspect * Math.PI / 180));
    const frostRisk_0_1 = clamp01(
      info.basin * 0.38 +
      northAspect * 0.22 +
      clamp01((-surfaceHeight + 1.8) * 0.08) +
      (1 - info.runoff) * 0.10 -
      southAspect * 0.18 -
      info.shoulder * 0.12
    );
    const disturbanceNoise = colorNoise((x + 219.4) * 0.011, (z - 83.7) * 0.011) * 0.5 + 0.5;
    const fireOrGrassDisturbance_0_1 = clamp01(
      disturbanceNoise * 0.22 +
      info.basin * 0.16 +
      info.wash.proximity * (1 - info.wash.gravel) * 0.10 -
      rockCover_0_1 * 0.18
    );
    const cell = {
      elevation_m: surfaceHeight,
      slope_deg,
      aspect,
      soilTexture,
      soilDepth_m,
      calicheDepth_m,
      rockCover_0_1,
      washDistance_m,
      runonIndex_0_1,
      frostRisk_0_1,
      recentRainDays,
      monsoonRain_0_1,
      winterRain_0_1,
      fireOrGrassDisturbance_0_1,
      landform,
    };
    return {
      wash: info.wash,
      flowAccumulation: info.flowAccumulation,
      runoff: info.runoff,
      soilMoisture: info.soilMoisture,
      shoulder: info.shoulder,
      basin: info.basin,
      ridge: info.ridge,
      height: surfaceHeight,
      elevation_m: surfaceHeight,
      slope: slopeMagnitude,
      slope_deg,
      aspect,
      soilTexture,
      soilDepth_m,
      calicheDepth_m,
      rockCover_0_1,
      washDistance_m,
      runonIndex_0_1,
      frostRisk_0_1,
      recentRainDays,
      monsoonRain_0_1,
      winterRain_0_1,
      fireOrGrassDisturbance_0_1,
      landform,
      cell,
      washProximity: info.wash.proximity,
      washGravel: info.wash.gravel,
    };
  }

  const buffers = [positions.buffer, normals.buffer, colors.buffer, terrainDetail.buffer, terrainLandform.buffer, terrainDebugData.buffer, indices.buffer];
  return {
    size,
    originX,
    originZ,
    sample,
    sampleInfo,
    transfer: {
      size,
      originX,
      originZ,
      segments,
      positions,
      normals,
      colors,
      terrainDetail,
      terrainLandform,
      terrainDebugData,
      indices,
    },
    diagnostics: {
      landformCounts,
    },
    buffers,
  };
}

function positiveDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

function classifyLandform({
  wash,
  flowAccumulation,
  soilMoisture,
  runoff,
  shoulder,
  basin,
  ridge,
  slope,
  rockCover_0_1,
}) {
  const washScore = clamp01(wash.proximity * 0.54 + wash.gravel * 0.34 + flowAccumulation * 0.22);
  const washMargin = clamp01(wash.proximity * (1 - wash.gravel * 0.58) + wash.bank * 0.55);
  const rockySlope = clamp01(shoulder * 0.45 + ridge * 0.34 + rockCover_0_1 * 0.32 + slope * 0.20);
  const upperBajada = clamp01(shoulder * 0.42 + runoff * 0.24 + ridge * 0.16 + (1 - basin) * 0.12 - washScore * 0.18);
  const lowerBajada = clamp01(basin * 0.44 + runoff * 0.12 + (1 - soilMoisture) * 0.20 - washScore * 0.18 - shoulder * 0.10);
  const sandyAlluvialFlat = clamp01(basin * 0.46 + (1 - slope * 1.7) * 0.24 + (1 - rockCover_0_1) * 0.20 - wash.gravel * 0.14);
  const calicheFlat = clamp01(basin * 0.38 + (1 - slope * 1.9) * 0.22 + (1 - soilMoisture) * 0.18 - washScore * 0.12);
  const basinFlat = clamp01(basin * 0.54 + (1 - slope * 2.2) * 0.26 - shoulder * 0.16);
  return {
    rockySlope,
    upperBajada,
    wash: washScore,
    washMargin,
    lowerBajada,
    sandyAlluvialFlat,
    calicheFlat,
    basinFlat,
  };
}

function primaryLandformName(landform = {}) {
  let bestName = 'unknown';
  let bestScore = -Infinity;
  for (const name of LANDFORM_NAMES) {
    const score = landform[name] ?? 0;
    if (score <= bestScore) continue;
    bestScore = score;
    bestName = name;
  }
  return bestName;
}

function landformIndex(landform = {}) {
  const name = primaryLandformName(landform);
  return Math.max(0, LANDFORM_NAMES.indexOf(name));
}

function buildPatchCenters({ terrain, seed, targetCount, minDistance, suitability }) {
  const rng = mulberry32(seed);
  const half = terrain.size / 2;
  const minX = terrain.originX - half + 1;
  const maxX = terrain.originX + half - 1;
  const minZ = terrain.originZ - half + 1;
  const maxZ = terrain.originZ + half - 1;
  const centers = [];
  const maxAttempts = Math.max(24, targetCount * 28);
  let attempts = 0;
  while (centers.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const x = rngRange(rng, minX, maxX);
    const z = rngRange(rng, minZ, maxZ);
    const info = terrain.sampleInfo(x, z, 0.6);
    const score = clamp01(suitability(info));
    if (rng() > score) continue;
    let tooClose = false;
    for (const center of centers) {
      const dx = x - center.x;
      const dz = z - center.z;
      if (dx * dx + dz * dz < minDistance * minDistance) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    centers.push({
      x,
      z,
      radius: rngRange(rng, minDistance * 0.55, minDistance * 1.55),
      strength: rngRange(rng, 0.72, 1.0),
    });
  }
  return centers;
}

function buildGlobalPatchCenters({ terrain, seed, targetCount, minDistance, padding = 0, suitability }) {
  const half = terrain.size / 2;
  const minX = terrain.originX - half - padding;
  const maxX = terrain.originX + half + padding;
  const minZ = terrain.originZ - half - padding;
  const maxZ = terrain.originZ + half + padding;
  const cellSize = Math.max(0.001, minDistance);
  const startCellX = Math.floor(minX / cellSize);
  const endCellX = Math.floor(maxX / cellSize);
  const startCellZ = Math.floor(minZ / cellSize);
  const endCellZ = Math.floor(maxZ / cellSize);
  const chunkCells = Math.max(1, Math.ceil(terrain.size / cellSize) ** 2);
  const probability = clamp01((targetCount / chunkCells) * 3.0);
  const centers = [];
  for (let cz = startCellZ; cz <= endCellZ; cz++) {
    for (let cx = startCellX; cx <= endCellX; cx++) {
      const rng = mulberry32(hashChunkSeed(seed, cx, cz));
      if (rng() > probability) continue;
      const x = (cx + rngRange(rng, 0.12, 0.88)) * cellSize;
      const z = (cz + rngRange(rng, 0.12, 0.88)) * cellSize;
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const info = terrain.sampleInfo(x, z, 0.6);
      const score = clamp01(suitability(info));
      if (rng() > score) continue;
      centers.push({
        x,
        z,
        radius: rngRange(rng, minDistance * 0.55, minDistance * 1.55),
        strength: rngRange(rng, 0.72, 1.0),
      });
    }
  }
  return centers;
}

function buildRockShelterNurses(state, terrain, seed, proportions) {
  const area = terrain.size * terrain.size;
  const centers = buildPatchCenters({
    terrain,
    seed,
    targetCount: Math.max(3, Math.floor(area / 2100)),
    minDistance: Math.max(5.5, proportions.ecology.youngSaguaroNurseEdge * 4.2),
    suitability: info => clamp01(
      info.rockCover_0_1 * 0.58 +
      info.landform.rockySlope * 0.34 +
      info.landform.upperBajada * 0.16 -
      info.landform.wash * 0.35 -
      info.soilMoisture * 0.20
    ),
  });
  for (const center of centers) {
    const nurse = {
      x: center.x,
      z: center.z,
      radius: center.radius * 0.38,
      rootRadius: 0,
      kind: 'rockShelter',
      nurseType: 'rock',
      nurseQuality: 0.42 * center.strength,
      shadeProtection: 0.46,
      herbivoreProtection: 0.25,
      soilIsland: 0,
      longTermCompetition: 0,
    };
    state.nursePlants.push(nurse);
    state.rockNurses.push(nurse);
  }
}

function classifySoilTexture({
  landform,
  wash,
  basin,
  runoff,
  soilMoisture,
  slope,
  rockCover_0_1,
}) {
  if (landform.wash > 0.58 && (wash.gravel > 0.28 || landform.washMargin > 0.52)) return 'wash_alluvium';
  if (rockCover_0_1 > 0.62 || landform.rockySlope > 0.72) return 'rock';
  if (wash.gravel > 0.38 || (landform.upperBajada > 0.52 && rockCover_0_1 > 0.28)) return 'gravel';
  if (basin > 0.64 && slope < 0.16 && soilMoisture > 0.58 && runoff < 0.22 && wash.gravel < 0.18) return 'clay';
  if (landform.sandyAlluvialFlat > 0.56 && rockCover_0_1 < 0.24) return 'sand';
  return 'loam';
}

function estimateSoilDepth({
  landform,
  soilTexture,
  slope,
  wash,
  basin,
  rockCover_0_1,
}) {
  let depth = 0.42 + basin * 0.34 + landform.wash * 0.48 + landform.washMargin * 0.26;
  depth -= rockCover_0_1 * 0.34 + slope * 0.18;
  if (soilTexture === 'rock') depth *= 0.42;
  if (soilTexture === 'gravel') depth *= 0.78;
  if (soilTexture === 'wash_alluvium') depth += 0.34 + wash.gravel * 0.12;
  if (soilTexture === 'clay') depth += 0.16;
  return clamp(depth, 0.08, 1.65);
}

function estimateCalicheDepth({
  landform,
  soilTexture,
  wash,
  basin,
  rockCover_0_1,
}) {
  if (soilTexture === 'wash_alluvium' || landform.wash > 0.68) return clamp(1.10 + wash.gravel * 0.45, 0.55, 2.0);
  if (soilTexture === 'rock') return clamp(0.12 + rockCover_0_1 * 0.20, 0.06, 0.55);
  const calicheFlat = Math.max(landform.calicheFlat, landform.lowerBajada * 0.72, basin * 0.45);
  return clamp(lerp(1.25, 0.24, calicheFlat) + rockCover_0_1 * 0.22, 0.12, 1.7);
}

function terrainWater(ctx) {
  const info = ctx.terrainInfo;
  if (!info) {
    const moisture = clamp(0.34 - ctx.slope * 0.08 - ctx.height * 0.025, 0, 1);
    return {
      moisture,
      flow: moisture,
      runoff: clamp(ctx.slope * 0.25, 0, 1),
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

function terrainLandforms(ctx) {
  return ctx.landform ?? ctx.terrainInfo?.landform ?? {};
}

function terrainCell(ctx) {
  return ctx.cell ?? ctx.terrainInfo?.cell ?? {};
}

function landformScore(ctx, name) {
  return terrainLandforms(ctx)[name] ?? 0;
}

function landformMax(ctx, names) {
  let score = 0;
  const landform = terrainLandforms(ctx);
  for (const name of names) score = Math.max(score, landform[name] ?? 0);
  return score;
}

function slopeScore(ctx, maxSlope) {
  return 1 - clamp01((ctx.slope ?? 0) / Math.max(0.001, maxSlope));
}

function steepOrWashMarginScore(ctx, slopeMax = 0.70) {
  return Math.max(clamp01((ctx.slope ?? 0) / Math.max(0.001, slopeMax)), landformScore(ctx, 'washMargin'));
}

function activeWashFloodPenalty(ctx, gravelWeight = 0.45, moistureStart = 0.78, moistureWeight = 0.4) {
  const water = terrainWater(ctx);
  return landformScore(ctx, 'wash') * water.gravel * gravelWeight +
    Math.max(0, water.moisture - moistureStart) * moistureWeight;
}

function flashFloodWashScore(ctx) {
  const water = terrainWater(ctx);
  return clamp01(water.flow * 0.62 + water.gravel * 0.38);
}

function runoffStressScore(ctx) {
  return terrainWater(ctx).runoff;
}

function rockShelterScore(ctx) {
  const cell = terrainCell(ctx);
  return clamp01((cell.rockCover_0_1 ?? 0) * 0.72 + landformScore(ctx, 'rockySlope') * 0.28);
}

function chanceFromScore(ctx, score) {
  ctx.suitabilityScore = clamp(score, 0.02, 0.98);
  return ctx.rng() < ctx.suitabilityScore;
}

function acceptPaloVerdeCandidate(ctx, state, proportions) {
  return chanceFromScore(ctx, paloVerdeSuitability(ctx, state, proportions));
}

function acceptSaguaroCandidate(ctx, state, proportions) {
  const nursePlants = state.nursePlants;
  const resourceZones = state.resourceZones;
  const age = ctx.variantOpts.age ?? 0.5;
  const height = estimateSaguaroHeight(age, proportions) * ctx.scale;
  const rootPadding = Math.max(proportions.ecology.minSaguaroRootPadding, height * 0.35);
  const water = terrainWater(ctx);
  if (spatialZonePressure(state.spatialIndexes.matureSaguaro, ctx.x, ctx.z, rootPadding) > 0) return false;
  if (flashFloodWashScore(ctx) > 0.70 && landformScore(ctx, 'wash') > 0.48) return ctx.rng() < 0.05;
  if (water.moisture > 0.76) return ctx.rng() < 0.12;
  if (runoffStressScore(ctx) > 0.78 && age < 0.34) return ctx.rng() < 0.10;
  const suitability = saguaroSuitability(ctx, nursePlants, resourceZones, proportions);
  const saguaroPressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: rootPadding,
    kinds: ['saguaro'],
  });
  if (saguaroPressure > 0.12) return false;
  const treePressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: age < 0.62 ? proportions.ecology.immatureSaguaroTreePadding : rootPadding * 0.7,
    kinds: ['paloVerde', 'mesquite'],
  });
  if (age >= 0.62 && treePressure > 0.35) return ctx.rng() < lerp(0.44, 0.06, treePressure);
  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  const rockShelter = rockShelterScore(ctx);
  if (age < 0.34) {
    if (water.moisture < 0.08 && !nurse && rockShelter < 0.55) return ctx.rng() < 0.01;
    if (!nurse) return ctx.rng() < lerp(0.02, 0.28, rockShelter);
    const canopy = nurse.point.radius;
    const quality = nurse.point.nurseQuality ?? 1;
    if (nurse.distance < canopy * 0.18) return chanceFromScore(ctx, suitability * lerp(0.55, 0.92, quality));
    if (nurse.distance < canopy) return chanceFromScore(ctx, suitability * lerp(0.88, 1.32, quality));
    if (nurse.distance < canopy + proportions.ecology.youngSaguaroNurseEdge) return chanceFromScore(ctx, suitability * lerp(0.42, 0.72, quality));
    return ctx.rng() < 0.025;
  }
  if (age < 0.62) {
    if (!nurse) return ctx.rng() < lerp(0.22, 0.38, rockShelter);
    const canopy = nurse.point.radius;
    const quality = nurse.point.nurseQuality ?? 1;
    if (nurse.distance < canopy * 1.25) return chanceFromScore(ctx, suitability * lerp(0.80, 1.12, quality));
    if (nurse.distance < canopy + proportions.ecology.juvenileSaguaroNurseEdge) return chanceFromScore(ctx, suitability * lerp(0.52, 0.82, quality));
    return chanceFromScore(ctx, suitability * 0.42);
  }
  if (!nurse) return chanceFromScore(ctx, suitability * 0.74);
  const canopy = nurse.point.radius;
  if (nurse.distance < canopy * 0.55) return chanceFromScore(ctx, suitability * 0.58);
  if (nurse.distance < canopy + proportions.ecology.matureSaguaroNurseEdge) return chanceFromScore(ctx, suitability * 0.88);
  return chanceFromScore(ctx, suitability * 0.70);
}

function acceptBarrelCactusCandidate(ctx, state, proportions) {
  const nursePlants = state.nursePlants;
  const matureSaguaroZones = state.matureSaguaroZones;
  const resourceZones = state.resourceZones;
  if (hasSpatialPointWithin(state.spatialIndexes.barrel, ctx.x, ctx.z, rngRange(ctx.rng, 1.5, 4.0))) return false;
  const pressure = matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, proportions.ecology.barrelSaguaroPadding);
  if (pressure > 0.72) return ctx.rng() < 0.04;
  if (pressure > 0.18) return ctx.rng() < lerp(0.72, 0.12, pressure);
  const rootPressure = resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.barrelRootPadding });
  if (rootPressure > 0.76) return ctx.rng() < 0.06;
  if (rootPressure > 0.28) return ctx.rng() < lerp(0.74, 0.18, rootPressure);
  const suitability = barrelSuitability(ctx, resourceZones, proportions);
  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  if (!nurse) return chanceFromScore(ctx, suitability);
  const canopy = nurse.point.radius;
  if (nurse.distance < canopy * 0.65) return chanceFromScore(ctx, suitability * 0.42);
  if (nurse.distance < canopy + proportions.ecology.barrelNurseEdge) return chanceFromScore(ctx, suitability * 1.08);
  return chanceFromScore(ctx, suitability);
}

function acceptPricklyPearCandidate(ctx, state, proportions) {
  const pressure = matureSaguaroPressure(ctx.x, ctx.z, state.matureSaguaroZones, proportions.ecology.pricklyPearSaguaroPadding);
  if (pressure > 0.70) return ctx.rng() < 0.07;
  if (pressure > 0.25) return ctx.rng() < lerp(0.80, 0.20, pressure);
  const rootPressure = resourcePressure(ctx.x, ctx.z, state.resourceZones, { padding: proportions.ecology.pricklyPearRootPadding });
  if (rootPressure > 0.82) return ctx.rng() < 0.08;
  return chanceFromScore(ctx, pricklyPearSuitability(ctx, state, proportions));
}

function acceptJumpingChollaCandidate(ctx, state, proportions) {
  const open = acceptOpenPlantCandidate(ctx, state.matureSaguaroZones, state.resourceZones, proportions, 0.34);
  if (!open) return false;
  const chollaPressure = resourcePressure(ctx.x, ctx.z, state.resourceZones, {
    padding: proportions.jumpingCholla.rootRadius * 0.35,
    kinds: ['jumpingCholla'],
  });
  if (chollaPressure > 0.72) return ctx.rng() < 0.08;
  return chanceFromScore(ctx, jumpingChollaSuitability(ctx, state, proportions));
}

function acceptMesquiteCandidate(ctx, state, proportions) {
  return chanceFromScore(ctx, mesquiteSuitability(ctx, state, proportions));
}

function acceptOpenPlantCandidate(ctx, matureSaguaroZones, resourceZones, proportions, competitionTolerance = 0.3) {
  const pressure = matureSaguaroPressure(ctx.x, ctx.z, matureSaguaroZones, proportions.ecology.openPlantSaguaroPadding);
  const rootPressure = Math.max(
    pressure,
    resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.openPlantRootPadding }),
  );
  if (rootPressure <= competitionTolerance) return true;
  return ctx.rng() < lerp(0.65, 0.06, rootPressure);
}

function acceptOcotilloCandidate(ctx, matureSaguaroZones, resourceZones, proportions) {
  const open = acceptOpenPlantCandidate(ctx, matureSaguaroZones, resourceZones, proportions, 0.42);
  if (!open) return false;
  return chanceFromScore(ctx, ocotilloSuitability(ctx, resourceZones, proportions));
}

function acceptCreosoteCandidate(ctx, state, proportions) {
  if (hasSpatialPointWithin(state.spatialIndexes.creosote, ctx.x, ctx.z, rngRange(ctx.rng, 1.5, 3.5))) return false;
  const open = acceptOpenPlantCandidate(ctx, state.matureSaguaroZones, state.resourceZones, proportions, 0.22);
  if (!open) return false;
  return chanceFromScore(ctx, creosoteSuitability(ctx, state.resourceZones, proportions));
}

function saguaroSuitability(ctx, nursePlants, resourceZones, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.46;
  const cell = terrainCell(ctx);
  const nurse = nearestPointInto(ctx.nearestScratch, ctx.x, ctx.z, nursePlants);
  const nurseScore = nurse
    ? clamp01((1 - Math.min(1, nurse.distance / Math.max(0.001, nurse.point.radius + proportions.ecology.juvenileSaguaroNurseEdge))) * (nurse.point.nurseQuality ?? 1))
    : 0;
  const rockShelter = rockShelterScore(ctx);
  const nurseOrRockAvailable = Math.max(nurseScore, rockShelter * 0.72);
  const shallowCoarseSoil = scoreSoilTexture(cell.soilTexture, ['rock', 'gravel', 'wash_alluvium']) * 0.72 + (1 - clamp01(cell.soilDepth_m / 1.2)) * 0.28;
  const rockySlopeOrUpperBajada = landformMax(ctx, ['rockySlope', 'upperBajada']);
  const washRunonBonus = water.flow * (1 - water.gravel * 0.58) * 0.42;
  const floodPenalty = activeWashFloodPenalty(ctx, 0.62, 0.74, 0.9);
  const firePenalty = cell.fireOrGrassDisturbance_0_1 * 0.28;
  return (
    rockySlopeOrUpperBajada * 0.35 +
    shallowCoarseSoil * 0.20 +
    nurseOrRockAvailable * 0.30 +
    (1 - cell.frostRisk_0_1) * 0.10 +
    washRunonBonus * 0.05 +
    0.10 -
    floodPenalty -
    firePenalty -
    resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.minSaguaroRootPadding, kinds: ['saguaro'] }) * 0.42
  );
}

function paloVerdeSuitability(ctx, state, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.36;
  const cell = terrainCell(ctx);
  const treePressure = spatialZonePressure(state.spatialIndexes.trees, ctx.x, ctx.z, proportions.ecology.treeCompetitionPadding);
  const coarseSoil = scoreSoilTexture(cell.soilTexture, ['rock', 'gravel', 'wash_alluvium']);
  const bimodalRain = clamp01(cell.monsoonRain_0_1 * 0.55 + cell.winterRain_0_1 * 0.45);
  const drainagePenalty = cell.soilTexture === 'clay' ? 0.42 : Math.max(0, water.moisture - 0.82) * 0.36;
  const activeWashPenalty = activeWashFloodPenalty(ctx, 0.26, 1, 0);
  return (
    landformScore(ctx, 'upperBajada') * 0.35 +
    landformScore(ctx, 'rockySlope') * 0.25 +
    bimodalRain * 0.20 +
    coarseSoil * 0.15 +
    (cell.soilTexture === 'clay' ? 0 : 0.05) +
    0.18 -
    drainagePenalty -
    activeWashPenalty -
    treePressure * 0.64
  );
}

function mesquiteSuitability(ctx, state, proportions) {
  const info = ctx.terrainInfo;
  if (!info) return 0.28;
  const cell = terrainCell(ctx);
  const water = terrainWater(ctx);
  const treePressure = spatialZonePressure(state.spatialIndexes.trees, ctx.x, ctx.z, proportions.ecology.mesquiteCompetitionPadding);
  const washDistanceClose = clamp01(1 - cell.washDistance_m / 18);
  const deepAlluvium = (cell.soilTexture === 'wash_alluvium' ? 0.72 : 0) + clamp01((cell.soilDepth_m - 0.55) / 0.9) * 0.28;
  const lowSlope = slopeScore(ctx, 0.58);
  const uplandScatterChance = landformMax(ctx, ['rockySlope', 'upperBajada']) * 0.36;
  const washForm = ctx.variantOpts.form === 'wash_floodplain_tree';
  const formFit = washForm
    ? clamp01(washDistanceClose * 0.58 + deepAlluvium * 0.26 + lowSlope * 0.16)
    : clamp01(landformMax(ctx, ['upperBajada', 'rockySlope']) * 0.62 + (1 - washDistanceClose) * 0.22 + lowSlope * 0.16);
  return (
    washDistanceClose * 0.40 +
    deepAlluvium * 0.25 +
    cell.runonIndex_0_1 * 0.20 +
    lowSlope * 0.10 +
    uplandScatterChance * 0.05 +
    formFit * 0.18 +
    0.04 -
    water.runoff * 0.18 -
    treePressure * 0.58
  );
}

function creosoteSuitability(ctx, resourceZones, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.42;
  const cell = terrainCell(ctx);
  const sandyAlluvialOrCalcareous = Math.max(
    scoreSoilTexture(cell.soilTexture, ['sand', 'loam', 'wash_alluvium']) * 0.72,
    landformScore(ctx, 'calicheFlat'),
  );
  const calichePresent = 1 - clamp01((cell.calicheDepth_m - 0.18) / 0.9);
  const lowSlope = slopeScore(ctx, 0.42);
  const goodSoilOxygen = cell.soilTexture === 'clay' ? 0.12 : 1 - clamp01(water.moisture * 0.55 + landformScore(ctx, 'wash') * 0.34);
  const poorDrainagePenalty = Math.max(
    cell.soilTexture === 'clay' ? 0.75 : 0,
    Math.max(0, water.moisture - 0.68) * 1.1,
    landformScore(ctx, 'wash') * 0.64,
  );
  const heavyShadePressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: proportions.ecology.treeCompetitionPadding,
    kinds: ['paloVerde', 'mesquite'],
  });
  return (
    landformMax(ctx, ['lowerBajada', 'basinFlat']) * 0.30 +
    sandyAlluvialOrCalcareous * 0.25 +
    calichePresent * 0.15 +
    lowSlope * 0.15 +
    goodSoilOxygen * 0.10 +
    0.12 -
    poorDrainagePenalty * 0.25 -
    heavyShadePressure * 0.24
  );
}

function ocotilloSuitability(ctx, resourceZones, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.34;
  const cell = terrainCell(ctx);
  const southOrSoutheastAspect = aspectPreference(cell.aspect, 155, 115);
  const shallowWellDrainedSoil = (1 - clamp01(cell.soilDepth_m / 1.05)) * 0.46 +
    (1 - clamp01(water.moisture * 0.85 + (cell.soilTexture === 'clay' ? 0.65 : 0))) * 0.54;
  const lowClayPenalty = cell.soilTexture === 'clay' ? 0.46 : 0;
  const chollaPressure = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: proportions.jumpingCholla.rootRadius * 0.55,
    kinds: ['jumpingCholla'],
  });
  return (
    landformScore(ctx, 'rockySlope') * 0.35 +
    landformScore(ctx, 'upperBajada') * 0.25 +
    shallowWellDrainedSoil * 0.20 +
    southOrSoutheastAspect * 0.10 +
    water.runoff * 0.12 +
    0.10 -
    lowClayPenalty -
    water.flow * water.gravel * 0.24 -
    chollaPressure * 0.25
  );
}

function barrelSuitability(ctx, resourceZones, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.40;
  const cell = terrainCell(ctx);
  const gravelOrRockOrSand = scoreSoilTexture(cell.soilTexture, ['gravel', 'rock', 'sand']);
  const desertShrubland = Math.max(landformMax(ctx, ['lowerBajada', 'upperBajada']), landformScore(ctx, 'rockySlope') * 0.72);
  const washMarginOrAlluvialFan = Math.max(landformScore(ctx, 'washMargin'), landformScore(ctx, 'upperBajada') * water.runoff);
  const treeShade = resourcePressure(ctx.x, ctx.z, resourceZones, {
    padding: proportions.ecology.barrelNurseEdge,
    kinds: ['paloVerde', 'mesquite'],
  });
  const openSun = 1 - treeShade;
  const floodPenalty = activeWashFloodPenalty(ctx, 0.32, 0.72, 0.40);
  return (
    gravelOrRockOrSand * 0.30 +
    desertShrubland * 0.20 +
    washMarginOrAlluvialFan * 0.20 +
    openSun * 0.15 -
    cell.frostRisk_0_1 * 0.15 +
    0.20 -
    floodPenalty
  );
}

function pricklyPearSuitability(ctx, state, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.42;
  const cell = terrainCell(ctx);
  const openDesertScrub = Math.max(landformMax(ctx, ['lowerBajada', 'upperBajada']), landformScore(ctx, 'rockySlope') * 0.65, landformScore(ctx, 'basinFlat') * 0.62);
  const gravelSandLoam = scoreSoilTexture(cell.soilTexture, ['gravel', 'sand', 'loam']);
  const nurse = nearestPointInto(ctx.nearestScratch, ctx.x, ctx.z, state.nursePlants);
  let partialNurseShade = 0;
  if (nurse) {
    const canopy = nurse.point.radius;
    const edgeDistance = Math.abs(nurse.distance - canopy * 0.72);
    partialNurseShade = (1 - clamp01(edgeDistance / Math.max(0.001, canopy + proportions.ecology.pricklyPearNurseEdge))) * (nurse.point.nurseQuality ?? 1);
  }
  const slopeOrWashEdge = steepOrWashMarginScore(ctx, 0.70);
  const existingClumpPatch = resourcePressure(ctx.x, ctx.z, state.resourceZones, {
    padding: proportions.pricklyPear.rootRadius * 0.75,
    kinds: ['pricklyPear'],
  });
  const patchCenter = patchCenterInfluence(ctx.x, ctx.z, state.pricklyPearPatchCenters);
  const animalDispersalPatch = Math.max(existingClumpPatch, patchCenter);
  const lowFloodingPenalty = activeWashFloodPenalty(ctx, 0.45, 0.80, 0.30);
  return (
    openDesertScrub * 0.25 +
    gravelSandLoam * 0.20 +
    partialNurseShade * 0.15 +
    slopeOrWashEdge * 0.15 +
    animalDispersalPatch * 0.10 +
    0.22 -
    lowFloodingPenalty
  );
}

function jumpingChollaSuitability(ctx, state, proportions) {
  const info = ctx.terrainInfo;
  const water = terrainWater(ctx);
  if (!info) return 0.34;
  const cell = terrainCell(ctx);
  const lowerBajadaOrValley = Math.max(landformMax(ctx, ['lowerBajada', 'basinFlat']), landformScore(ctx, 'sandyAlluvialFlat') * 0.72);
  const finerSoilsThanTeddyBearCholla = scoreSoilTexture(cell.soilTexture, ['loam', 'sand']) * 0.76 +
    (cell.soilTexture === 'clay' ? 0.16 : 0);
  const treeShade = resourcePressure(ctx.x, ctx.z, state.resourceZones, {
    padding: proportions.ecology.openPlantRootPadding,
    kinds: ['paloVerde', 'mesquite'],
  });
  const openSun = 1 - treeShade;
  const scrublandOrDesertFlat = Math.max(landformMax(ctx, ['lowerBajada', 'basinFlat']), landformScore(ctx, 'upperBajada') * 0.45);
  const chollaPressure = resourcePressure(ctx.x, ctx.z, state.resourceZones, {
    padding: proportions.jumpingCholla.rootRadius * 1.4,
    kinds: ['jumpingCholla'],
  });
  const colonyCenter = patchCenterInfluence(ctx.x, ctx.z, state.chollaColonyCenters);
  const clonalColonyProximity = Math.max(
    colonyCenter,
    smoothstep(0.05, 0.46, chollaPressure) * (1 - smoothstep(0.70, 0.95, chollaPressure)),
  );
  const wetWashPenalty = activeWashFloodPenalty(ctx, 0.36, 0.78, 0.44);
  return (
    lowerBajadaOrValley * 0.25 +
    finerSoilsThanTeddyBearCholla * 0.20 +
    openSun * 0.20 +
    scrublandOrDesertFlat * 0.15 +
    clonalColonyProximity * 0.15 +
    0.14 -
    wetWashPenalty
  );
}

function scoreSoilTexture(soilTexture, preferred) {
  return preferred.includes(soilTexture) ? 1 : 0;
}

function aspectPreference(aspect, center, width) {
  const delta = Math.abs(((aspect - center + 540) % 360) - 180);
  return 1 - clamp01(delta / width);
}

function patchCenterInfluence(x, z, centers) {
  let influence = 0;
  for (const center of centers) {
    const dx = x - center.x;
    const dz = z - center.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const radius = Math.max(0.001, center.radius);
    if (distance > radius) continue;
    influence = Math.max(influence, (1 - distance / radius) * center.strength);
  }
  return influence;
}

function biasYoungSaguaroUnderNurse(mat, rng, ctx, nursePlants, proportions) {
  const nurse = nearestPoint(ctx.x, ctx.z, nursePlants);
  if (!nurse || !ctx.terrain) return;
  const age = ctx.variantOpts.age ?? 0.5;
  const placement = decomposeMatrix(mat);
  const canopyRadius = nurse.point.radius;
  const nurseEdge = age < 0.34
    ? proportions.ecology.youngSaguaroNurseEdge
    : proportions.ecology.juvenileSaguaroNurseEdge;
  if (nurse.distance > canopyRadius + nurseEdge) return;

  const frostRisk = ctx.terrainInfo?.frostRisk_0_1 ?? 0;
  const targetBearing = frostRisk > 0.45
    ? degToRad(rngRange(rng, 150, 210))
    : rng() * Math.PI * 2;
  const nearBaseBias = nurse.point.kind === 'creosote' || age < 0.34;
  const minRadius = canopyRadius * (nearBaseBias ? 0.10 : 0.35);
  const maxRadius = canopyRadius * (nearBaseBias ? 0.42 : 0.95);
  const targetRadius = rngRange(rng, minRadius, Math.max(minRadius, maxRadius));
  const nx = nurse.point.x + Math.sin(targetBearing) * targetRadius;
  const nz = nurse.point.z - Math.cos(targetBearing) * targetRadius;
  const half = ctx.terrain.size / 2 - 1;
  const x = clamp(nx, ctx.terrain.originX - half, ctx.terrain.originX + half);
  const z = clamp(nz, ctx.terrain.originZ - half, ctx.terrain.originZ + half);
  const terrainInfo = ctx.terrain.sampleInfo(x, z, 0.6);
  placement.pos[0] = x;
  placement.pos[1] = terrainInfo.height;
  placement.pos[2] = z;
  composeMatrixInto(mat, placement.pos, placement.quat, placement.scale);
  ctx.x = x;
  ctx.z = z;
  ctx.height = terrainInfo.height;
  ctx.terrainInfo = terrainInfo;
}

function registerSaguaroNurseRemnant(state, ctx, age, height, rng, proportions) {
  if (age < 0.72) return;
  const nurse = nearestPoint(ctx.x, ctx.z, state.treeNurses);
  if (!nurse) return;
  const overlapReach = Math.max(nurse.point.rootRadius ?? 0, proportions.ecology.matureSaguaroNurseEdge + height * 0.22);
  if (nurse.distance > overlapReach) return;
  const decline = smoothstep(0.72, 1.0, age) * (1 - clamp01(nurse.distance / Math.max(0.001, overlapReach)));
  if (decline <= 0.08) return;
  nurse.point.nurseQuality = Math.max(0.12, (nurse.point.nurseQuality ?? 1) * lerp(1, 0.46, decline));
  nurse.point.shadeProtection = Math.max(0.10, (nurse.point.shadeProtection ?? 0.5) * lerp(1, 0.52, decline));
  nurse.point.soilIsland = Math.max(0.10, (nurse.point.soilIsland ?? 0.5) * lerp(1, 0.58, decline));
  nurse.point.decline = Math.max(nurse.point.decline ?? 0, decline);
  if (nurse.point.remnantGenerated || rng() > decline * 0.85) return;
  nurse.point.remnantGenerated = true;
  pushDeadwoodPlacement(state, {
    x: lerp(nurse.point.x, ctx.x, rngRange(rng, 0.05, 0.28)),
    z: lerp(nurse.point.z, ctx.z, rngRange(rng, 0.05, 0.28)),
    yaw: Math.atan2(ctx.x - nurse.point.x, ctx.z - nurse.point.z) + rngRangeSigned(rng, 0.65),
    scale: rngRange(rng, 1.05, 1.65) * lerp(0.82, 1.25, decline),
  });
}

function maybeAddChollaSkeleton(state, ctx, age, rng, proportions) {
  if (age < 0.72) return;
  const colony = patchCenterInfluence(ctx.x, ctx.z, state.chollaColonyCenters);
  const oldColonyScore = Math.max(colony, smoothstep(0.76, 1.0, age));
  if (rng() > oldColonyScore * 0.34) return;
  const radius = proportions.jumpingCholla.rootRadius * rngRange(rng, 0.25, 0.90);
  const yaw = rng() * Math.PI * 2;
  pushDeadwoodPlacement(state, {
    x: ctx.x + Math.sin(yaw) * radius,
    z: ctx.z - Math.cos(yaw) * radius,
    yaw: yaw + Math.PI * 0.5 + rngRangeSigned(rng, 0.45),
    scale: rngRange(rng, 0.62, 1.05),
  });
}

function pushDeadwoodPlacement(state, placement) {
  state.deadwoodPlacements.push({
    x: placement.x,
    z: placement.z,
    yaw: placement.yaw ?? 0,
    scale: placement.scale ?? 1,
    variantIdx: state.deadwoodPlacements.length % 8,
  });
}

function addEphemeralLifeIsland(state, ctx, rng, seasonalState, proportions, speciesStrength = 1) {
  const rainPulse = clamp01(
    (seasonalState.postRainFlush ? 0.55 : 0) +
    (seasonalState.springBloom ? 0.28 : 0) +
    (seasonalState.monsoon ? 0.18 : 0) +
    clamp01(1 - (seasonalState.recentRainDays ?? 999) / 18) * 0.45 +
    (seasonalState.winterRain_0_1 ?? 0) * 0.22 +
    (seasonalState.monsoonRain_0_1 ?? 0) * 0.18
  );
  if (rainPulse <= 0.08 || !ctx.terrain) return;
  const canopyRadius = ctx.variantOpts.form === 'wash_floodplain_tree'
    ? proportions.mesquite.canopyRadius * ctx.scale
    : proportions.paloVerde.canopyRadius * ctx.scale;
  const count = Math.floor(rngRange(rng, 3, 10) * rainPulse * speciesStrength);
  for (let i = 0; i < count; i++) {
    const bearing = rng() * Math.PI * 2;
    const radius = canopyRadius * Math.sqrt(rngRange(rng, 0.05, 1.10));
    const x = ctx.x + Math.sin(bearing) * radius;
    const z = ctx.z - Math.cos(bearing) * radius;
    const info = ctx.terrain.sampleInfo(x, z, 0.6);
    if (info.washGravel > 0.70 || info.rockCover_0_1 > 0.78) continue;
    state.ephemeralPlacements.push({
      x,
      z,
      yaw: rng() * Math.PI * 2,
      scale: rngRange(rng, 0.58, 1.18) * lerp(0.65, 1.25, rainPulse),
      variantIdx: state.ephemeralPlacements.length % 6,
    });
  }
}

function createSpatialIndex(cellSize) {
  return {
    cellSize,
    cells: new Map(),
    maxReach: 0,
  };
}

function addSpatialPoint(index, x, z, data = null) {
  const key = spatialCellKey(index, x, z);
  let cell = index.cells.get(key);
  if (!cell) {
    cell = [];
    index.cells.set(key, cell);
  }
  cell.push({ x, z, data });
  if (data?.radius) index.maxReach = Math.max(index.maxReach ?? 0, data.radius);
}

function hasSpatialPointWithin(index, x, z, radius) {
  if (!index || radius <= 0) return false;
  const cellRadius = Math.ceil(radius / index.cellSize);
  const cx = Math.floor(x / index.cellSize);
  const cz = Math.floor(z / index.cellSize);
  const radiusSq = radius * radius;
  for (let dz = -cellRadius; dz <= cellRadius; dz++) {
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      const cell = index.cells.get(`${cx + dx},${cz + dz}`);
      if (!cell) continue;
      for (const point of cell) {
        const px = x - point.x;
        const pz = z - point.z;
        if (px * px + pz * pz < radiusSq) return true;
      }
    }
  }
  return false;
}

function spatialZonePressure(index, x, z, padding = 0) {
  if (!index) return 0;
  const maxReach = index.maxReach ?? index.cellSize;
  const cellRadius = Math.ceil((maxReach + padding) / index.cellSize);
  const cx = Math.floor(x / index.cellSize);
  const cz = Math.floor(z / index.cellSize);
  let pressure = 0;
  for (let dz = -cellRadius; dz <= cellRadius; dz++) {
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      const cell = index.cells.get(`${cx + dx},${cz + dz}`);
      if (!cell) continue;
      for (const point of cell) {
        const data = point.data ?? {};
        const reach = (data.radius ?? 0) + padding;
        if (reach <= 0) continue;
        const px = x - point.x;
        const pz = z - point.z;
        const distanceSq = px * px + pz * pz;
        if (distanceSq >= reach * reach) continue;
        pressure = Math.max(pressure, (1 - Math.sqrt(distanceSq) / reach) * (data.strength ?? 1));
      }
    }
  }
  return clamp(pressure, 0, 1);
}

function spatialCellKey(index, x, z) {
  return `${Math.floor(x / index.cellSize)},${Math.floor(z / index.cellSize)}`;
}

function registerPlantZone(state, mat, {
  kind,
  canopyRadius = 0,
  rootRadius,
  resourceUse = 0.5,
  nurseType = 'tree',
  nurseQuality = 1,
  shadeProtection = 0.5,
  herbivoreProtection = 0.5,
  soilIsland = 0.5,
  longTermCompetition = 0.5,
  resourceType = 'competition',
}) {
  const { pos, scale } = decomposeMatrix(mat);
  const zone = {
    x: pos[0],
    z: pos[2],
    radius: rootRadius * scale[0],
    strength: resourceUse,
    kind,
    resourceType,
  };
  state.resourceZones.push(zone);
  if (canopyRadius > 0) {
    const nurse = {
      x: pos[0],
      z: pos[2],
      radius: canopyRadius * scale[0],
      rootRadius: zone.radius,
      kind,
      nurseType,
      nurseQuality,
      shadeProtection,
      herbivoreProtection,
      soilIsland,
      longTermCompetition,
    };
    state.nursePlants.push(nurse);
    if (nurseType === 'shrub') {
      state.shrubNurses.push(nurse);
    } else if (nurseType === 'rock') {
      state.rockNurses.push(nurse);
    } else {
      state.treeNurses.push(nurse);
      addSpatialPoint(state.spatialIndexes.trees, pos[0], pos[2], {
        radius: Math.max(nurse.radius, zone.radius),
        strength: zone.strength,
        kind,
      });
    }
  }
}

function estimateSaguaroHeight(age, proportions) {
  return proportions.saguaro.heightForAge(age);
}

function estimateSaguaroAgeYears(age) {
  return clamp(age, 0, 1) * 200;
}

function sampleSaguaroCohort(rng, chunkSeed) {
  const pulseRng = mulberry32(subSeed(chunkSeed, 31));
  const wetPulseOffset = rngRange(pulseRng, -4, 4);
  const cohorts = [
    { center: 8 + wetPulseOffset * 0.25, spread: 4, weight: 0.16 },
    { center: 18 + wetPulseOffset * 0.35, spread: 5, weight: 0.18 },
    { center: 34 + wetPulseOffset * 0.45, spread: 7, weight: 0.16 },
    { center: 58 + wetPulseOffset * 0.55, spread: 9, weight: 0.14 },
    { center: 88 + wetPulseOffset * 0.70, spread: 12, weight: 0.13 },
    { center: 124 + wetPulseOffset * 0.85, spread: 16, weight: 0.11 },
    { center: 164 + wetPulseOffset, spread: 20, weight: 0.09 },
    { center: 195, spread: 10, weight: 0.03 },
  ];
  let pick = rng();
  let cohort = cohorts[cohorts.length - 1];
  for (const candidate of cohorts) {
    pick -= candidate.weight;
    if (pick > 0) continue;
    cohort = candidate;
    break;
  }
  const jitter = (rng() + rng() + rng() - 1.5) / 1.5;
  const ageYears = clamp(cohort.center + jitter * cohort.spread, 1, 210);
  return {
    age: clamp(ageYears / 200, 0.005, 1),
    ageYears,
    cohortYear: Math.round(2026 - ageYears),
  };
}

function saguaroHeightMetersForAge(ageYears) {
  const age = clamp(ageYears, 0, 200);
  const table = [
    [0, 0.03],
    [8, 0.038],
    [10, 0.075],
    [30, 0.60],
    [55, 2.10],
    [90, 3.80],
    [125, 6.40],
    [170, 10.0],
    [200, 15.0],
  ];
  for (let i = 1; i < table.length; i++) {
    const [prevAge, prevHeight] = table[i - 1];
    const [nextAge, nextHeight] = table[i];
    if (age > nextAge) continue;
    const t = (age - prevAge) / (nextAge - prevAge || 1);
    return lerp(prevHeight, nextHeight, t * t * (3 - 2 * t));
  }
  return 15.0;
}

function nearestPoint(x, z, points) {
  let nearest = null;
  let nearestDistanceSq = Infinity;
  for (const point of points) {
    const dx = x - point.x;
    const dz = z - point.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < nearestDistanceSq) {
      nearest = point;
      nearestDistanceSq = distanceSq;
    }
  }
  return nearest ? { point: nearest, distance: Math.sqrt(nearestDistanceSq) } : null;
}

function nearestPointInto(out, x, z, points) {
  let nearest = null;
  let nearestDistanceSq = Infinity;
  for (const point of points) {
    const dx = x - point.x;
    const dz = z - point.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < nearestDistanceSq) {
      nearest = point;
      nearestDistanceSq = distanceSq;
    }
  }
  out.point = nearest;
  out.distance = nearest ? Math.sqrt(nearestDistanceSq) : Infinity;
  return nearest ? out : null;
}

function matureSaguaroPressure(x, z, zones, padding = 0) {
  let pressure = 0;
  for (const zone of zones) {
    const reach = zone.radius + padding;
    if (reach <= 0) continue;
    const dx = x - zone.x;
    const dz = z - zone.z;
    const distanceSq = dx * dx + dz * dz;
    const reachSq = reach * reach;
    if (distanceSq >= reachSq) continue;
    pressure = Math.max(pressure, 1 - Math.sqrt(distanceSq) / reach);
  }
  return pressure;
}

function resourcePressure(x, z, zones, { padding = 0, kinds = null, ignoreKind = null } = {}) {
  let pressure = 0;
  for (const zone of zones) {
    if (kinds && !kinds.includes(zone.kind)) continue;
    if (ignoreKind && zone.kind === ignoreKind) continue;
    const reach = zone.radius + padding;
    if (reach <= 0) continue;
    const dx = x - zone.x;
    const dz = z - zone.z;
    const distanceSq = dx * dx + dz * dz;
    const reachSq = reach * reach;
    if (distanceSq >= reachSq) continue;
    pressure = Math.max(pressure, (1 - Math.sqrt(distanceSq) / reach) * zone.strength);
  }
  return clamp(pressure, 0, 1);
}

function createWorkerProportions(rootMeasurement) {
  const root = Math.max(0.001, rootMeasurement ?? 7);
  const ratios = PROPORTION_RATIOS;
  const measure = ratio => root * ratio;
  const range = ratioRange => [measure(ratioRange[0]), measure(ratioRange[1])];
  return {
    saguaro: {
      ageYearsForNormalized(age) {
        return estimateSaguaroAgeYears(age);
      },
      heightForAge(age) {
        const naturalHeightM = saguaroHeightMetersForAge(estimateSaguaroAgeYears(age));
        return clamp(
          root * (naturalHeightM / SCENE_SCALE_REFERENCE.referenceHeight_m),
          measure(ratios.saguaro.minHeight),
          root,
        );
      },
    },
    paloVerde: {
      canopyRadius: measure(ratios.paloVerde.canopyRadius),
      rootRadius: measure(ratios.paloVerde.rootRadius),
    },
    mesquite: {
      canopyRadius: measure(ratios.mesquite.canopyRadius),
      rootRadius: measure(ratios.mesquite.rootRadius),
    },
    creosote: {
      canopyRadius: measure(0.12),
      rootRadius: measure(0.30),
    },
    jumpingCholla: {
      rootRadius: measure(0.20),
    },
    pricklyPear: {
      rootRadius: measure(0.26),
    },
    rocks: {
      pebbleSize: range(ratios.rocks.pebbleSize),
      boulderSize: range(ratios.rocks.boulderSize),
      pebbleSink: range(ratios.rocks.pebbleSink),
      boulderSink: range(ratios.rocks.boulderSink),
    },
    ecology: {
      youngSaguaroNurseEdge: measure(ratios.ecology.youngSaguaroNurseEdge),
      juvenileSaguaroNurseEdge: measure(ratios.ecology.juvenileSaguaroNurseEdge),
      matureSaguaroNurseEdge: measure(ratios.ecology.matureSaguaroNurseEdge),
      minMatureSaguaroCanopy: measure(ratios.ecology.minMatureSaguaroCanopy),
      minMatureSaguaroRoot: measure(ratios.ecology.minMatureSaguaroRoot),
      minSaguaroRootPadding: measure(ratios.ecology.minSaguaroRootPadding),
      treeCompetitionPadding: measure(ratios.ecology.treeCompetitionPadding),
      mesquiteCompetitionPadding: measure(ratios.ecology.mesquiteCompetitionPadding),
      barrelSaguaroPadding: measure(ratios.ecology.barrelSaguaroPadding),
      barrelRootPadding: measure(ratios.ecology.barrelRootPadding),
      barrelNurseEdge: measure(ratios.ecology.barrelNurseEdge),
      pricklyPearSaguaroPadding: measure(ratios.ecology.pricklyPearSaguaroPadding),
      pricklyPearRootPadding: measure(ratios.ecology.pricklyPearRootPadding),
      pricklyPearNurseEdge: measure(ratios.ecology.pricklyPearNurseEdge),
      openPlantSaguaroPadding: measure(ratios.ecology.openPlantSaguaroPadding),
      openPlantRootPadding: measure(ratios.ecology.openPlantRootPadding),
      immatureSaguaroTreePadding: measure(ratios.ecology.immatureSaguaroTreePadding),
    },
  };
}

function composeMatrixInto(out, pos, quat, scale) {
  const [x, y, z, w] = quat;
  const [sx, sy, sz] = scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  out[15] = 1;
}

function decomposeMatrix(m) {
  const sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const rm = [
    m[0] / sx, m[1] / sx, m[2] / sx,
    m[4] / sy, m[5] / sy, m[6] / sy,
    m[8] / sz, m[9] / sz, m[10] / sz,
  ];
  return {
    pos: [m[12], m[13], m[14]],
    quat: quatFromRotationMatrix(rm),
    scale: [sx, sy, sz],
  };
}

function quatFromAxisAngle(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function quatFromAxisAngleInto(out, axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  out[0] = axis[0] * s;
  out[1] = axis[1] * s;
  out[2] = axis[2] * s;
  out[3] = Math.cos(half);
}

function quatFromEuler(x, y, z) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function quatFromRotationMatrix(m) {
  const m11 = m[0], m12 = m[3], m13 = m[6];
  const m21 = m[1], m22 = m[4], m23 = m[7];
  const m31 = m[2], m32 = m[5], m33 = m[8];
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    return [
      (m32 - m23) * s,
      (m13 - m31) * s,
      (m21 - m12) * s,
      0.25 / s,
    ];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

function multiplyQuat(a, b) {
  const qax = a[0], qay = a[1], qaz = a[2], qaw = a[3];
  const qbx = b[0], qby = b[1], qbz = b[2], qbw = b[3];
  return [
    qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
    qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
    qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
    qaw * qbw - qax * qbx - qay * qby - qaz * qbz,
  ];
}

function fbm(noise, x, z, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return value / norm;
}

function ridgedFbm(noise, x, z, octaves = 4) {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, z * freq));
    value += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return value / norm;
}

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

function rngRangeSigned(rng, maxAbs) {
  return (rng() * 2 - 1) * maxAbs;
}

function subSeed(seed, salt) {
  let h = (seed ^ (salt * 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashChunkSeed(seed, cx, cz) {
  let h = seed >>> 0;
  h ^= Math.imul(cx | 0, 0x9e3779b1);
  h ^= Math.imul(cz | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function colorFromHex(hex) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

function colorLerpIntoBase(out, a, b, t) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

function colorLerpInto(a, b, t) {
  a[0] = lerp(a[0], b[0], t);
  a[1] = lerp(a[1], b[1], t);
  a[2] = lerp(a[2], b[2], t);
}

function multiplyColor(color, scalar) {
  color[0] *= scalar;
  color[1] *= scalar;
  color[2] *= scalar;
}

function sampleField(field, i00, i10, i01, i11, tx, tz) {
  return lerp(
    lerp(field[i00], field[i10], tx),
    lerp(field[i01], field[i11], tx),
    tz,
  );
}

function degToRad(value) {
  return value * Math.PI / 180;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
