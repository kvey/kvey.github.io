import * as THREE from 'three';
import { sweepRibbedTube, mergeGeometries, paintGeometry, scaledSegments } from './common.js';
import { rngRange, rngInt, rngChance } from '../random.js';

const UP = new THREE.Vector3(0, 1, 0);
const TREE_PART_BARK = 0;
const TREE_PART_LEAF = 1;
const TREE_PART_POD = 2;
const TREE_PART_THORN = 3;

export function safeSideVector(dir) {
  const side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-5) side.set(1, 0, 0);
  return side.normalize();
}

function paintTreeDetail(geom, value = [TREE_PART_BARK, 0, 0, 0]) {
  const count = geom.attributes.position.count;
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4] = value[0];
    arr[i * 4 + 1] = value[1];
    arr[i * 4 + 2] = value[2];
    arr[i * 4 + 3] = value[3];
  }
  geom.setAttribute('treeDetail', new THREE.BufferAttribute(arr, 4));
}

export function makeBranchSegment(rng, {
  start,
  end,
  r0,
  r1,
  colorBase,
  colorTip,
  curveScale = 0.08,
  twistScale = 0,
  sag = 0,
  segmentsAround = 8,
  ribCount = 0,
  ribDepth = 0,
  colorNoise = 0.08,
  detailScale = 1,
}) {
  const dir = end.clone().sub(start);
  const len = dir.length();
  if (len < 1e-3) return null;

  const side = safeSideVector(dir);
  const fwd = new THREE.Vector3().crossVectors(side, dir).normalize();
  const points = [start];
  if (twistScale > 0) {
    const p1 = start.clone().lerp(end, 0.34)
      .addScaledVector(side, len * rngRange(rng, -curveScale, curveScale))
      .addScaledVector(fwd, len * rngRange(rng, -twistScale, twistScale));
    const p2 = start.clone().lerp(end, 0.70)
      .addScaledVector(side, len * rngRange(rng, -twistScale, twistScale))
      .addScaledVector(fwd, len * rngRange(rng, -curveScale, curveScale));
    p1.y += len * sag * 0.55 + rngRange(rng, -0.025, 0.025) * len;
    p2.y += len * sag + rngRange(rng, -0.025, 0.025) * len;
    points.push(p1, p2);
  } else {
    const mid = start.clone().lerp(end, 0.5)
      .addScaledVector(side, len * rngRange(rng, -curveScale, curveScale));
    mid.y += len * sag + rngRange(rng, -0.025, 0.025) * len;
    points.push(mid);
  }
  points.push(end);

  const curve = new THREE.CatmullRomCurve3(points);
  const segs = scaledSegments(Math.floor(len * 9), detailScale, 5);

  const geom = sweepRibbedTube({
    curve,
    segmentsAlong: segs,
    segmentsAround,
    ribCount,
    ribDepth,
    radiusFn: (t) => THREE.MathUtils.lerp(r0, r1, t),
    colorFn: (t, a) => {
      const barkBand = ribCount > 0 ? Math.sin(a * ribCount + t * 8.0) * 0.045 : 0;
      const c = colorBase.clone().lerp(colorTip, t);
      c.multiplyScalar(1 + barkBand + rngRange(rng, -colorNoise, colorNoise));
      return c;
    },
  });
  paintTreeDetail(geom, [TREE_PART_BARK, 0, 0, rng()]);
  return geom;
}

export function makeLeafletSpray(rng, {
  center,
  axis,
  color,
  sprigs = 5,
  pairs = 6,
  spread = 0.36,
  sprigLength = 0.42,
  leafletLength = 0.055,
  leafletWidth = 0.018,
  droop = 0,
  density = 1,
}) {
  const positions = [];
  const colors = [];
  const indices = [];
  const main = axis.clone();
  if (main.lengthSq() < 1e-5) main.copy(UP);
  main.normalize();

  const side = safeSideVector(main);
  const forward = new THREE.Vector3().crossVectors(side, main).normalize();

  function addLeaflet(mid, along, lateral, halfLen, halfWidth, col) {
    const base = positions.length / 3;
    const leafletId = rng();
    const p0 = mid.clone().addScaledVector(along, halfLen);
    const p1 = mid.clone().addScaledVector(lateral, halfWidth);
    const p2 = mid.clone().addScaledVector(along, -halfLen);
    const p3 = mid.clone().addScaledVector(lateral, -halfWidth);
    positions.push(
      p0.x, p0.y, p0.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
    );
    for (let i = 0; i < 4; i++) colors.push(col.r, col.g, col.b);
    detail.push(
      TREE_PART_LEAF, 1.0, 0.0, leafletId,
      TREE_PART_LEAF, 0.5, 1.0, leafletId,
      TREE_PART_LEAF, 0.0, 0.0, leafletId,
      TREE_PART_LEAF, 0.5, -1.0, leafletId,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const sprigCount = Math.max(1, Math.floor(sprigs * density));
  const detail = [];
  for (let s = 0; s < sprigCount; s++) {
    const angle = rng() * Math.PI * 2;
    const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle));
    const base = center.clone()
      .addScaledVector(radial, rngRange(rng, 0, spread * 0.38))
      .addScaledVector(UP, rngRange(rng, -spread * 0.10, spread * 0.16));
    const sprigDir = main.clone().multiplyScalar(rngRange(rng, 0.18, 0.58))
      .addScaledVector(radial, rngRange(rng, 0.65, 1.05))
      .addScaledVector(UP, rngRange(rng, -droop, 0.26))
      .normalize();
    const sprigSide = safeSideVector(sprigDir);
    const len = sprigLength * rngRange(rng, 0.65, 1.18);
    const pairCount = Math.max(2, rngInt(rng, Math.max(2, pairs - 2), pairs + 2));

    for (let p = 0; p < pairCount; p++) {
      const t = (p + 0.5) / pairCount;
      const rachis = base.clone()
        .addScaledVector(sprigDir, len * (t - 0.15))
        .addScaledVector(UP, -droop * len * t * t * 0.28);
      const leafLen = leafletLength * rngRange(rng, 0.75, 1.25) * (1 - t * 0.18);
      const leafWidth = leafletWidth * rngRange(rng, 0.75, 1.25);
      const tint = color.clone().multiplyScalar(rngRange(rng, 0.78, 1.18));
      const offset = leafWidth * rngRange(rng, 1.2, 2.0);
      addLeaflet(rachis.clone().addScaledVector(sprigSide, offset), sprigDir, sprigSide, leafLen, leafWidth, tint);
      addLeaflet(rachis.clone().addScaledVector(sprigSide, -offset), sprigDir, sprigSide, leafLen, leafWidth, tint);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute('treeDetail', new THREE.Float32BufferAttribute(detail, 4));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function makeThornCluster(rng, {
  center,
  axis,
  count = 4,
  spread = 0.18,
  length = 0.055,
  color = new THREE.Color(0xd7c798),
  detailScale = 1,
}) {
  const parts = [];
  const main = axis.clone().normalize();
  if (main.lengthSq() < 1e-5) main.copy(UP);
  const side = safeSideVector(main);
  const forward = new THREE.Vector3().crossVectors(side, main).normalize();

  for (let i = 0; i < count; i++) {
    if (!rngChance(rng, 0.75)) continue;
    const angle = rng() * Math.PI * 2;
    const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle)).normalize();
    const dir = radial.clone().addScaledVector(main, rngRange(rng, -0.2, 0.35)).normalize();
    const at = center.clone()
      .addScaledVector(main, rngRange(rng, -spread, spread))
      .addScaledVector(radial, rngRange(rng, 0.01, 0.04));
    const h = length * rngRange(rng, 0.65, 1.35);
    const thorn = new THREE.ConeGeometry(h * 0.18, h, scaledSegments(5, detailScale, 4), 1);
    thorn.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
    thorn.translate(at.x + dir.x * h * 0.45, at.y + dir.y * h * 0.45, at.z + dir.z * h * 0.45);
    paintGeometry(thorn, color.clone().multiplyScalar(rngRange(rng, 0.85, 1.12)));
    paintTreeDetail(thorn, [TREE_PART_THORN, 0, 0, rng()]);
    parts.push(thorn);
  }

  return parts.length > 0 ? mergeGeometries(parts) : null;
}

export function makePodCluster(rng, {
  center,
  axis = new THREE.Vector3(0, -1, 0),
  count = 5,
  color = new THREE.Color(0xb98a45),
  lengthRange = [0.18, 0.34],
  radiusRange = [0.009, 0.013],
  curl = 0.09,
  segmentsAlong = 5,
}) {
  const parts = [];
  const side = safeSideVector(axis);
  const forward = new THREE.Vector3().crossVectors(side, axis).normalize();

  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const radial = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(forward, Math.sin(a));
    const base = center.clone()
      .addScaledVector(radial, rngRange(rng, 0.02, 0.16))
      .addScaledVector(UP, rngRange(rng, -0.05, 0.08));
    const len = rngRange(rng, lengthRange[0], lengthRange[1]);
    const p1 = base.clone().addScaledVector(radial, rngRange(rng, -curl * 0.45, curl * 0.45)).addScaledVector(UP, -len * 0.34);
    const p2 = base.clone().addScaledVector(radial, rngRange(rng, -curl, curl)).addScaledVector(UP, -len);
    const curve = new THREE.CatmullRomCurve3([base, p1, p2]);
    const pod = sweepRibbedTube({
      curve,
      segmentsAlong,
      segmentsAround: 5,
      radiusFn: (t) => rngRange(rng, radiusRange[0], radiusRange[1]) * (1 - t * 0.18),
      colorFn: (t) => color.clone().multiplyScalar(rngRange(rng, 0.85, 1.12) * (1 - t * 0.08)),
    });
    const podDetail = new Float32Array(pod.attributes.position.count * 4);
    const rings = segmentsAlong + 1;
    const stride = 6;
    const podId = rng();
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1);
      for (let j = 0; j < stride; j++) {
        const idx = ring * stride + j;
        const around = j / (stride - 1);
        podDetail[idx * 4] = TREE_PART_POD;
        podDetail[idx * 4 + 1] = t;
        podDetail[idx * 4 + 2] = around;
        podDetail[idx * 4 + 3] = podId;
      }
    }
    pod.setAttribute('treeDetail', new THREE.BufferAttribute(podDetail, 4));
    parts.push(pod);
  }

  return parts.length > 0 ? mergeGeometries(parts) : null;
}
