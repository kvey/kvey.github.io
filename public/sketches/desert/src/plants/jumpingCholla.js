import * as THREE from 'three';
import { mergeGeometries, paintCactusSpines, paintGeometry, resolveDetailScale, resolvePlantAge, scaledSegments, sweepRibbedTube } from './common.js';
import { buildChollaSpineBlades, sampleChollaJointAreoles } from './chollaSpineBlades.js';
import { rngChance, rngInt, rngRange } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Color the user-picked base color blends toward as a segment ages — deeper
// amber so old joints have that bronze hue real teddy bear cholla shows.
const CHOLLA_BLADE_TIP_COLOR = new THREE.Color(0xc6822e);

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Cylindropuntia fulgida: arborescent cholla with a low woody trunk, short
// detachable cylindrical joints, dense straw-colored spines, and hanging chains
// of mostly sterile green fruit.
export function generateJumpingCholla(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts, 0.42);
  const proportions = resolveProportionOracle(opts);
  const cholla = proportions.jumpingCholla;
  const suppressCloneDetails = opts.suppressCloneDetails ?? false;
  // chollaFinLength / chollaSpineCoverage keep their old keys so existing
  // saved presets still resolve, but in the UI they're labeled "Spine length"
  // and "Spine density" — the billboard sheath they originally controlled is
  // gone, and these now scale the real geometric quills.
  const chollaFinLength = THREE.MathUtils.clamp(opts.chollaFinLength ?? 1, 0.1, 3.0);
  const chollaSpineCoverage = THREE.MathUtils.clamp(opts.chollaSpineCoverage ?? 1, 0, 3.0);
  const chollaSpineWidth = THREE.MathUtils.clamp(opts.chollaSpineWidth ?? 1, 0.1, 4.0);
  const chollaSpineTilt = THREE.MathUtils.clamp(opts.chollaSpineTilt ?? 1, 0.0, 2.0);
  const chollaSpineColorHex = opts.chollaSpineColor ?? '#ffd768';
  const chollaSpineColor = new THREE.Color(chollaSpineColorHex);
  const age = resolvePlantAge(rng, opts, 0.58);
  const maturity = THREE.MathUtils.smoothstep(age, 0.20, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.62, 1.0);
  const height = THREE.MathUtils.lerp(cholla.height[0], cholla.height[1], Math.pow(age, 0.78)) * rngRange(rng, 0.88, 1.14);
  const trunkHeight = height * rngRange(rng, 0.42, 0.58);
  const crownRadius = Math.min(height * THREE.MathUtils.lerp(0.36, 0.58, maturity), cholla.height[1] * 0.42) * rngRange(rng, 0.86, 1.12);
  const trunkRadius = THREE.MathUtils.lerp(cholla.trunkRadius[0], cholla.trunkRadius[1], maturity) * rngRange(rng, 0.58, 0.86);
  const jointRadius = THREE.MathUtils.lerp(cholla.jointRadius[0], cholla.jointRadius[1], maturity) * rngRange(rng, 1.06, 1.30);
  const jointLength = THREE.MathUtils.lerp(cholla.jointLength[0], cholla.jointLength[1], maturity);
  const fruitRadius = THREE.MathUtils.lerp(cholla.fruitRadius[0], cholla.fruitRadius[1], maturity);
  const fruitLength = THREE.MathUtils.lerp(cholla.fruitLength[0], cholla.fruitLength[1], maturity);
  // Plant-wide reference spine length/width. Real cholla spines are roughly
  // uniform across the plant — picking these per-plant (not per-joint) means
  // the bulked-up woody base doesn't get giant spines, and each blade still
  // gets its own ~15% length jitter inside the sampler.
  const plantSpineLength = jointRadius * 2.5 * chollaFinLength * rngRange(rng, 0.92, 1.08);
  const plantSpineWidth = jointRadius * 0.030 * chollaSpineWidth * rngRange(rng, 0.95, 1.05);

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
  const lodName = String(opts.lodName ?? '').toLowerCase();
  const highestLod = !lodName || lodName === 'near' || lodName === 'full' || lodName === 'hero' || lodName === 'lod-0';
  const explicitSpineDetail = (opts.chollaSpineBillboards ?? highestLod) && detailScale > 0.50;
  let droppedJointCount = 0;
  let rootedSegmentCount = 0;

  // Plants only develop the bark-like woody base once they're mature.
  // Declared before the primary-chain loop because growJointChain (hoisted)
  // captures this const, and JS would throw TDZ if the call runs first.
  const matureWoody = THREE.MathUtils.smoothstep(age, 0.40, 0.82);

  // Below the highest LOD, grow fewer-but-longer joints (same chain length,
  // ~half the geometry) and stop side-branching at depth 1. A mature colony
  // cholla carries hundreds of joints, so joint count is the biggest lever on
  // mid/far triangle cost; at 30m+ the missing inter-joint waists and
  // outermost twigs are sub-pixel.
  const structureScale = highestLod ? 1 : THREE.MathUtils.clamp(0.42 + detailScale * 0.55, 0.5, 1);
  const maxBranchDepth = highestLod || detailScale >= 0.5 ? 2 : 1;
  const scaledJointCount = count => Math.max(2, Math.round(count * structureScale));
  const structureJointLength = jointLength / structureScale;

  // Real jumping cholla has no dedicated trunk — what looks like one is just
  // the oldest joints in each primary chain bulking up, darkening, and turning
  // bark-like with age. We model that directly: primary chains emerge from a
  // tight cluster near (0,0,0) and the first ~half of each chain carries a
  // `woodiness` factor that widens the radius and shifts the color toward
  // bark, but keeps spines (real woody joints still bear them).
  const primaryCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(3, 5, maturity)),
    Math.round(THREE.MathUtils.lerp(5, 9, maturity + oldGrowth * 0.28)),
  );
  const baseSpread = trunkRadius * 1.4;
  for (let i = 0; i < primaryCount; i++) {
    const a = (i / primaryCount) * Math.PI * 2 + rngRange(rng, -0.30, 0.30);
    const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const origin = new THREE.Vector3(
      radial.x * rngRange(rng, 0.0, baseSpread),
      rngRange(rng, 0.0, jointRadius * 0.55),
      radial.z * rngRange(rng, 0.0, baseSpread),
    );
    // Initial direction is mostly upward; outward tilt varies per branch so
    // the silhouette spreads rather than going straight up.
    const tilt = rngRange(rng, 0.18, 0.55);
    const dir = radial.clone()
      .multiplyScalar(tilt)
      .addScaledVector(Y_AXIS, 1 - tilt * 0.55)
      .normalize();
    growJointChain({
      start: origin,
      dir,
      radius: jointRadius * rngRange(rng, 0.95, 1.20),
      jointCount: scaledJointCount(rngInt(rng, Math.round(THREE.MathUtils.lerp(6, 10, maturity)), Math.round(THREE.MathUtils.lerp(10, 18, maturity + oldGrowth * 0.25)))),
      depth: 0,
      spread: crownRadius,
    });
  }

  if ((opts.fruitChains ?? true) && maturity > 0.28) {
    const fruitTipCount = Math.min(tips.length, rngInt(rng, Math.round(2 + maturity * 3), Math.round(6 + oldGrowth * 9)));
    for (let i = 0; i < fruitTipCount; i++) {
      const tip = tips[Math.floor(rng() * tips.length)];
      if (!tip) continue;
      addFruitChain(tip.point, tip.dir, rngInt(rng, 2, Math.round(THREE.MathUtils.lerp(4, 11, oldGrowth))));
    }
  }

  if (!suppressCloneDetails && maturity > 0.42) addDroppedJoints();

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  geom.userData.growthStage = age < 0.24 ? 'juvenile_segment_cluster' : age < 0.66 ? 'adult_tree_cholla' : 'old_clonal_colony_source';
  geom.userData.fruitChains = opts.fruitChains ?? true;
  geom.userData.droppedJoints = droppedJointCount;
  geom.userData.rootedSegments = rootedSegmentCount;
  return geom;

  function addPart(geom) {
    if (geom) parts.push(ensureChollaBillboardAttribute(geom));
  }

  function ensureChollaBillboardAttribute(geom) {
    if (!geom.attributes.cactusBillboard) {
      const count = geom.attributes.position.count;
      geom.setAttribute('cactusBillboard', new THREE.Float32BufferAttribute(new Float32Array(count * 4), 4));
    }
    return geom;
  }

  function growJointChain({ start, dir, radius, jointCount, depth, spread }) {
    let p = start.clone();
    let d = dir.clone().normalize();
    const branchTwist = rngRange(rng, -0.38, 0.38);
    for (let i = 0; i < jointCount; i++) {
      const chainT = jointCount <= 1 ? 1 : i / (jointCount - 1);
      // Woodiness fades over the first ~half of a primary chain — those are
      // the oldest joints, which thicken and darken into bark. Side branches
      // (depth >= 1) never go woody; they're newer growth.
      const woodiness = depth === 0
        ? Math.max(0, 1 - chainT * 2.0) * matureWoody
        : 0;
      const len = structureJointLength * rngRange(rng, 0.58, 1.04)
        * THREE.MathUtils.lerp(1.02, 0.78, chainT)
        * (1 + woodiness * 0.45);
      const droop = THREE.MathUtils.smoothstep(chainT, 0.34, 1.0) * rngRange(rng, 0.05, 0.22 + depth * 0.08);
      const turn = new THREE.Vector3(
        rngRange(rng, -0.18, 0.18),
        -droop + rngRange(rng, -0.06, 0.10),
        rngRange(rng, -0.18, 0.18),
      );
      d.add(turn).normalize();
      // With no central trunk, pull stragglers back toward (0, p.y, 0) so the
      // crown stays a coherent silhouette instead of fraying outward forever.
      const horizontalDistance = Math.hypot(p.x, p.z);
      if (horizontalDistance > spread) d.addScaledVector(new THREE.Vector3(-p.x, 0, -p.z).normalize(), 0.28).normalize();
      if (p.y > height) d.y -= 0.24;
      if (p.y < trunkHeight * 0.26) d.y += 0.18;
      d.normalize();
      const q = p.clone().addScaledVector(d, len);
      const segmentAge = THREE.MathUtils.clamp(age - depth * 0.08 - chainT * 0.18 + rngRange(rng, -0.06, 0.08), 0, 1);
      const radiusScale = THREE.MathUtils.lerp(1.16, 0.98, chainT) * (1 + woodiness * 1.6);
      addPart(buildChollaJoint(p, q, radius * radiusScale, segmentAge, branchTwist + i * 0.21, woodiness));

      if (depth < maxBranchDepth && i > 1 && rngChance(rng, THREE.MathUtils.lerp(0.18, 0.42, maturity) * (1 - depth * 0.24))) {
        const side = perpendicularDirection(d, rngRange(rng, -1.0, 1.0))
          .multiplyScalar(rngRange(rng, 0.58, 0.94))
          .addScaledVector(Y_AXIS, rngRange(rng, -0.10, 0.26))
          .normalize();
        growJointChain({
          start: q.clone().addScaledVector(side, radius * 0.45),
          dir: side,
          radius: radius * rngRange(rng, 0.86, 1.02),
          jointCount: scaledJointCount(rngInt(rng, 3, Math.round(THREE.MathUtils.lerp(5, 10, maturity)))),
          depth: depth + 1,
          spread: spread * 1.08,
        });
      }

      p = q;
    }
    if (depth <= 1 || rngChance(rng, 0.45)) tips.push({ point: p.clone(), dir: d.clone() });
  }

  function buildChollaJoint(start, end, radius, segmentAge, phase, woodiness = 0) {
    const axis = end.clone().sub(start);
    const length = axis.length();
    if (length <= 0.001) return new THREE.BufferGeometry();
    axis.normalize();
    const normal = Math.abs(axis.dot(Y_AXIS)) > 0.94
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3().crossVectors(Y_AXIS, axis).normalize();
    const binormal = new THREE.Vector3().crossVectors(axis, normal).normalize();
    // Floors low enough that mid/far actually shed triangles — the fragment
    // shader's tubercle bump carries the knobby look at distance, not the mesh.
    const rings = scaledSegments(Math.max(8, Math.round(length / Math.max(radius, 0.001) * 3.4)), detailScale, 4);
    const radial = scaledSegments(20, detailScale, 8);
    const areolesAround = 7;
    // Real cholla joints carry ~10-14 tubercles along a typical inter-node
    // length. Bump the row count so the fragment-shader bump map produces a
    // visibly knobby surface like the reference photo, not a smooth cylinder.
    const areoleRows = Math.max(8, Math.round(length / Math.max(radius * 0.85, 0.001)));
    const positions = [];
    const colors = [];
    const spines = [];
    const indices = [];

    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const rowOffset = (i % 2) * 0.5 + phase;
      const endTaper = THREE.MathUtils.lerp(0.90, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.12))
        * THREE.MathUtils.lerp(0.91, 1.0, 1 - THREE.MathUtils.smoothstep(t, 0.88, 1.0));
      const waist = 1 + 0.055 * Math.sin(t * Math.PI);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const areoleA = (a / (Math.PI * 2)) * areolesAround + rowOffset;
        const localA = Math.abs(fract(areoleA) - 0.5) * 2;
        const localT = Math.abs(fract(t * areoleRows) - 0.5) * 2;
        const tubercle = Math.exp(-(localA * localA * 2.2 + localT * localT * 2.5)) * 0.20;
        const wobble = 1 + Math.sin(a * 3.0 + t * 8.0 + phase) * 0.008 + Math.sin(a * 7.0 - t * 4.0) * 0.005;
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
        // Woody joints shift their base color toward bark, with the tubercle
        // crests catching some lighter dry-ridge highlights — keeps the bumpy
        // surface readable instead of flattening it into a brown blob.
        c.lerp(oldWood, woodiness * 0.78);
        c.lerp(dryRidge, woodiness * tubercle * 0.55);
        c.multiplyScalar(0.82 + tubercle * 0.20 + Math.max(0, Math.sin(a)) * 0.07);
        colors.push(c.r, c.g, c.b);

        const lowerOldFade = THREE.MathUtils.smoothstep(segmentAge, 0.08, 0.38);
        // Woody joints still bear spines (real ones do), just a touch fewer —
        // the body spine-strength attribute trims them ~20%.
        const woodSpineDamp = 1 - woodiness * 0.20;
        spines.push(areoleA, t * areoleRows, (0.58 + young * 0.22 + tubercle * 0.26) * lowerOldFade * woodSpineDamp, 5);
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

    const lowerOldFade = THREE.MathUtils.smoothstep(segmentAge, 0.08, 0.38);
    const capColor = oldStem.clone().lerp(stemGreen, THREE.MathUtils.smoothstep(segmentAge, 0.18, 0.72));
    capColor.lerp(youngStem, (1 - segmentAge) * 0.28);
    capColor.multiplyScalar(0.84);

    const startCenter = positions.length / 3;
    positions.push(start.x, start.y, start.z);
    colors.push(capColor.r, capColor.g, capColor.b);
    spines.push(phase, 0.0, 0.42 * lowerOldFade, 5);
    for (let j = 0; j < radial; j++) {
      indices.push(startCenter, j + 1, j);
    }

    const endCenter = positions.length / 3;
    positions.push(end.x, end.y, end.z);
    colors.push(capColor.r, capColor.g, capColor.b);
    spines.push(phase + 0.5, areoleRows, 0.42 * lowerOldFade, 5);
    const lastRing = rings * stride;
    for (let j = 0; j < radial; j++) {
      indices.push(endCenter, lastRing + j, lastRing + j + 1);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('cactusSpine', new THREE.Float32BufferAttribute(spines, 4));
    g.setIndex(indices);
    g.computeVertexNormals();
    ensureChollaBillboardAttribute(g);

    if (explicitSpineDetail) {
      // Cholla "fur" now comes from real geometric quills (mode 11). The old
      // billboard sheath cards (buildChollaSpineSheath) are intentionally not
      // emitted anymore — the blade halo replaces them.
      const bladeLayer = buildJointSpineBlades({
        start,
        axis,
        length,
        radius,
        areolesAround,
        areoleRows,
        phase,
        segmentAge,
        woodiness,
      });
      return mergeGeometries([g, bladeLayer].filter(Boolean));
    }

    return g;
  }

  function buildChollaSpineSheath({
    start,
    axis,
    normal,
    binormal,
    radius,
    length,
    segmentAge,
    phase,
    areolesAround,
    areoleRows,
    radiusScaleYoung = 1.72,
    radiusScaleOld = 1.48,
    strengthScale = 1.0,
    coverageScale = 1.0,
    phaseOffset = 0.0,
    greenReveal = 0.08,
  }) {
    const rows = scaledSegments(Math.max(3, Math.ceil(areoleRows * 0.36)), detailScale, 3);
    const around = scaledSegments(Math.max(3, Math.ceil(areolesAround * 0.50)), detailScale, 3);
    const positions = [];
    const normals = [];
    const colors = [];
    const spines = [];
    const billboards = [];
    const indices = [];
    const young = 1 - segmentAge;
    const sheathYoung = new THREE.Color(0xffd35e);
    const sheathOld = new THREE.Color(0xb47d2f);
    const greenGlint = new THREE.Color(0x7f9651);
    const coverage = THREE.MathUtils.clamp(coverageScale, 0.25, 3.0);
    const clusterScale = THREE.MathUtils.lerp(1.16, 1.72, THREE.MathUtils.clamp(coverage, 0.45, 2.2) / 2.2);

    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      const rowOffset = (i % 2) * 0.5;
      const rowCoord = t * areoleRows + phase * 0.37 + rowOffset;
      const localT = Math.abs(fract(rowCoord) - 0.5) * 2;
      const rowPeak = Math.exp(-(localT * localT * 2.8));
      const endTaper = THREE.MathUtils.lerp(0.70, 1.0, THREE.MathUtils.smoothstep(t, 0.0, 0.16))
        * THREE.MathUtils.lerp(0.78, 1.0, 1 - THREE.MathUtils.smoothstep(t, 0.82, 1.0));
      const waist = 1 - 0.025 * Math.sin(t * Math.PI);
      const rootR = radius * endTaper * waist * 0.98;
      const tipR = radius * endTaper * waist * THREE.MathUtils.lerp(radiusScaleOld, radiusScaleYoung, young);
      const cardLength = Math.max(radius * 0.10, tipR - rootR) * clusterScale;
      const cardWidth = radius * THREE.MathUtils.lerp(0.42, 0.68, young) * THREE.MathUtils.lerp(0.95, 1.18, strengthScale) * clusterScale;
      const axialCenter = start.clone().addScaledVector(axis, length * t);

      for (let j = 0; j < around; j++) {
        const a = ((j + rowOffset) / around) * Math.PI * 2 + phaseOffset + phase * 0.11;
        const out = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a)).normalize();
        const seed = i * around + j + Math.round(phaseOffset * 100.0) * 1000;
        const rootCenter = axialCenter.clone().addScaledVector(out, rootR);
        const tipCenter = rootCenter.clone().addScaledVector(out, cardLength);
        const width = cardWidth;
        const baseIndex = positions.length / 3;
        const center = rootCenter.clone().lerp(tipCenter, 0.5);
        const cRoot = sheathYoung.clone()
          .lerp(sheathOld, segmentAge * 0.68)
          .lerp(greenGlint, greenReveal)
          .multiplyScalar(0.76 + rowPeak * 0.12);
        const cTip = sheathYoung.clone()
          .lerp(sheathOld, segmentAge * 0.68)
          .multiplyScalar(0.96 + rowPeak * 0.18);

        const verts = [
          { u: 0.0, vy: 0.08, ox: -0.50, oy: -0.50, c: cRoot },
          { u: 0.0, vy: 0.92, ox: -0.50, oy: 0.50, c: cRoot },
          { u: 1.0, vy: 0.14, ox: 0.50, oy: -0.34, c: cTip },
          { u: 1.0, vy: 0.86, ox: 0.50, oy: 0.34, c: cTip },
        ];

        for (const vert of verts) {
          positions.push(center.x, center.y, center.z);
          normals.push(out.x, out.y, out.z);
          colors.push(vert.c.r, vert.c.g, vert.c.b);
          spines.push(vert.u, seed + vert.vy, (0.84 + young * 0.18 + rowPeak * 0.16) * strengthScale * coverage, 8 + segmentAge);
          billboards.push(vert.ox, vert.oy, cardLength, width);
        }

        indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 1, baseIndex + 2, baseIndex + 3);
      }
    }

    if (positions.length === 0) return null;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('cactusSpine', new THREE.Float32BufferAttribute(spines, 4));
    g.setAttribute('cactusBillboard', new THREE.Float32BufferAttribute(billboards, 4));
    g.setIndex(indices);
    return g;
  }

  // Per-joint mode-11 spine blades. The covering on real teddy bear / jumping
  // cholla reads as fur — many long thin quills radiating in every direction.
  // Sampler oversamples the body's areole grid by ~2x and produces a starburst
  // at each cell. Coverage scales by chollaSpineCoverage and detail scale.
  function buildJointSpineBlades({ start, axis, length, radius, areolesAround, areoleRows, phase, segmentAge, woodiness = 0 }) {
    const end = start.clone().addScaledVector(axis, length);
    const young = 1 - segmentAge;
    // Spine color blends from user-set color toward the warmer tip color as
    // the segment ages and toward bark on woody joints.
    const baseColor = chollaSpineColor.clone()
      .lerp(CHOLLA_BLADE_TIP_COLOR, 0.16 + segmentAge * 0.30)
      .lerp(dryRidge, woodiness * 0.30);
    // Fur is by far the most expensive geometry in the whole scene: a mature
    // clonal cholla carries hundreds of joints, so every blade here is
    // multiplied ~10^4 by the time a chunk is populated. Budget accordingly:
    // sub-sample the areole grid (0.6/0.7 densities) and keep the per-areole
    // starburst small, with wider blades compensating for the thinner count.
    // Woody joints still bear spines (real ones do) but at slightly reduced
    // density — ~80% of fresh joints.
    const woodyDensityDamp = 1 - woodiness * 0.22;
    const bladesPerAreole = Math.round(
      THREE.MathUtils.lerp(5, 7, detailScale) * chollaSpineCoverage * woodyDensityDamp,
    );
    if (bladesPerAreole <= 0) return null;
    const attachments = sampleChollaJointAreoles({
      start,
      end,
      radius,
      areolesAround,
      areoleRows,
      rowDensity: 0.6,
      aroundDensity: 0.7,
      phase,
      bladesPerAreole,
      // Mean tilt ~30° off perpendicular by default, scaled by chollaSpineTilt
      // so the slider runs from "perpendicular quills" (0) to "wide starburst".
      fanTiltBase: 0.55 * chollaSpineTilt,
      fanTiltJitter: 0.38 * chollaSpineTilt,
      // Plant-wide spine length — uniform across the whole cholla so the
      // bulked-up woody base doesn't get giant spines. Per-blade jitter (set
      // here, ±15%) gives the natural-looking variation you see in real
      // clusters where every spine is "about the same" but no two identical.
      lengthFn: () => plantSpineLength * rngRange(rng, 0.85, 1.15),
      // ~1.5x wider than the old dense fur so the sparser blade count still
      // reads as full coverage.
      widthFn: () => plantSpineWidth * 1.5 * rngRange(rng, 0.88, 1.14),
      colorFn: () => baseColor.clone().multiplyScalar(rngRange(rng, 0.90, 1.12)),
      strengthFn: () => 0.65 + young * 0.30,
      rng,
      skipBelow: 0.03,
      skipAbove: 0.97,
    });
    // 2 segments per blade: cholla quills are near-straight, and at fur blade
    // widths the middle ring of a 3-segment strip is invisible anyway.
    return buildChollaSpineBlades(attachments, { segments: 2 });
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
      addPart(fruit);
    }

    if (rngChance(rng, 0.16 + maturity * 0.18)) {
      const flower = new THREE.SphereGeometry(fruitRadius * 0.72, scaledSegments(8, detailScale, 5), scaledSegments(6, detailScale, 4), 0, Math.PI * 2, 0, Math.PI * 0.6);
      flower.translate(p.x, p.y - fruitRadius * 0.45, p.z);
      paintGeometry(flower, flowerPink);
      paintCactusSpines(flower, [0, 0, 0, 0]);
      addPart(flower);
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
      addPart(buildChollaJoint(start, end, jointRadius * rngRange(rng, 0.82, 1.10), Math.max(0.25, age - 0.18), rng() * Math.PI * 2));
      droppedJointCount++;

      if (oldGrowth > 0.28 && rngChance(rng, 0.18 + oldGrowth * 0.28)) {
        const sproutBase = center.clone();
        sproutBase.y = jointRadius * 0.18;
        const sproutDir = new THREE.Vector3(
          rngRange(rng, -0.22, 0.22),
          rngRange(rng, 0.78, 1.0),
          rngRange(rng, -0.22, 0.22),
        ).normalize();
        const sproutTop = sproutBase.clone().addScaledVector(sproutDir, jointLength * rngRange(rng, 0.42, 0.82));
        addPart(buildChollaJoint(sproutBase, sproutTop, jointRadius * rngRange(rng, 0.58, 0.78), Math.max(0.18, age - 0.10), rng() * Math.PI * 2));
        rootedSegmentCount++;
      }
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
