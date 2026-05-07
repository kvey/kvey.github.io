import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, resolveDetailScale, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Ocotillo: 5-20 long whippy stems radiating from a small base, curving outward
// then upward. Tiny green leaves; red flame flowers at tips when in bloom.
export function generateOcotillo(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const stemCount = rngInt(rng, 6, 18);
  const stemHeight = rngRange(rng, proportions.ocotillo.stemHeight[0], proportions.ocotillo.stemHeight[1]);
  const baseSpread = rngRange(rng, proportions.ocotillo.baseSpread[0], proportions.ocotillo.baseSpread[1]);
  const flowering = opts.flowering ?? rngChance(rng, 0.4);

  const bark = new THREE.Color(0x6a5430);
  const leaf = new THREE.Color(0x6e8a3e);
  const bloom = new THREE.Color(0xc4322c);

  const parts = [];

  for (let i = 0; i < stemCount; i++) {
    const a = (i / stemCount) * Math.PI * 2 + rngRange(rng, -0.25, 0.25);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = out.clone().multiplyScalar(baseSpread);
    const len = stemHeight * rngRange(rng, 0.8, 1.15);

    // Slight outward curve as it rises.
    const lean = rngRange(rng, 0.15, 0.45);
    const wobble = rngRange(rng, -0.15, 0.15);
    const p0 = start.clone();
    const p1 = start.clone().addScaledVector(out, len * lean * 0.3).add(new THREE.Vector3(0, len * 0.25, 0));
    const p2 = start.clone().addScaledVector(out, len * lean * 0.6 + wobble).add(new THREE.Vector3(0, len * 0.65, 0));
    const p3 = start.clone().addScaledVector(out, len * lean).add(new THREE.Vector3(0, len, 0));
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);

    const baseR = rngRange(rng, proportions.ocotillo.stemRadius[0], proportions.ocotillo.stemRadius[1]);
    const stem = sweepRibbedTube({
      curve,
      segmentsAlong: scaledSegments(30, detailScale, 16),
      segmentsAround: scaledSegments(8, detailScale, 5),
      ribCount: 0,
      ribDepth: 0,
      radiusFn: (t) => baseR * (1 - 0.7 * t),
      colorFn: (t) => {
        // Mix tiny leaf-fuzz green into the bark.
        const c = bark.clone().lerp(leaf, 0.25 + 0.4 * (1 - Math.abs(t - 0.5) * 2));
        return c;
      },
      closeStart: true,
      closeEnd: true,
    });
    parts.push(stem);

    // Flower tip
    if (flowering) {
      const tip = curve.getPointAt(1);
      const tipTan = curve.getTangentAt(1);
      const tipGeom = new THREE.ConeGeometry(
        rngRange(rng, proportions.ocotillo.flowerRadius[0], proportions.ocotillo.flowerRadius[1]),
        rngRange(rng, proportions.ocotillo.flowerHeight[0], proportions.ocotillo.flowerHeight[1]),
        scaledSegments(8, detailScale, 5),
        1,
        true,
      );
      const arr = new Float32Array(tipGeom.attributes.position.count * 3);
      for (let q = 0; q < tipGeom.attributes.position.count; q++) {
        arr[q * 3] = bloom.r;
        arr[q * 3 + 1] = bloom.g * (0.85 + rng() * 0.3);
        arr[q * 3 + 2] = bloom.b * (0.85 + rng() * 0.3);
      }
      tipGeom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipTan.clone().normalize());
      tipGeom.applyQuaternion(q);
      tipGeom.translate(tip.x, tip.y + proportions.ocotillo.flowerLift, tip.z);
      parts.push(tipGeom);
    }
  }

  return mergeGeometries(parts);
}
