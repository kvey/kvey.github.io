import * as THREE from 'three';
import { mergeGeometries, paintCactusSpines, resolveDetailScale, resolvePlantAge, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Opuntia: a clump of flattened, pear-shaped pads. Pads grow from areoles
// near the shoulder of an older pad, then fan outward into a dense low shrub.
export function generatePricklyPear(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  // Lifecycle scalar: young plants are a few tender pads, while old clumps
  // spread into branched thickets with thicker basal pads and more fruit.
  const age = resolvePlantAge(rng, opts, 0.70);
  const maturity = THREE.MathUtils.smoothstep(age, 0.18, 0.78);
  const oldGrowth = THREE.MathUtils.smoothstep(age, 0.66, 1.0);
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
  const maxPads = opts.maxPads ?? rngInt(
    rng,
    Math.round(THREE.MathUtils.lerp(4, 16, maturity)),
    Math.round(THREE.MathUtils.lerp(7, 38, maturity + oldGrowth * 0.38)),
  );

  const parts = [];
  let padCount = 0;

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

  // A custom pad mesh keeps the broad faces almost flat, pinches the edge thin,
  // and makes the top shoulder broader than the base like real Opuntia pads.
  function buildPad(spec) {
    const rings = scaledSegments(18, detailScale, 10);
    const radial = scaledSegments(30, detailScale, 16);
    const positions = [];
    const colors = [];
    const spines = [];
    const indices = [];

    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const profile = Math.pow(Math.sin(Math.PI * t), 0.48);
      const baseNeck = THREE.MathUtils.lerp(0.58, 1.0, smoothstep(0.06, 0.28, t));
      const topShoulder = THREE.MathUtils.lerp(0.84, spec.shoulderBias, smoothstep(0.45, 0.88, t));
      const halfWidth = spec.size * spec.widthScale * profile * baseNeck * topShoulder;
      const halfThickness = spec.thickness * Math.pow(profile, 0.68) * (0.88 + 0.12 * Math.sin(Math.PI * t));
      const centerX = spec.bend * Math.sin(Math.PI * t) * (0.6 + 0.4 * t);
      const y = spec.height * t;

      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const side = Math.cos(a);
        const face = Math.sin(a);
        const edgeWobble = 1
          + spec.wobbleA * Math.sin(a * 3 + spec.phase + t * 2.1)
          + spec.wobbleB * Math.sin(a * 5 - spec.phase * 0.7 + t * 4.6);
        const x = centerX + side * halfWidth * edgeWobble;
        const z = face * halfThickness * (0.82 + 0.18 * (1 - Math.abs(side)));
        positions.push(x, y, z);

        const rim = smoothstep(0.74, 0.99, Math.abs(side)) * smoothstep(0.05, 0.94, profile);
        const tip = smoothstep(0.82, 1.0, t) + (1 - smoothstep(0.0, 0.12, t));
        const young = 1 - spec.age;
        const sunFleck = 0.88 + rng() * 0.18 + 0.08 * Math.max(0, face);
        const c = spec.padColor.clone().lerp(spec.youngPadColor, young * 0.55);
        c.offsetHSL(0, 0.02 * Math.sin(a + spec.phase), (sunFleck - 1) * 0.14);
        const basalCork = spec.cork * smoothstep(0.02, 0.44, 1 - t) * (0.65 + 0.35 * Math.max(0, -face));
        const scarring = basalCork * (0.58 + 0.42 * Math.sin(a * 7.0 + t * 13.0 + spec.phase));
        c.lerp(oldPadColor, THREE.MathUtils.clamp(basalCork * 0.66, 0, 0.72));
        c.lerp(dryScarColor, THREE.MathUtils.clamp(scarring * 0.24, 0, 0.34));
        c.lerp(rimBlush, THREE.MathUtils.clamp((rim * spec.blush + tip * 0.08) * (0.65 + young * 0.25), 0, 0.55));
        colors.push(c.r, c.g, c.b);

        const faceWeight = smoothstep(0.18, 0.96, Math.abs(face));
        const rimFade = 1 - rim * 0.44;
        const areoleStrength = (0.20 + young * 0.26 + faceWeight * 0.18) * rimFade;
        spines.push(
          x / (spec.size * 0.36) + spec.areolePhaseX + t * 0.45,
          t * 8.2 + Math.sin(a) * 0.42 + spec.areolePhaseY,
          areoleStrength,
          2,
        );
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
      const profile = Math.pow(Math.sin(Math.PI * (y / spec.height)), 0.48);
      const x = side * spec.size * spec.widthScale * profile * rngRange(rng, 0.72, 0.96);
      const z = rngRange(rng, -0.010, 0.010);
      const isFlower = rngChance(rng, THREE.MathUtils.lerp(0.04, 0.18, maturity));
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
      const attachProfile = Math.pow(Math.sin(Math.PI * (attachY / spec.height)), 0.48);
      const attachX = lateral * spec.size * spec.widthScale * attachProfile * rngRange(rng, 0.48, 0.78);
      const attachZ = rngRange(rng, -spec.thickness * 0.35, spec.thickness * 0.35);

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
    grow(m, baseSize * rngRange(rng, 0.72, 1.12), rootDepth, spread);
  }

  const geom = mergeGeometries(parts);
  geom.userData.age = age;
  return geom;
}
