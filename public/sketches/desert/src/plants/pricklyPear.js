import * as THREE from 'three';
import { mergeGeometries, paintCactusSpines, resolveDetailScale, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';
import { resolveProportionOracle } from '../proportions.js';

// Opuntia: a clump of flattened, pear-shaped pads. Pads grow from areoles
// near the shoulder of an older pad, then fan outward into a dense low shrub.
export function generatePricklyPear(rng, opts = {}) {
  const detailScale = resolveDetailScale(opts);
  const proportions = resolveProportionOracle(opts);
  const baseSize = rngRange(rng, proportions.pricklyPear.padBaseSize[0], proportions.pricklyPear.padBaseSize[1]);
  const padHue = rngRange(rng, 0.285, 0.335);
  const padColor = new THREE.Color().setHSL(padHue, rngRange(rng, 0.22, 0.36), rngRange(rng, 0.36, 0.44));
  const youngPadColor = padColor.clone().offsetHSL(0.018, 0.08, 0.08);
  const rimBlush = new THREE.Color().setHSL(rngRange(rng, 0.92, 0.98), 0.28, 0.36);
  const fruitColor = new THREE.Color().setHSL(rngRange(rng, 0.94, 0.985), 0.55, 0.36);
  const flowerColor = new THREE.Color().setHSL(rngRange(rng, 0.10, 0.14), 0.76, 0.58);
  const maxDepth = rngInt(rng, 3, 4);
  const childChance = rngRange(rng, 0.58, 0.82);
  const maxPads = opts.maxPads ?? rngInt(rng, 12, 20);

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
    const age = 1 - depth / maxDepth;
    return {
      size,
      age,
      height: size * rngRange(rng, 2.25, 2.82),
      widthScale: rngRange(rng, 0.86, 1.08),
      thickness: size * rngRange(rng, 0.082, 0.135),
      bend: rngRange(rng, -0.10, 0.10) * size,
      shoulderBias: rngRange(rng, 0.86, 1.20),
      wobbleA: rngRange(rng, 0.018, 0.048),
      wobbleB: rngRange(rng, 0.010, 0.032),
      phase: rng() * Math.PI * 2,
      areolePhaseX: rng() * 9,
      areolePhaseY: rng() * 9,
      blush: rngRange(rng, 0.20, 0.54),
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
        const c = padColor.clone().lerp(youngPadColor, young * 0.55);
        c.offsetHSL(0, 0.02 * Math.sin(a + spec.phase), (sunFleck - 1) * 0.14);
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
      return fruitColor.clone().lerp(new THREE.Color(0xd18a55), (1 - y) * 0.32);
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
    if (depth > 1 || !rngChance(rng, 0.62)) return;

    const count = rngInt(rng, 1, depth === 0 ? 5 : 3);
    for (let k = 0; k < count; k++) {
      const side = rngRange(rng, -0.86, 0.86);
      const y = spec.height * rngRange(rng, 0.82, 0.98);
      const profile = Math.pow(Math.sin(Math.PI * (y / spec.height)), 0.48);
      const x = side * spec.size * spec.widthScale * profile * rngRange(rng, 0.72, 0.96);
      const z = rngRange(rng, -0.010, 0.010);
      const isFlower = rngChance(rng, 0.25);
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

    const childCount = rngInt(rng, depth >= maxDepth - 1 ? 1 : 2, depth >= maxDepth - 1 ? 2 : 3);
    for (let i = 0; i < childCount; i++) {
      if (!rngChance(rng, childChance) || padCount >= maxPads) continue;
      const childSize = size * rngRange(rng, 0.64, 0.88);
      const spread = childCount === 1 ? 0 : (i - (childCount - 1) / 2) / ((childCount - 1) / 2);
      const lateral = THREE.MathUtils.clamp(spread * 0.72 + sideBias * 0.28 + rngRange(rng, -0.28, 0.28), -0.92, 0.92);
      const attachY = spec.height * rngRange(rng, 0.68, 0.92);
      const attachProfile = Math.pow(Math.sin(Math.PI * (attachY / spec.height)), 0.48);
      const attachX = lateral * spec.size * spec.widthScale * attachProfile * rngRange(rng, 0.48, 0.78);
      const attachZ = rngRange(rng, -spec.thickness * 0.35, spec.thickness * 0.35);

      const m = parentMat.clone();
      m.multiply(new THREE.Matrix4().makeTranslation(attachX, attachY, attachZ));
      m.multiply(new THREE.Matrix4().makeRotationY(rngRange(rng, -0.85, 0.85)));
      m.multiply(new THREE.Matrix4().makeRotationX(rngRange(rng, -0.34, 0.34)));
      m.multiply(new THREE.Matrix4().makeRotationZ(lateral * rngRange(rng, 0.28, 0.68) + rngRange(rng, -0.18, 0.18)));

      grow(m, childSize, depth - 1, lateral);
    }
  }

  const rootCount = rngInt(rng, 2, 4);
  for (let i = 0; i < rootCount; i++) {
    const spread = rootCount === 1 ? 0 : (i - (rootCount - 1) / 2) / ((rootCount - 1) / 2);
    const yaw = spread * rngRange(rng, 0.55, 1.15) + rngRange(rng, -0.24, 0.24);
    const m = new THREE.Matrix4();
    m.multiply(new THREE.Matrix4().makeTranslation(spread * baseSize * rngRange(rng, 0.18, 0.38), 0, rngRange(rng, -0.04, 0.06)));
    m.multiply(new THREE.Matrix4().makeRotationY(yaw));
    m.multiply(new THREE.Matrix4().makeRotationX(rngRange(rng, -0.28, 0.20)));
    m.multiply(new THREE.Matrix4().makeRotationZ(spread * rngRange(rng, 0.22, 0.48) + rngRange(rng, -0.12, 0.12)));
    grow(m, baseSize * rngRange(rng, 0.78, 1.08), maxDepth - rngInt(rng, 0, 1), spread);
  }

  return mergeGeometries(parts);
}
