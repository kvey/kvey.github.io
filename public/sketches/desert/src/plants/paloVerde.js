import * as THREE from 'three';
import { mergeGeometries, resolveDetailScale, scaledSegments } from './common.js';
import { makeBranchSegment, makeLeafletSpray, makeThornCluster, safeSideVector } from './treeCommon.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const UP = new THREE.Vector3(0, 1, 0);

// Foothills palo verde: green photosynthetic bark, low multi-stem form,
// angular twigs, tiny bipinnate leaves, and a very open canopy.
export function generatePaloVerde(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const minHeight = Math.max(proportions.paloVerde.minHeight, proportions.paloVerde.height[0]);
  const maxHeight = Math.max(minHeight + proportions.paloVerde.minHeightGap, proportions.paloVerde.height[1]);
  const height = rngRange(rng, minHeight, maxHeight);
  const spread = height * rngRange(rng, 1.15, 1.42);
  const trunkRadius = THREE.MathUtils.lerp(proportions.paloVerde.trunkRadius[0], proportions.paloVerde.trunkRadius[1], height / Math.max(proportions.rootMeasurement, 1))
    * rngRange(rng, 0.84, 1.12);
  const maxDepth = rngInt(rng, 5, 6);
  const flowering = opts.flowering ?? rngChance(rng, 0.35);

  const barkBase = new THREE.Color(0x4f865f);
  const barkTip = new THREE.Color(0x83aa61);
  const barkYoung = new THREE.Color(0xb3bf58);
  const leaf = new THREE.Color(0x6f8740);
  const flower = new THREE.Color(0xe7c63a);
  const thorn = new THREE.Color(0xd8ca8e);

  const parts = [];

  function makeBlossomCluster(center, axis, scale) {
    const positions = [];
    const colors = [];
    const indices = [];
    const detail = [];
    const main = axis.clone();
    if (main.lengthSq() < 1e-5) main.copy(UP);
    main.normalize();

    const side = safeSideVector(main);
    const forward = new THREE.Vector3().crossVectors(side, main).normalize();
    const count = scaledSegments(rngInt(rng, 20, 42), detailScale, 8);

    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle)).normalize();
      const at = center.clone()
        .addScaledVector(radial, rngRange(rng, proportions.paloVerde.blossomScatter[0], proportions.paloVerde.blossomScatter[1]) * scale)
        .addScaledVector(main, rngRange(rng, proportions.paloVerde.blossomVertical[0], proportions.paloVerde.blossomVertical[1]) * scale)
        .addScaledVector(UP, rngRange(rng, proportions.paloVerde.blossomVertical[0], proportions.paloVerde.blossomVertical[1]) * scale);
      const u = radial.clone().lerp(side, rngRange(rng, 0.0, 0.45)).normalize();
      const v = new THREE.Vector3().crossVectors(u, main).normalize();
      if (v.lengthSq() < 1e-5) v.copy(forward);
      const size = rngRange(rng, proportions.paloVerde.blossomSize[0], proportions.paloVerde.blossomSize[1]) * scale;
      const base = positions.length / 3;
      const id = rng();
      positions.push(
        at.x + u.x * size, at.y + u.y * size, at.z + u.z * size,
        at.x + v.x * size * 0.72, at.y + v.y * size * 0.72, at.z + v.z * size * 0.72,
        at.x - u.x * size, at.y - u.y * size, at.z - u.z * size,
        at.x - v.x * size * 0.72, at.y - v.y * size * 0.72, at.z - v.z * size * 0.72,
      );
      const tint = flower.clone().lerp(new THREE.Color(0xf2dc69), rngRange(rng, 0.0, 0.45))
        .multiplyScalar(rngRange(rng, 0.86, 1.16));
      for (let j = 0; j < 4; j++) colors.push(tint.r, tint.g, tint.b);
      detail.push(
        1, 1.0, 0.0, id,
        1, 0.5, 1.0, id,
        1, 0.0, 0.0, id,
        1, 0.5, -1.0, id,
      );
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setAttribute('treeDetail', new THREE.Float32BufferAttribute(detail, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  function addLeafSprays(at, axis, vigor) {
    const scale = THREE.MathUtils.clamp(vigor, 0.55, 1.15);
    parts.push(makeLeafletSpray(rng, {
      center: at,
      axis,
      color: leaf,
      sprigs: scaledSegments(rngInt(rng, 2, 5), detailScale, 1),
      pairs: scaledSegments(rngInt(rng, 3, 6), detailScale, 2),
      spread: proportions.paloVerde.leafSpraySpread * scale,
      sprigLength: proportions.paloVerde.sprigLength * scale,
      leafletLength: rngRange(rng, proportions.paloVerde.leafletLength[0], proportions.paloVerde.leafletLength[1]) * scale,
      leafletWidth: rngRange(rng, proportions.paloVerde.leafletWidth[0], proportions.paloVerde.leafletWidth[1]) * scale,
      droop: 0.10,
      density: 0.52 * THREE.MathUtils.lerp(0.72, 1.0, detailScale),
    }));

    if (flowering && rngChance(rng, 0.72)) {
      parts.push(makeBlossomCluster(at.clone().addScaledVector(UP, 0.025), axis, scale));
    }
  }

  function grow(start, dir, length, radius, depth, crownLevel, azimuthBias) {
    const end = start.clone().addScaledVector(dir, length);
    const young = depth <= 1;
    const seg = makeBranchSegment(rng, {
      start,
      end,
      r0: radius,
      r1: radius * (young ? 0.55 : 0.68),
      colorBase: barkBase,
      colorTip: young ? barkYoung : barkTip,
      curveScale: young ? 0.20 : 0.11,
      twistScale: young ? 0.08 : 0.035,
      sag: depth <= 2 ? rngRange(rng, -0.055, 0.030) : rngRange(rng, -0.010, 0.070),
      segmentsAround: scaledSegments(radius > 0.055 ? 10 : 6, detailScale, radius > 0.055 ? 6 : 4),
      ribCount: radius > 0.065 ? 6 : 0,
      ribDepth: radius > 0.065 ? 0.045 : 0,
      colorNoise: 0.070,
      detailScale,
    });
    if (seg) parts.push(seg);

    if (depth <= 1 || length < 0.22 || radius < 0.018) {
      addLeafSprays(end, dir, length / spread + 0.55);
      const thorns = makeThornCluster(rng, {
        center: end.clone().lerp(start, 0.3),
        axis: dir,
        count: rngInt(rng, 1, 4),
        spread: length * 0.32,
        length: proportions.paloVerde.thornLength,
        color: thorn,
        detailScale,
      });
      if (thorns) parts.push(thorns);
      return;
    }

    if (depth <= 3 && rngChance(rng, 0.40)) {
      addLeafSprays(end.clone().lerp(start, 0.18), dir, length / spread + 0.35);
    }

    const childCount = rngInt(rng, depth >= maxDepth - 1 ? 2 : 1, depth <= 3 ? 4 : 3);
    const side = safeSideVector(dir);
    const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();

    for (let i = 0; i < childCount; i++) {
      const phase = azimuthBias + (i / childCount) * Math.PI * 2 + rngRange(rng, -0.72, 0.72);
      const lateral = side.clone().multiplyScalar(Math.cos(phase)).addScaledVector(fwd, Math.sin(phase)).normalize();
      const flatten = THREE.MathUtils.smoothstep(crownLevel, 0.1, 1.0);
      const child = dir.clone().multiplyScalar(rngRange(rng, 0.12, 0.36))
        .addScaledVector(lateral, rngRange(rng, 0.88, 1.34))
        .addScaledVector(UP, THREE.MathUtils.lerp(0.52, -0.06, flatten))
        .normalize();
      child.y = THREE.MathUtils.clamp(child.y, flatten > 0.55 ? -0.18 : 0.04, flatten > 0.55 ? 0.22 : 0.78);
      child.normalize();

      const childLen = length * rngRange(rng, 0.60, 0.90) * THREE.MathUtils.lerp(1.10, 0.76, flatten);
      const childR = radius * rngRange(rng, 0.48, 0.64);
      grow(end, child, childLen, childR, depth - 1, Math.max(crownLevel, end.y / height), phase);
    }
  }

  const trunkCount = rngInt(rng, 3, 6);
  for (let i = 0; i < trunkCount; i++) {
    const angle = (i / trunkCount) * Math.PI * 2 + rngRange(rng, -0.45, 0.45);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const base = radial.clone().multiplyScalar(rngRange(rng, proportions.paloVerde.twigBaseSpread[0], proportions.paloVerde.twigBaseSpread[1]));
    const dir = UP.clone()
      .multiplyScalar(rngRange(rng, 0.64, 0.92))
      .addScaledVector(radial, rngRange(rng, 0.32, 0.58))
      .normalize();
    const len = height * rngRange(rng, 0.26, 0.40);
    grow(base, dir, len, trunkRadius * rngRange(rng, 0.76, 1.10), maxDepth, 0, angle);
  }

  return mergeGeometries(parts);
}
