import { createNoise2D } from 'https://esm.sh/simplex-noise@4.0.1';

const Y_AXIS = [0, 1, 0];
const X_AXIS = [1, 0, 0];

const PHASES = [
  ['terrain', 'Shaping terrain and washes'],
  ['paloVerde', 'Placing palo verde nurse trees'],
  ['mesquite', 'Placing mesquite wash trees'],
  ['saguaro', 'Placing saguaros'],
  ['barrel', 'Placing barrel cacti'],
  ['pricklyPear', 'Placing prickly pear'],
  ['ocotillo', 'Placing ocotillo'],
  ['creosote', 'Placing creosote shrubs'],
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
  const state = {
    nursePlants: [],
    matureSaguaroZones: [],
    resourceZones: [],
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
  }, subSeed(params.seed, 1));
  if (!check()) return;
  const terrainMs = performance.now() - terrainStart;
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

  const stageDefs = [
    {
      key: 'paloVerde',
      generatorOpts: rng => ({
        flowering: params.paloVerdeFlowering,
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
      candidateFilter: ctx => acceptPaloVerdeCandidate(ctx, state.resourceZones, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.58;
        const maturity = smoothstep(0.18, 0.76, age);
        registerPlantZone(state, mat, {
          kind: 'paloVerde',
          canopyRadius: proportions.paloVerde.canopyRadius * lerp(0.42, 1.08, maturity),
          rootRadius: proportions.paloVerde.rootRadius * lerp(0.34, 1.05, maturity),
          resourceUse: lerp(0.22, 0.58, maturity),
        });
      },
    },
    {
      key: 'mesquite',
      generatorOpts: rng => ({
        seedPods: params.mesquiteSeedPods,
        age: Math.pow(rng(), 0.54),
      }),
      densityPerArea: params.mesquiteEnabled ? params.mesquiteDensity : 0,
      maxSlope: 0.75,
      scaleRange: [0.74, 1.08],
      variantCount: 5,
      seed: subSeed(chunkSeed, 10),
      geometrySeed: subSeed(params.seed, 10),
      lodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptMesquiteCandidate(ctx, state.resourceZones, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.58;
        const maturity = smoothstep(0.16, 0.74, age);
        registerPlantZone(state, mat, {
          kind: 'mesquite',
          canopyRadius: proportions.mesquite.canopyRadius * lerp(0.36, 1.10, maturity),
          rootRadius: proportions.mesquite.rootRadius * lerp(0.32, 1.08, maturity),
          resourceUse: lerp(0.30, 0.82, maturity),
        });
      },
    },
    {
      key: 'saguaro',
      generatorOpts: rng => ({
        armProbability: params.saguaroArmProbability,
        age: Math.pow(rng(), 0.68),
      }),
      densityPerArea: params.saguaroEnabled ? params.saguaroDensity : 0,
      maxSlope: 0.9,
      scaleRange: [0.92, 1.08],
      variantCount: 12,
      seed: subSeed(chunkSeed, 2),
      geometrySeed: subSeed(params.seed, 2),
      lodLevels,
      attemptMultiplier: 24,
      candidateFilter: ctx => acceptSaguaroCandidate(ctx, state.nursePlants, state.matureSaguaroZones, state.resourceZones, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        const height = estimateSaguaroHeight(age, proportions) * ctx.scale;
        if (age < 0.62) return;
        state.matureSaguaroZones.push({
          x: ctx.x,
          z: ctx.z,
          age,
          radius: Math.max(proportions.ecology.minMatureSaguaroCanopy, height * lerp(0.55, 0.95, age)),
        });
        state.resourceZones.push({
          x: ctx.x,
          z: ctx.z,
          radius: Math.max(proportions.ecology.minMatureSaguaroRoot, height * lerp(0.62, 0.92, age)),
          strength: lerp(0.42, 0.82, age),
          kind: 'saguaro',
        });
      },
    },
    {
      key: 'barrel',
      generatorOpts: rng => ({ age: Math.pow(rng(), 0.62) }),
      densityPerArea: params.barrelEnabled ? params.barrelDensity : 0,
      maxSlope: 1.4,
      scaleRange: [0.85, 1.25],
      variantCount: 6,
      seed: subSeed(chunkSeed, 3),
      geometrySeed: subSeed(params.seed, 3),
      lodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptBarrelCactusCandidate(ctx, state.nursePlants, state.matureSaguaroZones, state.resourceZones, proportions),
      onPlace: (mat, rng, i, ctx) => {
        const age = ctx.variantOpts.age ?? 0.5;
        const maturity = smoothstep(0.22, 0.82, age);
        const tilt = degToRad(rngRange(
          rng,
          lerp(2, 8, maturity),
          lerp(8, 26, maturity),
        ));
        const placement = decomposeMatrix(mat);
        placement.quat = multiplyQuat(placement.quat, quatFromAxisAngle(X_AXIS, tilt));
        composeMatrixInto(mat, placement.pos, placement.quat, placement.scale);
      },
    },
    {
      key: 'pricklyPear',
      generatorOpts: rng => ({ age: Math.pow(rng(), 0.70) }),
      densityPerArea: params.pricklyPearEnabled ? params.pricklyPearDensity : 0,
      maxSlope: 1.4,
      scaleRange: [0.85, 1.4],
      variantCount: 6,
      seed: subSeed(chunkSeed, 5),
      geometrySeed: subSeed(params.seed, 5),
      lodLevels,
      attemptMultiplier: 12,
      candidateFilter: ctx => acceptPricklyPearCandidate(ctx, state.nursePlants, state.matureSaguaroZones, state.resourceZones, proportions),
    },
    {
      key: 'ocotillo',
      generatorOpts: rng => ({
        flowering: params.ocotilloFlowering,
        age: Math.pow(rng(), 0.64),
      }),
      densityPerArea: params.ocotilloEnabled ? params.ocotilloDensity : 0,
      maxSlope: 2.0,
      scaleRange: [0.8, 1.2],
      variantCount: 6,
      seed: subSeed(chunkSeed, 6),
      geometrySeed: subSeed(params.seed, 6),
      lodLevels,
      attemptMultiplier: 10,
      candidateFilter: ctx => acceptOcotilloCandidate(ctx, state.matureSaguaroZones, state.resourceZones, proportions),
    },
    {
      key: 'creosote',
      generatorOpts: rng => ({ age: Math.pow(rng(), 0.56) }),
      densityPerArea: params.creosoteEnabled ? params.creosoteDensity : 0,
      maxSlope: 1.6,
      scaleRange: [0.7, 1.3],
      variantCount: 6,
      seed: subSeed(chunkSeed, 7),
      geometrySeed: subSeed(params.seed, 7),
      lodLevels,
      castShadow: false,
      attemptMultiplier: 10,
      candidateFilter: ctx => acceptCreosoteCandidate(ctx, state.matureSaguaroZones, state.resourceZones, proportions),
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
    });
    if (!check()) return;
    const stageMs = performance.now() - stageStart;
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
      },
      stage,
    }, stage.buffers);
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
}) {
  const rng = mulberry32(seed);
  const geometryRng = mulberry32(geometrySeed);
  const half = terrain.size / 2;
  const minX = terrain.originX - half;
  const maxX = terrain.originX + half;
  const minZ = terrain.originZ - half;
  const maxZ = terrain.originZ + half;
  const area = terrain.size * terrain.size;
  const count = Math.max(0, Math.floor(area * densityPerArea));
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
      optsByLod: levels.map((level, lodIndex) => ({
        ...baseOpts,
        detailScale: level.detailScale ?? 1,
        lodName: level.name ?? `lod-${lodIndex}`,
      })),
    });
  }

  const buckets = variants.map(() => []);
  const mat = new Array(16);
  const pos = [0, 0, 0];
  const quat = [0, 0, 0, 1];
  const scale = [1, 1, 1];
  let attempts = 0;
  let placed = 0;
  const maxAttempts = count * attemptMultiplier;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = rngRange(rng, minX + 1, maxX - 1);
    const z = rngRange(rng, minZ + 1, maxZ - 1);
    const terrainInfo = terrain.sampleInfo(x, z, 0.6);
    const h = terrainInfo.height;
    if (h < minHeight || h > maxHeight) continue;
    const s = terrainInfo.slope;
    if (s > maxSlope) continue;
    const variantIdx = Math.floor(rng() * variantCount);
    const lodIdx = 0;
    const variantOpts = variants[variantIdx].optsByLod[lodIdx];
    const sc = rngRange(rng, scaleRange[0], scaleRange[1]);
    if (candidateFilter) {
      const accepted = candidateFilter({
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
        rng,
        placed,
        attempts,
      });
      if (!accepted) continue;
    }

    const yaw = yawRandom ? rng() * Math.PI * 2 : 0;
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
      });
    }
    const bucket = buckets[variantIdx];
    for (let e = 0; e < 16; e++) bucket.push(mat[e]);
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
    buckets: transferBuckets,
    buffers,
  };
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
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
    for (const wash of washes) {
      const nearestLane = Math.round((x - wash.x0) / wash.spacing);
      for (let lane = nearestLane - 1; lane <= nearestLane + 1; lane++) {
        const baseX = wash.x0 + lane * wash.spacing;
        const lanePhase = wash.phase + lane * 1.713;
        const meander =
          Math.sin(z * wash.freq + lanePhase) * wash.amp +
          washNoise(z * 0.027 + lanePhase, baseX * 0.013) * wash.amp * 0.55;
        const center = baseX + meander * (0.45 + downhill * 0.9);
        const dist = Math.abs(x - center);
        const width = wash.width * (0.7 + downhill * 1.8);
        const channel = Math.exp(-Math.pow(dist / width, 2));
        const bankDist = Math.abs(dist - width * 1.35);
        const cutBank = Math.exp(-Math.pow(bankDist / (width * 0.55), 2));
        const barNoise = detailNoise(x * 0.45, z * 0.45) * 0.5 + 0.5;
        const active = smoothstep(0.05, 0.92, downhill);
        cut += channel * wash.depth * active;
        bank += cutBank * active * (0.08 + 0.06 * barNoise);
        gravel += channel * active * (0.4 + 0.6 * barNoise);
        nearest = Math.min(nearest, dist / (width * 3.5));

        const tributaryPhase = Math.sin((z + lane * wash.spacing) * 0.008 + lanePhase);
        if (tributaryPhase > -0.25) {
          const tribProgress = smoothstep(-0.25, 0.95, tributaryPhase);
          const tribCenter = center + wash.side * tribProgress * wash.spacing * 0.32;
          const tribDist = Math.abs(x - tribCenter);
          const tribWidth = width * 0.45;
          const tributary = Math.exp(-Math.pow(tribDist / tribWidth, 2)) * tribProgress;
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
    return {
      wash: info.wash,
      flowAccumulation: info.flowAccumulation,
      runoff: info.runoff,
      soilMoisture: info.soilMoisture,
      shoulder: info.shoulder,
      basin: info.basin,
      ridge: info.ridge,
      height: surfaceHeight,
      slope: slopeMagnitude,
      washProximity: info.wash.proximity,
      washGravel: info.wash.gravel,
    };
  }

  const buffers = [positions.buffer, normals.buffer, colors.buffer, terrainDetail.buffer, indices.buffer];
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
      indices,
    },
    buffers,
  };
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

function chanceFromScore(ctx, score) {
  return ctx.rng() < clamp(score, 0.02, 0.98);
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
  if (age >= 0.62 && treePressure > 0.35) return ctx.rng() < lerp(0.44, 0.06, treePressure);
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
  if (pressure > 0.18) return ctx.rng() < lerp(0.72, 0.12, pressure);
  const rootPressure = resourcePressure(ctx.x, ctx.z, resourceZones, { padding: proportions.ecology.barrelRootPadding });
  if (rootPressure > 0.76) return ctx.rng() < 0.06;
  if (rootPressure > 0.28) return ctx.rng() < lerp(0.74, 0.18, rootPressure);
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
  if (pressure > 0.25) return ctx.rng() < lerp(0.80, 0.20, pressure);
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
  return ctx.rng() < lerp(0.65, 0.06, rootPressure);
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

function registerPlantZone(state, mat, { kind, canopyRadius = 0, rootRadius, resourceUse = 0.5 }) {
  const { pos, scale } = decomposeMatrix(mat);
  const zone = {
    x: pos[0],
    z: pos[2],
    radius: rootRadius * scale[0],
    strength: resourceUse,
    kind,
  };
  state.resourceZones.push(zone);
  if (canopyRadius > 0) {
    state.nursePlants.push({
      x: pos[0],
      z: pos[2],
      radius: canopyRadius * scale[0],
      rootRadius: zone.radius,
      kind,
    });
  }
}

function estimateSaguaroHeight(age, proportions) {
  return proportions.saguaro.heightForAge(age);
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
  const measure = ratio => root * ratio;
  const range = ratios => [measure(ratios[0]), measure(ratios[1])];
  return {
    saguaro: {
      heightForAge(age) {
        const heightGrowth = Math.pow(clamp(age, 0, 1), 1.38);
        return clamp(root * lerp(0.08, 1.0, heightGrowth), measure(0.06), root);
      },
    },
    paloVerde: {
      canopyRadius: measure(0.34),
      rootRadius: measure(0.54),
    },
    mesquite: {
      canopyRadius: measure(0.58),
      rootRadius: measure(0.92),
    },
    rocks: {
      pebbleSize: range([0.0143, 0.0400]),
      boulderSize: range([0.0786, 0.1643]),
      pebbleSink: range([0.0057, 0.0129]),
      boulderSink: range([0.0171, 0.0429]),
    },
    ecology: {
      youngSaguaroNurseEdge: measure(0.129),
      juvenileSaguaroNurseEdge: measure(0.286),
      matureSaguaroNurseEdge: measure(0.343),
      minMatureSaguaroCanopy: measure(0.243),
      minMatureSaguaroRoot: measure(0.271),
      minSaguaroRootPadding: measure(0.114),
      treeCompetitionPadding: measure(0.171),
      mesquiteCompetitionPadding: measure(0.286),
      barrelSaguaroPadding: measure(0.114),
      barrelRootPadding: measure(0.079),
      barrelNurseEdge: measure(0.071),
      pricklyPearSaguaroPadding: measure(0.093),
      pricklyPearRootPadding: measure(0.064),
      pricklyPearNurseEdge: measure(0.157),
      openPlantSaguaroPadding: measure(0.079),
      openPlantRootPadding: measure(0.057),
      immatureSaguaroTreePadding: measure(0.0286),
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
