"use client";

import { useEffect, useRef } from 'react';
import { useBackground } from './background-provider';

const CHAR_FONT_SIZE = 12;
const SIM_SCALE = 1;
const JACOBI_ITERATIONS = 20;
const DYE_DISSIPATION = 0.985;
const VELOCITY_DISSIPATION = 0.985;
const CURL_STRENGTH = 8.0;
const SPLAT_RADIUS = 0.008;
const SPLAT_FORCE = 2000;
const AUTO_SPLAT_INTERVAL = 3000; // ms between auto splats
const NUM_AUTO_SPLATS = 1; // simultaneous splats per interval
const NUM_EMITTERS = 2; // persistent flowing emitters

// ASCII density ramp
const DENSITY_CHARS = ' .:-=+*#%@';

// ── WebGL2 helpers ──────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const p = gl.createProgram()!;
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

interface FBO {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

function createFBO(gl: WebGL2RenderingContext, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): FBO {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, framebuffer, width: w, height: h };
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap: () => void;
}

function createDoubleFBO(gl: WebGL2RenderingContext, w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFBO {
  let read = createFBO(gl, w, h, internalFormat, format, type, filter);
  let write = createFBO(gl, w, h, internalFormat, format, type, filter);
  return {
    get read() { return read; },
    get write() { return write; },
    swap() { const t = read; read = write; write = t; },
  };
}

// ── Shaders ─────────────────────────────────────────────────────────────────

const BASE_VS = `#version 300 es
in vec2 a_position;
out vec2 vUv;
void main() {
  vUv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_target;
uniform float u_aspectRatio;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;
out vec4 fragColor;
void main() {
  vec2 p = vUv - u_point;
  p.x *= u_aspectRatio;
  vec3 splat = exp(-dot(p, p) / u_radius) * u_color;
  vec3 base = texture(u_target, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const ADVECTION_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;
out vec4 fragColor;
vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main() {
  vec2 coord = vUv - u_dt * texture(u_velocity, vUv).xy * u_texelSize;
  fragColor = u_dissipation * bilerp(u_source, coord, u_texelSize);
}`;

const DIVERGENCE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_velocity, vUv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_velocity, vUv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_velocity, vUv - vec2(0.0, u_texelSize.y)).y;
  float T = texture(u_velocity, vUv + vec2(0.0, u_texelSize.y)).y;
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const CURL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_velocity, vUv - vec2(u_texelSize.x, 0.0)).y;
  float R = texture(u_velocity, vUv + vec2(u_texelSize.x, 0.0)).y;
  float B = texture(u_velocity, vUv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_velocity, vUv + vec2(0.0, u_texelSize.y)).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texelSize;
uniform float u_curlStrength;
uniform float u_dt;
out vec4 fragColor;
void main() {
  float L = texture(u_curl, vUv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_curl, vUv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_curl, vUv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_curl, vUv + vec2(0.0, u_texelSize.y)).x;
  float C = texture(u_curl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  float len = length(force) + 0.0001;
  force = force / len * u_curlStrength * C;
  vec2 vel = texture(u_velocity, vUv).xy;
  fragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}`;

const PRESSURE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_pressure, vUv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, vUv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_pressure, vUv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_pressure, vUv + vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SUBTRACT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  float L = texture(u_pressure, vUv - vec2(u_texelSize.x, 0.0)).x;
  float R = texture(u_pressure, vUv + vec2(u_texelSize.x, 0.0)).x;
  float B = texture(u_pressure, vUv - vec2(0.0, u_texelSize.y)).x;
  float T = texture(u_pressure, vUv + vec2(0.0, u_texelSize.y)).x;
  vec2 vel = texture(u_velocity, vUv).xy;
  vel -= vec2(R - L, T - B) * 0.5;
  fragColor = vec4(vel, 0.0, 1.0);
}`;

const CLEAR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D u_texture;
uniform float u_value;
out vec4 fragColor;
void main() {
  fragColor = u_value * texture(u_texture, vUv);
}`;

// ── Emitter: a point that wanders around the screen injecting dye ───────────

interface Emitter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
}

function createEmitter(): Emitter {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.0003 + Math.random() * 0.0005;
  return {
    x: 0.15 + Math.random() * 0.7,
    y: 0.15 + Math.random() * 0.7,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    phase: Math.random() * Math.PI * 2,
    speed,
  };
}

function updateEmitter(e: Emitter, time: number) {
  // Wander with smooth curves
  const wander = 0.00015;
  e.vx += Math.sin(time * 0.7 + e.phase) * wander;
  e.vy += Math.cos(time * 0.9 + e.phase * 1.3) * wander;
  // Clamp speed
  const s = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (s > e.speed * 2) {
    e.vx = (e.vx / s) * e.speed * 2;
    e.vy = (e.vy / s) * e.speed * 2;
  }
  e.x += e.vx;
  e.y += e.vy;
  // Bounce off edges
  if (e.x < 0.05 || e.x > 0.95) { e.vx *= -1; e.x = Math.max(0.05, Math.min(0.95, e.x)); }
  if (e.y < 0.05 || e.y > 0.95) { e.vy *= -1; e.y = Math.max(0.05, Math.min(0.95, e.y)); }
}

// ── Component ───────────────────────────────────────────────────────────────

function randomColor(): [number, number, number] {
  const hue = Math.random() * 360;
  const s = 0.7 + Math.random() * 0.3;
  const l = 0.4 + Math.random() * 0.2;
  // HSL to RGB
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

export default function FluidBackground() {
  const { background, contentHidden } = useBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const contentHiddenRef = useRef(contentHidden);

  useEffect(() => {
    contentHiddenRef.current = contentHidden;
  }, [contentHidden]);

  useEffect(() => {
    if (background !== 'fluid') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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

    // ── size canvas ──
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // ── sim dimensions ──
    const gridCols = Math.ceil(window.innerWidth / charW);
    const gridRows = Math.ceil(window.innerHeight / charH);
    const simW = Math.ceil(gridCols / SIM_SCALE);
    const simH = Math.ceil(gridRows / SIM_SCALE);

    // ── WebGL2 offscreen context ──
    const glCanvas = document.createElement('canvas');
    glCanvas.width = simW;
    glCanvas.height = simH;
    const gl = glCanvas.getContext('webgl2');

    if (!gl) {
      return () => { window.removeEventListener('resize', resize); };
    }

    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      return () => { window.removeEventListener('resize', resize); };
    }
    gl.getExtension('OES_texture_float_linear');

    // ── compile programs ──
    const splatProg = createProgram(gl, BASE_VS, SPLAT_FS);
    const advectionProg = createProgram(gl, BASE_VS, ADVECTION_FS);
    const divergenceProg = createProgram(gl, BASE_VS, DIVERGENCE_FS);
    const curlProg = createProgram(gl, BASE_VS, CURL_FS);
    const vorticityProg = createProgram(gl, BASE_VS, VORTICITY_FS);
    const pressureProg = createProgram(gl, BASE_VS, PRESSURE_FS);
    const gradientProg = createProgram(gl, BASE_VS, GRADIENT_SUBTRACT_FS);
    const clearProg = createProgram(gl, BASE_VS, CLEAR_FS);

    if (!splatProg || !advectionProg || !divergenceProg || !curlProg || !vorticityProg || !pressureProg || !gradientProg || !clearProg) {
      return () => { window.removeEventListener('resize', resize); };
    }

    // ── fullscreen quad ──
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    for (const prog of [splatProg, advectionProg, divergenceProg, curlProg, vorticityProg, pressureProg, gradientProg, clearProg]) {
      const loc = gl.getAttribLocation(prog, 'a_position');
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }

    // ── FBOs ──
    const texType = gl.FLOAT;
    const filtering = gl.NEAREST;

    const velocity = createDoubleFBO(gl, simW, simH, gl.RG32F, gl.RG, texType, filtering);
    const dye = createDoubleFBO(gl, simW, simH, gl.RGBA32F, gl.RGBA, texType, filtering);
    const divergenceFBO = createFBO(gl, simW, simH, gl.R32F, gl.RED, texType, filtering);
    const curlFBO = createFBO(gl, simW, simH, gl.R32F, gl.RED, texType, filtering);
    const pressure = createDoubleFBO(gl, simW, simH, gl.R32F, gl.RED, texType, filtering);

    const texelSizeX = 1.0 / simW;
    const texelSizeY = 1.0 / simH;
    const aspectRatio = simW / simH;

    function blit(target: FBO | null) {
      if (target) {
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
        gl!.viewport(0, 0, target.width, target.height);
      } else {
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
        gl!.viewport(0, 0, simW, simH);
      }
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    function splat(x: number, y: number, dx: number, dy: number, color: [number, number, number], radius?: number) {
      const r = radius ?? SPLAT_RADIUS;
      gl!.useProgram(splatProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(splatProg!, 'u_target'), 0);
      gl!.uniform1f(gl!.getUniformLocation(splatProg!, 'u_aspectRatio'), aspectRatio);
      gl!.uniform2f(gl!.getUniformLocation(splatProg!, 'u_point'), x, y);
      gl!.uniform3f(gl!.getUniformLocation(splatProg!, 'u_color'), dx, dy, 0.0);
      gl!.uniform1f(gl!.getUniformLocation(splatProg!, 'u_radius'), r);
      blit(velocity.write);
      velocity.swap();

      gl!.bindTexture(gl!.TEXTURE_2D, dye.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(splatProg!, 'u_target'), 0);
      gl!.uniform3f(gl!.getUniformLocation(splatProg!, 'u_color'), color[0], color[1], color[2]);
      blit(dye.write);
      dye.swap();
    }

    // ── mouse tracking ──
    let lastMouseX = -1;
    let lastMouseY = -1;

    const onMouseMove = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - e.clientY / window.innerHeight;
      if (lastMouseX >= 0) {
        const dx = (x - lastMouseX) * SPLAT_FORCE;
        const dy = (y - lastMouseY) * SPLAT_FORCE;
        const mouseColor: [number, number, number] = contentHiddenRef.current
          ? randomColor().map(c => c * 0.4) as [number, number, number]
          : [0.3, 0.3, 0.3];
        splat(x, y, dx, dy, mouseColor);
      }
      lastMouseX = x;
      lastMouseY = y;
    };

    const onMouseLeave = () => {
      lastMouseX = -1;
      lastMouseY = -1;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    // ── emitters: persistent wandering dye sources ──
    const emitters: Emitter[] = [];
    for (let i = 0; i < NUM_EMITTERS; i++) {
      emitters.push(createEmitter());
    }

    // ── auto-splat: random bursts across screen ──
    let lastAutoSplat = 0;

    function autoSplats(now: number) {
      if (now - lastAutoSplat < AUTO_SPLAT_INTERVAL) return;
      lastAutoSplat = now;

      for (let i = 0; i < NUM_AUTO_SPLATS; i++) {
        const x = Math.random();
        const y = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const force = SPLAT_FORCE * 0.15;
        const dx = Math.cos(angle) * force;
        const dy = Math.sin(angle) * force;
        const brightness = 0.05 + Math.random() * 0.1;
        const radius = SPLAT_RADIUS;
        const autoColor: [number, number, number] = contentHiddenRef.current
          ? randomColor().map(c => c * brightness * 2) as [number, number, number]
          : [brightness, brightness, brightness];
        splat(x, y, dx, dy, autoColor, radius);
      }
    }

    function emitterSplats(time: number) {
      for (const e of emitters) {
        updateEmitter(e, time);
        const force = SPLAT_FORCE * 0.15;
        const dx = e.vx * force * 200;
        const dy = e.vy * force * 200;
        const brightness = 0.08 + 0.05 * Math.sin(time * 1.0 + e.phase);
        const emitterColor: [number, number, number] = contentHiddenRef.current
          ? randomColor().map(c => c * brightness * 2) as [number, number, number]
          : [brightness, brightness, brightness];
        splat(e.x, e.y, dx, dy, emitterColor, SPLAT_RADIUS);
      }
    }

    // ── simulation step ──
    function step(dt: number) {
      // Curl
      gl!.useProgram(curlProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(curlProg!, 'u_velocity'), 0);
      gl!.uniform2f(gl!.getUniformLocation(curlProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      blit(curlFBO);

      // Vorticity confinement
      gl!.useProgram(vorticityProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(vorticityProg!, 'u_velocity'), 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, curlFBO.texture);
      gl!.uniform1i(gl!.getUniformLocation(vorticityProg!, 'u_curl'), 1);
      gl!.uniform2f(gl!.getUniformLocation(vorticityProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      gl!.uniform1f(gl!.getUniformLocation(vorticityProg!, 'u_curlStrength'), CURL_STRENGTH);
      gl!.uniform1f(gl!.getUniformLocation(vorticityProg!, 'u_dt'), dt);
      blit(velocity.write);
      velocity.swap();

      // Advect velocity
      gl!.useProgram(advectionProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(advectionProg!, 'u_velocity'), 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(advectionProg!, 'u_source'), 1);
      gl!.uniform2f(gl!.getUniformLocation(advectionProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      gl!.uniform1f(gl!.getUniformLocation(advectionProg!, 'u_dt'), dt);
      gl!.uniform1f(gl!.getUniformLocation(advectionProg!, 'u_dissipation'), VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      // Advect dye
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, dye.read.texture);
      gl!.uniform1f(gl!.getUniformLocation(advectionProg!, 'u_dissipation'), DYE_DISSIPATION);
      blit(dye.write);
      dye.swap();

      // Compute divergence
      gl!.useProgram(divergenceProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(divergenceProg!, 'u_velocity'), 0);
      gl!.uniform2f(gl!.getUniformLocation(divergenceProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      blit(divergenceFBO);

      // Clear pressure
      gl!.useProgram(clearProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, pressure.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(clearProg!, 'u_texture'), 0);
      gl!.uniform1f(gl!.getUniformLocation(clearProg!, 'u_value'), 0.8);
      blit(pressure.write);
      pressure.swap();

      // Jacobi pressure solve
      gl!.useProgram(pressureProg);
      gl!.uniform2f(gl!.getUniformLocation(pressureProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, divergenceFBO.texture);
      gl!.uniform1i(gl!.getUniformLocation(pressureProg!, 'u_divergence'), 1);
      for (let i = 0; i < JACOBI_ITERATIONS; i++) {
        gl!.activeTexture(gl!.TEXTURE0);
        gl!.bindTexture(gl!.TEXTURE_2D, pressure.read.texture);
        gl!.uniform1i(gl!.getUniformLocation(pressureProg!, 'u_pressure'), 0);
        blit(pressure.write);
        pressure.swap();
      }

      // Gradient subtraction
      gl!.useProgram(gradientProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, pressure.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(gradientProg!, 'u_pressure'), 0);
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, velocity.read.texture);
      gl!.uniform1i(gl!.getUniformLocation(gradientProg!, 'u_velocity'), 1);
      gl!.uniform2f(gl!.getUniformLocation(gradientProg!, 'u_texelSize'), texelSizeX, texelSizeY);
      blit(velocity.write);
      velocity.swap();
    }

    // ── readback buffer ──
    const readBuf = new Float32Array(simW * simH * 4);

    // ── animation loop ──
    const ctx = canvas.getContext('2d')!;
    let lastTime = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.016666);
      lastTime = now;
      const timeSec = now / 1000;

      emitterSplats(timeSec);
      autoSplats(now);
      step(dt);

      // Read back dye field
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, dye.read.framebuffer);
      gl!.readPixels(0, 0, simW, simH, gl!.RGBA, gl!.FLOAT, readBuf);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);

      // ASCII render
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = `${CHAR_FONT_SIZE}px ${fontFamily}`;
      ctx.textBaseline = 'top';

      for (let row = 0; row < simH; row++) {
        for (let col = 0; col < simW; col++) {
          // Dye texture is bottom-up (OpenGL), so flip Y
          const texRow = simH - 1 - row;
          const idx = (texRow * simW + col) * 4;
          const r = readBuf[idx];
          const g = readBuf[idx + 1];
          const b = readBuf[idx + 2];
          const val = Math.max(0, Math.min(1, (r + g + b) / 3.0));

          const charIdx = Math.min(DENSITY_CHARS.length - 1, Math.floor(val * DENSITY_CHARS.length));
          const ch2 = DENSITY_CHARS[charIdx];
          if (ch2 === ' ') continue;

          if (contentHiddenRef.current) {
            // Color mode: scale RGB channels to visible range
            const cr = Math.floor(Math.max(0, Math.min(1, r)) * 220 + 35);
            const cg = Math.floor(Math.max(0, Math.min(1, g)) * 220 + 35);
            const cb = Math.floor(Math.max(0, Math.min(1, b)) * 220 + 35);
            ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          } else {
            const gray = Math.floor(val * 180 + 40);
            ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
          }
          ctx.fillText(ch2, col * charW * SIM_SCALE, row * charH * SIM_SCALE);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    // Initial splats to seed the simulation
    for (let i = 0; i < 4; i++) {
      const x = 0.2 + Math.random() * 0.6;
      const y = 0.2 + Math.random() * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const force = SPLAT_FORCE * 0.2;
      const brightness = 0.1 + Math.random() * 0.1;
      const initColor: [number, number, number] = contentHiddenRef.current
        ? randomColor().map(c => c * brightness * 2) as [number, number, number]
        : [brightness, brightness, brightness];
      splat(x, y, Math.cos(angle) * force, Math.sin(angle) * force, initColor);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [background]);

  if (background !== 'fluid') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity: 0.35 }}
    />
  );
}
