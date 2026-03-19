"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';

// ── Simplex noise (2D) ─────────────────────────────────────────────────────
// Adapted from Stefan Gustavson's simplex noise implementation

const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

function buildPermTable(seed: number): { perm: Uint8Array; permMod12: Uint8Array } {
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates with seeded RNG
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

function createNoise2D(seed: number) {
  const { perm, permMod12 } = buildPermTable(seed);
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

  return function noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    let i1: number, j1: number;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi0 = permMod12[ii + perm[jj]];
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
    }

    // Returns value in [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  };
}

// ── Seed from string ────────────────────────────────────────────────────────

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// ── Config (matching URL params, grayscale) ─────────────────────────────────

const CELL_SIZE = 12;
const WAVE_AMPLITUDE = 0.2;
const WAVE_SPEED = 0.4;
const NOISE_INTENSITY = 0.06;
const VIGNETTE_INTENSITY = 0.6;
const VIGNETTE_RADIUS = 0.5;
const BRIGHTNESS = -0.15;
const CONTRAST = 1.5;
const TIME_SPEED = 1.3;
const SEED = hashSeed('3lzwko');

// Thresholds and corresponding glyphs (ascending density)
const THRESHOLDS: [number, string][] = [
  [0.16, ' '],
  [0.18, '.'],
  [0.28, '-'],
  [0.38, '+'],
  [0.48, 'o'],
];
const MAX_GLYPH = '#';

// ── Component ───────────────────────────────────────────────────────────────

export default function SimplexNoiseBackground() {
  const { background } = useBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (background !== 'simplex-noise') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const noise = createNoise2D(SEED);

    // Measure char dimensions
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

    const startTime = performance.now();

    const loop = (now: number) => {
      const elapsed = (now - startTime) / 1000.0;
      const time = elapsed * TIME_SPEED;

      const cw = canvas.width;
      const ch = canvas.height;
      const cols = Math.ceil(cw / charW);
      const rows = Math.ceil(ch / charH);

      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CELL_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      const cx = cols / 2;
      const cy = rows / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Sample noise with wave distortion
          const nx = col * NOISE_INTENSITY + Math.sin(time * WAVE_SPEED + row * 0.1) * WAVE_AMPLITUDE;
          const ny = row * NOISE_INTENSITY + Math.cos(time * WAVE_SPEED + col * 0.1) * WAVE_AMPLITUDE;
          const nt = time * 0.3;

          // Multi-octave noise for cloud-like appearance
          let val = noise(nx + nt, ny + nt * 0.7) * 0.6
                  + noise(nx * 2.0 + nt * 1.1, ny * 2.0 - nt * 0.5) * 0.25
                  + noise(nx * 4.0 - nt * 0.8, ny * 4.0 + nt * 0.3) * 0.15;

          // Normalize from [-1,1] to [0,1]
          val = (val + 1.0) * 0.5;

          // Apply contrast and brightness
          val = (val - 0.5) * CONTRAST + 0.5 + BRIGHTNESS;
          val = Math.max(0, Math.min(1, val));

          // Apply vignette
          const dx = (col - cx) / cx;
          const dy = (row - cy) / cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const vignette = 1.0 - Math.max(0, (dist - VIGNETTE_RADIUS) / (1.0 - VIGNETTE_RADIUS)) * VIGNETTE_INTENSITY;
          val *= Math.max(0, Math.min(1, vignette));

          // Map to glyph
          let glyph = MAX_GLYPH;
          for (let t = 0; t < THRESHOLDS.length; t++) {
            if (val < THRESHOLDS[t][0]) {
              glyph = THRESHOLDS[t][1];
              break;
            }
          }

          if (glyph === ' ') continue;

          // Grayscale brightness from density
          const gray = Math.floor(val * 180 + 40);
          ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
          ctx.fillText(glyph, col * charW, row * charH);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [background]);

  if (background !== 'simplex-noise') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.35 }}
    />
  );
}
