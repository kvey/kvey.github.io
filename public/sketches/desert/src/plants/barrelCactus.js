import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, colorRamp, paintCactusSpines, resolveDetailScale, resolvePlantAge, scaledSegments } from './common.js';
import { buildCactusSpineBlades, sampleColumnAreoles, ensureCactusBillboardAttribute } from './cactusSpineBlades.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const BARREL_SPINE_BASE_COLOR = new THREE.Color(0xebd591);
const BARREL_SPINE_TIP_COLOR = new THREE.Color(0xc6883b);

const UP = new THREE.Vector3(0, 1, 0);

// Ferocactus-style barrel: short ribbed ovoid, sometimes leaning slightly south.
// Returns a merged BufferGeometry with vertex colors. The optional flower disc
// pops up on top of mature individuals.
export function generateBarrelCactus(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young barrels are almost spherical; older barrels gain
  // diameter, height, ribs, woollier crowns, and seasonal flower rings.
  const age = resolvePlantAge(rng, opts, 0.62);
  const maturity = THREE.MathUtils.smoothstep(age, 0.22, 0.82);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const sizeNoise = rngRange(rng, 0.88, 1.12);
  const formNoise = rngRange(rng, -0.12, 0.14);

  const ribCount = Math.round(THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(20, 28, maturity) + rngRange(rng, -1, 1),
    20,
    28,
  ));
  const ribDepth = THREE.MathUtils.lerp(0.08, 0.19, maturity) * rngRange(rng, 0.88, 1.12);
  const heightToWidth = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(0.72, 1.08, maturity) + oldGrowth * rngRange(rng, 0.0, 0.08) + formNoise * 0.45,
    0.68,
    1.18,
  );
  const height = (
    THREE.MathUtils.lerp(proportions.barrelCactus.heightByAge[0], proportions.barrelCactus.heightByAge[1], Math.pow(age, 0.82))
    + oldGrowth * rngRange(rng, 0.0, proportions.barrelCactus.oldHeightBoost)
  ) * sizeNoise;
  const visualDiameter = height / heightToWidth;
  const radius = visualDiameter / (2 * (1 + ribDepth));
  const spineRows = Math.round(THREE.MathUtils.lerp(8, 26, maturity) + rngRange(rng, -2, 2));
  const spinePhase = rng();
  const straw = new THREE.Color(0xd2bd6b);
  const paleSpine = new THREE.Color(0xe6d89a);
  const grooveShade = new THREE.Color(0x263823);

  const stops = [
    { t: 0.0, c: new THREE.Color(0x344c31) },
    { t: 0.22, c: new THREE.Color(0x3f6138) },
    { t: 0.78, c: new THREE.Color(0x5f7d43) },
    { t: 1.0, c: new THREE.Color(0x758751) },
  ];

  // Rounded barrel profile with a broad equator, flat base, and non-pinched crown.
  function profile(t) {
    const u = t * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - Math.pow(u * 0.90, 2)));
    const plantedBase = THREE.MathUtils.lerp(0.58, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.18));
    const crownTaper = THREE.MathUtils.lerp(1.0, 0.84, THREE.MathUtils.smoothstep(t, 0.72, 1.0));
    return Math.max(0.42, r) * plantedBase * crownTaper;
  }

  const curve = new THREE.LineCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, height, 0),
  );

  const body = sweepRibbedTube({
    curve,
    segmentsAlong: scaledSegments(Math.max(34, Math.round(THREE.MathUtils.lerp(34, 66, maturity))), detailScale, 24),
    segmentsAround: Math.max(ribCount * 3, scaledSegments(Math.max(60, ribCount * 4), detailScale, 36)),
    ribCount,
    ribDepth,
    radiusFn: (t) => radius * profile(Math.min(0.99, Math.max(0.01, t))),
    colorFn: (t, a) => {
      const c = colorRamp(t, stops);
      const rib = (Math.cos(a * ribCount) + 1) * 0.5;
      const crest = Math.pow(rib, 6.5);
      const groove = Math.pow(1 - rib, 2.4);
      const row = 1 - Math.abs(((t * spineRows + spinePhase) % 1) * 2 - 1);
      const areole = crest * Math.pow(row, 5.5);
      const crownFade = THREE.MathUtils.smoothstep(t, 0.78, 1.0);

      c.lerp(grooveShade, groove * 0.18);
      c.lerp(straw, crest * (0.22 + crownFade * 0.12));
      c.lerp(paleSpine, areole * 0.68);
      c.multiplyScalar(0.68 + rib * 0.34 + areole * 0.16);
      return c;
    },
    spineFn: (t, a) => {
      const crownFade = THREE.MathUtils.smoothstep(t, 0.66, 1.0);
      const ageStrength = THREE.MathUtils.lerp(0.34, 0.72, maturity);
      return [
        (a * ribCount) / (Math.PI * 2),
        t * spineRows + spinePhase,
        ageStrength + crownFade * 0.22,
        1,
      ];
    },
    closeStart: true,
    closeEnd: true,
  });

  const parts = [body];

  // Per-blade mesh spines. Sample areoles along the body the same way the
  // procedural shader spines are placed (rib peaks × rows), then bezier-bend
  // each blade in the vertex shader.
  const spineDetail = THREE.MathUtils.clamp((detailScale - 0.50) / 0.50, 0, 1);
  if (spineDetail > 0.04) {
    const bladesPerAreole = Math.max(2, Math.round(THREE.MathUtils.lerp(3, 4, spineDetail)));
    // Body spineFn writes y = t * spineRows + spinePhase (no /height scaling)
    // — so rowsPerUnit here is spineRows / height, and rowPhase = spinePhase.
    const attachments = sampleColumnAreoles({
      curve,
      radiusFn: (t) => radius * profile(Math.min(0.99, Math.max(0.01, t))),
      ribCount,
      ribDepth,
      rowsPerUnit: spineRows / Math.max(0.001, height),
      rowPhase: spinePhase,
      bladesPerAreole,
      totalLength: height,
      rng,
      skipBelow: 0.05,
      skipAbove: 0.96,
      fanTiltMax: 0.22,
      strengthFn: t => {
        const crownFade = THREE.MathUtils.smoothstep(t, 0.66, 1.0);
        return spineDetail * (0.55 + crownFade * 0.30) * THREE.MathUtils.lerp(0.60, 1.05, maturity);
      },
      // Real barrel spines are ~3-5 cm.
      lengthFn: t => {
        const crownBoost = THREE.MathUtils.smoothstep(t, 0.62, 0.95);
        return radius * THREE.MathUtils.lerp(0.16, 0.26, crownBoost) * rngRange(rng, 0.90, 1.10);
      },
      widthFn: () => radius * 0.020,
      colorFn: t => BARREL_SPINE_BASE_COLOR.clone().lerp(BARREL_SPINE_TIP_COLOR, 0.22 + t * 0.18),
    });
    if (attachments.length) {
      const bladeGeom = buildCactusSpineBlades(attachments, { segments: 3 });
      if (bladeGeom) parts.push(bladeGeom);
    }
  }

  // Woolly yellow crown grows in with maturity, then becomes prominent.
  const topR = radius * profile(0.98);
  const crownMaturity = THREE.MathUtils.smoothstep(age, 0.28, 0.64);
  if (crownMaturity > 0.02) {
    const crown = new THREE.CylinderGeometry(
      topR * THREE.MathUtils.lerp(0.28, 0.55, crownMaturity),
      topR * THREE.MathUtils.lerp(0.42, 0.76, crownMaturity),
      height * THREE.MathUtils.lerp(0.025, 0.065, crownMaturity),
      scaledSegments(28, detailScale, 14),
      1,
    );
    crown.translate(0, height + height * 0.016, 0);
    paintFlat(crown, new THREE.Color(0xc9ae50));
    paintCactusSpines(crown);
    parts.push(crown);
  }

  if (crownMaturity > 0.20 && detailScale > 0.48) {
    const hookCount = rngInt(rng, 3, Math.round(THREE.MathUtils.lerp(5, 11, crownMaturity)));
    for (let i = 0; i < hookCount; i++) {
      const a = (i / hookCount) * Math.PI * 2 + rngRange(rng, -0.18, 0.18);
      const outward = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const base = outward.clone().multiplyScalar(topR * rngRange(rng, 0.20, 0.58));
      base.y = height + height * 0.035;
      const hookLen = height * rngRange(rng, 0.055, 0.105) * THREE.MathUtils.lerp(0.72, 1.18, maturity);
      const curve = new THREE.CatmullRomCurve3([
        base,
        base.clone().addScaledVector(UP, hookLen * 0.42).addScaledVector(outward, hookLen * 0.16),
        base.clone().addScaledVector(UP, hookLen * 0.62).addScaledVector(outward, hookLen * 0.42),
        base.clone().addScaledVector(UP, hookLen * 0.38).addScaledVector(outward, hookLen * 0.62),
      ]);
      const hook = sweepRibbedTube({
        curve,
        segmentsAlong: scaledSegments(9, detailScale, 5),
        segmentsAround: scaledSegments(5, detailScale, 4),
        radiusFn: t => radius * THREE.MathUtils.lerp(0.018, 0.006, t),
        colorFn: t => paleSpine.clone().lerp(straw, t * 0.45).multiplyScalar(rngRange(rng, 0.88, 1.10)),
        spineFn: t => [i, t * 3, 1.0, 6],
        closeStart: true,
        closeEnd: true,
      });
      parts.push(hook);
    }
  }

  // Occasional small flowers around the crown on mature individuals.
  const flowering = opts.flowering ?? rngChance(rng, THREE.MathUtils.lerp(0.02, 0.45, crownMaturity));
  if (age > 0.55 && flowering) {
    const flowerCount = rngInt(rng, 4, Math.round(THREE.MathUtils.lerp(6, 11, oldGrowth)));
    const crownR = topR * 0.95;
    for (let i = 0; i < flowerCount; i++) {
      const a = (i / flowerCount) * Math.PI * 2 + rng() * 0.3;
      const fx = Math.cos(a) * crownR;
      const fz = Math.sin(a) * crownR;
      const fr = rngRange(rng, proportions.barrelCactus.flowerRadius[0], proportions.barrelCactus.flowerRadius[1]);
      const f = new THREE.SphereGeometry(
        fr,
        scaledSegments(10, detailScale, 6),
        scaledSegments(6, detailScale, 4),
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.55,
      );
      f.translate(fx, height + fr * 0.18, fz);
      paintFlat(f, new THREE.Color().setHSL(0.12, 0.9, 0.58));
      paintCactusSpines(f);
      parts.push(f);
    }
  }

  for (const part of parts) ensureCactusBillboardAttribute(part);

  const geom = mergeGeometries(parts);
  geom.translate(0, -height * 0.075, 0);
  geom.userData.age = age;
  geom.userData.growthStage = age < 0.22 ? 'globe' : age < 0.62 ? 'adult_barrel' : 'old_leaning_barrel';
  geom.userData.toppleRisk = oldGrowth * THREE.MathUtils.smoothstep(heightToWidth, 1.35, 2.3);
  geom.userData.hookedCentralSpines = crownMaturity > 0.20;
  return geom;
}

function paintFlat(geom, color) {
  const count = geom.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}
