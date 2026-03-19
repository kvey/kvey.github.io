"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';

const CELL_SIZE = 12;
const LUM_CHARS = '.,-~:;=!*#$@';
const NUM_SOLIDS = 8;

type SolidType = 'torus' | 'cone' | 'cube';

interface Solid {
  type: SolidType;
  cx: number; // center x in col-space fraction (0-1)
  cy: number; // center y in row-space fraction (0-1)
  scale: number;
  rotSpeedA: number;
  rotSpeedB: number;
  phaseA: number;
  phaseB: number;
  color: [number, number, number]; // HSL hue, sat%, light% base
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Approximate radius of a solid in normalized (0-1) screen space at a given scale
function solidRadius(scale: number): number {
  // The K1 multiplier is 0.35*scale, and the torus (largest) spans ~4 units in K1 space.
  // On a ~100-col screen that's roughly 0.35*scale*4/5 / 100 ≈ 0.0028*scale per col.
  // We use a generous fraction-of-screen estimate to keep them apart.
  return 0.12 * scale;
}

function generateSolids(): Solid[] {
  const rand = seededRandom(42);
  const types: SolidType[] = ['torus', 'cone', 'cube'];
  const solids: Solid[] = [];
  const maxAttempts = 200;

  for (let i = 0; i < NUM_SOLIDS; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const scale = 0.6 + rand() * 0.8;
      const cx = 0.1 + rand() * 0.8;
      const cy = 0.1 + rand() * 0.8;
      const r = solidRadius(scale);

      let overlaps = false;
      for (const existing of solids) {
        const er = solidRadius(existing.scale);
        const dx = cx - existing.cx;
        const dy = cy - existing.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < r + er) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        solids.push({
          type: types[Math.floor(rand() * types.length)],
          cx,
          cy,
          scale,
          rotSpeedA: 0.3 + rand() * 0.8,
          rotSpeedB: 0.2 + rand() * 0.6,
          phaseA: rand() * 6.28,
          phaseB: rand() * 6.28,
          color: [Math.floor(rand() * 360), 70 + Math.floor(rand() * 20), 50 + Math.floor(rand() * 15)],
        });
        placed = true;
        break;
      }
    }
    if (!placed) break; // can't fit any more
  }
  return solids;
}

function renderTorus(
  output: string[], zbuffer: number[], solidIndex: number[],
  cols: number, rows: number,
  centerCol: number, centerRow: number,
  K1: number, A: number, B: number, si: number
) {
  const R1 = 1, R2 = 2, K2 = 5;
  const cosA = Math.cos(A), sinA = Math.sin(A);
  const cosB = Math.cos(B), sinB = Math.sin(B);

  for (let theta = 0; theta < 6.28; theta += 0.07) {
    const cosTheta = Math.cos(theta), sinTheta = Math.sin(theta);
    for (let phi = 0; phi < 6.28; phi += 0.02) {
      const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
      const circleX = R2 + R1 * cosTheta;
      const circleY = R1 * sinTheta;
      const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi) - circleY * cosA * sinB;
      const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi) + circleY * cosA * cosB;
      const z = K2 + cosA * circleX * sinPhi + circleY * sinA;
      const ooz = 1 / z;
      const xp = Math.floor(centerCol + K1 * ooz * x);
      const yp = Math.floor(centerRow - K1 * ooz * y * 0.5);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;
      const idx = yp * cols + xp;
      if (ooz > zbuffer[idx]) {
        zbuffer[idx] = ooz;
        solidIndex[idx] = si;
        const L = cosPhi * cosTheta * sinB - cosA * cosTheta * sinPhi - sinA * sinTheta + cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi);
        output[idx] = L > 0 ? LUM_CHARS[Math.min(Math.floor(L * 8), 11)] : '.';
      }
    }
  }
}

// Rotate normal from object space to world space and compute luminance
// using two lights (top-right and front-left) for richer shading
function computeLuminance(
  nx: number, ny: number, nz: number,
  cosA: number, sinA: number, cosB: number, sinB: number
): number {
  // Rotate normal: first around X by A, then around Z by B
  const ry1 = ny * cosA - nz * sinA;
  const rz1 = ny * sinA + nz * cosA;
  const rnx = nx * cosB - ry1 * sinB;
  const rny = nx * sinB + ry1 * cosB;
  const rnz = rz1;

  // Light 1: top-right-front (normalized ~(0.58, 0.58, 0.58))
  const L1 = Math.max(0, rnx * 0.577 + rny * 0.577 + rnz * 0.577);
  // Light 2: left-low-front (normalized ~(-0.5, -0.3, 0.81))
  const L2 = Math.max(0, rnx * -0.5 + rny * -0.3 + rnz * 0.81);
  // Combine with ambient
  return L1 * 0.6 + L2 * 0.35 + 0.05;
}

function renderCone(
  output: string[], zbuffer: number[], solidIndex: number[],
  cols: number, rows: number,
  centerCol: number, centerRow: number,
  K1: number, A: number, B: number, si: number
) {
  const H = 3, R = 1.5, K2 = 5;
  const cosA = Math.cos(A), sinA = Math.sin(A);
  const cosB = Math.cos(B), sinB = Math.sin(B);
  const slant = Math.sqrt(R * R + H * H);
  const nUp = R / slant;
  const nOut = H / slant;

  // Lateral surface
  for (let t = 0; t < 1; t += 0.02) {
    const r = R * (1 - t);
    const py = -H / 2 + t * H;
    for (let phi = 0; phi < 6.28; phi += 0.03) {
      const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
      const px = r * cosPhi;
      const pz = r * sinPhi;
      const rx = px * cosB - (py * cosA - pz * sinA) * sinB;
      const ry = px * sinB + (py * cosA - pz * sinA) * cosB;
      const rz = py * sinA + pz * cosA;
      const z = K2 + rz;
      const ooz = 1 / z;
      const xp = Math.floor(centerCol + K1 * ooz * rx);
      const yp = Math.floor(centerRow - K1 * ooz * ry * 0.5);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;
      const idx = yp * cols + xp;
      if (ooz > zbuffer[idx]) {
        zbuffer[idx] = ooz;
        solidIndex[idx] = si;
        const L = computeLuminance(nOut * cosPhi, nUp, nOut * sinPhi, cosA, sinA, cosB, sinB);
        output[idx] = LUM_CHARS[Math.min(Math.floor(L * 11), 11)];
      }
    }
  }

  // Base disc
  const baseY = -H / 2;
  for (let r2 = 0; r2 < R; r2 += 0.06) {
    for (let phi = 0; phi < 6.28; phi += 0.03) {
      const px = r2 * Math.cos(phi);
      const pz = r2 * Math.sin(phi);
      const rx = px * cosB - (baseY * cosA - pz * sinA) * sinB;
      const ry = px * sinB + (baseY * cosA - pz * sinA) * cosB;
      const rz = baseY * sinA + pz * cosA;
      const z = K2 + rz;
      const ooz = 1 / z;
      const xp = Math.floor(centerCol + K1 * ooz * rx);
      const yp = Math.floor(centerRow - K1 * ooz * ry * 0.5);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;
      const idx = yp * cols + xp;
      if (ooz > zbuffer[idx]) {
        zbuffer[idx] = ooz;
        solidIndex[idx] = si;
        const L = computeLuminance(0, -1, 0, cosA, sinA, cosB, sinB);
        output[idx] = LUM_CHARS[Math.min(Math.floor(L * 11), 11)];
      }
    }
  }
}

function renderCube(
  output: string[], zbuffer: number[], solidIndex: number[],
  cols: number, rows: number,
  centerCol: number, centerRow: number,
  K1: number, A: number, B: number, si: number
) {
  const S = 1.5, K2 = 5;
  const cosA = Math.cos(A), sinA = Math.sin(A);
  const cosB = Math.cos(B), sinB = Math.sin(B);
  const step = 0.06;

  // Each face: defined by which axis is fixed, its sign, and the two varying axes
  const faces: { fixed: number; sign: number; ax1: number; ax2: number; nx: number; ny: number; nz: number }[] = [
    { fixed: 2, sign: 1, ax1: 0, ax2: 1, nx: 0, ny: 0, nz: 1 },
    { fixed: 2, sign: -1, ax1: 0, ax2: 1, nx: 0, ny: 0, nz: -1 },
    { fixed: 1, sign: 1, ax1: 0, ax2: 2, nx: 0, ny: 1, nz: 0 },
    { fixed: 1, sign: -1, ax1: 0, ax2: 2, nx: 0, ny: -1, nz: 0 },
    { fixed: 0, sign: 1, ax1: 1, ax2: 2, nx: 1, ny: 0, nz: 0 },
    { fixed: 0, sign: -1, ax1: 1, ax2: 2, nx: -1, ny: 0, nz: 0 },
  ];

  for (const face of faces) {
    for (let u = -S; u <= S; u += step) {
      for (let v = -S; v <= S; v += step) {
        const pt = [0, 0, 0];
        pt[face.fixed] = face.sign * S;
        pt[face.ax1] = u;
        pt[face.ax2] = v;

        const [px, py, pz] = pt;
        const rx = px * cosB - (py * cosA - pz * sinA) * sinB;
        const ry = px * sinB + (py * cosA - pz * sinA) * cosB;
        const rz = py * sinA + pz * cosA;
        const z = K2 + rz;
        const ooz = 1 / z;
        const xp = Math.floor(centerCol + K1 * ooz * rx);
        const yp = Math.floor(centerRow - K1 * ooz * ry * 0.5);
        if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;
        const idx = yp * cols + xp;
        if (ooz > zbuffer[idx]) {
          zbuffer[idx] = ooz;
          solidIndex[idx] = si;
          const L = computeLuminance(face.nx, face.ny, face.nz, cosA, sinA, cosB, sinB);
          output[idx] = LUM_CHARS[Math.min(Math.floor(L * 11), 11)];
        }
      }
    }
  }
}

export default function SolidsBackground() {
  const { background, contentHidden } = useBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const solidsRef = useRef<Solid[]>(generateSolids());
  const contentHiddenRef = useRef(contentHidden);
  const dragRef = useRef<{ index: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    contentHiddenRef.current = contentHidden;
  }, [contentHidden]);

  useEffect(() => {
    if (background !== 'solids') {
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

    // Drag handlers — all on window so z-index doesn't matter
    const solids = solidsRef.current;

    const findSolidAt = (mx: number, my: number): number => {
      const fx = mx / window.innerWidth;
      const fy = my / window.innerHeight;
      let closest = -1;
      let closestDist = Infinity;
      for (let i = 0; i < solids.length; i++) {
        const dx = fx - solids[i].cx;
        const dy = fy - solids[i].cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r = solidRadius(solids[i].scale) * 1.3; // slightly larger hit area
        if (dist < r && dist < closestDist) {
          closest = i;
          closestDist = dist;
        }
      }
      return closest;
    };

    const onMouseDown = (e: MouseEvent) => {
      const idx = findSolidAt(e.clientX, e.clientY);
      if (idx >= 0) {
        const fx = e.clientX / window.innerWidth;
        const fy = e.clientY / window.innerHeight;
        dragRef.current = {
          index: idx,
          offsetX: solids[idx].cx - fx,
          offsetY: solids[idx].cy - fy,
        };
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const fx = e.clientX / window.innerWidth;
        const fy = e.clientY / window.innerHeight;
        solids[dragRef.current.index].cx = fx + dragRef.current.offsetX;
        solids[dragRef.current.index].cy = fy + dragRef.current.offsetY;
      } else {
        const idx = findSolidAt(e.clientX, e.clientY);
        document.body.style.cursor = idx >= 0 ? 'grab' : '';
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

      const output: string[] = new Array(cols * rows).fill(' ');
      const zbuffer: number[] = new Array(cols * rows).fill(0);
      const solidIdx: number[] = new Array(cols * rows).fill(-1);

      for (let si = 0; si < solids.length; si++) {
        const solid = solids[si];
        const centerCol = solid.cx * cols;
        const centerRow = solid.cy * rows;
        const K1 = Math.min(cols, rows) * 0.35 * solid.scale;
        const A = elapsed * solid.rotSpeedA + solid.phaseA;
        const B = elapsed * solid.rotSpeedB + solid.phaseB;

        if (solid.type === 'torus') {
          renderTorus(output, zbuffer, solidIdx, cols, rows, centerCol, centerRow, K1, A, B, si);
        } else if (solid.type === 'cone') {
          renderCone(output, zbuffer, solidIdx, cols, rows, centerCol, centerRow, K1, A, B, si);
        } else {
          renderCube(output, zbuffer, solidIdx, cols, rows, centerCol, centerRow, K1, A, B, si);
        }
      }

      // Render to canvas
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CELL_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const c = output[row * cols + col];
          if (c === ' ') continue;
          const lumIdx = LUM_CHARS.indexOf(c);
          if (contentHiddenRef.current && solidIdx[row * cols + col] >= 0) {
            const s = solids[solidIdx[row * cols + col]];
            const lightness = lumIdx >= 0 ? Math.floor((lumIdx / 11) * 40 + 30) : 35;
            ctx.fillStyle = `hsl(${s.color[0]},${s.color[1]}%,${lightness}%)`;
          } else {
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

  if (background !== 'solids') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.35 }}
    />
  );
}
