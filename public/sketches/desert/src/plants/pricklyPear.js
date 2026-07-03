import * as THREE from 'three';
import { mergeGeometries, paintCactusSpines, resolveDetailScale, resolvePlantAge, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Opuntia: a clump of flattened, pear-shaped pads. Pads grow from areoles
// near the shoulder of an older pad, then fan outward into a dense low shrub.
export function generatePricklyPear(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const suppressCloneDetails = opts.suppressCloneDetails ?? false;
  // Lifecycle scalar: young plants are a few tender pads, while old clumps
  // spread into branched thickets with thicker basal pads and more fruit.
  const age = resolvePlantAge(rng, opts, 0.70);
  const maturity = THREE.MathUtils.smoothstep(age, 0.18, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.66, 1.0);
  const flowering = opts.flowering ?? true;
  const fruiting = opts.fruiting ?? true;
  const baseSize = THREE.MathUtils.lerp(
    proportions.pricklyPear.padBaseSize[0],
    proportions.pricklyPear.padBaseSize[1],
    Math.pow(age, 0.64),
  ) * rngRange(rng, 0.88, 1.12);
  const padHue = rngRange(rng, 0.265, 0.350);
  const padColor = new THREE.Color().setHSL(padHue, rngRange(rng, 0.18, 0.38), rngRange(rng, 0.34, 0.46));
  const youngPadColor = padColor.clone().offsetHSL(0.018, 0.09, 0.09);
  const oldPadColor = new THREE.Color().setHSL(rngRange(rng, 0.095, 0.135), rngRange(rng, 0.14, 0.24), rngRange(rng, 0.38, 0.48));
  const dryScarColor = new THREE.Color().setHSL(rngRange(rng, 0.065, 0.105), rngRange(rng, 0.20, 0.34), rngRange(rng, 0.25, 0.34));
  const rimBlush = new THREE.Color().setHSL(rngRange(rng, 0.88, 0.99), 0.30, 0.38);
  const fruitColor = new THREE.Color().setHSL(rngRange(rng, 0.88, 0.965), 0.62, 0.38);
  const fruitBaseColor = new THREE.Color().setHSL(rngRange(rng, 0.075, 0.105), 0.52, 0.45);
  const flowerColor = new THREE.Color().setHSL(rngRange(rng, 0.10, 0.14), 0.76, 0.58);
  const maxDepth = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(1, 3, maturity)),
    Math.round(THREE.MathUtils.lerp(2, 5, maturity + oldGrowth * 0.25)),
  );
  const childChance = rngRange(
    rng,
    THREE.MathUtils.lerp(0.28, 0.60, maturity),
    THREE.MathUtils.lerp(0.46, 0.88, maturity),
  );
  // Far LOD (suppressCloneDetails) trims the newest/outermost pads — recursion
  // adds pads outward, so capping the count keeps the clump's core silhouette.
  const padBudgetScale = suppressCloneDetails ? 0.6 : 1;
  const maxPads = Math.max(3, Math.round((opts.maxPads ?? rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(4, 16, maturity)),
    Math.round(THREE.MathUtils.lerp(7, 38, maturity + oldGrowth * 0.38)),
  )) * padBudgetScale));

  const parts = [];
  let padCount = 0;
  let rootingPadCount = 0;

  function smoothstep(a, b, x) {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function colorGeometry(geom, colorFn) {
    const pos = geom.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = colorFn(i, pos);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  function paintSolid(geom, color, spine = [0, 0, 0, 0]) {
    colorGeometry(geom, () => color);
    paintCactusSpines(geom, spine);
  }

  function padProfile(t) {
    const rounded = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.42);
    const baseNeck = THREE.MathUtils.lerp(0.48, 1.0, smoothstep(0.04, 0.30, t));
    const topCrown = THREE.MathUtils.lerp(1.0, 0.86, smoothstep(0.90, 1.0, t));
    return rounded * baseNeck * topCrown;
  }

  function padHalfWidth(spec, t, side = 1) {
    const shoulder = THREE.MathUtils.lerp(0.78, spec.shoulderBias, smoothstep(0.38, 0.86, t));
    const waist = 1 - 0.08 * smoothstep(0.20, 0.46, t) * (1 - smoothstep(0.60, 0.82, t));
    const asymmetry = 1
      + side * spec.wobbleA * Math.sin(spec.phase + t * 5.1)
      + spec.wobbleB * Math.sin(spec.phase * 0.7 + t * 8.3 + side * 1.4);
    return spec.size * spec.widthScale * padProfile(t) * shoulder * waist * asymmetry;
  }

  function padCenterX(spec, t) {
    return spec.bend * Math.sin(Math.PI * t) * (0.6 + 0.4 * t);
  }

  function padThickness(spec, t) {
    const profile = padProfile(t);
    return spec.thickness * Math.pow(Math.max(0.001, profile), 0.34) * (0.88 + 0.12 * Math.sin(Math.PI * t));
  }

  function createPadSpec(size, depth) {
    const depthAge = maxDepth <= 0 ? 1 : depth / maxDepth;
    const padAge = THREE.MathUtils.clamp(
      age * THREE.MathUtils.lerp(0.36, 1.0, depthAge) + rngRange(rng, -0.08, 0.08),
      0,
      1,
    );
    const padMaturity = THREE.MathUtils.smoothstep(padAge, 0.18, 0.74);
    return {
      size,
      age: padAge,
      height: size * rngRange(
        rng,
        THREE.MathUtils.lerp(1.84, 2.25, padMaturity),
        THREE.MathUtils.lerp(2.18, 2.82, padMaturity),
      ),
      widthScale: rngRange(
        rng,
        THREE.MathUtils.lerp(0.72, 0.86, padMaturity),
        THREE.MathUtils.lerp(0.90, 1.08, padMaturity),
      ),
      thickness: size * rngRange(
        rng,
        THREE.MathUtils.lerp(0.060, 0.082, padMaturity),
        THREE.MathUtils.lerp(0.090, 0.145, padMaturity),
      ),
      bend: rngRange(rng, -0.10, 0.10) * size * THREE.MathUtils.lerp(1.35, 0.85, padMaturity),
      shoulderBias: rngRange(
        rng,
        THREE.MathUtils.lerp(0.74, 0.86, padMaturity),
        THREE.MathUtils.lerp(0.98, 1.20, padMaturity),
      ),
      wobbleA: rngRange(rng, 0.010, THREE.MathUtils.lerp(0.026, 0.054, padMaturity)),
      wobbleB: rngRange(rng, 0.006, THREE.MathUtils.lerp(0.018, 0.036, padMaturity)),
      phase: rng() * Math.PI * 2,
      areolePhaseX: rng() * 9,
      areolePhaseY: rng() * 9,
      blush: rngRange(rng, 0.20, 0.54) * THREE.MathUtils.lerp(1.20, 0.82, padMaturity),
      padColor: padColor.clone().offsetHSL(rngRange(rng, -0.020, 0.026), rngRange(rng, -0.035, 0.055), rngRange(rng, -0.050, 0.050)),
      youngPadColor: youngPadColor.clone().offsetHSL(rngRange(rng, -0.012, 0.018), rngRange(rng, -0.020, 0.045), rngRange(rng, -0.020, 0.050)),
      cork: oldGrowth * padMaturity * smoothstep(0.54, 1.0, depthAge) * rngRange(rng, 0.35, 1.0),
    };
  }

  // A custom biconvex pad mesh: broad domed faces, a real rounded rim, and a
  // pear-shaped outline instead of a flat billboard or tube-like oval.
  function buildPad(spec) {
    // Floors low enough that mid/far LODs actually shed triangles — a pad at
    // 40m+ is a handful of pixels and doesn't need a 14x12 grid per side. The
    // biconvex dome shading comes from normals, so even the hero pad reads
    // smooth at 20x16.
    const vertical = scaledSegments(20, detailScale, 7);
    const across = scaledSegments(16, detailScale, 6);
    const rimSteps = scaledSegments(8, detailScale, 3);
    const positions = [];
    const colors = [];
    const spines = [];
    const indices = [];

    function colorAt(t, u, face, rim) {
      const profile = padProfile(t);
      const edge = smoothstep(0.74, 0.99, Math.abs(u)) * smoothstep(0.05, 0.94, profile);
      const tip = smoothstep(0.82, 1.0, t) + (1 - smoothstep(0.0, 0.12, t));
      const young = 1 - spec.age;
      const fleck = 0.92
        + 0.06 * Math.sin(u * 9.0 + t * 13.0 + spec.phase)
        + 0.04 * Math.sin(u * 21.0 - t * 7.0 + spec.phase * 1.7)
        + 0.05 * Math.max(0, face);
      const c = spec.padColor.clone().lerp(spec.youngPadColor, young * 0.55);
      c.offsetHSL(0, 0.018 * Math.sin(u * 2.4 + spec.phase), (fleck - 1) * 0.18);
      const basalCork = spec.cork * smoothstep(0.02, 0.44, 1 - t) * (0.72 + 0.28 * Math.max(0, -face));
      const scarring = basalCork * (0.58 + 0.42 * Math.sin(u * 8.0 + t * 13.0 + spec.phase));
      c.lerp(oldPadColor, THREE.MathUtils.clamp(basalCork * 0.66, 0, 0.72));
      c.lerp(dryScarColor, THREE.MathUtils.clamp(scarring * 0.24, 0, 0.34));
      c.lerp(rimBlush, THREE.MathUtils.clamp(((edge + rim * 0.55) * spec.blush + tip * 0.08) * (0.65 + young * 0.25), 0, 0.55));
      return c;
    }

    function pushVertex(x, y, z, t, u, face, rim = 0) {
      positions.push(x, y, z);
      const c = colorAt(t, u, face, rim);
      colors.push(c.r, c.g, c.b);

      const edgeFade = 1 - smoothstep(0.76, 1.0, Math.abs(u)) * 0.52;
      const faceFade = rim > 0 ? 0.52 : 1.0;
      const areoleStrength = (0.22 + (1 - spec.age) * 0.23 + Math.max(0, Math.abs(face)) * 0.14) * edgeFade * faceFade;
      spines.push(
        u * 3.1 + spec.areolePhaseX + Math.sin(t * Math.PI) * 0.28,
        t * 8.6 + spec.areolePhaseY + Math.sin(u * 2.4 + spec.phase) * 0.18,
        areoleStrength,
        2,
      );
      return positions.length / 3 - 1;
    }

    function surfacePoint(spec, t, u, faceSign) {
      const side = u < 0 ? -1 : 1;
      const halfWidth = padHalfWidth(spec, t, side);
      const absU = Math.abs(u);
      const y = spec.height * t;
      const widthPow = Math.pow(absU, 1.05);
      const centerX = padCenterX(spec, t);
      const x = centerX + Math.sign(u || side) * halfWidth * widthPow;
      const dome = Math.pow(Math.max(0, 1 - absU * absU), 0.58);
      const z = faceSign * padThickness(spec, t) * (0.20 + 0.80 * dome);
      return { x, y, z };
    }

    for (const faceSign of [1, -1]) {
      const start = positions.length / 3;
      for (let i = 0; i <= vertical; i++) {
        const t = i / vertical;
        for (let j = 0; j <= across; j++) {
          const u = (j / across) * 2 - 1;
          const p = surfacePoint(spec, t, u, faceSign);
          pushVertex(p.x, p.y, p.z, t, u, faceSign, 0);
        }
      }

      const stride = across + 1;
      for (let i = 0; i < vertical; i++) {
        for (let j = 0; j < across; j++) {
          const a = start + i * stride + j;
          const b = a + stride;
          if (faceSign > 0) {
            indices.push(a, a + 1, b, b, a + 1, b + 1);
          } else {
            indices.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
    }

    function addSideRim(side) {
      const start = positions.length / 3;
      for (let i = 0; i <= vertical; i++) {
        const t = i / vertical;
        const halfWidth = padHalfWidth(spec, t, side);
        const edgeThickness = padThickness(spec, t) * 0.20;
        const xCenter = padCenterX(spec, t) + side * halfWidth;
        for (let k = 0; k <= rimSteps; k++) {
          const phi = (k / rimSteps) * Math.PI;
          const x = xCenter + side * Math.sin(phi) * edgeThickness * 0.62;
          const y = spec.height * t;
          const z = Math.cos(phi) * edgeThickness;
          pushVertex(x, y, z, t, side, Math.cos(phi), 1);
        }
      }

      const stride = rimSteps + 1;
      for (let i = 0; i < vertical; i++) {
        for (let k = 0; k < rimSteps; k++) {
          const a = start + i * stride + k;
          const b = a + stride;
          if (side > 0) {
            indices.push(a, a + 1, b, b, a + 1, b + 1);
          } else {
            indices.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
    }

    function addEndRim(endT, endSign) {
      const start = positions.length / 3;
      for (let j = 0; j <= across; j++) {
        const u = (j / across) * 2 - 1;
        const front = surfacePoint(spec, endT, u, 1);
        const zAmp = Math.abs(front.z);
        for (let k = 0; k <= rimSteps; k++) {
          const phi = (k / rimSteps) * Math.PI;
          const x = front.x;
          const y = front.y + endSign * Math.sin(phi) * zAmp * 0.28;
          const z = Math.cos(phi) * zAmp;
          pushVertex(x, y, z, endT, u, Math.cos(phi), 1);
        }
      }

      const stride = rimSteps + 1;
      for (let j = 0; j < across; j++) {
        for (let k = 0; k < rimSteps; k++) {
          const a = start + j * stride + k;
          const b = a + stride;
          if (endSign > 0) {
            indices.push(a, b, a + 1, b, b + 1, a + 1);
          } else {
            indices.push(a, a + 1, b, b, a + 1, b + 1);
          }
        }
      }
    }

    addSideRim(-1);
    addSideRim(1);
    addEndRim(0, -1);
    addEndRim(1, 1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('cactusSpine', new THREE.Float32BufferAttribute(spines, 4));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  function buildFruit(r, height) {
    const g = new THREE.SphereGeometry(r, scaledSegments(10, detailScale, 6), scaledSegments(8, detailScale, 5));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / r;
      const taper = THREE.MathUtils.lerp(0.72, 0.48, smoothstep(0.05, 1.0, y));
      pos.setXYZ(
        i,
        pos.getX(i) * taper,
        pos.getY(i) * (height / (r * 2)),
        pos.getZ(i) * taper,
      );
    }
    g.translate(0, height * 0.5, 0);
    g.computeVertexNormals();
    colorGeometry(g, (i, p) => {
      const y = THREE.MathUtils.clamp(p.getY(i) / height, 0, 1);
      return fruitColor.clone().lerp(fruitBaseColor, (1 - y) * 0.38);
    });
    paintCactusSpines(g, [rng() * 4, rng() * 4, 0.18, 2]);
    return g;
  }

  function buildFlower(r) {
    const flowerParts = [];
    const center = new THREE.SphereGeometry(r * 0.38, scaledSegments(8, detailScale, 5), scaledSegments(5, detailScale, 4));
    paintSolid(center, new THREE.Color(0xf2c15a));
    flowerParts.push(center);

    const petalCount = rngInt(rng, 6, 8);
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * Math.PI * 2 + rngRange(rng, -0.12, 0.12);
      const petal = new THREE.SphereGeometry(
        r * rngRange(rng, 0.36, 0.48),
        scaledSegments(8, detailScale, 5),
        scaledSegments(5, detailScale, 4),
      );
      petal.scale(1.55, 0.48, 0.10);
      petal.rotateZ(a);
      petal.translate(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, 0);
      paintSolid(petal, flowerColor.clone().lerp(new THREE.Color(0xf6d38b), rng() * 0.22));
      flowerParts.push(petal);
    }
    const g = mergeGeometries(flowerParts);
    g.rotateX(-Math.PI * 0.5);
    return g;
  }

  function buildRootingCollar(size) {
    const collar = new THREE.CylinderGeometry(
      size * rngRange(rng, 0.12, 0.20),
      size * rngRange(rng, 0.16, 0.26),
      size * rngRange(rng, 0.020, 0.035),
      scaledSegments(10, detailScale, 6),
      1,
    );
    collar.translate(0, size * 0.010, 0);
    paintSolid(collar, dryScarColor.clone().lerp(oldPadColor, rngRange(rng, 0.20, 0.55)), [0, 0, 0.04, 2]);
    return collar;
  }

  function addRimGrowth(parentMat, spec, depth) {
    if (age < 0.42 || depth > 1 || !rngChance(rng, THREE.MathUtils.lerp(0.22, 0.82, maturity))) return;

    const count = rngInt(
      rng,
      1,
      depth === 0
        ? Math.round(THREE.MathUtils.lerp(3, 8, oldGrowth))
        : Math.round(THREE.MathUtils.lerp(2, 4, maturity)),
    );
    for (let k = 0; k < count; k++) {
      const side = rngRange(rng, -0.86, 0.86);
      const y = spec.height * rngRange(rng, 0.82, 0.98);
      const t = y / spec.height;
      const x = padCenterX(spec, t) + side * padHalfWidth(spec, t, side < 0 ? -1 : 1) * rngRange(rng, 0.74, 0.98);
      const z = rngRange(rng, -padThickness(spec, t) * 0.28, padThickness(spec, t) * 0.28);
      if (!flowering && !fruiting) continue;
      const isFlower = flowering && (!fruiting || rngChance(rng, THREE.MathUtils.lerp(0.04, 0.18, maturity)));
      const g = isFlower
        ? buildFlower(rngRange(rng, spec.size * 0.10, spec.size * 0.16))
        : buildFruit(rngRange(rng, spec.size * 0.075, spec.size * 0.12), rngRange(rng, spec.size * 0.18, spec.size * 0.30));
      g.translate(x, y, z);
      g.rotateZ(rngRange(rng, -0.28, 0.28));
      g.applyMatrix4(parentMat);
      parts.push(g);
    }
  }

  function grow(parentMat, size, depth, sideBias = 0) {
    if (padCount >= maxPads) return;
    padCount += 1;

    const spec = createPadSpec(size, depth);
    const padGeom = buildPad(spec);
    padGeom.applyMatrix4(parentMat);
    parts.push(padGeom);
    addRimGrowth(parentMat, spec, depth);

    if (depth <= 0 || padCount >= maxPads) return;

    const childCount = rngInt(rng, depth >= maxDepth - 1 ? 1 : 2, depth >= maxDepth - 1 ? 3 : 4);
    for (let i = 0; i < childCount; i++) {
      if (!rngChance(rng, childChance) || padCount >= maxPads) continue;
      const childSize = size * rngRange(
        rng,
        THREE.MathUtils.lerp(0.52, 0.64, maturity),
        THREE.MathUtils.lerp(0.72, 0.90, maturity),
      );
      const spread = childCount === 1 ? 0 : (i - (childCount - 1) / 2) / ((childCount - 1) / 2);
      const lateral = THREE.MathUtils.clamp(spread * 0.72 + sideBias * 0.28 + rngRange(rng, -0.28, 0.28), -0.92, 0.92);
      const attachY = spec.height * rngRange(
        rng,
        THREE.MathUtils.lerp(0.54, 0.68, depth / Math.max(1, maxDepth)),
        0.92,
      );
      const attachT = attachY / spec.height;
      const attachX = padCenterX(spec, attachT)
        + lateral * padHalfWidth(spec, attachT, lateral < 0 ? -1 : 1) * rngRange(rng, 0.52, 0.82);
      const attachZ = rngRange(rng, -padThickness(spec, attachT) * 0.48, padThickness(spec, attachT) * 0.48);

      const m = parentMat.clone();
      m.multiply(new THREE.Matrix4().makeTranslation(attachX, attachY, attachZ));
      m.multiply(new THREE.Matrix4().makeRotationY(rngRange(rng, -0.85, 0.85)));
      m.multiply(new THREE.Matrix4().makeRotationX(rngRange(rng, -0.46, 0.32)));
      m.multiply(new THREE.Matrix4().makeRotationZ(lateral * rngRange(rng, 0.38, 0.82) + rngRange(rng, -0.22, 0.22)));

      grow(m, childSize, depth - 1, lateral);
    }
  }

  const rootCount = rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(1, 4, maturity)),
    Math.round(THREE.MathUtils.lerp(2, 9, maturity + oldGrowth * 0.55)),
  );
  const colonySpread = baseSize * THREE.MathUtils.lerp(0.22, 2.25, maturity + oldGrowth * 0.45);
  for (let i = 0; i < rootCount; i++) {
    const spread = rootCount === 1 ? 0 : (i - (rootCount - 1) / 2) / ((rootCount - 1) / 2);
    const angle = (i / Math.max(1, rootCount)) * Math.PI * 2 + rngRange(rng, -0.55, 0.55);
    const radius = colonySpread * Math.sqrt(rng()) * rngRange(rng, 0.28, 1.0);
    const yaw = angle + Math.PI * 0.5 + rngRange(rng, -0.70, 0.70);
    const m = new THREE.Matrix4();
    m.multiply(new THREE.Matrix4().makeTranslation(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    m.multiply(new THREE.Matrix4().makeRotationY(yaw));
    m.multiply(new THREE.Matrix4().makeRotationX(rngRange(rng, -0.46, 0.18)));
    m.multiply(new THREE.Matrix4().makeRotationZ(spread * rngRange(rng, 0.38, 0.78) + rngRange(rng, -0.22, 0.22)));
    const rootDepth = Math.max(0, maxDepth - rngInt(rng, 0, age < 0.46 ? 2 : 1));
    if (!suppressCloneDetails && oldGrowth > 0.18 && detailScale > 0.42 && rngChance(rng, THREE.MathUtils.lerp(0.22, 0.74, oldGrowth))) {
      const collar = buildRootingCollar(baseSize);
      collar.applyMatrix4(m);
      parts.push(collar);
      rootingPadCount++;
    }
    grow(m, baseSize * rngRange(rng, 0.72, 1.12), rootDepth, spread);
  }

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  geom.userData.growthStage = age < 0.24 ? 'juvenile_pad_cluster' : age < 0.66 ? 'adult_spreading_clump' : 'old_rooting_thicket';
  geom.userData.form = 'pad_graph_clump';
  geom.userData.padCount = padCount;
  geom.userData.rootingPads = rootingPadCount;
  geom.userData.estimatedClumpWidth = colonySpread * 2 + baseSize * 1.6;
  geom.userData.estimatedClumpHeight = baseSize * (1 + maxDepth * 1.15);
  return geom;
}
