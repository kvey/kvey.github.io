import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, resolveDetailScale, resolvePlantAge, scaledSegments, paintGeometry } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Ocotillo: 5-20 long whippy stems radiating from a small base, curving outward
// then upward. Stems vary from dry gray-brown canes to watered green canes;
// red-orange tubular flower clusters sit at the cane tips when in bloom.
export function generateOcotillo(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young ocotillos have a few short whips; old plants form
  // tall, many-stemmed crowns with darker basal canes and more bloom tips.
  const age = resolvePlantAge(rng, opts, 0.64);
  const maturity = THREE.MathUtils.smoothstep(age, 0.16, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const stemCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(3, 9, maturity)),
    Math.round(THREE.MathUtils.lerp(6, 24, maturity + oldGrowth * 0.20)),
  );
  const stemHeight = THREE.MathUtils.lerp(
    proportions.ocotillo.stemHeight[0] * 0.38,
    proportions.ocotillo.stemHeight[1],
    Math.pow(age, 0.82),
  ) * rngRange(rng, 0.90, 1.12);
  const baseSpread = THREE.MathUtils.lerp(
    proportions.ocotillo.baseSpread[0] * 0.55,
    proportions.ocotillo.baseSpread[1] * 1.22,
    maturity,
  ) * rngRange(rng, 0.82, 1.16);
  const flowering = (opts.flowering ?? rngChance(rng, THREE.MathUtils.lerp(0.08, 0.46, maturity))) && age > 0.34;
  const plantHydration = rngChance(rng, 0.42) ? rngRange(rng, 0.58, 1.0) : rngRange(rng, 0.0, 0.28);

  const dryBark = new THREE.Color(0x756a58);
  const oldBark = new THREE.Color(0x4f4638);
  const wetStem = new THREE.Color(0x486a3d);
  const bloomBase = new THREE.Color(0xc83a27);
  const bloomHot = new THREE.Color(0xef6a28);

  const parts = [];

  for (let i = 0; i < stemCount; i++) {
    const a = (i / stemCount) * Math.PI * 2 + rngRange(rng, -0.25, 0.25);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = out.clone().multiplyScalar(baseSpread);
    const len = stemHeight * rngRange(rng, 0.8, 1.15);

    // Slight outward curve as it rises.
    const lean = rngRange(
      rng,
      THREE.MathUtils.lerp(0.09, 0.15, maturity),
      THREE.MathUtils.lerp(0.32, 0.50, maturity),
    );
    const wobble = rngRange(rng, -0.15, 0.15);
    const p0 = start.clone();
    const p1 = start.clone().addScaledVector(out, len * lean * 0.3).add(new THREE.Vector3(0, len * 0.25, 0));
    const p2 = start.clone().addScaledVector(out, len * lean * 0.6 + wobble).add(new THREE.Vector3(0, len * 0.65, 0));
    const p3 = start.clone().addScaledVector(out, len * lean).add(new THREE.Vector3(0, len, 0));
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);

    const baseR = rngRange(
      rng,
      THREE.MathUtils.lerp(proportions.ocotillo.stemRadius[0] * 0.46, proportions.ocotillo.stemRadius[0], maturity),
      THREE.MathUtils.lerp(proportions.ocotillo.stemRadius[1] * 0.68, proportions.ocotillo.stemRadius[1] * 1.16, oldGrowth),
    );
    const stemHydration = THREE.MathUtils.clamp(plantHydration + rngRange(rng, -0.18, 0.2), 0, 1);
    const segmentsAlong = scaledSegments(36, detailScale, 18);
    const segmentsAround = scaledSegments(12, detailScale, 8);
    const stem = sweepRibbedTube({
      curve,
      segmentsAlong,
      segmentsAround,
      ribCount: rngInt(rng, 4, 6),
      ribDepth: THREE.MathUtils.lerp(0.030, 0.065, maturity),
      radiusFn: (t) => baseR * (1 - THREE.MathUtils.lerp(0.58, 0.74, maturity) * t),
      colorFn: (t) => {
        const ageDarkening = 0.08 + oldGrowth * 0.32 + t * 0.18;
        return dryBark.clone()
          .lerp(oldBark, ageDarkening)
          .lerp(wetStem, stemHydration * (0.70 + 0.22 * t));
      },
      closeStart: true,
      closeEnd: true,
    });
    addOcotilloDetail(stem, {
      part: 0,
      segmentsAlong,
      segmentsAround,
      hydration: stemHydration,
    });
    parts.push(stem);

    // Flowering canes carry loose red-orange clusters at the tips.
    if (flowering && rngChance(rng, THREE.MathUtils.lerp(0.22, 0.86, stemHydration) * THREE.MathUtils.lerp(0.42, 1.0, maturity))) {
      const tip = curve.getPointAt(1);
      const tipTan = curve.getTangentAt(1);
      const flowerCount = rngInt(rng, 2, Math.round(THREE.MathUtils.lerp(5, 10, stemHydration * maturity)));
      for (let f = 0; f < flowerCount; f++) {
        const clusterAngle = (f / flowerCount) * Math.PI * 2 + rngRange(rng, -0.28, 0.28);
        const side = new THREE.Vector3(Math.cos(clusterAngle), 0, Math.sin(clusterAngle)).multiplyScalar(
          rngRange(rng, proportions.ocotillo.flowerRadius[0] * 0.32, proportions.ocotillo.flowerRadius[1] * 0.62),
        );
        const flowerLength = rngRange(rng, proportions.ocotillo.flowerHeight[0] * 0.58, proportions.ocotillo.flowerHeight[1] * 0.86);
        const flowerRadius = rngRange(rng, proportions.ocotillo.flowerRadius[0] * 0.42, proportions.ocotillo.flowerRadius[1] * 0.68);
        const tipGeom = new THREE.ConeGeometry(
          flowerRadius,
          flowerLength,
          scaledSegments(7, detailScale, 5),
          1,
          true,
        );
        const flowerTint = bloomBase.clone().lerp(bloomHot, rngRange(rng, 0.05, 0.72));
        paintGeometry(tipGeom, flowerTint);
        addFlowerDetail(tipGeom, {
          hydration: stemHydration,
        });
        const flowerDir = tipTan.clone()
          .normalize()
          .add(side.clone().normalize().multiplyScalar(rngRange(rng, 0.05, 0.18)))
          .normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), flowerDir);
        tipGeom.applyQuaternion(q);
        const lift = proportions.ocotillo.flowerLift + flowerLength * rngRange(rng, 0.16, 0.42);
        tipGeom.translate(
          tip.x + side.x,
          tip.y + lift,
          tip.z + side.z,
        );
        parts.push(tipGeom);
      }
    }
  }

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  return geom;
}

function addOcotilloDetail(geom, {
  part,
  segmentsAlong,
  segmentsAround,
  hydration,
}) {
  const count = geom.attributes.position.count;
  const detail = new Float32Array(count * 4);
  const ringStride = segmentsAround + 1;
  const tubeVertexCount = (segmentsAlong + 1) * ringStride;

  for (let q = 0; q < count; q++) {
    let t = 0;
    let around = 0;
    if (q < tubeVertexCount) {
      const ring = Math.floor(q / ringStride);
      const spoke = q % ringStride;
      t = ring / segmentsAlong;
      around = spoke / segmentsAround;
    } else {
      t = q === tubeVertexCount ? 0 : 1;
    }
    detail[q * 4] = part;
    detail[q * 4 + 1] = t;
    detail[q * 4 + 2] = around;
    detail[q * 4 + 3] = hydration;
  }

  geom.setAttribute('ocotilloDetail', new THREE.BufferAttribute(detail, 4));
}

function addFlowerDetail(geom, { hydration }) {
  const count = geom.attributes.position.count;
  const detail = new Float32Array(count * 4);
  const pos = geom.attributes.position;
  const bounds = new THREE.Box3().setFromBufferAttribute(pos);
  const height = bounds.getSize(new THREE.Vector3()).y || 1;
  const minY = bounds.min.y;

  for (let q = 0; q < count; q++) {
    const x = pos.getX(q);
    const z = pos.getZ(q);
    detail[q * 4] = 1;
    detail[q * 4 + 1] = THREE.MathUtils.clamp((pos.getY(q) - minY) / height, 0, 1);
    detail[q * 4 + 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    detail[q * 4 + 3] = hydration;
  }

  geom.setAttribute('ocotilloDetail', new THREE.BufferAttribute(detail, 4));
}
