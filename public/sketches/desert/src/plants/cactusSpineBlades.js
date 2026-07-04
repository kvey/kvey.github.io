import * as THREE from '../three-shim.js';

// Mode flag the cactus spine material uses to switch into bezier-bend mode.
// Stays out of the band used by other spine modes (1, 2, 5, 6, 8+age).
export const SPINE_BLADE_MODE = 10;

// mergeGeometries (plants/common.js) only keeps attributes present on *every*
// part. Cactus geometries that mix body parts with spine blades need this
// shim so the blade attribute survives the merge.
export function ensureCactusBillboardAttribute(geom) {
  if (!geom?.attributes?.cactusBillboard) {
    const count = geom.attributes.position.count;
    geom.setAttribute('cactusBillboard', new THREE.BufferAttribute(new Float32Array(count * 4), 4));
  }
  return geom;
}

// Build a single BufferGeometry holding many "spine blade" ribbons.
// Each attachment becomes one straight tapered quad strip (segments+1 rings ×
// 2 verts) along its bladeDir, offset sideways along its binormal. The vertex
// shader (cactusSpineMaterial) does the per-vertex straight-line projection
// at draw time from the packed attributes.
//
// attachments[i]:
//   base      THREE.Vector3  object-local anchor on the cactus surface
//   bladeDir  THREE.Vector3  unit direction the spine points (= surface normal
//                            for a perpendicular spine; tilted a few degrees
//                            for radial blades inside an areole fan)
//   binormal  THREE.Vector3  unit vector perpendicular to bladeDir; orients the
//                            strip width axis (pre-computed so the vertex
//                            shader never has to choose an arbitrary basis)
//   length    number         blade length along bladeDir
//   widthBase number         blade width at base
//   color     THREE.Color    per-blade spine color
export function buildCactusSpineBlades(attachments, opts = {}) {
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
    // `normal` attribute carries bladeDir (the spine direction).
    const nx = at.bladeDir.x, ny = at.bladeDir.y, nz = at.bladeDir.z;
    // `cactusBillboard.xyz` carries the pre-computed strip binormal.
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
        spines[sOff++] = SPINE_BLADE_MODE;
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


// Sample blade attachments at the *exact* areole grid used by the cactus body
// fragment shader. The texture areoles sit at integer values of
//   x = a * ribCount / (2π)    (rib peak)
//   y = t * rowsPerUnit * length + rowPhase   (row tick)
// — `cactusApplySpines` then bumps the cream disk at floor(x+0.5), floor(y)+0.5.
// Mirroring those cell centers here means the geometric spine clusters land
// right on the cream dots, not floating between them.
//
// Clusters are regular (no rng skipping). bladesPerAreole controls fan count;
// jitter is bounded and small so the line of spines along a rib reads as a row
// of identical clusters rather than a random sprinkle.
//
// opts:
//   curve, radiusFn, ribCount, ribDepth,
//   rowsPerUnit       rows per unit-length on curve (matches body spineRowsPerUnit)
//   rowPhase          phase offset, matches the body's spineFn rowPhase
//   bladesPerAreole   spines per areole cluster
//   lengthFn(t)       blade length in object units
//   widthFn(t)        blade width at base
//   colorFn(t)        per-blade base color
//   strengthFn(t)     0..1 multiplier; <0.1 skips the whole row
//   rng               PRNG fn (used only for tiny per-blade jitter)
export function sampleColumnAreoles(opts) {
  const {
    curve,
    radiusFn,
    ribCount,
    ribDepth = 0.05,
    rowsPerUnit = 8,
    rowPhase = 0,
    bladesPerAreole = 3,
    lengthFn,
    widthFn,
    colorFn,
    strengthFn = () => 1,
    rng,
    totalLength,
    skipBelow = 0,
    skipAbove = 1,
    // Maximum tilt of radial spines off the surface normal. 0 = every spine
    // perfectly perpendicular; ~0.18 rad (~10°) ≈ visible fan but still reads
    // as "sticking straight out". Real cactus areoles fan ~10-25°.
    fanTiltMax = 0.18,
  } = opts;

  if (ribCount <= 0 || bladesPerAreole <= 0) return [];

  const length = totalLength ?? curve.getLength?.() ?? 1;
  // Total areole rows match the body's spineFn so cell centers line up.
  const rowTotal = Math.max(1, Math.ceil(length * rowsPerUnit + rowPhase));

  // Stable parallel-transport frames along the curve mirror sweepRibbedTube so
  // angle=0 lands on the same rib peak both here and in the body geometry.
  const sampleCount = Math.max(8, rowTotal * 2);
  const frames = [];
  let normalAxis = new THREE.Vector3();
  for (let i = 0; i <= sampleCount; i++) {
    const ft = i / sampleCount;
    const tangent = curve.getTangentAt(ft).normalize();
    if (i === 0) {
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(tangent.dot(up)) > 0.95) up.set(1, 0, 0);
      normalAxis.crossVectors(up, tangent).normalize();
    } else {
      const dot = normalAxis.dot(tangent);
      normalAxis.addScaledVector(tangent, -dot).normalize();
      if (normalAxis.lengthSq() < 1e-6) normalAxis.set(1, 0, 0);
    }
    const binormal = new THREE.Vector3().crossVectors(tangent, normalAxis).normalize();
    frames.push({ tangent: tangent.clone(), normal: normalAxis.clone(), binormal: binormal.clone() });
  }
  function frameAt(t) {
    const idx = THREE.MathUtils.clamp(Math.round(t * sampleCount), 0, sampleCount);
    return frames[idx];
  }

  const attachments = [];
  const surfNormal = new THREE.Vector3();
  const tangentialBasis = new THREE.Vector3();
  const upBasis = new THREE.Vector3();

  // Iterate the same integer row cells the fragment shader does. The body
  // spineFn writes y = t*length*rowsPerUnit + rowPhase, and the shader bumps
  // areoles at floor(y)+0.5 — so the cell center is at y = N + 0.5, giving
  // t = (N + 0.5 - rowPhase) / (length * rowsPerUnit).
  const denom = Math.max(0.0001, length * rowsPerUnit);
  for (let row = 0; row < rowTotal; row++) {
    const t = (row + 0.5 - rowPhase) / denom;
    if (t < skipBelow || t > skipAbove) continue;
    const strength = strengthFn(t);
    if (strength <= 0.08) continue;
    const r = radiusFn(t) * (1 + ribDepth);
    const center = curve.getPointAt(t);
    const f = frameAt(t);

    const areoleLength = lengthFn(t);
    const areoleWidth = widthFn(t);
    const areoleColor = colorFn(t);
    const fanCount = Math.max(1, Math.round(bladesPerAreole * THREE.MathUtils.clamp(strength, 0.25, 1.0)));

    for (let rib = 0; rib < ribCount; rib++) {
      const angle = (rib / ribCount) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      surfNormal.set(
        f.normal.x * cosA + f.binormal.x * sinA,
        f.normal.y * cosA + f.binormal.y * sinA,
        f.normal.z * cosA + f.binormal.z * sinA,
      ).normalize();
      const base = center.clone().addScaledVector(surfNormal, r);

      // Two orthonormal axes in the surface plane at this areole:
      //   tangentialBasis — around the column
      //   upBasis         — along the column tangent
      tangentialBasis.crossVectors(surfNormal, f.tangent);
      if (tangentialBasis.lengthSq() < 1e-4) tangentialBasis.set(1, 0, 0);
      tangentialBasis.normalize();
      upBasis.crossVectors(tangentialBasis, surfNormal).normalize();

      for (let b = 0; b < fanCount; b++) {
        // Central spine (b at the middle) gets zero tilt — perfectly
        // perpendicular. Outer slots tilt symmetrically up to fanTiltMax.
        const slot = fanCount === 1 ? 0 : (b - (fanCount - 1) / 2) / ((fanCount - 1) / 2);
        const tiltMag = Math.abs(slot) * fanTiltMax;
        // Distribute the radial azimuth around the central spine so blades
        // don't all tilt the same way. Even fanCounts get pair-tilted sideways
        // (along the column), odds get an extra up/down spread.
        const azimuth = slot * Math.PI * 0.6 + (rng() - 0.5) * 0.12;
        const lateral = new THREE.Vector3()
          .addScaledVector(tangentialBasis, Math.cos(azimuth))
          .addScaledVector(upBasis, Math.sin(azimuth) * 0.35);
        if (lateral.lengthSq() < 1e-6) lateral.copy(tangentialBasis);
        else lateral.normalize();

        // bladeDir = normal tilted toward `lateral` by tiltMag. Magnitude
        // stays 1; for tiltMag=0 it equals the surface normal.
        const bladeDir = surfNormal.clone()
          .multiplyScalar(Math.cos(tiltMag))
          .addScaledVector(lateral, Math.sin(tiltMag))
          .normalize();

        // Strip binormal: perpendicular to bladeDir, kept in the surface
        // plane so the strip width axis hugs the cactus surface (the blade's
        // "flat side" faces up/down the column, not in/out).
        const binormal = new THREE.Vector3().crossVectors(bladeDir, upBasis);
        if (binormal.lengthSq() < 1e-4) binormal.crossVectors(bladeDir, tangentialBasis);
        binormal.normalize();

        const lengthJitter = 0.93 + (rng() - 0.5) * 0.12;
        const widthJitter = 0.96 + (rng() - 0.5) * 0.08;
        const tone = 0.96 + (rng() - 0.5) * 0.08;
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
