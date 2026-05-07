import * as THREE from 'three';
import { mergeGeometries, resolveDetailScale, scaledSegments } from './common.js';
import {
  makeBranchSegment,
  makeLeafletSpray,
  makePodCluster,
  makeThornCluster,
  safeSideVector,
} from './treeCommon.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const UP = new THREE.Vector3(0, 1, 0);

// Velvet / honey mesquite: rough dark trunks, low branching scaffold limbs,
// wide umbrella crown, feathery compound leaflets, thorns, and long pods.
export function generateMesquite(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const mesquiteMinHeight = Math.max(proportions.mesquite.minHeight, proportions.mesquite.height[0]);
  const mesquiteMaxHeight = Math.max(mesquiteMinHeight + proportions.mesquite.minHeightGap, proportions.mesquite.height[1]);
  const height = rngRange(rng, mesquiteMinHeight, mesquiteMaxHeight);
  const spread = height * rngRange(rng, 1.34, 1.76);
  const trunkRadius = THREE.MathUtils.lerp(proportions.mesquite.trunkRadius[0], proportions.mesquite.trunkRadius[1], height / Math.max(proportions.rootMeasurement, 1))
    * rngRange(rng, 0.86, 1.14);
  const maxDepth = 5;
  const seedPods = opts.seedPods ?? rngChance(rng, 0.42);

  const barkBase = new THREE.Color(0x30251d);
  const barkTip = new THREE.Color(0x5f4b32);
  const twig = new THREE.Color(0x74613c);
  const leaf = new THREE.Color(0x5d6c42);
  const thorn = new THREE.Color(0xcab777);
  const pod = new THREE.Color(0xc49348);

  const parts = [];

  function addTwigCurtain(at, axis, vigor) {
    const scale = THREE.MathUtils.clamp(vigor, 0.55, 1.4);
    const droopAxis = axis.clone().lerp(new THREE.Vector3(0, -1, 0), 0.34).normalize();
    parts.push(makeLeafletSpray(rng, {
      center: at,
      axis: droopAxis,
      color: leaf,
      sprigs: scaledSegments(rngInt(rng, 8, 14), detailScale, 4),
      pairs: scaledSegments(rngInt(rng, 10, 16), detailScale, 5),
      spread: proportions.mesquite.leafSpraySpread * scale,
      sprigLength: proportions.mesquite.sprigLength * scale,
      leafletLength: rngRange(rng, proportions.mesquite.leafletLength[0], proportions.mesquite.leafletLength[1]) * scale,
      leafletWidth: rngRange(rng, proportions.mesquite.leafletWidth[0], proportions.mesquite.leafletWidth[1]) * scale,
      droop: 0.62,
      density: 1.08 * THREE.MathUtils.lerp(0.68, 1.0, detailScale),
    }));

    if (seedPods && rngChance(rng, 0.48)) {
      const pods = makePodCluster(rng, {
        center: at.clone().addScaledVector(UP, -proportions.mesquite.podDrop),
        axis: droopAxis,
        count: rngInt(rng, 3, 9),
        color: pod,
        lengthRange: proportions.mesquite.podLength,
        radiusRange: proportions.mesquite.podRadius,
        curl: 0.15,
        segmentsAlong: scaledSegments(8, detailScale, 5),
      });
      if (pods) parts.push(pods);
    }
  }

  function grow(start, dir, length, radius, depth, crownLevel, azimuthBias) {
    const end = start.clone().addScaledVector(dir, length);
    const woody = radius > 0.045;
    const seg = makeBranchSegment(rng, {
      start,
      end,
      r0: radius,
      r1: radius * (woody ? rngRange(rng, 0.62, 0.75) : rngRange(rng, 0.48, 0.62)),
      colorBase: woody ? barkBase : barkTip,
      colorTip: depth <= 2 ? twig : barkTip,
      curveScale: woody ? 0.16 : 0.20,
      twistScale: woody ? 0.18 : 0.07,
      sag: depth <= 2 ? rngRange(rng, -0.18, -0.06) : rngRange(rng, -0.045, 0.025),
      segmentsAround: scaledSegments(woody ? 11 : 6, detailScale, woody ? 6 : 4),
      ribCount: woody ? 7 : 0,
      ribDepth: woody ? 0.10 : 0,
      colorNoise: woody ? 0.12 : 0.08,
      detailScale,
    });
    if (seg) parts.push(seg);

    if (depth <= 1 || length < 0.28 || radius < 0.014) {
      addTwigCurtain(end, dir, length / spread + 0.82);
      const thorns = makeThornCluster(rng, {
        center: end.clone().lerp(start, 0.35),
        axis: dir,
        count: rngInt(rng, 2, 5),
        spread: length * 0.28,
        length: proportions.mesquite.thornLength,
        color: thorn,
        detailScale,
      });
      if (thorns) parts.push(thorns);
      return;
    }

    if (depth <= 3 && rngChance(rng, 0.82)) {
      addTwigCurtain(end.clone().lerp(start, 0.12), dir, length / spread + 0.62);
    }

    const childCount = rngInt(rng, depth >= maxDepth - 1 ? 3 : 2, 4);
    const side = safeSideVector(dir);
    const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
    const crown = THREE.MathUtils.smoothstep(crownLevel, 0.12, 0.92);

    for (let i = 0; i < childCount; i++) {
      const phase = azimuthBias + (i / childCount) * Math.PI * 2 + rngRange(rng, -1.08, 1.08);
      const lateral = side.clone().multiplyScalar(Math.cos(phase)).addScaledVector(fwd, Math.sin(phase)).normalize();
      const child = dir.clone().multiplyScalar(rngRange(rng, 0.08, 0.30))
        .addScaledVector(lateral, rngRange(rng, 1.02, 1.46))
        .addScaledVector(UP, THREE.MathUtils.lerp(0.50, -0.24, crown))
        .normalize();
      child.y = THREE.MathUtils.clamp(child.y, crown > 0.45 ? -0.38 : 0.03, crown > 0.45 ? 0.28 : 0.72);
      child.normalize();

      const childLen = length * rngRange(rng, 0.68, 0.92) * THREE.MathUtils.lerp(1.22, 0.88, crown);
      const childR = radius * rngRange(rng, 0.52, 0.68);
      grow(end, child, childLen, childR, depth - 1, Math.max(crownLevel, end.y / height), phase);
    }
  }

  const trunkCount = rngInt(rng, 2, 5);
  for (let i = 0; i < trunkCount; i++) {
    const angle = (i / trunkCount) * Math.PI * 2 + rngRange(rng, -0.6, 0.6);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const base = radial.clone().multiplyScalar(rngRange(rng, proportions.mesquite.twigBaseSpread[0], proportions.mesquite.twigBaseSpread[1]));
    const dir = UP.clone()
      .multiplyScalar(rngRange(rng, 0.58, 0.82))
      .addScaledVector(radial, rngRange(rng, 0.42, 0.72))
      .normalize();
    const len = height * rngRange(rng, 0.22, 0.34);
    grow(base, dir, len, trunkRadius * rngRange(rng, 0.82, 1.18), maxDepth, 0, angle);
  }

  return mergeGeometries(parts);
}
