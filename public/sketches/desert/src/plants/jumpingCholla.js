import * as THREE from 'three';
import { mergeGeometries, paintCactusSpines, paintGeometry, resolveDetailScale, resolvePlantAge, scaledSegments, sweepRibbedTube } from './common.js';
import { rngChance, rngInt, rngRange } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Cylindropuntia fulgida: arborescent cholla with a low woody trunk, short
// detachable cylindrical joints, dense straw-colored spines, and hanging chains
// of mostly sterile green fruit.
export function generateJumpingCholla(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts, 0.42);
  const proportions = resolveProportionOracle(opts);
  const cholla = proportions.jumpingCholla;
  const age = resolvePlantAge(rng, opts, 0.58);
  const maturity = THREE.MathUtils.smoothstep(age, 0.20, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const height = THREE.MathUtils.lerp(cholla.height[0], cholla.height[1], Math.pow(age, 0.78)) * rngRange(rng, 0.88, 1.14);
  const trunkHeight = height * rngRange(rng, 0.42, 0.58);
  const crownRadius = Math.min(height * THREE.MathUtils.lerp(0.36, 0.58, maturity), cholla.height[1] * 0.42) * rngRange(rng, 0.86, 1.12);
  const trunkRadius = THREE.MathUtils.lerp(cholla.trunkRadius[0], cholla.trunkRadius[1], maturity) * rngRange(rng, 0.58, 0.86);
  const jointRadius = THREE.MathUtils.lerp(cholla.jointRadius[0], cholla.jointRadius[1], maturity) * rngRange(rng, 0.90, 1.14);
  const jointLength = THREE.MathUtils.lerp(cholla.jointLength[0], cholla.jointLength[1], maturity);
  const fruitRadius = THREE.MathUtils.lerp(cholla.fruitRadius[0], cholla.fruitRadius[1], maturity);
  const fruitLength = THREE.MathUtils.lerp(cholla.fruitLength[0], cholla.fruitLength[1], maturity);

  const oldWood = new THREE.Color(0x5d5543);
  const dryRidge = new THREE.Color(0x8a7d61);
  const oldStem = new THREE.Color(0x566742);
  const stemGreen = new THREE.Color(0x789250);
  const youngStem = new THREE.Color(0x9cab61);
  const sheath = new THREE.Color(0xe5d8aa);
  const fruitGreen = new THREE.Color(0x8b9b4f);
  const fruitYellow = new THREE.Color(0xb8a55b);
  const flowerPink = new THREE.Color(0xd5a0b8);
  const parts = [];
  const tips = [];

  const leanAngle = rngRange(rng, 0.02, 0.075) * maturity;
  const leanDir = rng() * Math.PI * 2;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(Math.cos(leanDir) * leanAngle * trunkHeight * 0.35, trunkHeight * 0.48, Math.sin(leanDir) * leanAngle * trunkHeight * 0.35),
    new THREE.Vector3(Math.cos(leanDir) * leanAngle * trunkHeight, trunkHeight, Math.sin(leanDir) * leanAngle * trunkHeight),
  ]);
  parts.push(sweepRibbedTube({
    curve: trunkCurve,
    segmentsAlong: scaledSegments(22, detailScale, 12),
    segmentsAround: scaledSegments(16, detailScale, 10),
    ribCount: 7,
    ribDepth: 0.025 + oldGrowth * 0.030,
    radiusFn: (t) => {
      const node = 1 + Math.sin(t * Math.PI * 15 + leanDir) * 0.055 + Math.sin(t * Math.PI * 27) * 0.026;
      const taper = 0.92 - t * 0.22;
      return trunkRadius * taper * node;
    },
    colorFn: (t, a) => {
      const nodeBand = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 15 + leanDir), 4);
      const ridge = Math.max(0, Math.cos(a * 7)) * 0.18;
      const c = oldWood.clone().lerp(dryRidge, nodeBand * 0.28 + ridge);
      c.lerp(oldStem, THREE.MathUtils.smoothstep(t, 0.48, 1.0) * 0.36);
      c.lerp(sheath, nodeBand * 0.08);
      return c;
    },
    spineFn: (t, a) => [
      (a / (Math.PI * 2)) * 5 + t * 0.5,
      t * 10,
      THREE.MathUtils.smoothstep(t, 0.30, 1.0) * 0.18,
      5,
    ],
    closeStart: true,
    closeEnd: true,
  }));

  const primaryCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(5, 8, maturity)),
    Math.round(THREE.MathUtils.lerp(8, 16, maturity + oldGrowth * 0.28)),
  );
  const trunkTop = trunkCurve.getPointAt(1);
  for (let i = 0; i < primaryCount; i++) {
    const whorl = i % 4;
    const a = (i / primaryCount) * Math.PI * 2 + whorl * 0.42 + rngRange(rng, -0.28, 0.28);
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const originT = THREE.MathUtils.clamp(
      rngRange(rng, 0.08, 0.92) + Math.sin(i * 2.37) * 0.05,
      0.06,
      1.0,
    );
    const origin = trunkCurve.getPointAt(originT)
      .addScaledVector(radial, trunkRadius * rngRange(rng, 0.35, 0.85));
    const dir = radial.clone()
      .multiplyScalar(rngRange(rng, 0.76, 1.0))
      .addScaledVector(Y_AXIS, rngRange(rng, originT < 0.34 ? 0.34 : -0.02, originT < 0.34 ? 0.70 : 0.36))
      .normalize();
    growJointChain({
      start: origin,
      dir,
      radius: jointRadius * rngRange(rng, 0.88, 1.16),
      jointCount: rngInt(rng, Math.round(THREE.MathUtils.lerp(5, 8, maturity)), Math.round(THREE.MathUtils.lerp(8, 16, maturity + oldGrowth * 0.25))),
      depth: 0,
      spread: crownRadius,
    });
  }

  if (maturity > 0.28) {
    const fruitTipCount = Math.min(tips.length, rngInt(rng, Math.round(2 + maturity * 3), Math.round(6 + oldGrowth * 9)));
    for (let i = 0; i < fruitTipCount; i++) {
      const tip = tips[Math.floor(rng() * tips.length)];
      if (!tip) continue;
      addFruitChain(tip.point, tip.dir, rngInt(rng, 2, Math.round(THREE.MathUtils.lerp(4, 11, oldGrowth))));
    }
  }

  if (maturity > 0.42) addDroppedJoints();

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  return geom;

  function growJointChain({ start, dir, radius, jointCount, depth, spread }) {
    let p = start.clone();
    let d = dir.clone().normalize();
    const branchTwist = rngRange(rng, -0.38, 0.38);
    for (let i = 0; i < jointCount; i++) {
      const chainT = jointCount <= 1 ? 1 : i / (jointCount - 1);
      const len = jointLength * rngRange(rng, 0.64, 1.18) * THREE.MathUtils.lerp(1.08, 0.82, chainT);
      const droop = THREE.MathUtils.smoothstep(chainT, 0.34, 1.0) * rngRange(rng, 0.05, 0.22 + depth * 0.08);
      const turn = new THREE.Vector3(
        rngRange(rng, -0.18, 0.18),
        -droop + rngRange(rng, -0.06, 0.10),
        rngRange(rng, -0.18, 0.18),
      );
      d.add(turn).normalize();
      const horizontalDistance = Math.hypot(p.x - trunkTop.x, p.z - trunkTop.z);
      if (horizontalDistance > spread) d.addScaledVector(new THREE.Vector3(trunkTop.x - p.x, 0, trunkTop.z - p.z).normalize(), 0.28).normalize();
      if (p.y > height) d.y -= 0.24;
      if (p.y < trunkHeight * 0.26) d.y += 0.18;
      d.normalize();
      const q = p.clone().addScaledVector(d, len);
      const segmentAge = THREE.MathUtils.clamp(age - depth * 0.08 - chainT * 0.18 + rngRange(rng, -0.06, 0.08), 0, 1);
      parts.push(buildChollaJoint(p, q, radius * THREE.MathUtils.lerp(1.03, 0.84, chainT), segmentAge, branchTwist + i * 0.21));

      if (depth < 2 && i > 1 && rngChance(rng, THREE.MathUtils.lerp(0.18, 0.42, maturity) * (1 - depth * 0.24))) {
        const side = perpendicularDirection(d, rngRange(rng, -1.0, 1.0))
          .multiplyScalar(rngRange(rng, 0.58, 0.94))
          .addScaledVector(Y_AXIS, rngRange(rng, -0.10, 0.26))
          .normalize();
        growJointChain({
          start: q.clone().addScaledVector(side, radius * 0.45),
          dir: side,
          radius: radius * rngRange(rng, 0.86, 1.02),
          jointCount: rngInt(rng, 3, Math.round(THREE.MathUtils.lerp(5, 10, maturity))),
          depth: depth + 1,
          spread: spread * 1.08,
        });
      }

      p = q;
    }
    if (depth <= 1 || rngChance(rng, 0.45)) tips.push({ point: p.clone(), dir: d.clone() });
  }

  function buildChollaJoint(start, end, radius, segmentAge, phase) {
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length <= 0.001) return new THREE.BufferGeometry();
    axis.normalize();
    const normal = Math.abs(axis.dot(Y_AXIS)) > 0.94
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3().crossVectors(Y_AXIS, axis).normalize();
    const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
    const rings = scaledSegments(Math.max(8, Math.round(length / Math.max(radius, 0.001) * 3.4)), detailScale, 7);
    const radial = scaledSegments(24, detailScale, 14);
    const areolesAround = 7;
    const areoleRows = Math.max(5, Math.round(length / Math.max(radius * 1.18, 0.001)));
    const positions = [];
    const colors = [];
    const spines = [];
    const indices = [];

    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const rowOffset = (i % 2) * 0.5 + phase;
      const endTaper = THREE.MathUtils.lerp(0.78, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.16))
        * THREE.MathUtils.lerp(0.84, 1.0, 1 - THREE.MathUtils.smoothstep(t, 0.82, 1.0));
      const waist = 1 - 0.035 * Math.sin(t * Math.PI);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const areoleA = (a / (Math.PI * 2)) * areolesAround + rowOffset;
        const localA = Math.abs(fract(areoleA) - 0.5) * 2;
        const localT = Math.abs(fract(t * areoleRows) - 0.5) * 2;
        const tubercle = Math.exp(-(localA * localA * 2.6 + localT * localT * 3.0)) * 0.28;
        const wobble = 1 + Math.sin(a * 3.0 + t * 8.0 + phase) * 0.012 + Math.sin(a * 7.0 - t * 4.0) * 0.008;
        const r = radius * endTaper * waist * wobble * (1 + tubercle);
        const p = start.clone()
          .addScaledVector(axis, length * t)
          .addScaledVector(normal, Math.cos(a) * r)
          .addScaledVector(binormal, Math.sin(a) * r);
        positions.push(p.x, p.y, p.z);

        const young = 1 - segmentAge;
        const c = oldStem.clone().lerp(stemGreen, THREE.MathUtils.smoothstep(segmentAge, 0.18, 0.72));
        c.lerp(youngStem, young * 0.28);
        c.lerp(sheath, tubercle * (0.22 + young * 0.24));
        c.multiplyScalar(0.82 + tubercle * 0.20 + Math.max(0, Math.sin(a)) * 0.07);
        colors.push(c.r, c.g, c.b);

        const lowerOldFade = THREE.MathUtils.smoothstep(segmentAge, 0.08, 0.38);
        spines.push(areoleA, t * areoleRows + phase * 0.37, (0.58 + young * 0.22 + tubercle * 0.26) * lowerOldFade, 5);
      }
    }

    const stride = radial + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * stride + j;
        const b = a + stride;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('cactusSpine', new THREE.Float32BufferAttribute(spines, 4));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function addFruitChain(anchor, parentDir, count) {
    let p = anchor.clone();
    const fall = new THREE.Vector3(
      parentDir.x * rngRange(rng, 0.04, 0.18),
      -1,
      parentDir.z * rngRange(rng, 0.04, 0.18),
    ).normalize();
    for (let i = 0; i < count; i++) {
      const chainT = count <= 1 ? 1 : i / (count - 1);
      const r = fruitRadius * rngRange(rng, 0.78, 1.18) * THREE.MathUtils.lerp(1.12, 0.68, chainT);
      const h = fruitLength * rngRange(rng, 0.78, 1.12) * THREE.MathUtils.lerp(1.05, 0.68, chainT);
      p = p.clone().addScaledVector(fall, h * 0.70);
      const fruit = new THREE.SphereGeometry(r, scaledSegments(10, detailScale, 6), scaledSegments(8, detailScale, 5));
      fruit.scale(rngRange(rng, 0.74, 0.95), h / (r * 2), rngRange(rng, 0.74, 0.98));
      fruit.translate(p.x, p.y, p.z);
      paintGeometry(fruit, fruitGreen.clone().lerp(fruitYellow, i / Math.max(1, count - 1) * 0.18 + rng() * 0.12));
      paintCactusSpines(fruit, [rng() * 3, rng() * 3, 0.08, 5]);
      parts.push(fruit);
    }

    if (rngChance(rng, 0.16 + maturity * 0.18)) {
      const flower = new THREE.SphereGeometry(fruitRadius * 0.72, scaledSegments(8, detailScale, 5), scaledSegments(6, detailScale, 4), 0, Math.PI * 2, 0, Math.PI * 0.6);
      flower.translate(p.x, p.y - fruitRadius * 0.45, p.z);
      paintGeometry(flower, flowerPink);
      paintCactusSpines(flower, [0, 0, 0, 0]);
      parts.push(flower);
    }
  }

  function addDroppedJoints() {
    const droppedCount = rngInt(rng, 1, Math.round(THREE.MathUtils.lerp(3, 9, oldGrowth)));
    for (let i = 0; i < droppedCount; i++) {
      const a = rng() * Math.PI * 2;
      const dist = rngRange(rng, trunkRadius * 3.0, Math.max(trunkRadius * 6.0, crownRadius * rngRange(rng, 0.28, 0.78)));
      const center = new THREE.Vector3(Math.cos(a) * dist, jointRadius * rngRange(rng, 0.28, 0.72), Math.sin(a) * dist);
      const dir = new THREE.Vector3(Math.cos(a + rngRange(rng, -1.4, 1.4)), rngRange(rng, -0.06, 0.06), Math.sin(a + rngRange(rng, -1.4, 1.4))).normalize();
      const len = jointLength * rngRange(rng, 0.56, 1.02);
      const start = center.clone().addScaledVector(dir, -len * 0.5);
      const end = center.clone().addScaledVector(dir, len * 0.5);
      parts.push(buildChollaJoint(start, end, jointRadius * rngRange(rng, 0.82, 1.10), Math.max(0.25, age - 0.18), rng() * Math.PI * 2));
    }
  }
}

function perpendicularDirection(dir, roll) {
  const base = Math.abs(dir.dot(Y_AXIS)) > 0.92 ? new THREE.Vector3(1, 0, 0) : Y_AXIS;
  const a = new THREE.Vector3().crossVectors(dir, base).normalize();
  const b = new THREE.Vector3().crossVectors(dir, a).normalize();
  return a.multiplyScalar(Math.cos(roll * Math.PI)).addScaledVector(b, Math.sin(roll * Math.PI)).normalize();
}

function fract(value) {
  return value - Math.floor(value);
}
