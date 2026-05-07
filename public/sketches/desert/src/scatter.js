import * as THREE from 'three';
import { mulberry32, rngRange } from './random.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEFAULT_PLANT_LOD_LEVELS = [
  { name: 'near', distance: 45, detailScale: 1, castShadow: true },
  { name: 'mid', distance: 95, detailScale: 0.72, castShadow: false },
  { name: 'far', distance: Infinity, detailScale: 0.48, castShadow: false },
];

// Pre-build N variant geometries from a generator, then scatter them as
// InstancedMeshes across the terrain.
//
// generator(rng, opts) -> BufferGeometry  (with vertex colors)
// material            shared MeshStandardMaterial (vertexColors:true)
// terrain             { sample, slope, size }
// densityPerArea      target instances per (m^2 of terrain)
// maxSlope            reject placements where terrain slope > this
// minHeight/maxHeight terrain elevation gate (e.g. avoid washes for saguaros)
// candidateFilter(ctx) optional hook to reject/weight specific candidates.
// onPlace(mat, rng, i) optional hook to tweak the per-instance matrix
// variantCount        how many unique geometries to bake (more = more variety)
// lodLevels           optional [{ name, distance, detailScale, castShadow }]
export function scatterPlants({
  generator,
  generatorOpts = {},
  material,
  terrain,
  densityPerArea = 0.01,
  maxSlope = 1.0,
  minHeight = -Infinity,
  maxHeight = Infinity,
  scaleRange = [0.9, 1.15],
  yawRandom = true,
  variantCount = 6,
  seed = 1,
  geometrySeed = seed,
  parent,
  castShadow = true,
  receiveShadow = true,
  lodLevels = null,
  attemptMultiplier = 6,
  candidateFilter = null,
  onPlace = null,
}) {
  const rng = mulberry32(seed);
  const geometryRng = mulberry32(geometrySeed);
  const half = terrain.size / 2;
  const area = terrain.size * terrain.size;
  const count = Math.max(0, Math.floor(area * densityPerArea));
  if (count === 0) return [];

  const levels = (lodLevels && lodLevels.length > 0)
    ? lodLevels
    : DEFAULT_PLANT_LOD_LEVELS;

  // Prepare variant specs. Geometry is generated lazily after placement, only
  // for LOD/variant buckets that actually receive instances.
  const variants = [];
  for (let i = 0; i < variantCount; i++) {
    const baseOpts = typeof generatorOpts === 'function'
      ? generatorOpts(geometryRng, i)
      : generatorOpts;
    const variantSeed = Math.floor(geometryRng() * 0xffffffff);
    variants.push({
      seed: variantSeed,
      optsByLod: levels.map((level, lodIndex) => ({
        ...baseOpts,
        detailScale: level.detailScale ?? 1,
        lodName: level.name ?? `lod-${lodIndex}`,
      })),
    });
  }

  // Bucket placement matrices per variant. Store raw elements to avoid
  // allocating one Matrix4 per accepted candidate.
  const buckets = variants.map(() => []);
  const tmpMat = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  let attempts = 0;
  let placed = 0;
  const maxAttempts = count * attemptMultiplier;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = rngRange(rng, -half + 1, half - 1);
    const z = rngRange(rng, -half + 1, half - 1);
    const terrainInfo = terrain.sampleInfo ? terrain.sampleInfo(x, z, 0.6) : null;
    const h = terrainInfo?.height ?? terrain.sample(x, z);
    if (h < minHeight || h > maxHeight) continue;
    const s = terrainInfo?.slope ?? terrain.slope(x, z, 0.6);
    if (s > maxSlope) continue;
    const variantIdx = Math.floor(rng() * variantCount);
    const lodIdx = 0;
    const variantOpts = variants[variantIdx].optsByLod[lodIdx];
    const sc = rngRange(rng, scaleRange[0], scaleRange[1]);
    if (candidateFilter) {
      const accepted = candidateFilter({
        x,
        z,
        height: h,
        slope: s,
        terrainInfo,
        scale: sc,
        lodIndex: lodIdx,
        lodLevel: levels[lodIdx],
        variantIdx,
        variantOpts,
        rng,
        placed,
        attempts,
      });
      if (!accepted) continue;
    }

    pos.set(x, h, z);
    const yaw = yawRandom ? rng() * Math.PI * 2 : 0;
    quat.setFromAxisAngle(Y_AXIS, yaw);
    scale.set(sc, sc, sc);
    tmpMat.compose(pos, quat, scale);

    if (onPlace) {
      onPlace(tmpMat, rng, placed, {
        x,
        z,
        height: h,
        slope: s,
        terrainInfo,
        scale: sc,
        lodIndex: lodIdx,
        lodLevel: levels[lodIdx],
        variantIdx,
        variantOpts,
      });
    }

    const bucket = buckets[variantIdx];
    const elements = tmpMat.elements;
    for (let e = 0; e < 16; e++) bucket.push(elements[e]);
    placed++;
  }

  // Build a Three.js LOD object per non-empty variant. Each LOD level renders
  // the same instance matrices with a different geometry detail scale.
  const objects = [];
  const center = new THREE.Vector3();
  for (let i = 0; i < variants.length; i++) {
    const bucket = buckets[i];
    if (bucket.length === 0) continue;
    const instanceCount = bucket.length / 16;
    center.set(0, 0, 0);
    for (let k = 0; k < instanceCount; k++) {
      const offset = k * 16;
      center.x += bucket[offset + 12];
      center.y += bucket[offset + 13];
      center.z += bucket[offset + 14];
    }
    center.multiplyScalar(1 / instanceCount);

    const lod = new THREE.LOD();
    lod.position.copy(center);
    lod.name = 'plant-lod';
    lod.userData.lodLevels = levels.map((level, lodIndex) => ({
      name: level.name ?? `lod-${lodIndex}`,
      distance: level.distance ?? Infinity,
    }));

    for (let lodIdx = 0; lodIdx < levels.length; lodIdx++) {
      const level = levels[lodIdx];
      const geometry = generator(mulberry32(variants[i].seed), variants[i].optsByLod[lodIdx]);
      const inst = new THREE.InstancedMesh(geometry, material, instanceCount);
      inst.castShadow = level.castShadow ?? castShadow;
      inst.receiveShadow = level.receiveShadow ?? receiveShadow;
      inst.userData.lod = level.name ?? `lod-${lodIdx}`;
      inst.userData.lodDistance = level.distance ?? Infinity;
      for (let k = 0; k < instanceCount; k++) {
        tmpMat.fromArray(bucket, k * 16);
        tmpMat.elements[12] -= center.x;
        tmpMat.elements[13] -= center.y;
        tmpMat.elements[14] -= center.z;
        inst.setMatrixAt(k, tmpMat);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      lod.addLevel(inst, lodStartDistance(lodIdx));
    }
    parent.add(lod);
    objects.push(lod);
  }
  return objects;

  function lodStartDistance(lodIdx) {
    if (lodIdx === 0) return 0;
    return levels[lodIdx - 1].distance ?? 0;
  }
}
