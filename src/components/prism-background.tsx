"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';

const CELL_SIZE = 12;
const LUM_CHARS = '.,-~:;=!*#$@';

const BEAM_COLORS: [number, number, number][] = [
  [255, 0, 0],
  [255, 69, 0],
  [255, 140, 0],
  [255, 215, 0],
  [0, 204, 0],
  [0, 102, 255],
  [75, 0, 130],
  [139, 0, 255],
];

// ── 2D math helpers ──────────────────────────────────────────────────────────

function refractiveIndex(i: number): number {
  return 1.48 + (i / 7) * 0.06;
}

function refract2D(
  ix: number, iy: number, nx: number, ny: number, n1: number, n2: number
): [number, number] | null {
  let cosI = -(ix * nx + iy * ny);
  let nnx = nx, nny = ny;
  if (cosI < 0) { nnx = -nx; nny = -ny; cosI = -cosI; }
  const ratio = n1 / n2;
  const sinT2 = ratio * ratio * (1 - cosI * cosI);
  if (sinT2 > 1) return null;
  const cosT = Math.sqrt(1 - sinT2);
  return [ratio * ix + (ratio * cosI - cosT) * nnx, ratio * iy + (ratio * cosI - cosT) * nny];
}

function reflect2D(dx: number, dy: number, nx: number, ny: number): [number, number] {
  const dot = dx * nx + dy * ny;
  return [dx - 2 * dot * nx, dy - 2 * dot * ny];
}

function raySegment(
  rox: number, roy: number, rdx: number, rdy: number,
  ax: number, ay: number, bx: number, by: number
): number {
  const abx = bx - ax, aby = by - ay;
  const aox = ax - rox, aoy = ay - roy;
  const denom = rdx * aby - rdy * abx;
  if (Math.abs(denom) < 1e-6) return -1;
  const t = (aox * aby - aoy * abx) / denom;
  const s = (aox * rdy - aoy * rdx) / denom;
  if (t > 0.001 && s >= 0 && s <= 1) return t;
  return -1;
}

function normalize2D(x: number, y: number): [number, number] {
  const len = Math.sqrt(x * x + y * y);
  if (len < 1e-8) return [0, 0];
  return [x / len, y / len];
}

function rot2D(x: number, y: number, angle: number): [number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function pointInTriangle(
  px: number, py: number,
  v0: readonly number[], v1: readonly number[], v2: readonly number[]
): boolean {
  const e0x = v1[0] - v0[0], e0y = v1[1] - v0[1];
  const e1x = v2[0] - v0[0], e1y = v2[1] - v0[1];
  const e2x = px - v0[0], e2y = py - v0[1];
  const d00 = e0x * e0x + e0y * e0y;
  const d01 = e0x * e1x + e0y * e1y;
  const d02 = e0x * e2x + e0y * e2y;
  const d11 = e1x * e1x + e1y * e1y;
  const d12 = e1x * e2x + e1y * e2y;
  const inv = 1 / (d00 * d11 - d01 * d01);
  const u = (d11 * d02 - d01 * d12) * inv;
  const v = (d00 * d12 - d01 * d02) * inv;
  return u >= 0 && v >= 0 && (u + v) <= 1;
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number
): number {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  let t = (apx * abx + apy * aby) / (abx * abx + aby * aby);
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx - px, cy = ay + t * aby - py;
  return Math.sqrt(cx * cx + cy * cy);
}

// ── Triangle geometry helper ─────────────────────────────────────────────────

interface TriShape {
  verts: (readonly [number, number])[];
  edges: { a: readonly [number, number]; b: readonly [number, number] }[];
  normals: { nx: number; ny: number }[];
}

function makeTriangle(
  cx: number, cy: number, angle: number,
  baseVerts: [number, number][]
): TriShape {
  const verts = baseVerts.map(([x, y]) => {
    const [rx, ry] = rot2D(x, y, angle);
    return [cx + rx, cy + ry] as const;
  });
  const [v0, v1, v2] = verts;
  const edges = [
    { a: v0, b: v1 },
    { a: v1, b: v2 },
    { a: v2, b: v0 },
  ];
  const triCX = (v0[0] + v1[0] + v2[0]) / 3;
  const triCY = (v0[1] + v1[1] + v2[1]) / 3;
  const normals = edges.map(({ a, b }) => {
    const ex = b[0] - a[0], ey = b[1] - a[1];
    let [nx, ny] = normalize2D(-ey, ex);
    if (nx * (triCX - a[0]) + ny * (triCY - a[1]) > 0) {
      nx = -nx; ny = -ny;
    }
    return { nx, ny };
  });
  return { verts, edges, normals };
}

// ── Beam data ────────────────────────────────────────────────────────────────

interface BeamRay {
  exitX: number; exitY: number;
  dirX: number; dirY: number;
  inEntryX: number; inEntryY: number;
  inDirX: number; inDirY: number;
  inLen: number;
  color: [number, number, number];
}

interface ReflectedBeam {
  originX: number; originY: number;
  dirX: number; dirY: number;
  color: [number, number, number];
}

// ── Prism refraction ─────────────────────────────────────────────────────────

function computePrismBeams(
  tri: TriShape,
  beamOriginX: number, beamOriginY: number,
  beamDirX: number, beamDirY: number
): { entryX: number; entryY: number; beams: BeamRay[] } {
  let bestEntryT = Infinity;
  let entryEdgeIdx = -1;
  for (let i = 0; i < 3; i++) {
    const { a, b } = tri.edges[i];
    const t = raySegment(beamOriginX, beamOriginY, beamDirX, beamDirY, a[0], a[1], b[0], b[1]);
    if (t > 0 && t < bestEntryT) { bestEntryT = t; entryEdgeIdx = i; }
  }
  if (entryEdgeIdx < 0) return { entryX: -1, entryY: beamOriginY, beams: [] };

  const entryX = beamOriginX + beamDirX * bestEntryT;
  const entryY = beamOriginY + beamDirY * bestEntryT;
  const entryNormal = tri.normals[entryEdgeIdx];

  const beams: BeamRay[] = [];
  for (let i = 0; i < 8; i++) {
    const n = refractiveIndex(i);
    const ref = refract2D(beamDirX, beamDirY, entryNormal.nx, entryNormal.ny, 1.0, n);
    if (!ref) continue;
    const [rdx, rdy] = normalize2D(ref[0], ref[1]);

    let bestExitT = Infinity;
    let exitEdgeIdx = -1;
    for (let ei = 0; ei < 3; ei++) {
      if (ei === entryEdgeIdx) continue;
      const { a, b } = tri.edges[ei];
      const t = raySegment(entryX, entryY, rdx, rdy, a[0], a[1], b[0], b[1]);
      if (t > 0 && t < bestExitT) { bestExitT = t; exitEdgeIdx = ei; }
    }
    if (exitEdgeIdx < 0) continue;

    const exitX = entryX + rdx * bestExitT;
    const exitY = entryY + rdy * bestExitT;
    const exitRef = refract2D(rdx, rdy, tri.normals[exitEdgeIdx].nx, tri.normals[exitEdgeIdx].ny, n, 1.0);
    if (!exitRef) continue;
    const [edx, edy] = normalize2D(exitRef[0], exitRef[1]);

    beams.push({
      exitX, exitY, dirX: edx, dirY: edy,
      inEntryX: entryX, inEntryY: entryY,
      inDirX: rdx, inDirY: rdy, inLen: bestExitT,
      color: BEAM_COLORS[i],
    });
  }

  return { entryX, entryY, beams };
}

// ── Mirror reflection ────────────────────────────────────────────────────────

function computeMirrorReflections(
  mirrorTri: TriShape, beams: BeamRay[]
): ReflectedBeam[] {
  const reflected: ReflectedBeam[] = [];
  for (const beam of beams) {
    let bestT = Infinity;
    let hitEdgeIdx = -1;
    for (let i = 0; i < 3; i++) {
      const { a, b } = mirrorTri.edges[i];
      const t = raySegment(beam.exitX, beam.exitY, beam.dirX, beam.dirY, a[0], a[1], b[0], b[1]);
      if (t > 0 && t < bestT) { bestT = t; hitEdgeIdx = i; }
    }
    if (hitEdgeIdx < 0) continue;

    const hitX = beam.exitX + beam.dirX * bestT;
    const hitY = beam.exitY + beam.dirY * bestT;
    const n = mirrorTri.normals[hitEdgeIdx];
    const [rx, ry] = reflect2D(beam.dirX, beam.dirY, n.nx, n.ny);

    reflected.push({
      originX: hitX, originY: hitY,
      dirX: rx, dirY: ry,
      color: beam.color,
    });
  }
  return reflected;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PrismBackground() {
  const { background } = useBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const prismPosRef = useRef({ cx: 0.45, cy: 0.5 });
  const prismAngleRef = useRef(-0.52);

  const mirrorPosRef = useRef({ cx: 0.75, cy: 0.5 });
  const mirrorAngleRef = useRef(0.4);

  const lightPosRef = useRef({ cx: 0.08, cy: 0.5 });
  const lightAutoRef = useRef(true);

  const dragRef = useRef<{
    target: 'prism' | 'mirror' | 'light';
    mode: 'rotate' | 'translate';
    startX: number; startY: number;
    startAngle: number;
    offsetX: number; offsetY: number;
  } | null>(null);

  useEffect(() => {
    if (background !== 'prism') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';
    ctx.font = `${CELL_SIZE}px ${fontFamily}`;
    const charW = ctx.measureText('M').width;
    const charH = CELL_SIZE * 1.2;



    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const prismPos = prismPosRef.current;
    const mirrorPos = mirrorPosRef.current;

    // Prism base shape
    const prismBaseVerts = (sz: number): [number, number][] => [
      [-sz * 0.9, 0],
      [sz * 0.5, -sz * 0.85],
      [sz * 0.5, sz * 0.85],
    ];

    // Mirror base shape — flatter isosceles triangle
    const mirrorBaseVerts = (sz: number): [number, number][] => [
      [-sz * 0.15, 0],
      [sz * 0.15, -sz * 0.7],
      [sz * 0.15, sz * 0.7],
    ];

    const lightPos = lightPosRef.current;
    const LIGHT_RADIUS = 3; // radius in character cells

    const hitTest = (mx: number, my: number): 'prism' | 'mirror' | 'light' | null => {
      const cols = Math.ceil(canvas.width / charW);
      const rows = Math.ceil(canvas.height / charH);
      const col = mx / charW;
      const row = my / charH;
      const sz = Math.min(cols, rows) * 0.32;
      const msz = Math.min(cols, rows) * 0.22;

      // Check light source first
      const lightCol = lightPos.cx * cols;
      const lightRow = lightPos.cy * rows;
      const lightDist = Math.sqrt((col - lightCol) ** 2 + (row - lightRow) ** 2);
      if (lightDist <= LIGHT_RADIUS + 1) return 'light';

      // Check mirror
      const mv = mirrorBaseVerts(msz).map(([x, y]) => {
        const [rx, ry] = rot2D(x, y, mirrorAngleRef.current);
        return [mirrorPos.cx * cols + rx, mirrorPos.cy * rows + ry] as const;
      });
      if (pointInTriangle(col, row, mv[0], mv[1], mv[2])) return 'mirror';

      const pv = prismBaseVerts(sz).map(([x, y]) => {
        const [rx, ry] = rot2D(x, y, prismAngleRef.current);
        return [prismPos.cx * cols + rx, prismPos.cy * rows + ry] as const;
      });
      if (pointInTriangle(col, row, pv[0], pv[1], pv[2])) return 'prism';

      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = hitTest(e.clientX, e.clientY);
      if (!target) return;

      const fx = e.clientX / window.innerWidth;
      const fy = e.clientY / window.innerHeight;

      if (target === 'light') {
        if (e.shiftKey) return; // light has no rotation
        lightAutoRef.current = false;
        dragRef.current = {
          target: 'light', mode: 'translate',
          startX: e.clientX, startY: e.clientY,
          startAngle: 0,
          offsetX: lightPos.cx - fx, offsetY: lightPos.cy - fy,
        };
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }

      const tPos = target === 'prism' ? prismPos : mirrorPos;
      const tAngleRef = target === 'prism' ? prismAngleRef : mirrorAngleRef;

      if (e.shiftKey) {
        dragRef.current = {
          target, mode: 'rotate',
          startX: e.clientX, startY: e.clientY,
          startAngle: tAngleRef.current,
          offsetX: 0, offsetY: 0,
        };
        document.body.style.cursor = 'ew-resize';
      } else {
        dragRef.current = {
          target, mode: 'translate',
          startX: e.clientX, startY: e.clientY,
          startAngle: tAngleRef.current,
          offsetX: tPos.cx - fx, offsetY: tPos.cy - fy,
        };
        document.body.style.cursor = 'grabbing';
      }
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        if (dragRef.current.target === 'light') {
          const fx = e.clientX / window.innerWidth;
          const fy = e.clientY / window.innerHeight;
          lightPos.cx = fx + dragRef.current.offsetX;
          lightPos.cy = fy + dragRef.current.offsetY;
        } else {
          const tPos = dragRef.current.target === 'prism' ? prismPos : mirrorPos;
          const tAngleRef = dragRef.current.target === 'prism' ? prismAngleRef : mirrorAngleRef;
          if (dragRef.current.mode === 'translate') {
            const fx = e.clientX / window.innerWidth;
            const fy = e.clientY / window.innerHeight;
            tPos.cx = fx + dragRef.current.offsetX;
            tPos.cy = fy + dragRef.current.offsetY;
          } else {
            const dx = e.clientX - dragRef.current.startX;
            tAngleRef.current = dragRef.current.startAngle + dx * 0.005;
          }
        }
      } else {
        const target = hitTest(e.clientX, e.clientY);
        if (target === 'light') {
          document.body.style.cursor = 'grab';
        } else if (target) {
          document.body.style.cursor = e.shiftKey ? 'ew-resize' : 'grab';
        } else {
          document.body.style.cursor = '';
        }
      }
    };

    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const startTime = performance.now();

    const loop = (now: number) => {
      const elapsed = (now - startTime) / 1000.0;
      const cw = canvas.width;
      const ch = canvas.height;
      const cols = Math.ceil(cw / charW);
      const rows = Math.ceil(ch / charH);
      const totalCells = cols * rows;

      const output: string[] = new Array(totalCells).fill(' ');
      const colorBuf: ([number, number, number] | null)[] = new Array(totalCells).fill(null);

      const prismCenterCol = prismPos.cx * cols;
      const prismCenterRow = prismPos.cy * rows;
      const prismSize = Math.min(cols, rows) * 0.32;
      const prismTri = makeTriangle(prismCenterCol, prismCenterRow, prismAngleRef.current, prismBaseVerts(prismSize));

      const mirrorCenterCol = mirrorPos.cx * cols;
      const mirrorCenterRow = mirrorPos.cy * rows;
      const mirrorSize = Math.min(cols, rows) * 0.22;
      const mirrorTri = makeTriangle(mirrorCenterCol, mirrorCenterRow, mirrorAngleRef.current, mirrorBaseVerts(mirrorSize));

      // Update light source position (auto-oscillate or manual)
      if (lightAutoRef.current) {
        lightPos.cy = 0.5 + Math.sin(elapsed * 0.4) * 0.5;
      }

      // Input beam
      const beamOriginX = lightPos.cx * cols;
      const beamOriginY = lightPos.cy * rows;
      const [beamDirX, beamDirY] = normalize2D(prismCenterCol - beamOriginX, prismCenterRow - beamOriginY);

      // Check if the source beam hits the mirror first
      let srcBeamHitMirrorT = Infinity;
      let srcBeamHitEdge = -1;
      for (let i = 0; i < 3; i++) {
        const { a, b } = mirrorTri.edges[i];
        const t = raySegment(beamOriginX, beamOriginY, beamDirX, beamDirY, a[0], a[1], b[0], b[1]);
        if (t > 0 && t < srcBeamHitMirrorT) { srcBeamHitMirrorT = t; srcBeamHitEdge = i; }
      }

      // Check if it hits the prism first
      let srcBeamHitPrismT = Infinity;
      for (let i = 0; i < 3; i++) {
        const { a, b } = prismTri.edges[i];
        const t = raySegment(beamOriginX, beamOriginY, beamDirX, beamDirY, a[0], a[1], b[0], b[1]);
        if (t > 0 && t < srcBeamHitPrismT) srcBeamHitPrismT = t;
      }

      // If source beam hits mirror before prism, reflect it toward prism
      let effectiveBeamOriginX = beamOriginX;
      let effectiveBeamOriginY = beamOriginY;
      let effectiveBeamDirX = beamDirX;
      let effectiveBeamDirY = beamDirY;
      let sourceBeamEndT = srcBeamHitPrismT; // where the source beam segment ends
      let mirrorReflectedSource: { originX: number; originY: number; dirX: number; dirY: number } | null = null;

      if (srcBeamHitEdge >= 0 && srcBeamHitMirrorT < srcBeamHitPrismT) {
        // Source beam hits mirror first — reflect it
        const hitX = beamOriginX + beamDirX * srcBeamHitMirrorT;
        const hitY = beamOriginY + beamDirY * srcBeamHitMirrorT;
        const n = mirrorTri.normals[srcBeamHitEdge];
        const [rx, ry] = reflect2D(beamDirX, beamDirY, n.nx, n.ny);
        mirrorReflectedSource = { originX: hitX, originY: hitY, dirX: rx, dirY: ry };
        sourceBeamEndT = srcBeamHitMirrorT;

        // Use reflected beam as input to prism
        effectiveBeamOriginX = hitX;
        effectiveBeamOriginY = hitY;
        effectiveBeamDirX = rx;
        effectiveBeamDirY = ry;
      }

      // Compute prism refraction using the effective beam (direct or mirror-reflected)
      const prismResult = computePrismBeams(prismTri, effectiveBeamOriginX, effectiveBeamOriginY, effectiveBeamDirX, effectiveBeamDirY);

      // Compute mirror reflections of prism exit beams
      const reflectedBeams = computeMirrorReflections(mirrorTri, prismResult.beams);

      // ── Render each cell ──
      const [p0, p1, p2] = prismTri.verts;
      const [m0, m1, m2] = mirrorTri.verts;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const insidePrism = pointInTriangle(col, row, p0, p1, p2);
          const insideMirror = pointInTriangle(col, row, m0, m1, m2);

          // ── Prism body ──
          if (insidePrism) {
            const d0 = distToSegment(col, row, p0[0], p0[1], p1[0], p1[1]);
            const d1 = distToSegment(col, row, p1[0], p1[1], p2[0], p2[1]);
            const d2 = distToSegment(col, row, p2[0], p2[1], p0[0], p0[1]);
            const edgeFade = Math.max(0, 1.0 - Math.min(d0, d1, d2) / (prismSize * 0.3));
            const lum = 0.15 + edgeFade * 0.35;
            output[idx] = LUM_CHARS[Math.min(Math.floor(lum * 11), 11)];
            const brightness = Math.floor(lum * 160 + 60);
            colorBuf[idx] = [
              Math.floor(brightness * 0.85),
              Math.floor(brightness * 0.88),
              Math.min(255, Math.floor(brightness * 1.1)),
            ];
          }

          // ── Mirror body ──
          if (insideMirror) {
            const d0 = distToSegment(col, row, m0[0], m0[1], m1[0], m1[1]);
            const d1 = distToSegment(col, row, m1[0], m1[1], m2[0], m2[1]);
            const d2 = distToSegment(col, row, m2[0], m2[1], m0[0], m0[1]);
            const edgeFade = Math.max(0, 1.0 - Math.min(d0, d1, d2) / (mirrorSize * 0.15));
            const lum = 0.25 + edgeFade * 0.45;
            output[idx] = LUM_CHARS[Math.min(Math.floor(lum * 11), 11)];
            const brightness = Math.floor(lum * 180 + 60);
            colorBuf[idx] = [brightness, brightness, Math.min(255, Math.floor(brightness * 1.05))];
          }

          // ── Internal prism beams ──
          if (insidePrism && prismResult.beams.length > 0) {
            let bestI = 0;
            let bestC: [number, number, number] | null = null;
            for (const beam of prismResult.beams) {
              const tx = col - beam.inEntryX, ty = row - beam.inEntryY;
              const along = tx * beam.inDirX + ty * beam.inDirY;
              if (along < 0 || along > beam.inLen) continue;
              const cx2 = beam.inEntryX + beam.inDirX * along;
              const cy2 = beam.inEntryY + beam.inDirY * along;
              const dist = Math.sqrt((col - cx2) ** 2 + (row - cy2) ** 2);
              const beamW = 1.0 + (along / beam.inLen) * 1.5;
              if (dist < beamW) {
                const intensity = (1.0 - dist / beamW) * 0.8;
                if (intensity > bestI) { bestI = intensity; bestC = beam.color; }
              }
            }
            if (bestI > 0 && bestC) {
              output[idx] = LUM_CHARS[Math.min(Math.floor(bestI * 11), 11)];
              colorBuf[idx] = [
                Math.min(255, Math.floor(bestC[0] * bestI)),
                Math.min(255, Math.floor(bestC[1] * bestI)),
                Math.min(255, Math.floor(bestC[2] * bestI)),
              ];
            }
          }

          // ── Incoming source beam (from light source, clipped at mirror or prism) ──
          if (!insidePrism && !insideMirror) {
            const tx = col - beamOriginX, ty = row - beamOriginY;
            const along = tx * beamDirX + ty * beamDirY;
            if (along > 0 && along < sourceBeamEndT) {
              const cx2 = beamOriginX + beamDirX * along;
              const cy2 = beamOriginY + beamDirY * along;
              const dist = Math.sqrt((col - cx2) ** 2 + (row - cy2) ** 2);
              if (dist < 2.5) {
                const fade = 1.0 - dist / 2.5;
                output[idx] = LUM_CHARS[Math.min(Math.floor(fade * 11), 11)];
                const b = Math.floor(fade * 120 + 40);
                colorBuf[idx] = [b, b, b];
              }
            }

            // ── Reflected source beam (from mirror to prism) ──
            if (mirrorReflectedSource) {
              const rs = mirrorReflectedSource;
              const tx2 = col - rs.originX, ty2 = row - rs.originY;
              const along2 = tx2 * rs.dirX + ty2 * rs.dirY;
              // Clip at prism entry
              let maxAlong = Infinity;
              if (prismResult.entryX > 0) {
                maxAlong = (prismResult.entryX - rs.originX) * rs.dirX + (prismResult.entryY - rs.originY) * rs.dirY;
              }
              if (along2 > 0 && along2 < maxAlong) {
                const cx3 = rs.originX + rs.dirX * along2;
                const cy3 = rs.originY + rs.dirY * along2;
                const dist2 = Math.sqrt((col - cx3) ** 2 + (row - cy3) ** 2);
                if (dist2 < 2.5) {
                  const fade = 1.0 - dist2 / 2.5;
                  output[idx] = LUM_CHARS[Math.min(Math.floor(fade * 11), 11)];
                  const b = Math.floor(fade * 120 + 40);
                  colorBuf[idx] = [b, b, b];
                }
              }
            }
          }

          // ── Exit beams from prism (outside both shapes) ──
          if (!insidePrism && !insideMirror) {
            let bestI = 0;
            let bestC: [number, number, number] | null = null;

            for (const beam of prismResult.beams) {
              const tx = col - beam.exitX, ty = row - beam.exitY;
              const along = tx * beam.dirX + ty * beam.dirY;
              if (along <= 0) continue;

              // Clip beam at mirror hit point if this beam has a reflection
              let maxAlong = Infinity;
              for (let ei = 0; ei < 3; ei++) {
                const { a, b } = mirrorTri.edges[ei];
                const t = raySegment(beam.exitX, beam.exitY, beam.dirX, beam.dirY, a[0], a[1], b[0], b[1]);
                if (t > 0 && t < maxAlong) maxAlong = t;
              }
              if (along > maxAlong) continue;

              const cx2 = beam.exitX + beam.dirX * along;
              const cy2 = beam.exitY + beam.dirY * along;
              const dist = Math.sqrt((col - cx2) ** 2 + (row - cy2) ** 2);
              const beamW = 1.2 + along * 0.006;
              if (dist < beamW) {
                const intensity = (1.0 - dist / beamW) * 0.95;
                if (intensity > bestI) { bestI = intensity; bestC = beam.color; }
              }
            }

            // ── Reflected beams from mirror ──
            for (const rb of reflectedBeams) {
              const tx = col - rb.originX, ty = row - rb.originY;
              const along = tx * rb.dirX + ty * rb.dirY;
              if (along <= 0) continue;
              const cx2 = rb.originX + rb.dirX * along;
              const cy2 = rb.originY + rb.dirY * along;
              const dist = Math.sqrt((col - cx2) ** 2 + (row - cy2) ** 2);
              const beamW = 1.2 + along * 0.006;
              if (dist < beamW) {
                const intensity = (1.0 - dist / beamW) * 0.85;
                if (intensity > bestI) { bestI = intensity; bestC = rb.color; }
              }
            }

            if (bestI > 0 && bestC) {
              output[idx] = LUM_CHARS[Math.min(Math.floor(bestI * 11), 11)];
              colorBuf[idx] = [
                Math.min(255, Math.floor(bestC[0] * bestI)),
                Math.min(255, Math.floor(bestC[1] * bestI)),
                Math.min(255, Math.floor(bestC[2] * bestI)),
              ];
            }
          }
        }
      }

      // ── Light source circle ──
      const lightCol = lightPos.cx * cols;
      const lightRow = lightPos.cy * rows;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const dist = Math.sqrt((col - lightCol) ** 2 + (row - lightRow) ** 2);
          if (dist <= LIGHT_RADIUS) {
            const idx = row * cols + col;
            output[idx] = '@';
            colorBuf[idx] = [60, 60, 60];
          }
        }
      }

      // ── Final render pass ──
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CELL_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const c = output[idx];
          if (c === ' ') continue;
          const color = colorBuf[idx];
          if (color) {
            ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
          } else {
            const lumIdx = LUM_CHARS.indexOf(c);
            const brightness = lumIdx >= 0 ? Math.floor((lumIdx / 11) * 160 + 60) : 80;
            ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
          }
          ctx.fillText(c, col * charW, row * charH);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.body.style.cursor = '';
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [background]);

  if (background !== 'prism') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.35 }}
    />
  );
}
