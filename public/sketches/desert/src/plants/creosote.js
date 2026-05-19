import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, resolveDetailScale, resolvePlantAge, resolveStructureScale, scaledSegments, paintGeometry } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const UP = new THREE.Vector3(0, 1, 0);
const CREOSOTE_PART_STEM = 0;
const CREOSOTE_PART_LEAF_CARD = 1;

function sideVector(dir) {
  const side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  return side.normalize();
}

function paintCreosoteDetail(geom, value = [CREOSOTE_PART_STEM, 0, 0, 0]) {
  const count = geom.attributes.position.count;
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4] = value[0];
    arr[i * 4 + 1] = value[1];
    arr[i * 4 + 2] = value[2];
    arr[i * 4 + 3] = value[3];
  }
  geom.setAttribute('creosoteDetail', new THREE.BufferAttribute(arr, 4));
}

function makeFoliageCard(rng, {
  center,
  axis,
  color,
  length,
  width,
  id,
}) {
  const main = axis.clone();
  if (main.lengthSq() < 1e-5) main.copy(UP);
  main.normalize();
  const lateral = sideVector(main);
  const faceLift = new THREE.Vector3().crossVectors(lateral, main).normalize().multiplyScalar(width * rngRange(rng, -0.12, 0.12));
  const base = positionsForCard(center, main, lateral, faceLift, length, width);
  const geom = new THREE.BufferGeometry();
  const tint = color.clone()
    .lerp(new THREE.Color(0xa9a244), rngRange(rng, 0.04, 0.32))
    .multiplyScalar(rngRange(rng, 0.78, 1.12));

  geom.setAttribute('position', new THREE.Float32BufferAttribute(base.positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute([
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
  ], 3));
  geom.setAttribute('creosoteDetail', new THREE.Float32BufferAttribute([
    CREOSOTE_PART_LEAF_CARD, 0, 0, id,
    CREOSOTE_PART_LEAF_CARD, 1, 0, id,
    CREOSOTE_PART_LEAF_CARD, 1, 1, id,
    CREOSOTE_PART_LEAF_CARD, 0, 1, id,
  ], 4));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
}

function positionsForCard(center, main, lateral, lift, length, width) {
  const c0 = center.clone().addScaledVector(main, -length * 0.50).add(lift);
  const c1 = center.clone().addScaledVector(main, length * 0.50).addScaledVector(UP, -length * 0.06).add(lift);
  const w0 = width * rngWidthTaper(-0.5);
  const w1 = width * rngWidthTaper(0.5);
  const p0 = c0.clone().addScaledVector(lateral, -w0);
  const p1 = c0.clone().addScaledVector(lateral, w0);
  const p2 = c1.clone().addScaledVector(lateral, w1);
  const p3 = c1.clone().addScaledVector(lateral, -w1);
  return {
    positions: [
      p0.x, p0.y, p0.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
    ],
  };
}

function rngWidthTaper(t) {
  return 0.72 + 0.28 * (1 - Math.abs(t));
}

// Creosote bush: many grey basal stems with sparse twiggy interiors and small,
// resinous paired leaves clustered on the outer crown.
export function generateCreosote(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const structureScale = resolveStructureScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: creosote starts as a loose few-stem shrub, then widens
  // into an old open ring with many gray basal stems and a leafier perimeter.
  const age = resolvePlantAge(rng, opts, 0.56);
  const maturity = THREE.MathUtils.smoothstep(age, 0.12, 0.70);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.68, 1.0);
  const cloneRing = opts.cloneRing ?? oldGrowth > 0.42;
  const deadInterior = THREE.MathUtils.clamp(opts.deadInterior ?? oldGrowth, 0, 1);
  const cloneRingRadius = THREE.MathUtils.clamp(opts.cloneRingRadius ?? THREE.MathUtils.lerp(0.38, 0.72, oldGrowth), 0, 0.92);
  const rainFlush = opts.rainFlush ?? false;
  const flowering = (opts.flowering ?? rngChance(rng, 0.18 + maturity * 0.28)) && maturity > 0.18;
  const branchCount = scaledSegments(
    rngInt(
      rng,
      Math.round(THREE.MathUtils.lerp(8, 28, maturity)),
      Math.round(THREE.MathUtils.lerp(14, 56, maturity + oldGrowth * 0.22)),
    ),
    structureScale,
    6,
  );
  const height = THREE.MathUtils.lerp(
    proportions.creosote.height[0] * 0.42,
    proportions.creosote.height[1],
    Math.pow(age, 0.72),
  ) * rngRange(rng, 0.90, 1.14);
  const spread = THREE.MathUtils.lerp(
    proportions.creosote.spread[0] * 0.36,
    proportions.creosote.spread[1] * 1.18,
    Math.pow(age, 0.66),
  ) * rngRange(rng, 0.88, 1.16);
  const crownHeight = height * rngRange(
    rng,
    THREE.MathUtils.lerp(0.62, 0.74, maturity),
    THREE.MathUtils.lerp(0.88, 1.08, maturity),
  );

  const oldWood = new THREE.Color(0x746d61);
  const youngWood = new THREE.Color(0x8b8254);
  const leaf = new THREE.Color(0x68753a).lerp(new THREE.Color(0x7f903f), rainFlush ? 0.55 : 0);
  const flower = new THREE.Color(0xe7c83c);
  const parts = [];

  for (let i = 0; i < branchCount; i++) {
    const a = rng() * Math.PI * 2;
    const interiorGap = cloneRing ? cloneRingRadius * deadInterior : 0;
    const rim = rngRange(rng, Math.max(interiorGap, THREE.MathUtils.lerp(0.10, 0.30, maturity)), 1.0);
    const r = spread * Math.sqrt(rim);
    const tipX = Math.cos(a) * r;
    const tipZ = Math.sin(a) * r;
    const crownT = THREE.MathUtils.clamp(r / spread, 0, 1);
    const tipY = crownHeight * (0.40 + 0.52 * (1 - Math.abs(crownT - 0.68) * 0.82) + rngRange(rng, -0.12, 0.10));
    const baseJitter = spread * THREE.MathUtils.lerp(0.12, 0.32, cloneRing ? deadInterior : 0);

    const p0 = new THREE.Vector3(
      cloneRing ? Math.cos(a) * spread * interiorGap * rngRange(rng, 0.30, 0.58) + rngRange(rng, -baseJitter, baseJitter) : rngRange(rng, -baseJitter, baseJitter),
      rngRange(rng, 0, height * 0.04),
      cloneRing ? Math.sin(a) * spread * interiorGap * rngRange(rng, 0.30, 0.58) + rngRange(rng, -baseJitter, baseJitter) : rngRange(rng, -baseJitter, baseJitter),
    );
    const p1 = new THREE.Vector3(
      tipX * rngRange(rng, 0.18, 0.28),
      height * rngRange(rng, 0.14, 0.28),
      tipZ * rngRange(rng, 0.18, 0.28),
    );
    const p2 = new THREE.Vector3(
      tipX * rngRange(rng, 0.56, 0.74) + Math.cos(a + Math.PI * 0.5) * spread * rngRange(rng, -0.08, 0.08),
      tipY * rngRange(rng, 0.60, 0.82),
      tipZ * rngRange(rng, 0.56, 0.74) + Math.sin(a + Math.PI * 0.5) * spread * rngRange(rng, -0.08, 0.08),
    );
    const p3 = new THREE.Vector3(tipX, tipY, tipZ);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);

    const stemRadius = proportions.creosote.stemRadius * rngRange(
      rng,
      THREE.MathUtils.lerp(0.24, 0.42, maturity),
      THREE.MathUtils.lerp(0.44, 0.82, maturity + oldGrowth * 0.25),
    );
    const stem = sweepRibbedTube({
      curve,
      segmentsAlong: scaledSegments(16, detailScale, 8),
      segmentsAround: scaledSegments(5, detailScale, 4),
      ribCount: 0,
      ribDepth: 0,
      radiusFn: (t) => stemRadius * (1 - 0.84 * t),
      colorFn: (t) => oldWood.clone()
        .lerp(youngWood, (0.34 + 0.54 * t) * THREE.MathUtils.lerp(1.18, 0.78, oldGrowth))
        .multiplyScalar(rngRange(rng, 0.84, 1.14)),
    });
    paintCreosoteDetail(stem, [CREOSOTE_PART_STEM, 0, 0, rng()]);
    parts.push(stem);

    const axis = p3.clone().sub(p2).normalize();
    const foliageChance = (crownT > 0.42 ? 0.96 : 0.46) *
      THREE.MathUtils.lerp(0.38, 1.0, maturity) *
      (cloneRing && crownT < cloneRingRadius ? THREE.MathUtils.lerp(0.28, 0.08, deadInterior) : 1.0);
    if (rngChance(rng, foliageChance)) {
      const cardCount = scaledSegments(
        rngInt(rng, 1, crownT > 0.62 ? Math.round(THREE.MathUtils.lerp(2, 4, maturity)) : 2),
        detailScale,
        1,
      );
      for (let c = 0; c < cardCount; c++) {
        const radial = new THREE.Vector3(tipX, 0, tipZ).normalize();
        if (radial.lengthSq() < 1e-5) radial.set(Math.cos(a), 0, Math.sin(a));
        const cardAxis = axis.clone()
          .lerp(radial.addScaledVector(UP, rngRange(rng, -0.12, 0.44)).normalize(), rngRange(rng, 0.22, 0.58))
          .normalize();
        const cardCenter = p3.clone()
          .addScaledVector(axis, -spread * rngRange(rng, 0.018, 0.070))
          .addScaledVector(UP, rngRange(rng, -height * 0.035, height * 0.045));
        parts.push(makeFoliageCard(rng, {
          center: cardCenter,
          axis: cardAxis,
          color: leaf,
          length: rngRange(rng, proportions.creosote.leafClusterRadius[0], proportions.creosote.leafClusterRadius[1])
            * rngRange(rng, THREE.MathUtils.lerp(1.20, 1.8, maturity), THREE.MathUtils.lerp(2.10, 3.1, maturity)),
          width: rngRange(rng, proportions.creosote.leafClusterRadius[0], proportions.creosote.leafClusterRadius[1])
            * rngRange(rng, THREE.MathUtils.lerp(0.52, 0.74, maturity), THREE.MathUtils.lerp(0.86, 1.22, maturity)),
          id: rng(),
        }));
      }
    }
    if (flowering && crownT > 0.62 && detailScale > 0.48 && rngChance(rng, 0.10 + maturity * 0.22)) {
      const flowerGeom = new THREE.SphereGeometry(
        rngRange(rng, proportions.creosote.leafClusterRadius[0] * 0.22, proportions.creosote.leafClusterRadius[1] * 0.32),
        scaledSegments(6, detailScale, 4),
        scaledSegments(4, detailScale, 3),
      );
      flowerGeom.translate(
        p3.x + rngRange(rng, -spread * 0.018, spread * 0.018),
        p3.y + rngRange(rng, -height * 0.015, height * 0.025),
        p3.z + rngRange(rng, -spread * 0.018, spread * 0.018),
      );
      paintGeometry(flowerGeom, flower.clone().multiplyScalar(rngRange(rng, 0.92, 1.12)));
      paintCreosoteDetail(flowerGeom, [CREOSOTE_PART_STEM, 0, 0, rng()]);
      parts.push(flowerGeom);
    }
  }

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  geom.userData.growthStage = age < 0.24 ? 'juvenile_loose_shrub' : age < 0.68 ? 'adult_matrix_shrub' : 'old_clone_ring';
  geom.userData.cloneRing = cloneRing;
  geom.userData.cloneRingRadius = cloneRingRadius;
  geom.userData.deadInterior = deadInterior;
  return geom;
}
