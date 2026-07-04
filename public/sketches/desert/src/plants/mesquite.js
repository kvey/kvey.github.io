import * as THREE from '../three-shim.js';
import { mergeGeometries, resolveDetailScale, resolvePlantAge, resolveStructureScale, scaledSegments } from './common.js';
import {
  makeBranchSegment,
  makeLeafletSpray,
  makeLeafletRibbonSpray,
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
  const structureScale = resolveStructureScale(opts, 0.36);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young mesquites are scrubby, thorny shrubs; old trees
  // develop heavier dark trunks, broad umbrella crowns, and more pod clusters.
  const age = resolvePlantAge(rng, opts, 0.54);
  const form = opts.form ?? 'upland_or_wash_unspecified';
  const washTreeForm = form === 'wash_floodplain_tree';
  const maturity = THREE.MathUtils.smoothstep(age, 0.16, 0.74);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const mesquiteMinHeight = Math.max(proportions.mesquite.minHeight, proportions.mesquite.height[0]);
  const mesquiteMaxHeight = Math.max(mesquiteMinHeight + proportions.mesquite.minHeightGap, proportions.mesquite.height[1]);
  const height = THREE.MathUtils.lerp(mesquiteMinHeight * 0.38, mesquiteMaxHeight, Math.pow(age, 0.78))
    * rngRange(rng, washTreeForm ? 1.02 : 0.70, washTreeForm ? 1.24 : 0.96);
  const spread = height * rngRange(
    rng,
    THREE.MathUtils.lerp(washTreeForm ? 0.98 : 1.10, washTreeForm ? 1.42 : 1.58, maturity),
    THREE.MathUtils.lerp(washTreeForm ? 1.30 : 1.38, washTreeForm ? 2.05 : 2.25, maturity + oldGrowth * 0.15),
  );
  const trunkRadius = THREE.MathUtils.lerp(proportions.mesquite.trunkRadius[0] * 0.42, proportions.mesquite.trunkRadius[1] * 1.12, Math.pow(age, 0.70))
    * rngRange(rng, washTreeForm ? 0.98 : 0.70, washTreeForm ? 1.28 : 0.96);
  const rawMaxDepth = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(2, 5, maturity)),
    Math.round(THREE.MathUtils.lerp(3, 6, maturity + oldGrowth * 0.22)),
  );
  const maxDepth = Math.max(2, Math.round(rawMaxDepth * THREE.MathUtils.lerp(0.72, 1.0, structureScale)));
  const seedPods = (opts.seedPods ?? rngChance(rng, THREE.MathUtils.lerp(0.08, 0.50, maturity))) && age > 0.38;
  const catkins = (opts.catkins ?? false) && age > 0.30;

  const barkBase = new THREE.Color(0x30251d);
  const barkTip = new THREE.Color(0x5f4b32);
  const twig = new THREE.Color(0x5f7440);
  const leaf = new THREE.Color(0x5d6c42);
  const thorn = new THREE.Color(0xcab777);
  const pod = new THREE.Color(0xc49348);
  const catkin = new THREE.Color(0xdfcf75);

  const parts = [];
  const maxBranches = Math.round(THREE.MathUtils.lerp(240, 980, structureScale) * THREE.MathUtils.lerp(0.76, 1.18, maturity));
  let branchCount = 0;

  function addTwigCurtain(at, axis, vigor) {
    const scale = THREE.MathUtils.clamp(vigor * THREE.MathUtils.lerp(0.68, 1.12, maturity), 0.42, 1.45);
    const droopAxis = axis.clone().lerp(new THREE.Vector3(0, -1, 0), 0.34).normalize();
    parts.push(makeLeafletRibbonSpray(rng, {
      center: at,
      axis: droopAxis,
      color: leaf,
      sprigs: scaledSegments(rngInt(rng, 3, Math.round(THREE.MathUtils.lerp(8, 16, maturity))), detailScale, 3),
      pairs: scaledSegments(rngInt(rng, 6, Math.round(THREE.MathUtils.lerp(10, 17, maturity))), detailScale, 4),
      spread: proportions.mesquite.leafSpraySpread * scale,
      sprigLength: proportions.mesquite.sprigLength * scale,
      leafletWidth: rngRange(rng, proportions.mesquite.leafletWidth[0], proportions.mesquite.leafletWidth[1]) * scale,
      droop: 0.62,
      density: 1.02 * THREE.MathUtils.lerp(0.48, 1.0, maturity) * THREE.MathUtils.lerp(0.62, 1.0, structureScale),
    }));

    if (detailScale > 0.86 && rngChance(rng, THREE.MathUtils.lerp(0.18, 0.34, maturity))) {
      parts.push(makeLeafletSpray(rng, {
        center: at,
        axis: droopAxis,
        color: leaf,
        sprigs: rngInt(rng, 1, 3),
        pairs: rngInt(rng, 4, 7),
        spread: proportions.mesquite.leafSpraySpread * scale * 0.72,
        sprigLength: proportions.mesquite.sprigLength * scale * 0.82,
        leafletLength: rngRange(rng, proportions.mesquite.leafletLength[0], proportions.mesquite.leafletLength[1]) * scale,
        leafletWidth: rngRange(rng, proportions.mesquite.leafletWidth[0], proportions.mesquite.leafletWidth[1]) * scale,
        droop: 0.62,
        density: 0.38,
      }));
    }

    if (seedPods && structureScale > 0.55 && rngChance(rng, THREE.MathUtils.lerp(0.16, 0.48, maturity) * structureScale)) {
      const pods = makePodCluster(rng, {
        center: at.clone().addScaledVector(UP, -proportions.mesquite.podDrop),
        axis: droopAxis,
        count: rngInt(rng, 1, Math.max(1, Math.round(THREE.MathUtils.lerp(4, 9, maturity) * structureScale))),
        color: pod,
        lengthRange: proportions.mesquite.podLength,
        radiusRange: proportions.mesquite.podRadius,
        curl: 0.15,
        segmentsAlong: scaledSegments(8, detailScale, 5),
      });
      if (pods) parts.push(pods);
    }

    if (catkins && structureScale > 0.58 && rngChance(rng, THREE.MathUtils.lerp(0.12, 0.38, maturity) * structureScale)) {
      const blooms = makePodCluster(rng, {
        center: at.clone().addScaledVector(UP, -proportions.mesquite.podDrop * 0.45),
        axis: droopAxis,
        count: rngInt(rng, 2, Math.max(2, Math.round(THREE.MathUtils.lerp(4, 10, maturity) * structureScale))),
        color: catkin,
        lengthRange: [proportions.mesquite.podLength[0] * 0.34, proportions.mesquite.podLength[0] * 0.62],
        radiusRange: [proportions.mesquite.podRadius[0] * 0.55, proportions.mesquite.podRadius[0] * 0.78],
        curl: 0.025,
        segmentsAlong: scaledSegments(5, detailScale, 4),
      });
      if (blooms) parts.push(blooms);
    }
  }

  function grow(start, dir, length, radius, depth, crownLevel, azimuthBias) {
    if (branchCount++ >= maxBranches) {
      addTwigCurtain(start.clone().addScaledVector(dir, length * 0.65), dir, length / spread + 0.48);
      return;
    }

    const end = start.clone().addScaledVector(dir, length);
    const woody = radius > 0.045;
    const seg = makeBranchSegment(rng, {
      start,
      end,
      r0: radius,
      r1: radius * (woody ? rngRange(rng, 0.62, 0.75) : rngRange(rng, 0.48, 0.62)),
      colorBase: woody ? barkBase : barkTip,
      colorTip: depth <= 2 ? twig : barkTip,
      curveScale: (woody ? 0.16 : 0.20) * THREE.MathUtils.lerp(1.18, 0.90, oldGrowth),
      twistScale: (woody ? 0.22 : 0.07) * THREE.MathUtils.lerp(0.76, 1.12, maturity),
      sag: depth <= 2
        ? rngRange(rng, THREE.MathUtils.lerp(-0.08, -0.22, oldGrowth), -0.04)
        : rngRange(rng, -0.045, THREE.MathUtils.lerp(0.060, 0.015, oldGrowth)),
      segmentsAround: scaledSegments(woody ? 11 : 6, detailScale, woody ? 6 : 4),
      ribCount: woody ? 9 : 0,
      ribDepth: woody ? THREE.MathUtils.lerp(0.10, 0.17, oldGrowth) : 0,
      colorNoise: woody ? 0.12 : 0.08,
      detailScale,
    });
    if (seg) parts.push(seg);

    if (depth <= 1 || length < 0.28 || radius < 0.014) {
      addTwigCurtain(end, dir, length / spread + 0.82);
      if (structureScale > 0.62) {
        const thorns = makeThornCluster(rng, {
          center: end.clone().lerp(start, 0.35),
          axis: dir,
          count: rngInt(rng, 1, Math.max(1, Math.round(4 * structureScale))),
          spread: length * 0.28,
          length: proportions.mesquite.thornLength,
          color: thorn,
          detailScale,
        });
        if (thorns) parts.push(thorns);
      }
      return;
    }

    if (depth <= 3 && rngChance(rng, THREE.MathUtils.lerp(0.46, 0.78, maturity) * THREE.MathUtils.lerp(0.72, 1.0, structureScale))) {
      addTwigCurtain(end.clone().lerp(start, 0.12), dir, length / spread + 0.62);
    }

    const childMin = depth >= maxDepth - 1 ? Math.round(THREE.MathUtils.lerp(1, 3, maturity)) : 2;
    const childMax = Math.round(THREE.MathUtils.lerp(2, 5, maturity + oldGrowth * 0.12) * THREE.MathUtils.lerp(0.82, 1.0, structureScale));
    const childLower = Math.max(1, childMin);
    const childUpper = Math.max(childLower, childMax);
    const childCount = rngInt(rng, childLower, childUpper);
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

      const childLen = length * rngRange(rng, 0.62, 0.94) * THREE.MathUtils.lerp(1.22, 0.88, crown) * THREE.MathUtils.lerp(0.86, 1.06, maturity);
      const childR = radius * rngRange(rng, THREE.MathUtils.lerp(0.44, 0.52, maturity), THREE.MathUtils.lerp(0.58, 0.70, maturity));
      grow(end, child, childLen, childR, depth - 1, Math.max(crownLevel, end.y / height), phase);
    }
  }

  const trunkMin = Math.max(washTreeForm ? 1 : 3, Math.round(THREE.MathUtils.lerp(washTreeForm ? 1 : 3, washTreeForm ? 2 : 5, maturity) * THREE.MathUtils.lerp(0.86, 1.0, structureScale)));
  const trunkMax = Math.max(trunkMin, Math.round(THREE.MathUtils.lerp(washTreeForm ? 2 : 4, washTreeForm ? 6 : 9, maturity + oldGrowth * 0.12) * THREE.MathUtils.lerp(0.82, 1.0, structureScale)));
  const trunkCount = rngInt(rng, trunkMin, trunkMax);
  for (let i = 0; i < trunkCount; i++) {
    const angle = (i / trunkCount) * Math.PI * 2 + rngRange(rng, -0.6, 0.6);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const base = radial.clone().multiplyScalar(rngRange(rng, proportions.mesquite.twigBaseSpread[0], proportions.mesquite.twigBaseSpread[1]));
    const dir = UP.clone()
      .multiplyScalar(rngRange(rng, 0.58, 0.82))
      .addScaledVector(radial, rngRange(rng, 0.42, 0.72))
      .normalize();
    const len = height * rngRange(
      rng,
      THREE.MathUtils.lerp(0.18, 0.22, maturity),
      THREE.MathUtils.lerp(0.28, 0.36, maturity),
    );
    grow(base, dir, len, trunkRadius * rngRange(rng, 0.82, 1.18), maxDepth, 0, angle);
  }

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  geom.userData.growthStage = age < 0.24 ? 'juvenile_thorny_shrub' : age < 0.68 ? 'adult_mesquite' : 'old_bosque_tree';
  geom.userData.form = form;
  return geom;
}
