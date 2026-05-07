import * as THREE from 'three';

export function resolveDetailScale(opts = {}, min = 0.45) {
  return THREE.MathUtils.clamp(opts.detailScale ?? 1, min, 1);
}

export function scaledSegments(value, detailScale, min) {
  return Math.max(min, Math.round(value * detailScale));
}

// Sweep a circular cross-section (with optional vertical ribs) along a 3D curve.
// Builds a closed BufferGeometry and bakes vertex colors so we can mix
// many plant types under a single material.
//
// opts:
//   curve           THREE.Curve<Vector3>
//   segmentsAlong   N rings along the curve
//   segmentsAround  M radial segments per ring (smooth ribs need M >= ribCount * 4)
//   ribCount        number of vertical pleats; 0 = smooth
//   ribDepth        rib amplitude as a fraction of radius (e.g. 0.08)
//   radiusFn(t)     radius as a function of curve parameter t in [0,1]
//   colorFn(t, a)   THREE.Color for each vertex (t along curve, a around angle)
//   spineFn(t, a)   [ribCoord, rowCoord, strength, mode] for shared cactus spine shader
//   closeStart/closeEnd  cap the ends with a fan
export function sweepRibbedTube(opts) {
  const {
    curve,
    segmentsAlong = 32,
    segmentsAround = 32,
    ribCount = 0,
    ribDepth = 0,
    radiusFn,
    colorFn = null,
    spineFn = null,
    closeStart = false,
    closeEnd = false,
  } = opts;

  const positions = [];
  const colors = [];
  const spines = [];
  const indices = [];

  // Parallel-transport frames along the curve. Stable enough for
  // mostly-vertical sweeps; cacti & branches don't twist hard.
  const frames = [];
  let normal = new THREE.Vector3();
  for (let i = 0; i <= segmentsAlong; i++) {
    const t = i / segmentsAlong;
    const tangent = curve.getTangentAt(t).normalize();
    if (i === 0) {
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(tangent.dot(up)) > 0.95) up.set(1, 0, 0);
      normal.crossVectors(up, tangent).normalize();
    } else {
      // re-orthogonalize previous normal against new tangent
      const dot = normal.dot(tangent);
      normal.addScaledVector(tangent, -dot).normalize();
      if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);
    }
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    frames.push({ tangent: tangent.clone(), normal: normal.clone(), binormal: binormal.clone() });
  }

  const tmp = new THREE.Vector3();

  for (let i = 0; i <= segmentsAlong; i++) {
    const t = i / segmentsAlong;
    const center = curve.getPointAt(t);
    const f = frames[i];
    const baseR = radiusFn(t);
    for (let j = 0; j <= segmentsAround; j++) {
      const a = (j / segmentsAround) * Math.PI * 2;
      // "Knob" rib profile: peaks bulge outward by ribDepth, valleys sit at baseR.
      // Models a real cactus pleat (ridges sticking out from a body) much better
      // than a symmetric sin which pinches valleys inward by the same amount.
      const rib = ribCount > 0
        ? 1 + ribDepth * (0.5 + 0.5 * Math.cos(a * ribCount))
        : 1;
      const r = baseR * rib;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r;
      tmp.copy(center).addScaledVector(f.normal, cx).addScaledVector(f.binormal, cy);
      positions.push(tmp.x, tmp.y, tmp.z);
      if (colorFn) {
        const c = colorFn(t, a);
        colors.push(c.r, c.g, c.b);
      }
      if (spineFn) {
        const s = spineFn(t, a);
        spines.push(s[0], s[1], s[2], s[3]);
      }
    }
  }

  const stride = segmentsAround + 1;
  for (let i = 0; i < segmentsAlong; i++) {
    for (let j = 0; j < segmentsAround; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, a + 1, b);
      indices.push(b, a + 1, b + 1);
    }
  }

  // Caps
  if (closeStart) {
    const centerIdx = positions.length / 3;
    const c = curve.getPointAt(0);
    positions.push(c.x, c.y, c.z);
    if (colorFn) {
      const col = colorFn(0, 0);
      colors.push(col.r, col.g, col.b);
    }
    if (spineFn) {
      const s = spineFn(0, 0);
      spines.push(s[0], s[1], s[2], s[3]);
    }
    for (let j = 0; j < segmentsAround; j++) {
      indices.push(centerIdx, j + 1, j);
    }
  }
  if (closeEnd) {
    const lastRing = segmentsAlong * stride;
    const centerIdx = positions.length / 3;
    const c = curve.getPointAt(1);
    positions.push(c.x, c.y, c.z);
    if (colorFn) {
      const col = colorFn(1, 0);
      colors.push(col.r, col.g, col.b);
    }
    if (spineFn) {
      const s = spineFn(1, 0);
      spines.push(s[0], s[1], s[2], s[3]);
    }
    for (let j = 0; j < segmentsAround; j++) {
      indices.push(centerIdx, lastRing + j, lastRing + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colorFn) geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (spineFn) geom.setAttribute('cactusSpine', new THREE.Float32BufferAttribute(spines, 4));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Smooth lerp between many color stops keyed by t in [0,1].
export function colorRamp(t, stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t <= b.t) {
      const u = (t - a.t) / (b.t - a.t || 1);
      return a.c.clone().lerp(b.c, u);
    }
  }
  return stops[stops.length - 1].c.clone();
}

// Apply a flat color to every vertex of a geometry.
export function paintGeometry(geom, color) {
  const count = geom.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

export function paintCactusSpines(geom, value = [0, 0, 0, 0]) {
  const count = geom.attributes.position.count;
  const arr = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4] = value[0];
    arr[i * 4 + 1] = value[1];
    arr[i * 4 + 2] = value[2];
    arr[i * 4 + 3] = value[3];
  }
  geom.setAttribute('cactusSpine', new THREE.BufferAttribute(arr, 4));
}

// Merge an array of BufferGeometries that share the same attributes
// (position, normal, color, index). Avoids pulling in BufferGeometryUtils.
export function mergeGeometries(geoms) {
  let posCount = 0;
  let idxCount = 0;
  for (const g of geoms) {
    posCount += g.attributes.position.count;
    idxCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const mergeAttrs = [];
  const firstAttrs = geoms[0].attributes;
  for (const name of Object.keys(firstAttrs)) {
    if (name === 'position') continue;
    const first = firstAttrs[name];
    if (geoms.every(g => {
      const attr = g.attributes[name];
      return attr && attr.itemSize === first.itemSize && attr.normalized === first.normalized;
    })) {
      mergeAttrs.push({
        name,
        itemSize: first.itemSize,
        normalized: first.normalized,
        ArrayType: first.array.constructor,
      });
    }
  }

  const positions = new Float32Array(posCount * 3);
  const attributes = new Map();
  for (const attr of mergeAttrs) {
    attributes.set(attr.name, {
      ...attr,
      array: new attr.ArrayType(posCount * attr.itemSize),
    });
  }
  const indices = posCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);

  let pOff = 0;
  let iOff = 0;
  for (const g of geoms) {
    const p = g.attributes.position.array;
    positions.set(p, pOff * 3);
    for (const [name, attr] of attributes) {
      attr.array.set(g.attributes[name].array, pOff * attr.itemSize);
    }
    if (g.index) {
      const idx = g.index.array;
      for (let k = 0; k < idx.length; k++) indices[iOff + k] = idx[k] + pOff;
      iOff += idx.length;
    } else {
      for (let k = 0; k < g.attributes.position.count; k++) indices[iOff + k] = pOff + k;
      iOff += g.attributes.position.count;
    }
    pOff += g.attributes.position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  for (const [name, attr] of attributes) {
    merged.setAttribute(name, new THREE.BufferAttribute(attr.array, attr.itemSize, attr.normalized));
  }
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}
