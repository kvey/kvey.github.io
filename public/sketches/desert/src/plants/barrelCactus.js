import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, colorRamp, paintCactusSpines, resolveDetailScale, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Ferocactus-style barrel: short ribbed ovoid, sometimes leaning slightly south.
// Returns a merged BufferGeometry with vertex colors. The optional flower disc
// pops up on top of mature individuals.
export function generateBarrelCactus(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young barrels are almost spherical; older barrels gain
  // diameter, height, ribs, woollier crowns, and seasonal flower rings.
  const age = THREE.MathUtils.clamp(opts.age ?? Math.pow(rng(), 0.62), 0, 1);
  const maturity = THREE.MathUtils.smoothstep(age, 0.22, 0.82);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const sizeNoise = rngRange(rng, 0.88, 1.12);
  const formNoise = rngRange(rng, -0.12, 0.14);

  const ribCount = Math.round(THREE.MathUtils.lerp(15, 36, maturity) + rngRange(rng, -2, 3));
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

  // Occasional small flowers around the crown on mature individuals.
  const flowerChance = THREE.MathUtils.lerp(0.02, 0.45, crownMaturity);
  if (age > 0.55 && rngChance(rng, flowerChance)) {
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

  const geom = mergeGeometries(parts);
  geom.translate(0, -height * 0.075, 0);
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
