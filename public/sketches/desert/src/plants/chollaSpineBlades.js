import * as THREE from 'three';

// Mode flag the cactus spine material switches into for cholla-specific spine
// blades. Mode 10 belongs to saguaro/barrel; cholla gets its own band so the
// two pipelines can diverge (different bezier, different fragment treatment,
// etc.) without breaking each other.
export const CHOLLA_SPINE_BLADE_MODE = 11;

// mergeGeometries (plants/common.js) only keeps attributes present on every
// part. The cholla pipeline merges joint cylinders + sheath cards + blade
// strips; all three must carry cactusBillboard or it gets dropped from the
// merged buffer.
export function ensureChollaBladeBillboardAttribute(geom) {
  if (!geom?.attributes?.cactusBillboard) {
    const count = geom.attributes.position.count;
    geom.setAttribute('cactusBillboard', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
  }
  return geom;
}

// Build a single BufferGeometry holding many "spine blade" ribbons for cholla
// joints. Mirrors buildCactusSpineBlades in cactusSpineBlades.js — each
// attachment becomes one straight tapered quad strip along its bladeDir,
// offset sideways along its binormal. Kept as an independent file so cholla
// can iterate on blade geometry without touching the saguaro/barrel path.
//
// attachments[i]:
//   base      THREE.Vector3  object-local anchor on the joint surface
//   bladeDir  THREE.Vector3  unit direction the spine points (= surface normal
//                            for a perpendicular spine; tilted for fan blades)
//   binormal  THREE.Vector3  unit vector perpendicular to bladeDir; orients
//                            the strip width axis
//   length    number         blade length along bladeDir
//   widthBase number         blade width at base
//   color     THREE.Color    per-blade spine color
export function buildChollaSpineBlades(attachments, opts = {}) {
  if (!attachments || attachments.length === 0) return null;
  const segments = Math.max(2, opts.segments ?? 3);
  const ringCount = segments + 1;
  const vertsPerBlade = ringCount * 2;

  const bladeCount = attachments.length;
  const positions = new Float32Array(bladeCount * vertsPerBlade * 3);
  const normals = new Float32Array(bladeCount * vertsPerBlade * 3);
  const colors = new Float32Array(bladeCount * vertsPerBlade * 3);
  const spines = new Float32Array(bladeCount * vertsPerBlade * 4);
  const billboards = new Float32Array(bladeCount * vertsPerBlade * 4);
  const indexCount = bladeCount * segments * 6;
  const totalVerts = bladeCount * vertsPerBlade;
  const indices = totalVerts > 65535
    ? new Uint32Array(indexCount)
    : new Uint16Array(indexCount);

  let posOff = 0;
  let nrmOff = 0;
  let colOff = 0;
  let sOff = 0;
  let bOff = 0;
  let iOff = 0;

  for (let i = 0; i < bladeCount; i++) {
    const at = attachments[i];
    const bx = at.base.x, by = at.base.y, bz = at.base.z;
    const nx = at.bladeDir.x, ny = at.bladeDir.y, nz = at.bladeDir.z;
    const cx = at.binormal.x, cy = at.binormal.y, cz = at.binormal.z;
    const L = at.length;
    const W = at.widthBase;
    const cr = at.color.r, cg = at.color.g, cb = at.color.b;

    const baseIndex = i * vertsPerBlade;

    for (let r = 0; r < ringCount; r++) {
      const t = r / segments;
      for (let s = -1; s <= 1; s += 2) {
        positions[posOff++] = bx;
        positions[posOff++] = by;
        positions[posOff++] = bz;
        normals[nrmOff++] = nx;
        normals[nrmOff++] = ny;
        normals[nrmOff++] = nz;
        colors[colOff++] = cr;
        colors[colOff++] = cg;
        colors[colOff++] = cb;
        spines[sOff++] = t;
        spines[sOff++] = s;
        spines[sOff++] = W;
        spines[sOff++] = CHOLLA_SPINE_BLADE_MODE;
        billboards[bOff++] = cx;
        billboards[bOff++] = cy;
        billboards[bOff++] = cz;
        billboards[bOff++] = L;
      }
    }

    for (let r = 0; r < segments; r++) {
      const a = baseIndex + r * 2;
      indices[iOff++] = a;
      indices[iOff++] = a + 1;
      indices[iOff++] = a + 2;
      indices[iOff++] = a + 2;
      indices[iOff++] = a + 1;
      indices[iOff++] = a + 3;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('cactusSpine', new THREE.BufferAttribute(spines, 4));
  geom.setAttribute('cactusBillboard', new THREE.BufferAttribute(billboards, 4));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  return geom;
}

// Sample blade attachments on a single cholla joint to produce a *furry*
// covering — many long thin quills radiating in every direction off the joint
// surface, not a tight perpendicular fan.
//
// The areole grid follows buildChollaJoint's (areolesAround × areoleRows) cells
// with the same row-stagger `(row % 2) * 0.5 + phase`, but each cell expands
// into a starburst: bladesPerAreole spines distributed evenly around the
// surface normal, each tilted off perpendicular by fanTiltBase ± fanTiltJitter.
// Callers may pass `rowDensity` / `aroundDensity` > 1 to oversample the grid
// for the fluffy look real teddy bear cholla has.
//
// opts:
//   start, end       THREE.Vector3 endpoints of the joint axis
//   radius           cylinder radius
//   areolesAround    azimuthal areole count (matches buildChollaJoint)
//   areoleRows       row count along the joint
//   rowDensity       row-grid multiplier (default 1; 2 = twice as many rows)
//   aroundDensity    azimuthal-grid multiplier (default 1)
//   phase            phase offset matching the body's spineFn
//   bladesPerAreole  spines per areole cluster (starburst count)
//   fanTiltBase      mean tilt off perpendicular (rad). 0 = perfect quills,
//                    ~0.5 ≈ 28° starburst (cholla fur)
//   fanTiltJitter    +/- variation around fanTiltBase
//   lengthFn(t)      blade length in object units (t = position along joint)
//   widthFn(t)       blade width at base
//   colorFn(t)       per-blade base color
//   strengthFn(t)    0..1 multiplier; <0.1 skips the row
//   rng              PRNG fn (used for azimuth/tilt jitter and tone variation)
//   skipBelow/Above  fraction-of-joint bounds to skip (e.g., cap regions)
export function sampleChollaJointAreoles(opts) {
  const {
    start,
    end,
    radius,
    areolesAround = 7,
    areoleRows = 5,
    rowDensity = 1,
    aroundDensity = 1,
    phase = 0,
    bladesPerAreole = 14,
    fanTiltBase = 0.50,
    fanTiltJitter = 0.32,
    lengthFn,
    widthFn,
    colorFn,
    strengthFn = () => 1,
    rng,
    skipBelow = 0,
    skipAbove = 1,
  } = opts;

  if (areolesAround <= 0 || areoleRows <= 0 || bladesPerAreole <= 0) return [];

  const axis = end.clone().sub(start);
  const length = axis.length();
  if (length <= 0.0001) return [];
  axis.divideScalar(length);

  const denseRows = Math.max(2, Math.round(areoleRows * rowDensity));
  const denseAround = Math.max(3, Math.round(areolesAround * aroundDensity));

  // Stable orthonormal basis on the joint, picked the same way buildChollaJoint
  // picks it — keeps the body and blade frames in sync.
  const upRef = new THREE.Vector3(0, 1, 0);
  const normalAxis = Math.abs(axis.dot(upRef)) > 0.94
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3().crossVectors(upRef, axis).normalize();
  const binormalAxis = new THREE.Vector3().crossVectors(axis, normalAxis).normalize();

  const attachments = [];
  const surfNormal = new THREE.Vector3();
  const tangentialBasis = new THREE.Vector3();
  const upBasis = new THREE.Vector3();
  const halfPi = Math.PI * 0.5;

  for (let row = 0; row < denseRows; row++) {
    const t = (row + 0.5) / denseRows;
    if (t < skipBelow || t > skipAbove) continue;
    const strength = strengthFn(t);
    if (strength <= 0.08) continue;

    const center = start.clone().addScaledVector(axis, length * t);
    const areoleLength = lengthFn(t);
    const areoleWidth = widthFn(t);
    const areoleColor = colorFn(t);
    const fanCount = Math.round(bladesPerAreole * THREE.MathUtils.clamp(strength, 0.0, 1.0));
    if (fanCount <= 0) continue;

    const rowOffset = (row % 2) * 0.5 + phase;

    for (let rib = 0; rib < denseAround; rib++) {
      const a = ((rib + rowOffset) / denseAround) * Math.PI * 2;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      surfNormal.set(
        normalAxis.x * cosA + binormalAxis.x * sinA,
        normalAxis.y * cosA + binormalAxis.y * sinA,
        normalAxis.z * cosA + binormalAxis.z * sinA,
      ).normalize();
      const base = center.clone().addScaledVector(surfNormal, radius);

      tangentialBasis.crossVectors(surfNormal, axis);
      if (tangentialBasis.lengthSq() < 1e-4) tangentialBasis.set(1, 0, 0);
      tangentialBasis.normalize();
      upBasis.crossVectors(tangentialBasis, surfNormal).normalize();

      // Starburst: each blade gets an even slice of the full azimuth and a
      // tilt off perpendicular sampled around fanTiltBase. Together they
      // produce the dense radial halo that reads as fur.
      for (let b = 0; b < fanCount; b++) {
        const azimuth = ((b + rng() * 0.4) / fanCount) * Math.PI * 2;
        const tiltMag = THREE.MathUtils.clamp(
          fanTiltBase + (rng() - 0.5) * 2 * fanTiltJitter,
          0,
          halfPi - 0.05,
        );
        const lateral = new THREE.Vector3()
          .addScaledVector(tangentialBasis, Math.cos(azimuth))
          .addScaledVector(upBasis, Math.sin(azimuth));
        if (lateral.lengthSq() < 1e-6) lateral.copy(tangentialBasis);
        else lateral.normalize();

        const bladeDir = surfNormal.clone()
          .multiplyScalar(Math.cos(tiltMag))
          .addScaledVector(lateral, Math.sin(tiltMag))
          .normalize();

        // Strip binormal — perpendicular to bladeDir; pick the in-surface side
        // so the flat strip presents broadside to nearby viewers.
        const binormal = new THREE.Vector3().crossVectors(bladeDir, lateral);
        if (binormal.lengthSq() < 1e-4) binormal.crossVectors(bladeDir, upBasis);
        binormal.normalize();

        // Wider jitter than saguaro: cholla fur reads as many distinct hairs,
        // so length/tone vary more between blades in the same cluster.
        const lengthJitter = 0.78 + rng() * 0.44;
        const widthJitter = 0.84 + rng() * 0.32;
        const tone = 0.88 + rng() * 0.24;
        const color = areoleColor.clone().multiplyScalar(tone);

        attachments.push({
          base,
          bladeDir,
          binormal,
          length: areoleLength * lengthJitter,
          widthBase: areoleWidth * widthJitter,
          color,
        });
      }
    }
  }

  return attachments;
}
