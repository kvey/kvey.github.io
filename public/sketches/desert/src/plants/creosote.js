import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, resolveDetailScale, scaledSegments } from './common.js';
import { rngRange, rngInt } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Creosote bush: messy mound of thin branches, dark green tiny leaves.
// Most common low shrub on the Sonoran desert floor.
export function generateCreosote(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const branchCount = rngInt(rng, 8, 20);
  const height = rngRange(rng, proportions.creosote.height[0], proportions.creosote.height[1]);
  const spread = rngRange(rng, proportions.creosote.spread[0], proportions.creosote.spread[1]);

  const wood = new THREE.Color(0x4a3a26);
  const leaf = new THREE.Color(0x4d6238);

  const parts = [];

  for (let i = 0; i < branchCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = spread * Math.sqrt(rng());
    const tipX = Math.cos(a) * r;
    const tipZ = Math.sin(a) * r;
    const tipY = height * (0.6 + rng() * 0.4);

    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(tipX * 0.3, height * 0.2, tipZ * 0.3);
    const p2 = new THREE.Vector3(tipX * 0.7, height * 0.6, tipZ * 0.7);
    const p3 = new THREE.Vector3(tipX, tipY, tipZ);
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);

    const stem = sweepRibbedTube({
      curve,
      segmentsAlong: scaledSegments(14, detailScale, 8),
      segmentsAround: scaledSegments(6, detailScale, 4),
      ribCount: 0,
      ribDepth: 0,
      radiusFn: (t) => proportions.creosote.stemRadius * (1 - 0.8 * t),
      colorFn: (t) => wood.clone().lerp(leaf, 0.3 + 0.5 * t),
    });
    parts.push(stem);

    // Tiny leaf cluster at tip
    const leafBlob = new THREE.IcosahedronGeometry(
      rngRange(rng, proportions.creosote.leafClusterRadius[0], proportions.creosote.leafClusterRadius[1]),
      detailScale > 0.7 ? 1 : 0,
    );
    const pos = leafBlob.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let q = 0; q < pos.count; q++) {
      pos.setXYZ(q,
        pos.getX(q) * (0.7 + rng() * 0.5),
        pos.getY(q) * (0.7 + rng() * 0.5),
        pos.getZ(q) * (0.7 + rng() * 0.5));
      const c = leaf.clone().multiplyScalar(0.85 + rng() * 0.3);
      arr[q * 3] = c.r; arr[q * 3 + 1] = c.g; arr[q * 3 + 2] = c.b;
    }
    leafBlob.computeVertexNormals();
    leafBlob.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    leafBlob.translate(tipX, tipY, tipZ);
    parts.push(leafBlob);
  }

  return mergeGeometries(parts);
}
