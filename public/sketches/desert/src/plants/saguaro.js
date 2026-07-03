import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, colorRamp, paintCactusSpines, paintGeometry, resolveDetailScale, scaledSegments } from './common.js';
import { buildCactusSpineBlades, sampleColumnAreoles, ensureCactusBillboardAttribute } from './cactusSpineBlades.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

const SAGUARO_SPINE_COLOR_BASE = new THREE.Color(0xf2e5b4);
const SAGUARO_SPINE_COLOR_TIP = new THREE.Color(0xc7a767);

// Saguaro (Carnegiea gigantea).
//
// Anatomy modeled here:
//   - Columnar trunk with a slight S-shaped lean (no real saguaro is dead-straight).
//   - 11-27 vertical pleats; "knob" rib profile (peaks bulge from a base body).
//   - Continuous tapered apex baked into the trunk sweep — ribs converge cleanly
//     to the rosette-tip, no visible seam between body and dome.
//   - Base flare (root buttress), gentle mid-height bulge, apical shoulder
//     (slight widening just below the dome), and faint vertical wobble for
//     annual-growth banding.
//   - Spine-cluster halo: rib peaks pick up a cream tint, much stronger near
//     the apex (where spine clusters are densest in real saguaros).
//   - Arms emerge from inside the trunk axis with a gaussian shoulder bulge.
//     The thin part inside the trunk is occluded; what's visible is a smoothly
//     flared join — the same way real arms fuse with the parent trunk.
export function generateSaguaro(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  // ----- Dimensional parameters -----
  // Lifecycle scalar: young saguaros are short, narrow columns with few ribs
  // and no arms. Old saguaros are tall, thicker, more ribbed, and carry more
  // arms from multiple heights on the trunk.
  const maxTrunkHeight = opts.maxHeight ?? proportions.saguaro.maxHeight;
  const heightCurvePower = 1.38;
  const inferredAge = opts.height == null
    ? null
    : Math.pow(
      THREE.MathUtils.clamp(
        (opts.height / maxTrunkHeight - proportions.ratios.saguaro.seedlingHeight)
          / (1 - proportions.ratios.saguaro.seedlingHeight),
        0,
        1,
      ),
      1 / heightCurvePower,
    );
  const age = THREE.MathUtils.clamp(opts.age ?? inferredAge ?? Math.pow(rng(), 0.68), 0, 1);
  const maturity = THREE.MathUtils.smoothstep(age, 0.18, 0.72);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.68, 1.0);
  const armMaturity = THREE.MathUtils.smoothstep(age, 0.52, 0.96);
  const hydration = THREE.MathUtils.clamp(opts.hydration ?? 0.36, 0, 1);
  const sizeNoise = opts.height == null ? rngRange(rng, 0.90, 1.10) : 1;
  const trunkHeight = opts.height ?? THREE.MathUtils.clamp(
    proportions.saguaro.heightForAge(age) * sizeNoise,
    proportions.saguaro.minHeight,
    maxTrunkHeight,
  );
  const trunkRadius = proportions.saguaro.trunkRadius(
    maturity,
    oldGrowth,
    rngRange(rng, proportions.saguaro.oldRadiusBoostRange[0], proportions.saguaro.oldRadiusBoostRange[1]),
  ) * rngRange(rng, 0.92, 1.10) * THREE.MathUtils.lerp(0.97, 1.08, hydration);
  const ribCount = Math.round(
    THREE.MathUtils.clamp(THREE.MathUtils.lerp(12, 24, maturity) + oldGrowth * rngRange(rng, 0, 1), 12, 24),
  );
  const ribDepth = THREE.MathUtils.lerp(0.055, 0.15, maturity) * rngRange(rng, 0.88, 1.12) * THREE.MathUtils.lerp(1.18, 0.92, hydration);

  // The dome at the apex is built into the same sweep as the trunk by
  // extending the curve a little beyond `trunkHeight` and tapering radius
  // smoothly to zero. This keeps the rib pleats continuous all the way up.
  const apexExtension = trunkRadius * rngRange(
    rng,
    THREE.MathUtils.lerp(1.8, 1.35, maturity),
    THREE.MathUtils.lerp(2.2, 1.85, maturity),
  );
  const totalHeight = trunkHeight + apexExtension;
  const trunkFrac = trunkHeight / totalHeight;

  // Subtle full-body lean (≤ ~3°) — saguaros aren't surveyed posts.
  const leanAngle = rngRange(
    rng,
    0.004,
    THREE.MathUtils.lerp(0.018, 0.06, maturity),
  );
  const leanDir = rng() * Math.PI * 2;
  const leanX = Math.cos(leanDir);
  const leanZ = Math.sin(leanDir);
  // Tiny perpendicular S-bend at mid-height for character.
  const wobbleAngle = rngRange(rng, -0.025, 0.025) * THREE.MathUtils.lerp(0.25, 1.0, maturity);
  const wobX = Math.cos(leanDir + Math.PI / 2);
  const wobZ = Math.sin(leanDir + Math.PI / 2);

  // ----- Color palette -----
  // Brown root → muted tan-green at base → deep saguaro green → lighter at apex.
  const stops = [
    { t: 0.00, c: new THREE.Color(0x4a3520) }, // root flare browns
    { t: 0.05, c: new THREE.Color(0x55502c) },
    { t: 0.18, c: new THREE.Color(0x3d573a) }, // body deep green
    { t: 0.55, c: new THREE.Color(0x416f3e) },
    { t: 1.00, c: new THREE.Color(0x547e4a) }, // apex lighter
  ];
  const SPINE = new THREE.Color(0xe8d6a6);     // cream spine-cluster halo
  const YOUNG_GREEN = new THREE.Color(0x6d8a4b);
  const OLD_DUST = new THREE.Color(0x6b704d);
  const WOODY_BARK = new THREE.Color(0x8a6035);
  const flowerColor = new THREE.Color(0xf8f1df);
  const flowerCenterColor = new THREE.Color(0xd8aa4c);
  const fruitColor = new THREE.Color(0xa82018);
  const woodyBaseT = proportions.saguaro.woodyBaseFraction(age) * rngRange(rng, 0.72, 1.12);
  const spineRowsPerMeter = rngRange(rng, 7.5, 10.5);
  const spinePhase = rng();

  // Color function shared by trunk + arms.  Two effects on top of the ramp:
  //   1. Brightness modulation by rib peak (peaks lighter, valleys darker).
  //   2. Cream spine-halo mixed into the peaks, ramped up sharply near the apex.
  function bodyColorFn(t, a, opts = {}) {
    const tColor = opts.colorT ?? t;
    const apexT = opts.apexT ?? t;
    const c = colorRamp(tColor, stops);

    const ribUnit = (Math.cos(a * ribCount) + 1) * 0.5; // 0..1
    const ribSharp = ribUnit * ribUnit;                 // narrows the peak band

    // Spine halo — denser as we approach the apex.
    const apexFactor = THREE.MathUtils.smoothstep(apexT, 0.55, 1.0);
    const spineMix = ribSharp * (0.04 + 0.18 * maturity + 0.42 * apexFactor);
    c.lerp(SPINE, spineMix);
    c.lerp(YOUNG_GREEN, (1 - maturity) * 0.20);
    c.lerp(OLD_DUST, oldGrowth * 0.08);
    if (woodyBaseT > 0 && tColor < woodyBaseT) {
      const barkMix = (1 - tColor / woodyBaseT) * THREE.MathUtils.smoothstep(age, 0.72, 1.0);
      c.lerp(WOODY_BARK, barkMix * 0.82);
    }

    // Light/dark modulation
    c.multiplyScalar(0.86 + ribUnit * 0.20);
    return c;
  }

  // ----- Trunk curve -----
  // 4-point Catmull-Rom: base, mid (lateral wobble), top, apex.
  function leanPoint(h) {
    return new THREE.Vector3(leanX * leanAngle * h, h, leanZ * leanAngle * h);
  }
  const midH = trunkHeight * 0.45;
  const trunkPoints = [
    leanPoint(0),
    leanPoint(midH).add(new THREE.Vector3(
      wobX * wobbleAngle * trunkHeight,
      0,
      wobZ * wobbleAngle * trunkHeight,
    )),
    leanPoint(trunkHeight),
    leanPoint(totalHeight),
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints, false, 'catmullrom', 0.4);

  function trunkRadiusFn(t) {
    if (t < trunkFrac) {
      const tt = t / trunkFrac; // 0..1 along trunk body
      // Base flare (decays fast)
      const baseFlare = 1 + THREE.MathUtils.lerp(0.08, 0.26, maturity) * Math.exp(-tt * 14);
      // Subtle mid-height bulge
      const bulge = 1 + THREE.MathUtils.lerp(0.015, 0.055, maturity) * Math.exp(-Math.pow((tt - 0.5) * 3, 2));
      // Apical shoulder — slight widening just below the dome
      const apexShoulder = 1 + THREE.MathUtils.lerp(0.04, 0.09, maturity) * Math.exp(-Math.pow((tt - 0.97) * 18, 2));
      // Annual-band wobble (very subtle, but reads in shadow)
      const wobble = 1 + THREE.MathUtils.lerp(0.004, 0.014, maturity) * Math.sin(tt * Math.PI * 7);
      // Mild taper toward apex
      const taper = 1 - THREE.MathUtils.lerp(0.08, 0.035, maturity) * tt;
      return trunkRadius * baseFlare * bulge * apexShoulder * wobble * taper;
    }
    // Apex dome: hemispherical-ish radius taper to a point.
    const u = (t - trunkFrac) / (1 - trunkFrac);
    const apexR = trunkRadius * 0.96;
    return apexR * Math.sqrt(Math.max(0, 1 - u * u));
  }

  const trunkSegmentsAlong = scaledSegments(
    Math.max(36, Math.floor(totalHeight * THREE.MathUtils.lerp(7, 9, maturity))),
    detailScale,
    14,
  );
  // Radial density must scale with LOD too — a flat ribCount*4 floor kept
  // far-LOD trunks at near-full triangle counts across thousands of instances.
  const trunkSegmentsAround = Math.max(
    scaledSegments(ribCount * 4, detailScale, 14),
    scaledSegments(Math.max(60, ribCount * 6), detailScale, 16),
  );

  // Per-blade mesh spines built once per cactus geometry variant. Blades
  // are bezier-curved ribbons whose curvature is evaluated in the vertex
  // shader (mode 10 in cactusSpineMaterial). These are the single most
  // expensive part of the geometry, so they are gated to the closest LOD
  // only — beyond a few metres the blades read as sub-pixel noise and every
  // other LOD falls back to the cheap procedural spine halo.
  const lodName = String(opts.lodName ?? '').toLowerCase();
  const highestLod = !lodName || lodName === 'near' || lodName === 'full' || lodName === 'hero' || lodName === 'lod-0';
  const spineDetail = THREE.MathUtils.clamp((detailScale - 0.55) / 0.45, 0, 1);
  const wantBlades = highestLod && spineDetail > 0.04;
  const spineAttachments = [];
  function addColumnBlades({
    curve,
    radiusFn,
    totalLen,
    spineRows,
    bodyFrac = 1,
    apexBoost = 1,
    rowPhase = 0,
    rowsPerUnit,
  }) {
    if (!wantBlades) return;
    const skipBelow = woodyBaseT > 0 ? woodyBaseT * 0.9 : 0.04;
    // 3-4 stiff spines per areole — the user-facing target. Texture areoles
    // sit at floor(y)+0.5 along each rib peak; we sample the same grid.
    const bladesPerAreole = Math.max(2, Math.round(THREE.MathUtils.lerp(3, 4, spineDetail)));
    const apexT = bodyFrac;
    sampleColumnAreoles({
      curve,
      radiusFn,
      ribCount,
      ribDepth,
      rowsPerUnit,
      rowPhase,
      bladesPerAreole,
      totalLength: totalLen,
      rng,
      skipBelow,
      skipAbove: Math.min(0.98, bodyFrac + 0.06),
      // Keep central spine perpendicular; radial spines tilt ~9°.
      fanTiltMax: 0.16,
      strengthFn: t => {
        const apexFactor = THREE.MathUtils.smoothstep(t, apexT - 0.45, apexT);
        const woodyFade = woodyBaseT > 0
          ? 1 - THREE.MathUtils.smoothstep(t, 0.0, woodyBaseT * 1.05)
          : 0;
        return spineDetail * apexBoost * (0.40 + apexFactor * 0.45) * (1 - woodyFade * 0.75);
      },
      // Real saguaro spines are 2-4 cm. Scale to trunk radius so visual
      // proportion holds across plant sizes.
      lengthFn: t => {
        const apexFactor = THREE.MathUtils.smoothstep(t, apexT - 0.45, apexT);
        return trunkRadius * THREE.MathUtils.lerp(0.11, 0.20, apexFactor) * rngRange(rng, 0.90, 1.10);
      },
      widthFn: () => trunkRadius * 0.014,
      colorFn: t => {
        const apexFactor = THREE.MathUtils.smoothstep(t, apexT - 0.3, apexT);
        return SAGUARO_SPINE_COLOR_BASE.clone().lerp(SAGUARO_SPINE_COLOR_TIP, apexFactor * 0.34);
      },
    }).forEach(a => spineAttachments.push(a));
  }

  const trunkGeom = sweepRibbedTube({
    curve: trunkCurve,
    segmentsAlong: trunkSegmentsAlong,
    segmentsAround: trunkSegmentsAround,
    ribCount,
    ribDepth,
    radiusFn: trunkRadiusFn,
    colorFn: (t, a) => bodyColorFn(t, a, { colorT: t, apexT: t }),
    spineFn: (t, a) => {
      const apexFactor = THREE.MathUtils.smoothstep(t, 0.45, 1.0);
      const woodyFade = woodyBaseT > 0
        ? 1 - THREE.MathUtils.smoothstep(t, 0.0, woodyBaseT * 1.12)
        : 0;
      return [
        (a * ribCount) / (Math.PI * 2),
        t * totalHeight * spineRowsPerMeter + spinePhase,
        (0.42 + apexFactor * 0.34) * (1 - woodyFade * 0.72),
        1,
      ];
    },
    closeStart: true,
    closeEnd: true,
  });
  const parts = [trunkGeom];
  const seasonalParts = [];

  addColumnBlades({
    curve: trunkCurve,
    radiusFn: trunkRadiusFn,
    totalLen: totalHeight,
    spineRows: trunkHeight * spineRowsPerMeter,
    bodyFrac: trunkFrac,
    apexBoost: 1.0,
    // Trunk body spineFn writes y = t * totalHeight * spineRowsPerMeter + spinePhase.
    // Sampling the same rowsPerUnit + rowPhase puts each cluster on a texture areole.
    rowsPerUnit: spineRowsPerMeter,
    rowPhase: spinePhase,
  });

  function addSeasonalCrown({ curve, count, phase = 0 }) {
    if (age < 0.56 || count <= 0) return;
    const heightScale = maxTrunkHeight;
    const peak = curve.getPointAt(1);
    const belowPeak = curve.getPointAt(0.965);
    const peakNormal = peak.clone().sub(belowPeak).normalize();
    if (peakNormal.lengthSq() < 1e-6) peakNormal.set(0, 1, 0);
    const sideA = new THREE.Vector3().crossVectors(peakNormal, new THREE.Vector3(0, 1, 0));
    if (sideA.lengthSq() < 1e-6) sideA.crossVectors(peakNormal, new THREE.Vector3(1, 0, 0));
    sideA.normalize();
    const sideB = new THREE.Vector3().crossVectors(peakNormal, sideA).normalize();
    const clusterRadius = heightScale * THREE.MathUtils.lerp(0.0045, 0.010, maturity);
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * Math.PI * 2 + rngRange(rng, -0.18, 0.18);
      const ringOffset = sideA.clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(sideB, Math.sin(a))
        .multiplyScalar(clusterRadius * rngRange(rng, 0.28, 1.05));
      const normal = peakNormal.clone()
        .addScaledVector(ringOffset, rngRange(rng, 3.0, 7.0))
        .normalize();
      const flowerRadius = heightScale * rngRange(rng, 0.0105, 0.0165);
      const flowerDepth = flowerRadius * rngRange(rng, 0.62, 0.86);
      const flowerCenter = peak.clone()
        .addScaledVector(peakNormal, -flowerDepth * rngRange(rng, 0.06, 0.35))
        .add(ringOffset.clone().multiplyScalar(rngRange(rng, 0.80, 1.16)))
        .addScaledVector(normal, flowerDepth * 0.38);
      addSaguaroFlower(seasonalParts, flowerCenter, normal, flowerRadius, flowerDepth, flowerColor, flowerCenterColor, detailScale);

      const fruitLength = heightScale * rngRange(rng, 0.0080, 0.0135);
      const fruitRadius = fruitLength * rngRange(rng, 0.30, 0.42);
      const fruitCenter = peak.clone()
        .add(ringOffset.clone().multiplyScalar(rngRange(rng, 0.36, 0.86)))
        .addScaledVector(normal, fruitLength * 0.32);
      addSaguaroFruit(seasonalParts, fruitCenter, normal, fruitRadius, fruitLength, fruitColor, detailScale);
    }
  }

  const trunkCrownCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(2, 4, maturity)),
    Math.round(THREE.MathUtils.lerp(4, 9, oldGrowth)),
  );
  addSeasonalCrown({
    curve: trunkCurve,
    count: trunkCrownCount,
    phase: rng() * Math.PI * 2,
  });

  // ----- Arms -----
  // Saguaros only sprout arms once they're old enough (commonly 50+ years,
  // ~3.5m+). Below that we leave the trunk alone. Past that threshold, age
  // controls the arm budget so older plants reliably carry more arms.
  const armCapable = age >= proportions.ratios.saguaro.firstArmAge && trunkHeight > maxTrunkHeight * 0.42;
  const armChance = opts.armProbability ?? 0.7;
  const numArms = armCapable ? proportions.saguaro.armCount(rng, age, armChance) : 0;

  const baseAngle = rng() * Math.PI * 2;
  const armAngles = [];
  for (let i = 0; i < numArms; i++) {
    armAngles.push(baseAngle + (i / numArms) * Math.PI * 2 + rngRange(rng, -0.45, 0.45));
  }

  for (let i = 0; i < numArms; i++) {
    const armAngle = armAngles[i];

    // Joint location and rise are stage-based: first arms are short and
    // mid-height; senior plants can carry older arms lower on the trunk.
    const riseRange = proportions.saguaro.armRiseFractionRange(age);
    const minRiseFrac = rngRange(rng, riseRange[0], riseRange[1]);
    const jointRange = proportions.saguaro.armJointRange(age);
    const jointMin = jointRange[0];
    const jointMax = Math.min(jointRange[1], 0.94 - riseRange[0]);
    const jointT = rngRange(rng, jointMin, Math.max(jointMin + 0.06, jointMax));
    const jointH = trunkHeight * jointT;

    // Cap the arm's top so the central trunk apex stays tallest most of the
    // time. A small probability allows a near-trunk-height arm for variety.
    const minArmTopFrac = Math.min(0.94, jointT + minRiseFrac);
    const maxArmTopFrac = Math.min(0.96, jointT + riseRange[1] + oldGrowth * 0.08);
    const armTopFrac = age >= proportions.ratios.saguaro.adultAge
      && rngChance(rng, proportions.ratios.saguaro.nearTopArmChance + oldGrowth * 0.08)
      ? rngRange(rng, Math.max(minArmTopFrac, 0.86), 0.96) // rarely peeks near trunk top
      : rngRange(
        rng,
        minArmTopFrac,
        Math.max(minArmTopFrac + 0.02, maxArmTopFrac),
      ); // typical: below apex
    const armTopH = Math.min(trunkHeight * armTopFrac, trunkHeight * 0.95);

    // Guarantee a meaningful rise: very short arms read as awkward nubs.
    const minRise = trunkHeight * minRiseFrac;
    const effectiveJointH = Math.min(jointH, armTopH - minRise);
    const armRise = armTopH - effectiveJointH;
    const armReachByRise = proportions.saguaro.armReachProfile(rng, armMaturity);
    const armReach = trunkRadius + rngRange(rng, armReachByRise[0], armReachByRise[1]) * armRise;
    const armRadiusScale = proportions.saguaro.armRadiusScaleRange(armMaturity);
    const armRadius = trunkRadius * rngRange(rng, armRadiusScale[0], armRadiusScale[1]);
    const armApexExt = armRadius * rngRange(rng, 1.4, 1.8);

    const trunkAxisAtJoint = leanPoint(effectiveJointH);
    const outDir = new THREE.Vector3(Math.cos(armAngle), 0, Math.sin(armAngle));

    // Build the arm path in (out, up) coordinates anchored at the joint.
    // 5 monotonically-rising control points produce the close out-then-up J,
    // and crucially never dip below the joint — which previously caused the
    // arm to poke out the underside of the trunk and expose the closeStart fan.
    const armWiggle = rngRange(rng, -0.025, 0.025); // tiny lateral character
    function arm3(out, up, sideJitter = 0) {
      const lateral = new THREE.Vector3(-outDir.z, 0, outDir.x);
      return trunkAxisAtJoint.clone()
        .addScaledVector(outDir, out)
        .addScaledVector(lateral, sideJitter)
        .add(new THREE.Vector3(0, up, 0));
    }
    // Profile (in fractions of armReach / armRise):
    //   p0 — joint, on trunk axis, exactly at joint height
    //   p1 — moving out and very slightly up (sets initial tangent ≈ horizontal)
    //   p2 — just past the trunk surface, partway up (the visual "elbow")
    //   p3 — near max reach, mostly risen
    //   p4 — top of the arm body, vertical
    //   p5 — apex tip (small extension above p4)
    const p0 = arm3(0,                   0);
    const p1 = arm3(armReach * 0.45,     armRise * 0.06);
    const p2 = arm3(armReach * 0.85,     armRise * 0.40, armReach * armWiggle);
    const p3 = arm3(armReach * 1.00,     armRise * 0.80);
    const p4 = arm3(armReach * 1.00,     armRise);
    const p5 = arm3(armReach * 1.00,     armRise + armApexExt);

    const armCurve = new THREE.CatmullRomCurve3(
      [p0, p1, p2, p3, p4, p5],
      false,
      'catmullrom',
      0.5,
    );

    // Body fraction = everything except the apex extension.
    const bodyApprox = armRise + armReach * 0.85;
    const armBodyFrac = bodyApprox / (bodyApprox + armApexExt);

    function armRadiusFn(t) {
      if (t > armBodyFrac) {
        // Apex dome, hemispherical-ish profile
        const u = (t - armBodyFrac) / (1 - armBodyFrac);
        return armRadius * 0.95 * Math.sqrt(Math.max(0, 1 - u * u));
      }
      const tt = t / armBodyFrac; // 0..1 along arm body

      // Inside-the-trunk neck: tiny radius at the very base so the first ring
      // is safely buried inside trunk geometry, occluded from view.
      const neckEnd = 0.08;
      const neck = tt < neckEnd
        ? 0.45 + (tt / neckEnd) * 0.55  // 0.45 → 1.0
        : 1.0;

      // Shoulder bulge: a *narrow* gaussian centered just outside the trunk
      // surface. The visible result is a tight flare at the joint, then a
      // clean cylindrical arm — like real saguaro shoulders.
      const shoulderPeakT = 0.18;
      const shoulderWidth = 0.08;
      const shoulderBulge = Math.exp(
        -Math.pow((tt - shoulderPeakT) / shoulderWidth, 2),
      );

      const taper = 1 - 0.05 * tt;
      return armRadius * neck * (1 + 0.30 * shoulderBulge) * taper;
    }

    function armColorFn(t, a) {
      // Map arm parameter into the trunk gradient: mid-trunk where the arm
      // joins, light-apex at the arm's own tip.
      const colorT = THREE.MathUtils.lerp(0.45, 1.0, t);
      // Apex-spine halo strength based on arm-local apex proximity.
      const apexT = t > armBodyFrac ? (t - armBodyFrac) / (1 - armBodyFrac) : t * 0.6;
      return bodyColorFn(t, a, { colorT, apexT });
    }

    const armSegmentsAlong = scaledSegments(
      Math.max(36, Math.round(THREE.MathUtils.lerp(42, 60, armMaturity))),
      detailScale,
      12,
    );
    // Same LOD-scaled radial floor as the trunk (see trunkSegmentsAround).
    const armSegmentsAround = Math.max(
      scaledSegments(ribCount * 4, detailScale, 12),
      scaledSegments(Math.max(60, ribCount * 5), detailScale, 14),
    );
    const armSpinePhase = rng();
    const armSpineRows = spineRowsPerMeter * rngRange(rng, 0.9, 1.15);

    const armGeom = sweepRibbedTube({
      curve: armCurve,
      segmentsAlong: armSegmentsAlong,
      segmentsAround: armSegmentsAround,
      ribCount,
      ribDepth: ribDepth * 0.95,
      radiusFn: armRadiusFn,
      colorFn: armColorFn,
      spineFn: (t, a) => {
        const apexT = t > armBodyFrac ? (t - armBodyFrac) / (1 - armBodyFrac) : t * 0.6;
        const apexFactor = THREE.MathUtils.smoothstep(apexT, 0.35, 1.0);
        return [
          (a * ribCount) / (Math.PI * 2),
          t * (armRise + armReach) * armSpineRows + armSpinePhase,
          0.38 + apexFactor * 0.36,
          1,
        ];
      },
      closeStart: true,
      closeEnd: true,
    });
    parts.push(armGeom);
    addColumnBlades({
      curve: armCurve,
      radiusFn: armRadiusFn,
      totalLen: armRise + armReach + armApexExt,
      spineRows: (armRise + armReach) * armSpineRows,
      bodyFrac: armBodyFrac,
      apexBoost: 1.05,
      // Arm spineFn writes y = t * (armRise + armReach) * armSpineRows + armSpinePhase.
      // Note totalLen here is (armRise+armReach+armApexExt) — the curve length —
      // so rowsPerUnit must be scaled to keep y = totalLen * rowsPerUnit + phase
      // matching the body's expression at t=1.
      rowsPerUnit: armSpineRows * ((armRise + armReach) / Math.max(0.001, armRise + armReach + armApexExt)),
      rowPhase: armSpinePhase,
    });

    if (age > 0.62 && rngChance(rng, THREE.MathUtils.lerp(0.32, 0.88, armMaturity))) {
      addSeasonalCrown({
        curve: armCurve,
        count: rngInt(rng, 2, Math.round(THREE.MathUtils.lerp(3, 6, oldGrowth))),
        phase: rng() * Math.PI * 2,
      });
    }
  }

  parts.push(...seasonalParts);

  if (spineAttachments.length) {
    const bladeGeom = buildCactusSpineBlades(spineAttachments, { segments: 3 });
    if (bladeGeom) parts.push(bladeGeom);
  }

  // Blade parts carry cactusBillboard; mergeGeometries drops attributes that
  // aren't on every part. Stub a zero billboard on body/seasonal parts.
  for (const part of parts) ensureCactusBillboardAttribute(part);

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  geom.userData.spineBladeCount = spineAttachments.length;
  return geom;
}

function markSeasonalCactusPart(geom, color, mode) {
  paintGeometry(geom, color);
  paintCactusSpines(geom, [0, 0, 0, mode]);
}

function orientSeasonalPart(geom, position, direction) {
  const dir = direction.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geom.applyQuaternion(q);
  geom.translate(position.x, position.y, position.z);
}

function addSaguaroFlower(parts, center, normal, radius, depth, petalColor, centerColor, detailScale) {
  const cup = new THREE.CylinderGeometry(
    radius * 0.82,
    radius * 0.42,
    depth * 0.58,
    scaledSegments(7, detailScale, 5),
    1,
    true,
  );
  markSeasonalCactusPart(cup, petalColor, 3);
  orientSeasonalPart(cup, center.clone().addScaledVector(normal, -depth * 0.08), normal);
  parts.push(cup);

  const petalCount = 6;
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(
      1,
      scaledSegments(6, detailScale, 4),
      scaledSegments(4, detailScale, 3),
    );
    petal.scale(radius * 0.42, depth * 0.18, radius * 0.72);
    petal.rotateY(a);
    petal.translate(Math.cos(a) * radius * 0.48, depth * 0.16, Math.sin(a) * radius * 0.48);
    markSeasonalCactusPart(petal, petalColor.clone().lerp(new THREE.Color(0xfffbf0), 0.35), 3);
    orientSeasonalPart(petal, center.clone().addScaledVector(normal, depth * 0.08), normal);
    parts.push(petal);
  }

  const disk = new THREE.SphereGeometry(
    radius * 0.24,
    scaledSegments(6, detailScale, 4),
    scaledSegments(4, detailScale, 3),
  );
  disk.scale(1.0, 0.34, 1.0);
  markSeasonalCactusPart(disk, centerColor, 3);
  orientSeasonalPart(disk, center.clone().addScaledVector(normal, depth * 0.32), normal);
  parts.push(disk);
}

function addSaguaroFruit(parts, center, normal, radius, length, color, detailScale) {
  const fruit = new THREE.SphereGeometry(
    1,
    scaledSegments(7, detailScale, 5),
    scaledSegments(5, detailScale, 4),
  );
  fruit.scale(radius, length * 0.50, radius * 0.82);
  markSeasonalCactusPart(fruit, color, 4);
  orientSeasonalPart(fruit, center, normal);
  parts.push(fruit);
}
