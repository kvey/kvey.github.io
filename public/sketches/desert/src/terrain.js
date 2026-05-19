import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './random.js';
import { createTerrainMaterial } from './materials/terrainMaterial.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

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

// Builds a heightmap-driven plane that reads like a Sonoran bajada:
//   - a higher mountain-front shoulder that grades into a basin floor
//   - overlapping alluvial fans below that shoulder
//   - meandering dry washes with cut banks and subtle gravel bars
//   - rocky slope faces, talus, crust, and wind ripples on the flats
//
// Returns { mesh, sample(x, z) }  where sample() gives terrain height
// at a world-space (x, z) — used for plant + rock placement.
export function buildTerrain(params, seed) {
  const rng = mulberry32(seed);
  const macroNoise = createNoise2D(rng);
  const ridgeNoise = createNoise2D(rng);
  const detailNoise = createNoise2D(rng);
  const warpNoise = createNoise2D(rng);
  const washNoise = createNoise2D(rng);
  const colorNoise = createNoise2D(rng);

  const {
    size = 140,
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
  const invSize = 1 / size;
  const gridStride = segments + 1;
  const gridStep = size / segments;
  const hydroSegments = Math.max(8, Math.floor(hydrologySegments));
  const hydroStride = hydroSegments + 1;
  const hydroStep = size / hydroSegments;
  let heightField = null;
  let hydrologyField = null;

  const washCount = 5;
  const washes = [];
  for (let i = 0; i < washCount; i++) {
    const t = washCount === 1 ? 0.5 : i / (washCount - 1);
    washes.push({
      x0: THREE.MathUtils.lerp(-half * 0.72, half * 0.72, t) + (rng() - 0.5) * half * 0.22,
      phase: rng() * Math.PI * 2,
      amp: 4.5 + rng() * 8.0,
      freq: 0.026 + rng() * 0.022,
      width: 0.9 + rng() * 1.15,
      depth: 0.5 + rng() * 0.8,
      side: rng() < 0.5 ? -1 : 1,
    });
  }

  function warpedCoords(x, z) {
    const wx = x + warpNoise(x * 0.018, z * 0.018) * 8.5;
    const wz = z + warpNoise((x + 91.7) * 0.015, (z - 41.3) * 0.015) * 7.0;
    return [wx, wz];
  }

  function washNetwork(x, z) {
    const downhill = clamp01((z + half) * invSize);
    let cut = 0;
    let bank = 0;
    let gravel = 0;
    let nearest = 1;

    for (const wash of washes) {
      const meander =
        Math.sin(z * wash.freq + wash.phase) * wash.amp +
        washNoise(z * 0.027 + wash.phase, wash.x0 * 0.013) * wash.amp * 0.55;
      const center = wash.x0 + meander * (0.45 + downhill * 0.9);
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

      const tributaryStart = -half * (0.58 + 0.16 * Math.sin(wash.phase));
      if (z > tributaryStart) {
        const tribCenter = center + wash.side * (z - tributaryStart) * (0.28 + wash.width * 0.025);
        const tribDist = Math.abs(x - tribCenter);
        const tribWidth = width * 0.45;
        const tributary = Math.exp(-Math.pow(tribDist / tribWidth, 2)) * smoothstep(tributaryStart, half * 0.25, z);
        cut += tributary * wash.depth * 0.28;
        gravel += tributary * 0.4;
        nearest = Math.min(nearest, tribDist / (tribWidth * 4));
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
    const north = clamp01((half - z) * invSize);
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

    const erodedCut = wash.cut * washStrength * erosionStrength;
    const depositionalBank = wash.bank * fanStrength;
    const raw =
      basinTilt +
      mountainFront +
      bajada +
      bedrock +
      strata +
      ripple +
      desertPavement +
      depositionalBank -
      erodedCut;

    return {
      height: raw * heightScale,
      wash,
      flowAccumulation,
      runoff,
      soilMoisture,
      shoulder,
      basin,
      ridge,
      macro,
      fanLobes,
    };
  }

  // Layered FBM-ish height function. Stable for any (x, z), so plants
  // can place themselves precisely on the surface.
  function sample(x, z) {
    if (heightField) return sampleHeightField(x, z);
    return evaluate(x, z).height;
  }

  function sampleHeightField(x, z) {
    const gx = THREE.MathUtils.clamp((x + half) / gridStep, 0, segments);
    const gz = THREE.MathUtils.clamp((z + half) / gridStep, 0, segments);
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
    const h0 = THREE.MathUtils.lerp(heightField[i00], heightField[i10], tx);
    const h1 = THREE.MathUtils.lerp(heightField[i01], heightField[i11], tx);
    return THREE.MathUtils.lerp(h0, h1, tz);
  }

  function buildHydrologyField() {
    const count = hydroStride * hydroStride;
    const fields = {
      cut: new Float32Array(count),
      bank: new Float32Array(count),
      gravel: new Float32Array(count),
      proximity: new Float32Array(count),
      flowAccumulation: new Float32Array(count),
      runoff: new Float32Array(count),
      soilMoisture: new Float32Array(count),
      shoulder: new Float32Array(count),
      basin: new Float32Array(count),
      ridge: new Float32Array(count),
    };

    for (let row = 0; row <= hydroSegments; row++) {
      const z = -half + row * hydroStep;
      for (let col = 0; col <= hydroSegments; col++) {
        const x = -half + col * hydroStep;
        const i = row * hydroStride + col;
        const info = evaluate(x, z);
        fields.cut[i] = info.wash.cut;
        fields.bank[i] = info.wash.bank;
        fields.gravel[i] = info.wash.gravel;
        fields.proximity[i] = info.wash.proximity;
        fields.flowAccumulation[i] = info.flowAccumulation;
        fields.runoff[i] = info.runoff;
        fields.soilMoisture[i] = info.soilMoisture;
        fields.shoulder[i] = info.shoulder;
        fields.basin[i] = info.basin;
        fields.ridge[i] = info.ridge;
      }
    }

    return fields;
  }

  function sampleHydrologyField(x, z) {
    if (!hydrologyField) return evaluate(x, z);
    const gx = THREE.MathUtils.clamp((x + half) / hydroStep, 0, hydroSegments);
    const gz = THREE.MathUtils.clamp((z + half) / hydroStep, 0, hydroSegments);
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
    const sampleField = (field) => {
      const h0 = THREE.MathUtils.lerp(field[i00], field[i10], tx);
      const h1 = THREE.MathUtils.lerp(field[i01], field[i11], tx);
      return THREE.MathUtils.lerp(h0, h1, tz);
    };
    const cut = sampleField(hydrologyField.cut);
    const bank = sampleField(hydrologyField.bank);
    const gravel = sampleField(hydrologyField.gravel);
    const proximity = sampleField(hydrologyField.proximity);

    return {
      wash: { cut, bank, gravel, proximity },
      flowAccumulation: sampleField(hydrologyField.flowAccumulation),
      runoff: sampleField(hydrologyField.runoff),
      soilMoisture: sampleField(hydrologyField.soilMoisture),
      shoulder: sampleField(hydrologyField.shoulder),
      basin: sampleField(hydrologyField.basin),
      ridge: sampleField(hydrologyField.ridge),
    };
  }

  function gradient(x, z, eps = 0.5) {
    const hx = (sample(x + eps, z) - sample(x - eps, z)) / (2 * eps);
    const hz = (sample(x, z + eps) - sample(x, z - eps)) / (2 * eps);
    return { hx, hz };
  }

  // Slope magnitude (for placement rules — avoid steep cliffs).
  function slope(x, z, eps = 0.5) {
    const g = gradient(x, z, eps);
    return Math.sqrt(g.hx * g.hx + g.hz * g.hz);
  }

  function sampleInfo(x, z, eps = 0.5) {
    const info = sampleHydrologyField(x, z);
    const surfaceHeight = sample(x, z);
    const g = gradient(x, z, eps);
    const slopeMagnitude = Math.sqrt(g.hx * g.hx + g.hz * g.hz);
    const slope_deg = Math.atan(slopeMagnitude) * 180 / Math.PI;
    // Aspect is the downslope bearing: 0=N (-Z), 90=E (+X), 180=S (+Z), 270=W (-X).
    const aspect = positiveDegrees(Math.atan2(-g.hx, g.hz) * 180 / Math.PI);
    const washDistance_m = Math.max(0, (1 - info.wash.proximity) * THREE.MathUtils.lerp(18, 7, info.wash.gravel));
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
    const downhill = new THREE.Vector2(-g.hx, -g.hz);
    if (downhill.lengthSq() > 0.000001) downhill.normalize();
    return {
      ...info,
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
      flowDirection: downhill,
      // Positive values mean runoff is likely to move toward the basin/south.
      southFlow: clamp01((downhill.y + 1) * 0.5),
      washProximity: info.wash.proximity,
      washGravel: info.wash.gravel,
    };
  }

  const geom = new THREE.PlaneGeometry(size, size, segments, segments);
  geom.rotateX(-Math.PI / 2);
  hydrologyField = buildHydrologyField();

  const pos = geom.attributes.position;
  heightField = new Float32Array(pos.count);
  const washGravel = new Float32Array(pos.count);
  const washProximity = new Float32Array(pos.count);
  const shoulder = new Float32Array(pos.count);
  const basin = new Float32Array(pos.count);
  const ridge = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  const terrainDetail = new Float32Array(pos.count * 4);
  const terrainLandform = new Float32Array(pos.count);
  const terrainDebugData = new Float32Array(pos.count * 4);
  const sand = new THREE.Color(0xc6a16d);
  const sandLight = new THREE.Color(0xd8bd8b);
  const desertVarnish = new THREE.Color(0x715036);
  const talus = new THREE.Color(0x8f6b4c);
  const dust = new THREE.Color(0xb88863);
  const washBed = new THREE.Color(0x9f875e);
  const caliche = new THREE.Color(0xd4c39f);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const info = evaluate(x, z);
    heightField[i] = info.height;
    washGravel[i] = info.wash.gravel;
    washProximity[i] = info.wash.proximity;
    shoulder[i] = info.shoulder;
    basin[i] = info.basin;
    ridge[i] = info.ridge;
    pos.setY(i, info.height);
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const col = i % gridStride;
    const row = Math.floor(i / gridStride);
    const left = row * gridStride + Math.max(0, col - 1);
    const right = row * gridStride + Math.min(segments, col + 1);
    const prev = Math.max(0, row - 1) * gridStride + col;
    const next = Math.min(segments, row + 1) * gridStride + col;
    const dx = pos.getX(right) - pos.getX(left) || gridStep;
    const dz = pos.getZ(next) - pos.getZ(prev) || gridStep;
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
    const mottle = colorNoise(x * 0.55, z * 0.55) * 0.5 + 0.5;
    const dirty = colorNoise((x - 17.3) * 0.12, (z + 11.9) * 0.12) * 0.5 + 0.5;
    const paleCrust = smoothstep(0.22, 0.74, basin[i]) * (1 - washGravel[i]) * (colorNoise(x * 0.08, z * 0.08) * 0.5 + 0.5);

    tmp.copy(sand).lerp(sandLight, mottle * 0.45);
    tmp.lerp(dust, dirty * 0.28);
    tmp.lerp(caliche, paleCrust * 0.22);
    tmp.lerp(washBed, washGravel[i] * 0.62);
    tmp.lerp(talus, shoulder[i] * Math.min(0.6, s * 0.45));
    if (s > 0.72) tmp.lerp(desertVarnish, Math.min(1, (s - 0.72) * 1.2 + ridge[i] * 0.35));
    if (washProximity[i] > 0.25) tmp.offsetHSL(0.0, -0.04 * washProximity[i], -0.03 * washProximity[i]);

    colors[i * 3 + 0] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    terrainDetail[i * 4 + 0] = washGravel[i];
    terrainDetail[i * 4 + 1] = shoulder[i];
    terrainDetail[i * 4 + 2] = basin[i];
    terrainDetail[i * 4 + 3] = Math.min(1, s * 0.65);
    terrainLandform[i] = landformIndex(landform);
    terrainDebugData[i * 4] = Math.max(0, SOIL_TEXTURE_NAMES.indexOf(soilTexture));
    terrainDebugData[i * 4 + 1] = runonIndex_0_1;
    terrainDebugData[i * 4 + 2] = frostRisk_0_1;
    terrainDebugData[i * 4 + 3] = rockCover_0_1;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('terrainDetail', new THREE.BufferAttribute(terrainDetail, 4));
  geom.setAttribute('terrainLandform', new THREE.BufferAttribute(terrainLandform, 1));
  geom.setAttribute('terrainDebugData', new THREE.BufferAttribute(terrainDebugData, 4));
  geom.computeVertexNormals();

  const mat = createTerrainMaterial();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;

  return { mesh, sample, slope, sampleInfo, size };
}

function positiveDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

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
const SOIL_TEXTURE_NAMES = Object.freeze(['rock', 'gravel', 'wash_alluvium', 'sand', 'loam', 'clay']);

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
  return THREE.MathUtils.clamp(depth, 0.08, 1.65);
}

function estimateCalicheDepth({
  landform,
  soilTexture,
  wash,
  basin,
  rockCover_0_1,
}) {
  if (soilTexture === 'wash_alluvium' || landform.wash > 0.68) return THREE.MathUtils.clamp(1.10 + wash.gravel * 0.45, 0.55, 2.0);
  if (soilTexture === 'rock') return THREE.MathUtils.clamp(0.12 + rockCover_0_1 * 0.20, 0.06, 0.55);
  const calicheFlat = Math.max(landform.calicheFlat, landform.lowerBajada * 0.72, basin * 0.45);
  return THREE.MathUtils.clamp(THREE.MathUtils.lerp(1.25, 0.24, calicheFlat) + rockCover_0_1 * 0.22, 0.12, 1.7);
}
