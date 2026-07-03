import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, resolveDetailScale, resolvePlantAge, resolveStructureScale, scaledSegments, paintGeometry } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Ocotillo: 5-20 long whippy stems radiating from a small base, curving outward
// then upward. Stems vary from dry gray-brown canes to watered green canes;
// red-orange tubular flower clusters sit at the cane tips when in bloom.
export function generateOcotillo(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const structureScale = resolveStructureScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young ocotillos have a few short whips; old plants form
  // tall, many-stemmed crowns with darker basal canes and more bloom tips.
  const age = resolvePlantAge(rng, opts, 0.64);
  const maturity = THREE.MathUtils.smoothstep(age, 0.16, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const caneBudget = THREE.MathUtils.lerp(0.36, 1.0, structureScale);
  const stemCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(4, 14, maturity) * caneBudget),
    Math.max(6, Math.round(THREE.MathUtils.lerp(8, 100, maturity + oldGrowth * 0.36) * caneBudget)),
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
  const leafFlush = opts.leafFlush ?? false;
  const plantHydration = leafFlush ? rngRange(rng, 0.68, 1.0) : rngChance(rng, 0.42) ? rngRange(rng, 0.58, 1.0) : rngRange(rng, 0.0, 0.28);

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
    // Floors low enough that far LOD sheds triangles — a whippy cane at 80m+
    // reads fine as a 10x5 tube.
    const segmentsAlong = scaledSegments(36, detailScale, 10);
    const segmentsAround = scaledSegments(12, detailScale, 5);
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

    if (leafFlush && stemHydration > 0.42 && detailScale > 0.44) {
      const leafCount = scaledSegments(
        rngInt(rng, Math.round(THREE.MathUtils.lerp(4, 8, maturity)), Math.round(THREE.MathUtils.lerp(8, 18, maturity))),
        detailScale,
        3,
      );
      for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
        const t = rngRange(rng, 0.08, 0.88);
        const center = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const around = rng() * Math.PI * 2;
        const side = new THREE.Vector3(Math.cos(around), 0, Math.sin(around));
        if (Math.abs(side.dot(tangent)) > 0.88) side.crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
        const leafLength = rngRange(rng, proportions.ocotillo.stemRadius[0] * 2.8, proportions.ocotillo.stemRadius[1] * 5.2);
        parts.push(makeOcotilloLeafCard({
          center: center.addScaledVector(side, baseR * rngRange(rng, 1.2, 1.8)),
          tangent,
          side,
          length: leafLength,
          width: leafLength * rngRange(rng, 0.18, 0.28),
          color: wetStem.clone().offsetHSL(0.02, 0.10, 0.08),
          hydration: stemHydration,
          id: rng(),
        }));
      }
    }

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
        const flowerLength = rngRange(rng, proportions.ocotillo.flowerHeight[0] * 0.72, proportions.ocotillo.flowerHeight[1] * 1.05);
        const flowerRadius = rngRange(rng, proportions.ocotillo.flowerRadius[0] * 0.44, proportions.ocotillo.flowerRadius[1] * 0.70);
        const radialSegments = scaledSegments(5, detailScale, 5);
        const tipGeom = new THREE.CylinderGeometry(
          flowerRadius * rngRange(rng, 1.06, 1.34),
          flowerRadius * rngRange(rng, 0.30, 0.48),
          flowerLength,
          radialSegments,
          2,
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
  geom.userData.growthStage = age < 0.24 ? 'juvenile_canes' : age < 0.68 ? 'adult_wand_cluster' : 'old_dense_cane_crown';
  geom.userData.leafFlush = leafFlush;
  geom.userData.caneCount = stemCount;
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

function makeOcotilloLeafCard({
  center,
  tangent,
  side,
  length,
  width,
  color,
  hydration,
  id,
}) {
  const along = tangent.clone().normalize();
  const lateral = side.clone().normalize();
  const lift = new THREE.Vector3().crossVectors(lateral, along).normalize().multiplyScalar(width * 0.18);
  const p0 = center.clone().addScaledVector(along, -length * 0.46).addScaledVector(lateral, -width).add(lift);
  const p1 = center.clone().addScaledVector(along, -length * 0.46).addScaledVector(lateral, width).add(lift);
  const p2 = center.clone().addScaledVector(along, length * 0.54).addScaledVector(lateral, width * 0.18).add(lift);
  const p3 = center.clone().addScaledVector(along, length * 0.54).addScaledVector(lateral, -width * 0.18).add(lift);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([
    p0.x, p0.y, p0.z,
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z,
  ], 3));
  const tint = color.clone().multiplyScalar(0.88 + (id % 1) * 0.22);
  geom.setAttribute('color', new THREE.Float32BufferAttribute([
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
    tint.r, tint.g, tint.b,
  ], 3));
  geom.setAttribute('ocotilloDetail', new THREE.Float32BufferAttribute([
    0, 0.25, id, hydration,
    0, 0.25, id, hydration,
    0, 0.85, id, hydration,
    0, 0.85, id, hydration,
  ], 4));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
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
