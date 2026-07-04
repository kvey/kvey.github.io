"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';
import { useTheme } from './theme-provider';

const CELL_SIZE = 12;

// Beam palette for dark mode — bright, glowing colors on a dark page.
const BEAM_COLORS_DARK: [number, number, number][] = [
  [255, 40, 40],
  [255, 140, 0],
  [255, 215, 0],
  [0, 220, 80],
  [0, 170, 255],
  [120, 80, 255],
  [220, 60, 220],
];

// Beam palette for light mode — darker, saturated colors that read on white.
const BEAM_COLORS_LIGHT: [number, number, number][] = [
  [205, 0, 0],
  [200, 85, 0],
  [170, 130, 0],
  [0, 145, 45],
  [0, 95, 200],
  [85, 40, 205],
  [175, 0, 155],
];

const MIRROR_COLOR_DARK: [number, number, number] = [120, 125, 145];
const MIRROR_COLOR_LIGHT: [number, number, number] = [70, 75, 95];

const GRID_COLS = 9; // number of mirror columns
const GRID_ROWS = 6; // number of mirror rows
const MAX_BOUNCES = 48; // max reflections before a beam is abandoned
const ENERGY_DECAY = 0.93; // intensity lost per reflection

// Braille dot layout — each character cell is a 2-wide × 4-tall dot grid.
// Indexed [localY 0..3][localX 0..1] → the bit to OR into the base 0x2800.
const BRAILLE_DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

// ── 2D math helpers ──────────────────────────────────────────────────────────

function reflect2D(dx: number, dy: number, nx: number, ny: number): [number, number] {
  const dot = dx * nx + dy * ny;
  return [dx - 2 * dot * nx, dy - 2 * dot * ny];
}

function normalize2D(x: number, y: number): [number, number] {
  const len = Math.sqrt(x * x + y * y);
  if (len < 1e-8) return [0, 0];
  return [x / len, y / len];
}

// Ray (ro + t·rd) vs segment (a→b). Returns nearest positive t, or -1.
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
  if (t > 0.01 && s >= 0 && s <= 1) return t;
  return -1;
}

// t at which a ray leaves the [0,w]×[0,h] box.
function rayExitT(ox: number, oy: number, dx: number, dy: number, w: number, h: number): number {
  let tmax = Infinity;
  if (dx > 1e-9) tmax = Math.min(tmax, (w - ox) / dx);
  else if (dx < -1e-9) tmax = Math.min(tmax, (0 - ox) / dx);
  if (dy > 1e-9) tmax = Math.min(tmax, (h - oy) / dy);
  else if (dy < -1e-9) tmax = Math.min(tmax, (0 - oy) / dy);
  return tmax;
}

// ── Mirror geometry ──────────────────────────────────────────────────────────

interface Mirror {
  cx: number; cy: number; // center, in sub-pixel (dot) coordinates
  half: number;           // half-length of the segment
  ax: number; ay: number; // endpoints
  bx: number; by: number;
  nx: number; ny: number; // unit normal
}

function buildMirror(cx: number, cy: number, half: number, angle: number): Mirror {
  const c = Math.cos(angle), s = Math.sin(angle);
  const ax = cx - c * half, ay = cy - s * half;
  const bx = cx + c * half, by = cy + s * half;
  const [nx, ny] = normalize2D(-s, c); // perpendicular to the segment
  return { cx, cy, half, ax, ay, bx, by, nx, ny };
}

// ── Beam tracing ─────────────────────────────────────────────────────────────

interface BeamSeg {
  x0: number; y0: number; x1: number; y1: number;
  intensity: number;
  color: [number, number, number];
}

function traceBeam(
  ox: number, oy: number, dx: number, dy: number,
  mirrors: Mirror[], w: number, h: number,
  color: [number, number, number]
): BeamSeg[] {
  const segs: BeamSeg[] = [];
  let cx = ox, cy = oy, ddx = dx, ddy = dy;
  let intensity = 0.95;

  for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
    let bestT = Infinity;
    let hit: Mirror | null = null;
    for (const m of mirrors) {
      const t = raySegment(cx, cy, ddx, ddy, m.ax, m.ay, m.bx, m.by);
      if (t > 0 && t < bestT) { bestT = t; hit = m; }
    }

    const exitT = rayExitT(cx, cy, ddx, ddy, w, h);

    if (!hit || bestT >= exitT) {
      // Beam leaves the grid without hitting another mirror.
      const ex = cx + ddx * exitT, ey = cy + ddy * exitT;
      segs.push({ x0: cx, y0: cy, x1: ex, y1: ey, intensity, color });
      break;
    }

    const hx = cx + ddx * bestT, hy = cy + ddy * bestT;
    segs.push({ x0: cx, y0: cy, x1: hx, y1: hy, intensity, color });

    const [rx, ry] = reflect2D(ddx, ddy, hit.nx, hit.ny);
    ddx = rx; ddy = ry;
    cx = hx + ddx * 0.05; cy = hy + ddy * 0.05; // nudge off the surface
    intensity *= ENERGY_DECAY;
    if (intensity < 0.06) break;
  }

  return segs;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MirrorGridBackground() {
  const { background } = useBackground();
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // User-controllable base orientation per mirror, persisted across frames.
  const baseAnglesRef = useRef<number[]>([]);
  const phasesRef = useRef<number[]>([]);
  // Vertical entry position of each laser, as a fraction [0,1] of the height.
  const beamYsRef = useRef<number[]>([]);

  const dragRef = useRef<
    | { kind: 'mirror'; index: number; startX: number; startAngle: number; moved: boolean }
    | { kind: 'laser'; index: number }
    | null
  >(null);

  useEffect(() => {
    if (background !== 'mirror-grid') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const isLight = theme === 'light';
    const BEAM_COLORS = isLight ? BEAM_COLORS_LIGHT : BEAM_COLORS_DARK;
    const MIRROR_COLOR = isLight ? MIRROR_COLOR_LIGHT : MIRROR_COLOR_DARK;
    // Faded beams should darken toward black on white, but stay glowing on dark.
    const liftFloor = isLight ? 0.55 : 0.4;

    const ctx = canvas.getContext('2d')!;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';
    ctx.font = `${CELL_SIZE}px ${fontFamily}`;
    const charW = ctx.measureText('M').width;
    const charH = CELL_SIZE * 1.2;
    // Each character cell holds a 2×4 grid of Braille dots.
    const dotW = charW / 2;
    const dotH = charH / 4;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const NUM = GRID_COLS * GRID_ROWS;

    // Initialize per-mirror state once.
    if (baseAnglesRef.current.length !== NUM) {
      const base: number[] = [];
      const phase: number[] = [];
      for (let i = 0; i < NUM; i++) {
        // Start each mirror at one of the two diagonals for a clean maze look.
        base.push((i + ((i / GRID_COLS) | 0)) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4);
        phase.push((i * 1.37) % (Math.PI * 2));
      }
      baseAnglesRef.current = base;
      phasesRef.current = phase;
    }

    const NUM_BEAMS = BEAM_COLORS.length;
    if (beamYsRef.current.length !== NUM_BEAMS) {
      beamYsRef.current = BEAM_COLORS.map((_, i) => (i + 0.5) / NUM_BEAMS);
    }

    // Compute mirror layout in sub-pixel (Braille dot) coordinates.
    const layout = () => {
      const subCols = Math.ceil(canvas.width / dotW);
      const subRows = Math.ceil(canvas.height / dotH);
      const marginX = subCols * 0.18; // leave room on the left for incoming beams
      const usableW = subCols - marginX - subCols * 0.06;
      const usableH = subRows * 0.88;
      const offY = subRows * 0.06;
      const stepX = usableW / GRID_COLS;
      const stepY = usableH / GRID_ROWS;
      const half = Math.min(stepX, stepY) * 0.34;
      const centers: { cx: number; cy: number }[] = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          centers.push({
            cx: marginX + stepX * (c + 0.5),
            cy: offY + stepY * (r + 0.5),
          });
        }
      }
      return { subCols, subRows, centers, half, stepX, stepY };
    };

    const hitTestMirror = (mx: number, my: number): number => {
      const { centers, stepX, stepY } = layout();
      const sx = mx / dotW;
      const sy = my / dotH;
      let best = -1, bestD = Math.min(stepX, stepY) * 0.6;
      for (let i = 0; i < centers.length; i++) {
        const dCol = centers[i].cx - sx;
        const dRow = centers[i].cy - sy;
        const d = Math.sqrt(dCol * dCol + dRow * dRow);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    // Lasers live along the left edge; grab the nearest marker if the cursor
    // is close to the edge and roughly level with an entry point.
    const hitTestLaser = (mx: number, my: number): number => {
      if (mx > charW * 3) return -1;
      const frac = my / canvas.height;
      let best = -1, bestD = (charH * 1.5) / canvas.height;
      for (let i = 0; i < beamYsRef.current.length; i++) {
        const d = Math.abs(beamYsRef.current[i] - frac);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    const onMouseDown = (e: MouseEvent) => {
      const laser = hitTestLaser(e.clientX, e.clientY);
      if (laser >= 0) {
        dragRef.current = { kind: 'laser', index: laser };
        document.body.style.cursor = 'ns-resize';
        e.preventDefault();
        return;
      }
      const idx = hitTestMirror(e.clientX, e.clientY);
      if (idx < 0) return;
      dragRef.current = {
        kind: 'mirror',
        index: idx,
        startX: e.clientX,
        startAngle: baseAnglesRef.current[idx],
        moved: false,
      };
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        if (drag.kind === 'laser') {
          beamYsRef.current[drag.index] = Math.max(0, Math.min(1, e.clientY / canvas.height));
        } else {
          const dx = e.clientX - drag.startX;
          if (Math.abs(dx) > 2) drag.moved = true;
          baseAnglesRef.current[drag.index] = drag.startAngle + dx * 0.01;
        }
      } else if (hitTestLaser(e.clientX, e.clientY) >= 0) {
        document.body.style.cursor = 'ns-resize';
      } else {
        document.body.style.cursor = hitTestMirror(e.clientX, e.clientY) >= 0 ? 'grab' : '';
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag) {
        // A click (no drag) snaps a mirror to the next 45° step.
        if (drag.kind === 'mirror' && !drag.moved) {
          baseAnglesRef.current[drag.index] = drag.startAngle + Math.PI / 4;
        }
        dragRef.current = null;
        if (hitTestLaser(e.clientX, e.clientY) >= 0) {
          document.body.style.cursor = 'ns-resize';
        } else {
          document.body.style.cursor = hitTestMirror(e.clientX, e.clientY) >= 0 ? 'grab' : '';
        }
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
      const { subCols, subRows, centers, half } = layout();
      const cols = Math.ceil(cw / charW);
      const rows = Math.ceil(ch / charH);
      const totalCells = cols * rows;

      // Per-character-cell accumulators: Braille dot bits, plus the color of the
      // brightest sub-dot that landed in the cell (one color per glyph).
      const dotBits = new Uint8Array(totalCells);
      const cellColor: ([number, number, number] | null)[] = new Array(totalCells).fill(null);
      const cellInten = new Float32Array(totalCells);

      const setDot = (
        sx: number, sy: number,
        color: [number, number, number], intensity: number
      ) => {
        const ix = Math.round(sx), iy = Math.round(sy);
        if (ix < 0 || ix >= subCols || iy < 0 || iy >= subRows) return;
        const cellCol = ix >> 1, cellRow = iy >> 2;
        if (cellCol >= cols || cellRow >= rows) return;
        const idx = cellRow * cols + cellCol;
        dotBits[idx] |= BRAILLE_DOTS[iy & 3][ix & 1];
        if (intensity > cellInten[idx]) {
          cellInten[idx] = intensity;
          cellColor[idx] = color;
        }
      };

      // Build mirrors with a gentle ambient wobble layered on the base angle.
      const mirrors: Mirror[] = centers.map((c, i) => {
        const wobble = Math.sin(elapsed * 0.25 + phasesRef.current[i]) * 0.06;
        const angle = baseAnglesRef.current[i] + wobble;
        return buildMirror(c.cx, c.cy, half, angle);
      });

      // ── Mirrors (dim, drawn as real sub-pixel segments) ──
      for (const m of mirrors) {
        const len = Math.hypot(m.bx - m.ax, m.by - m.ay);
        const steps = Math.max(2, Math.ceil(len * 1.6));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          setDot(m.ax + (m.bx - m.ax) * t, m.ay + (m.by - m.ay) * t, MIRROR_COLOR, 0.22);
        }
      }

      // ── Trace colored beams entering from the left ──
      const allSegs: BeamSeg[] = [];
      const entryYs: number[] = [];
      for (let i = 0; i < NUM_BEAMS; i++) {
        // Draggable entry point per beam, fired straight into the grid.
        const entryY = beamYsRef.current[i] * subRows;
        entryYs.push(entryY);
        const segs = traceBeam(1, entryY, 1, 0, mirrors, subCols, subRows, BEAM_COLORS[i]);
        for (const seg of segs) allSegs.push(seg);
      }

      // ── Rasterize beam segments into sub-pixel dots (brightest wins per cell) ──
      for (const seg of allSegs) {
        const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
        const steps = Math.max(1, Math.ceil(len * 1.5));
        // Keep faded beams visible while still reading as dimmer.
        const lift = liftFloor + (1 - liftFloor) * seg.intensity;
        const color: [number, number, number] = [
          Math.min(255, Math.floor(seg.color[0] * lift)),
          Math.min(255, Math.floor(seg.color[1] * lift)),
          Math.min(255, Math.floor(seg.color[2] * lift)),
        ];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          setDot(seg.x0 + (seg.x1 - seg.x0) * t, seg.y0 + (seg.y1 - seg.y0) * t, color, seg.intensity);
        }
      }

      // ── Light source markers on the left edge ──
      for (let i = 0; i < NUM_BEAMS; i++) {
        const c = BEAM_COLORS[i];
        for (let d = -2; d <= 2; d++) {
          setDot(1, entryYs[i] + d, c, 1.0);
          setDot(0, entryYs[i] + d, c, 1.0);
        }
      }

      // ── Final render pass ──
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CELL_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const bits = dotBits[idx];
          if (!bits) continue;
          const color = cellColor[idx] ?? MIRROR_COLOR;
          ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
          ctx.fillText(String.fromCharCode(0x2800 + bits), col * charW, row * charH);
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
  }, [background, theme]);

  if (background !== 'mirror-grid') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: theme === 'light' ? 0.55 : 0.35 }}
    />
  );
}
