"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';

const NUM_BOIDS = 1000;
const TEX_W = 32;
const TEX_H = 32; // 32*32=1024 >= 1000
const CHAR_FONT_SIZE = 14;
const WORLD_SCALE = 2; // boid world is 2x grid for sub-cell smoothness

// ── WebGL2 shaders ──────────────────────────────────────────────────────────

const QUAD_VS = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const COMPUTE_FS = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2 u_stateSize;
uniform vec2 u_worldSize;
uniform vec2 u_mousePos; // -1,-1 when inactive

out vec4 fragColor;

const float MAX_SPEED = 3.0;
const float MAX_FORCE = 0.08;
const float SEP_DIST = 5.0;
const float NEIGHBOR_DIST = 20.0;
const float FLEE_DIST = 30.0;
const float FLEE_STRENGTH = 3.0;

vec2 clampLen(vec2 v, float mx) {
  float l = length(v);
  return l > mx ? v * (mx / l) : v;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int idx = coord.y * int(u_stateSize.x) + coord.x;

  if (idx >= ${NUM_BOIDS}) {
    fragColor = vec4(0.0);
    return;
  }

  vec4 me = texelFetch(u_state, coord, 0);
  vec2 pos = me.xy;
  vec2 vel = me.zw;

  vec2 sep = vec2(0.0), ali = vec2(0.0), coh = vec2(0.0);
  float sN = 0.0, aN = 0.0, cN = 0.0;

  for (int i = 0; i < ${NUM_BOIDS}; i++) {
    ivec2 tc = ivec2(i % ${TEX_W}, i / ${TEX_W});
    vec4 o = texelFetch(u_state, tc, 0);
    float d = distance(pos, o.xy);

    if (d > 0.001 && d < SEP_DIST) {
      sep += normalize(pos - o.xy) / d;
      sN += 1.0;
    }
    if (d > 0.001 && d < NEIGHBOR_DIST) {
      ali += o.zw;
      coh += o.xy;
      aN += 1.0;
      cN += 1.0;
    }
  }

  vec2 force = vec2(0.0);

  if (sN > 0.0) {
    sep /= sN;
    if (length(sep) > 0.0) {
      force += clampLen(normalize(sep) * MAX_SPEED - vel, MAX_FORCE) * 1.8;
    }
  }
  if (aN > 0.0) {
    ali /= aN;
    if (length(ali) > 0.001) {
      force += clampLen(normalize(ali) * MAX_SPEED - vel, MAX_FORCE);
    }
  }
  if (cN > 0.0) {
    coh /= cN;
    vec2 d = coh - pos;
    if (length(d) > 0.001) {
      force += clampLen(normalize(d) * MAX_SPEED - vel, MAX_FORCE);
    }
  }

  // flee from cursor
  if (u_mousePos.x >= 0.0) {
    float md = distance(pos, u_mousePos);
    if (md > 0.001 && md < FLEE_DIST) {
      vec2 away = normalize(pos - u_mousePos);
      force += clampLen(away * MAX_SPEED - vel, MAX_FORCE) * FLEE_STRENGTH * (1.0 - md / FLEE_DIST);
    }
  }

  // gravity toward center
  vec2 gc = u_worldSize * 0.5 - pos;
  if (length(gc) > 0.001) {
    force += clampLen(normalize(gc) * MAX_SPEED - vel, MAX_FORCE) * 0.5;
  }

  vel = clampLen(vel + force, MAX_SPEED);
  pos += vel;

  // wrap borders
  if (pos.x < 2.0) pos.x = u_worldSize.x - 2.0;
  if (pos.y < 2.0) pos.y = u_worldSize.y - 2.0;
  if (pos.x > u_worldSize.x - 2.0) pos.x = 2.0;
  if (pos.y > u_worldSize.y - 2.0) pos.y = 2.0;

  fragColor = vec4(pos, vel);
}`;

// ── helpers ─────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  const vShader = compileShader(gl, gl.VERTEX_SHADER, vs)!;
  const fShader = compileShader(gl, gl.FRAGMENT_SHADER, fs)!;
  gl.attachShader(p, vShader);
  gl.attachShader(p, fShader);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function createFloat32Texture(gl: WebGL2RenderingContext, w: number, h: number, data: Float32Array | null) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Velocity → color: angle → hue, speed → lightness
function velocityColor(vx: number, vy: number): string {
  const angle = Math.atan2(vy, vx);
  const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360; // 0-360
  const speed = Math.sqrt(vx * vx + vy * vy);
  const lightness = Math.min(80, Math.floor((speed / 3.0) * 50 + 30));
  return `hsl(${Math.floor(hue)},85%,${lightness}%)`;
}

// Arrow chars for 8 directions based on velocity angle
function arrowChar(vx: number, vy: number): string {
  const angle = Math.atan2(vy, vx); // -PI to PI
  // Divide into 8 sectors of 45 degrees each
  // Sector boundaries at multiples of PI/8 offset from 0
  if (angle > -Math.PI / 8 && angle <= Math.PI / 8) return '\u2192';       // → right
  if (angle > Math.PI / 8 && angle <= 3 * Math.PI / 8) return '\u2198';    // ↘ down-right
  if (angle > 3 * Math.PI / 8 && angle <= 5 * Math.PI / 8) return '\u2193'; // ↓ down
  if (angle > 5 * Math.PI / 8 && angle <= 7 * Math.PI / 8) return '\u2199'; // ↙ down-left
  if (angle > -3 * Math.PI / 8 && angle <= -Math.PI / 8) return '\u2197';  // ↗ up-right
  if (angle > -5 * Math.PI / 8 && angle <= -3 * Math.PI / 8) return '\u2191'; // ↑ up
  if (angle > -7 * Math.PI / 8 && angle <= -5 * Math.PI / 8) return '\u2196'; // ↖ up-left
  return '\u2190'; // ← left (covers both edges near ±PI)
}

// ── component ───────────────────────────────────────────────────────────────

export default function FlockingBackground() {
  const { background, contentHidden } = useBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const contentHiddenRef = useRef(contentHidden);
  const stateRef = useRef<{
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    fb: [WebGLFramebuffer, WebGLFramebuffer];
    tex: [WebGLTexture, WebGLTexture];
    ping: number;
    readBuf: Float32Array;
    worldW: number;
    worldH: number;
    charW: number;
    charH: number;
    gridCols: number;
    gridRows: number;
    vao: WebGLVertexArrayObject;
  } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    contentHiddenRef.current = contentHidden;
  }, [contentHidden]);

  useEffect(() => {
    if (background !== 'flocking') {
      // cleanup
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stateRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── measure character dimensions ──
    const measureCtx = document.createElement('canvas').getContext('2d')!;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';
    measureCtx.font = `${CHAR_FONT_SIZE}px ${fontFamily}`;
    const charW = measureCtx.measureText('M').width;
    const charH = CHAR_FONT_SIZE * 1.2;

    // ── size canvas to viewport ──
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      // Convert screen coords to world coords
      const wx = (e.clientX / charW) * WORLD_SCALE;
      const wy = (e.clientY / charH) * WORLD_SCALE;
      mousePosRef.current = { x: wx, y: wy };
    };
    const onMouseLeave = () => {
      mousePosRef.current = { x: -1, y: -1 };
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    const gridCols = Math.floor(canvas.width / charW);
    const gridRows = Math.floor(canvas.height / charH);
    const worldW = gridCols * WORLD_SCALE;
    const worldH = gridRows * WORLD_SCALE;

    // ── set up WebGL2 offscreen context for GPU compute ──
    const glCanvas = document.createElement('canvas');
    glCanvas.width = TEX_W;
    glCanvas.height = TEX_H;
    const gl = glCanvas.getContext('webgl2')!;

    if (!gl) {
      console.warn('WebGL2 not available, falling back to CPU simulation');
      // CPU fallback below
      runCPUFallback(canvas, charW, charH, gridCols, gridRows, worldW, worldH, fontFamily, rafRef, mousePosRef, contentHiddenRef);
      return () => {
        cancelAnimationFrame(rafRef.current);
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseleave', onMouseLeave);
      };
    }

    // Enable float textures for render targets
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      console.warn('EXT_color_buffer_float not available, CPU fallback');
      runCPUFallback(canvas, charW, charH, gridCols, gridRows, worldW, worldH, fontFamily, rafRef, mousePosRef, contentHiddenRef);
      return () => {
        cancelAnimationFrame(rafRef.current);
        window.removeEventListener('resize', resize);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseleave', onMouseLeave);
      };
    }

    const program = createProgram(gl, QUAD_VS, COMPUTE_FS);
    if (!program) return;

    // ── fullscreen quad VAO ──
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ── initialize boid data ──
    const initData = new Float32Array(TEX_W * TEX_H * 4);
    for (let i = 0; i < NUM_BOIDS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const off = i * 4;
      initData[off] = Math.random() * worldW; // posX
      initData[off + 1] = Math.random() * worldH; // posY
      initData[off + 2] = Math.cos(angle); // velX
      initData[off + 3] = Math.sin(angle); // velY (fixed: Rust bug used cos twice)
    }

    // ── ping-pong textures + framebuffers ──
    const tex0 = createFloat32Texture(gl, TEX_W, TEX_H, initData);
    const tex1 = createFloat32Texture(gl, TEX_W, TEX_H, null);
    const fb0 = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex0, 0);
    const fb1 = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex1, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const readBuf = new Float32Array(TEX_W * TEX_H * 4);

    stateRef.current = {
      gl, program,
      fb: [fb0, fb1],
      tex: [tex0, tex1],
      ping: 0,
      readBuf,
      worldW, worldH,
      charW, charH,
      gridCols, gridRows,
      vao,
    };

    // ── animation loop (throttled to ~20fps like Rust version) ──
    const ctx = canvas.getContext('2d')!;
    const FRAME_INTERVAL = 50; // ms between simulation ticks
    let lastFrame = 0;

    const loop = (now: number) => {
      const s = stateRef.current;
      if (!s) return;

      if (now - lastFrame < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrame = now;

      // Recompute grid on resize
      const cw = canvas.width;
      const ch = canvas.height;

      // GPU compute step
      const { gl, program, fb, tex, vao } = s;
      const src = s.ping;
      const dst = 1 - src;

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, TEX_W, TEX_H);

      // Bind source texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[src]);
      gl.uniform1i(gl.getUniformLocation(program, 'u_state'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'u_stateSize'), TEX_W, TEX_H);
      gl.uniform2f(gl.getUniformLocation(program, 'u_worldSize'), s.worldW, s.worldH);
      gl.uniform2f(gl.getUniformLocation(program, 'u_mousePos'), mousePosRef.current.x, mousePosRef.current.y);

      // Render to destination framebuffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb[dst]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Read back boid data
      gl.readPixels(0, 0, TEX_W, TEX_H, gl.RGBA, gl.FLOAT, s.readBuf);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      s.ping = dst;

      // ── ASCII render ──
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CHAR_FONT_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let i = 0; i < NUM_BOIDS; i++) {
        const off = i * 4;
        const px = s.readBuf[off];
        const py = s.readBuf[off + 1];
        const vx = s.readBuf[off + 2];
        const vy = s.readBuf[off + 3];

        // Grid position (world / scale)
        const gx = Math.floor(px / WORLD_SCALE);
        const gy = Math.floor(py / WORLD_SCALE);

        if (gx < 0 || gx >= s.gridCols || gy < 0 || gy >= s.gridRows) continue;

        if (contentHiddenRef.current) {
          ctx.fillStyle = velocityColor(vx, vy);
        } else {
          const speed = Math.sqrt(vx * vx + vy * vy);
          const gray = Math.min(255, Math.floor((speed / 3.0) * 200 + 55));
          ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        }
        ctx.fillText(arrowChar(vx, vy), gx * s.charW, gy * s.charH);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop as FrameRequestCallback);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      stateRef.current = null;
    };
  }, [background]);

  if (background !== 'flocking') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.35 }}
    />
  );
}

// ── CPU fallback (same algorithm, no WebGL) ─────────────────────────────────

function runCPUFallback(
  canvas: HTMLCanvasElement,
  charW: number,
  charH: number,
  gridCols: number,
  gridRows: number,
  worldW: number,
  worldH: number,
  fontFamily: string,
  rafRef: React.MutableRefObject<number>,
  mousePosRef: React.MutableRefObject<{ x: number; y: number }>,
  contentHiddenRef: React.MutableRefObject<boolean>,
) {
  const ctx = canvas.getContext('2d')!;
  const MAX_SPEED = 3.0;
  const MAX_FORCE = 0.08;

  interface Boid { px: number; py: number; vx: number; vy: number; }

  const boids: Boid[] = [];
  for (let i = 0; i < NUM_BOIDS; i++) {
    const a = Math.random() * Math.PI * 2;
    boids.push({ px: Math.random() * worldW, py: Math.random() * worldH, vx: Math.cos(a), vy: Math.sin(a) });
  }

  function clampLen(x: number, y: number, max: number): [number, number] {
    const l = Math.sqrt(x * x + y * y);
    if (l > max) { const s = max / l; return [x * s, y * s]; }
    return [x, y];
  }

  function normalize(x: number, y: number): [number, number] {
    const l = Math.sqrt(x * x + y * y);
    return l > 0.001 ? [x / l, y / l] : [0, 0];
  }

  const FRAME_INTERVAL = 50;
  let lastFrame = 0;

  const loop = (now: number) => {
    if (now - lastFrame < FRAME_INTERVAL) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    lastFrame = now;

    // update
    for (let i = 0; i < NUM_BOIDS; i++) {
      const b = boids[i];
      let sx = 0, sy = 0, sN = 0;
      let ax = 0, ay = 0, aN = 0;
      let cx = 0, cy = 0, cN = 0;

      for (let j = 0; j < NUM_BOIDS; j++) {
        if (i === j) continue;
        const o = boids[j];
        const dx = b.px - o.px, dy = b.py - o.py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.001 && d < 5.0) {
          const [nx, ny] = normalize(dx, dy);
          sx += nx / d; sy += ny / d; sN++;
        }
        if (d > 0.001 && d < 20.0) {
          ax += o.vx; ay += o.vy; aN++;
          cx += o.px; cy += o.py; cN++;
        }
      }

      let fx = 0, fy = 0;
      if (sN > 0) {
        sx /= sN; sy /= sN;
        const l = Math.sqrt(sx * sx + sy * sy);
        if (l > 0) {
          const [nx, ny] = normalize(sx, sy);
          const [s1, s2] = clampLen(nx * MAX_SPEED - b.vx, ny * MAX_SPEED - b.vy, MAX_FORCE);
          fx += s1 * 1.8; fy += s2 * 1.8;
        }
      }
      if (aN > 0) {
        ax /= aN; ay /= aN;
        const l = Math.sqrt(ax * ax + ay * ay);
        if (l > 0.001) {
          const [nx, ny] = normalize(ax, ay);
          const [s1, s2] = clampLen(nx * MAX_SPEED - b.vx, ny * MAX_SPEED - b.vy, MAX_FORCE);
          fx += s1; fy += s2;
        }
      }
      if (cN > 0) {
        cx /= cN; cy /= cN;
        const dx = cx - b.px, dy = cy - b.py;
        const l = Math.sqrt(dx * dx + dy * dy);
        if (l > 0.001) {
          const [nx, ny] = normalize(dx, dy);
          const [s1, s2] = clampLen(nx * MAX_SPEED - b.vx, ny * MAX_SPEED - b.vy, MAX_FORCE);
          fx += s1; fy += s2;
        }
      }
      // flee from cursor
      {
        const mp = mousePosRef.current;
        if (mp.x >= 0) {
          const dx = b.px - mp.x, dy = b.py - mp.y;
          const md = Math.sqrt(dx * dx + dy * dy);
          if (md > 0.001 && md < 30.0) {
            const [nx, ny] = normalize(dx, dy);
            const [s1, s2] = clampLen(nx * MAX_SPEED - b.vx, ny * MAX_SPEED - b.vy, MAX_FORCE);
            const strength = 3.0 * (1.0 - md / 30.0);
            fx += s1 * strength; fy += s2 * strength;
          }
        }
      }
      // gravity
      {
        const dx = worldW / 2 - b.px, dy = worldH / 2 - b.py;
        const l = Math.sqrt(dx * dx + dy * dy);
        if (l > 0.001) {
          const [nx, ny] = normalize(dx, dy);
          const [s1, s2] = clampLen(nx * MAX_SPEED - b.vx, ny * MAX_SPEED - b.vy, MAX_FORCE);
          fx += s1 * 0.5; fy += s2 * 0.5;
        }
      }

      b.vx += fx; b.vy += fy;
      [b.vx, b.vy] = clampLen(b.vx, b.vy, MAX_SPEED);
      b.px += b.vx; b.py += b.vy;
      if (b.px < 2) b.px = worldW - 2;
      if (b.py < 2) b.py = worldH - 2;
      if (b.px > worldW - 2) b.px = 2;
      if (b.py > worldH - 2) b.py = 2;
    }

    // render
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${CHAR_FONT_SIZE}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    for (const b of boids) {
      const gx = Math.floor(b.px / WORLD_SCALE);
      const gy = Math.floor(b.py / WORLD_SCALE);
      if (gx < 0 || gx >= gridCols || gy < 0 || gy >= gridRows) continue;
      if (contentHiddenRef.current) {
        ctx.fillStyle = velocityColor(b.vx, b.vy);
      } else {
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const gray = Math.min(255, Math.floor((speed / 3.0) * 200 + 55));
        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
      }
      ctx.fillText(arrowChar(b.vx, b.vy), gx * charW, gy * charH);
    }

    rafRef.current = requestAnimationFrame(loop);
  };

  rafRef.current = requestAnimationFrame(loop);
}
