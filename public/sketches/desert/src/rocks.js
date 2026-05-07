import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { rngRange, rngPick } from './random.js';

// Procedural rock: continuous weathered ellipsoid with chipped faces,
// sediment bands, dark fissures, and vertex detail for the rock shader.
export function generateRock(rng, opts = {}) {
  const size = opts.size ?? rngRange(rng, 0.18, 0.9);
  const isBoulder = size > 0.5;
  const detailScale = opts.detailScale ?? 1;
  const widthSegments = Math.max(isBoulder ? 14 : 8, Math.round((isBoulder ? 28 : 16) * detailScale));
  const heightSegments = Math.max(isBoulder ? 8 : 5, Math.round((isBoulder ? 16 : 10) * detailScale));
  const geom = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const shapeNoise = createNoise3D(rng);
  const grainNoise = createNoise3D(rng);

  const xScale = rngRange(rng, 0.85, 1.45);
  const yScale = rngRange(rng, isBoulder ? 0.44 : 0.50, isBoulder ? 0.74 : 0.82);
  const zScale = rngRange(rng, 0.78, 1.38);
  const baseY = -size * yScale * rngRange(rng, 0.68, 0.82);
  const strataFreq = rngRange(rng, 8.0, 15.0);
  const strataTiltX = rngRange(rng, -0.9, 0.9);
  const strataTiltZ = rngRange(rng, -0.9, 0.9);
  const strataPhase = rngRange(rng, 0, Math.PI * 2);
  const chipPlanes = buildChipPlanes(rng, size, isBoulder ? 6 : 4);
  const crackPlanes = buildCrackPlanes(rng, size, isBoulder ? 5 : 3);

  const pos = geom.attributes.position;
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    dir.copy(v).normalize();

    const lobe = shapeNoise(dir.x * 1.05, dir.y * 1.05, dir.z * 1.05) * 0.16;
    const undulation = shapeNoise(dir.x * 2.7 + 11.0, dir.y * 2.7, dir.z * 2.7) * 0.085;
    const weathering = shapeNoise(dir.x * 6.0, dir.y * 6.0 - 7.0, dir.z * 6.0) * 0.025;
    const radius = size * (1.0 + lobe + undulation + weathering);

    v.copy(dir).multiplyScalar(radius);
    v.x *= xScale;
    v.y *= yScale;
    v.z *= zScale;

    const layerCoord = (v.y / size) * strataFreq + v.x * strataTiltX + v.z * strataTiltZ + strataPhase;
    const terrace = Math.sin(layerCoord) * Math.sin(layerCoord * 0.47 + 1.8);
    v.addScaledVector(dir, terrace * size * (isBoulder ? 0.018 : 0.012));

    for (const plane of chipPlanes) {
      const d = v.dot(plane.normal) - plane.offset;
      if (d > 0) v.addScaledVector(plane.normal, -d * plane.strength);
    }

    if (v.y < baseY) {
      const crush = baseY - v.y;
      v.y = baseY - crush * 0.12;
      const spread = 1 + Math.min(0.16, crush / size * 0.08);
      v.x *= spread;
      v.z *= spread;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geom.computeVertexNormals();

  // Vertex color: desert rock palettes, with shaded lower faces and dusty tops.
  const palettes = [
    [new THREE.Color(0x96704f), new THREE.Color(0x5f4430), new THREE.Color(0xc2a477)], // tan
    [new THREE.Color(0x9b684d), new THREE.Color(0x603b2b), new THREE.Color(0xbf8460)], // red sandstone
    [new THREE.Color(0x837768), new THREE.Color(0x514a40), new THREE.Color(0xb9ab94)], // gray-tan
    [new THREE.Color(0x7c5b3d), new THREE.Color(0x46331f), new THREE.Color(0xaa8155)], // dark brown
  ];
  const [light, dark, dust] = rngPick(rng, palettes);
  const colors = new Float32Array(pos.count * 3);
  const detail = new Float32Array(pos.count * 4);

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const normal = geom.attributes.normal;
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normal, i);
    const y = v.y;
    const u = (y - minY) / (maxY - minY || 1);
    const layerCoord = (y / size) * strataFreq + v.x * strataTiltX + v.z * strataTiltZ + strataPhase;
    const band = 1 - smoothstep(0.02, 0.16, Math.abs(Math.sin(layerCoord)));
    const grain = grainNoise(v.x * 18, v.y * 18, v.z * 18) * 0.5 + 0.5;
    const crack = crackAmount(v, crackPlanes, size);
    const topDust = smoothstep(0.15, 0.92, n.y) * smoothstep(0.28, 1.0, u);

    c.copy(dark).lerp(light, 0.24 + u * 0.56 + grain * 0.12);
    c.lerp(dust, topDust * 0.30 + band * 0.13);
    c.multiplyScalar(THREE.MathUtils.lerp(0.68, 1.08, n.y * 0.5 + 0.5));
    c.multiplyScalar(1.0 - crack * 0.32);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    detail[i * 4] = u;
    detail[i * 4 + 1] = band;
    detail[i * 4 + 2] = crack;
    detail[i * 4 + 3] = grain;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('rockDetail', new THREE.BufferAttribute(detail, 4));

  return geom;
}

function buildChipPlanes(rng, size, count) {
  const planes = [];
  for (let i = 0; i < count; i++) {
    const normal = new THREE.Vector3(
      rngRange(rng, -1, 1),
      rngRange(rng, -0.25, 0.85),
      rngRange(rng, -1, 1),
    ).normalize();
    planes.push({
      normal,
      offset: size * rngRange(rng, 0.42, 0.86),
      strength: rngRange(rng, 0.45, 0.88),
    });
  }
  return planes;
}

function buildCrackPlanes(rng, size, count) {
  const planes = [];
  for (let i = 0; i < count; i++) {
    planes.push({
      normal: new THREE.Vector3(
        rngRange(rng, -1, 1),
        rngRange(rng, -0.35, 0.65),
        rngRange(rng, -1, 1),
      ).normalize(),
      offset: size * rngRange(rng, -0.45, 0.45),
      width: rngRange(rng, 0.008, 0.026),
    });
  }
  return planes;
}

function crackAmount(v, planes, size) {
  let amount = 0;
  for (const plane of planes) {
    const d = Math.abs(v.dot(plane.normal) - plane.offset);
    amount = Math.max(amount, 1 - smoothstep(plane.width * size, plane.width * size * 7.0, d));
  }
  return amount;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
