import * as THREE from 'three';
import { mulberry32, rngRange } from './random.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

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
// lodOrigin           optional Vector3-like camera position for distance LOD
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
  parent,
  castShadow = true,
  receiveShadow = true,
  lodLevels = null,
  lodOrigin = null,
  attemptMultiplier = 6,
  candidateFilter = null,
  onPlace = null,
}) {
  const rng = mulberry32(seed);
  const half = terrain.size / 2;
  const area = terrain.size * terrain.size;
  const count = Math.max(0, Math.floor(area * densityPerArea));
  if (count === 0) return [];

  const levels = (lodLevels && lodLevels.length > 0)
    ? lodLevels
    : [{ name: 'full', distance: Infinity, detailScale: 1 }];
  const lodDistanceSq = levels.map(level => {
    const distance = level.distance ?? Infinity;
    return distance * distance;
  });

  // Prepare variant specs. Geometry is generated lazily after placement, only
  // for LOD/variant buckets that actually receive instances.
  const variants = [];
  for (let i = 0; i < variantCount; i++) {
    const baseOpts = typeof generatorOpts === 'function'
      ? generatorOpts(rng, i)
      : generatorOpts;
    const variantSeed = Math.floor(rng() * 0xffffffff);
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
  const buckets = levels.map(() => variants.map(() => []));
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
    const lodIdx = chooseLod(x, h, z);
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

    const bucket = buckets[lodIdx][variantIdx];
    const elements = tmpMat.elements;
    for (let e = 0; e < 16; e++) bucket.push(elements[e]);
    placed++;
  }

  // Build InstancedMesh per non-empty variant.
  const meshes = [];
  for (let lodIdx = 0; lodIdx < levels.length; lodIdx++) {
    const level = levels[lodIdx];
    for (let i = 0; i < variants.length; i++) {
      if (buckets[lodIdx][i].length === 0) continue;
      const instanceCount = buckets[lodIdx][i].length / 16;
      const geometry = generator(mulberry32(variants[i].seed), variants[i].optsByLod[lodIdx]);
      const inst = new THREE.InstancedMesh(geometry, material, instanceCount);
      inst.castShadow = level.castShadow ?? castShadow;
      inst.receiveShadow = level.receiveShadow ?? receiveShadow;
      inst.userData.lod = level.name ?? `lod-${lodIdx}`;
      for (let k = 0; k < instanceCount; k++) {
        tmpMat.fromArray(buckets[lodIdx][i], k * 16);
        inst.setMatrixAt(k, tmpMat);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      parent.add(inst);
      meshes.push(inst);
    }
  }
  return meshes;

  function chooseLod(x, y, z) {
    if (!lodOrigin || levels.length === 1) return 0;
    const dx = x - lodOrigin.x;
    const dy = y - (lodOrigin.y ?? 0);
    const dz = z - lodOrigin.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    for (let i = 0; i < lodDistanceSq.length; i++) {
      if (d2 <= lodDistanceSq[i]) return i;
    }
    return levels.length - 1;
  }
}
