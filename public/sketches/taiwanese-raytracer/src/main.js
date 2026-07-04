const canvas = document.getElementById('raytracer');
const loading = document.getElementById('loading');
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});

if (!gl) {
  loading.textContent = 'WebGL2 unavailable';
  throw new Error('WebGL2 is required for the Taiwanese Motifs ray tracer.');
}

const controls = {
  relief: document.getElementById('relief'),
  micro: document.getElementById('micro'),
  reflect: document.getElementById('reflect'),
  exposure: document.getElementById('exposure'),
  resolution: document.getElementById('resolution'),
};

const outputs = {
  relief: document.getElementById('reliefValue'),
  micro: document.getElementById('microValue'),
  reflect: document.getElementById('reflectValue'),
  exposure: document.getElementById('exposureValue'),
  resolution: document.getElementById('resolutionValue'),
  fps: document.getElementById('fps'),
  scale: document.getElementById('scaleText'),
};

const motionToggle = document.getElementById('motionToggle');
const fitToggle = document.getElementById('fitToggle');
const collapseToggle = document.getElementById('collapseToggle');
const controlsPanel = document.getElementById('controls');

const state = {
  width: 1,
  height: 1,
  dpr: 1,
  targetScale: Number(controls.resolution.value),
  motion: true,
  fullImage: false,
  pointer: { x: 0.62, y: 0.38, down: false, lastX: 0, lastY: 0 },
  orbit: { yaw: -0.16, pitch: 0.08 },
  lastFrame: performance.now(),
  fps: 0,
};

const vertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec2 position;
out vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform vec2 uResolution;
uniform vec2 uTexSize;
uniform vec2 uPointer;
uniform float uTime;
uniform float uRelief;
uniform float uMicro;
uniform float uReflectance;
uniform float uExposure;
uniform float uFullImage;
uniform float uMotion;
uniform vec2 uOrbit;

const float PI = 3.14159265359;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }

vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

vec3 toDisplay(vec3 c) {
  c = max(c, vec3(0.0));
  return pow(c, vec3(1.0 / 2.2));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

mat3 rotX(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(
    1.0, 0.0, 0.0,
    0.0, c, s,
    0.0, -s, c
  );
}

mat3 rotY(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

mat3 panelRotation() {
  return rotY(uOrbit.x) * rotX(uOrbit.y);
}

vec3 imageSample(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    vec2 edgeUv = clamp(uv, vec2(0.0), vec2(1.0));
    vec3 edge = toLinear(texture(uImage, edgeUv).rgb);
    float vignette = smoothstep(1.1, 0.15, length(uv - 0.5));
    return edge * (0.18 + 0.18 * vignette);
  }

  return toLinear(texture(uImage, uv).rgb);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

float sourceLum(vec2 uv) {
  return luminance(imageSample(uv));
}

float lineTexture(vec2 uv) {
  float vertical = abs(fract(uv.x * uTexSize.x * 0.53) - 0.5);
  float horizontal = abs(fract(uv.y * uTexSize.y * 0.21) - 0.5);
  float v = 1.0 - smoothstep(0.0, 0.22, vertical);
  float h = 1.0 - smoothstep(0.0, 0.18, horizontal);
  return max(v * 0.16, h * 0.08);
}

float heightAt(vec2 uv) {
  vec2 texel = 1.0 / uTexSize;
  vec3 c = imageSample(uv);
  float l = luminance(c);

  float lN = sourceLum(uv + vec2(0.0, texel.y));
  float lS = sourceLum(uv - vec2(0.0, texel.y));
  float lE = sourceLum(uv + vec2(texel.x, 0.0));
  float lW = sourceLum(uv - vec2(texel.x, 0.0));
  float edge = length(vec2(lE - lW, lN - lS));

  float high = smoothstep(0.14, 0.78, l);
  float brightRidge = pow(saturate(l * 1.25), 1.35);
  float darkRelief = pow(1.0 - saturate(l * 1.7), 3.0) * 0.18;
  float ridge = smoothstep(0.018, 0.125, edge);
  float grain = (hash12(floor(uv * uTexSize * 0.65)) - 0.5) * 0.035 * uMicro;
  float grooves = lineTexture(uv) * uMicro;

  float h = high * 0.46 + brightRidge * 0.34 + ridge * 0.27 + darkRelief + grooves + grain;
  return saturate(pow(h, 1.08));
}

vec2 traceRelief(vec2 uv, vec2 viewStep, out float hitHeight) {
  const int STEPS = 42;
  vec2 p = uv;
  vec2 prevP = p;
  float layer = 0.0;
  float prevLayer = 0.0;
  float h = heightAt(p);
  float prevH = h;

  for (int i = 0; i < STEPS; i++) {
    prevP = p;
    prevLayer = layer;
    prevH = h;
    layer += 1.0 / float(STEPS);
    p += viewStep / float(STEPS);
    h = heightAt(p);
    if (layer > h) {
      break;
    }
  }

  float before = prevH - prevLayer;
  float after = h - layer;
  float w = before / max(before - after, 0.0001);
  vec2 hit = mix(prevP, p, saturate(w));
  hitHeight = heightAt(hit);
  return hit;
}

vec3 normalAt(vec2 uv) {
  vec2 texel = 1.0 / uTexSize;
  float hL = heightAt(uv - vec2(texel.x, 0.0));
  float hR = heightAt(uv + vec2(texel.x, 0.0));
  float hD = heightAt(uv - vec2(0.0, texel.y));
  float hU = heightAt(uv + vec2(0.0, texel.y));
  vec2 slope = vec2(hL - hR, hD - hU);

  float fineA = hash12(floor(uv * uTexSize * 1.1));
  float fineB = hash12(floor((uv + 0.013) * uTexSize * 1.4));
  slope += vec2(fineA - 0.5, fineB - 0.5) * 0.018 * uMicro;

  return normalize(vec3(slope * (17.0 + 7.0 * uMicro) * uRelief, 1.0));
}

float shadowRay(vec2 uv, float h, vec3 lightDir) {
  if (lightDir.z <= 0.02) return 0.72;

  vec2 ray = lightDir.xy / max(lightDir.z, 0.08) * 0.052 * uRelief;
  float shadow = 1.0;

  for (int i = 1; i <= 14; i++) {
    float t = float(i) / 14.0;
    float sampleH = heightAt(uv + ray * t);
    float clearance = h + t * 0.42;
    float block = smoothstep(clearance - 0.08, clearance + 0.04, sampleH);
    shadow = min(shadow, 1.0 - block * (1.0 - t * 0.45));
  }

  return mix(0.36, 1.0, shadow);
}

float ambientOcclusion(vec2 uv, float h) {
  vec2 texel = 1.0 / uTexSize;
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = (float(i) + 0.5) * PI * 0.25;
    vec2 dir = vec2(cos(a), sin(a));
    float radius = 3.0 + float(i % 3) * 2.0;
    float s = heightAt(uv + dir * texel * radius);
    occ += saturate((s - h) * 2.4 + 0.12);
  }
  return saturate(1.0 - occ / 8.0);
}

vec3 environmentColor(vec3 r) {
  r = normalize(r);
  float up = r.y * 0.5 + 0.5;
  vec3 base = mix(vec3(0.022, 0.025, 0.027), vec3(0.62, 0.66, 0.67), pow(up, 1.6));

  float stripA = pow(max(0.0, 1.0 - abs(r.x * 2.7 + r.y * 0.32)), 68.0);
  float stripB = pow(max(0.0, 1.0 - abs(r.x * 1.05 - r.y * 1.65 + 0.16)), 46.0);
  float stripC = pow(max(0.0, 1.0 - abs(r.y * 3.8 - 1.15)), 92.0);
  float warm = pow(max(0.0, dot(r, normalize(vec3(-0.52, 0.28, 0.81)))), 115.0);
  float cool = pow(max(0.0, dot(r, normalize(vec3(0.66, -0.18, 0.72)))), 86.0);

  base += vec3(1.0, 0.86, 0.56) * (stripA * 2.6 + warm * 5.2);
  base += vec3(0.50, 0.92, 0.86) * (stripB * 1.65 + cool * 2.7);
  base += vec3(0.95, 0.98, 1.0) * stripC * 1.2;

  return base;
}

vec3 shade(vec2 uv, vec3 viewDirLocal, mat3 panelRot, float hitHeight) {
  vec3 base = imageSample(uv);
  float luma = luminance(base);
  vec3 nLocal = normalAt(uv);
  vec3 nWorld = normalize(panelRot * nLocal);
  vec3 vWorld = normalize(panelRot * vec3(-viewDirLocal.xy, max(0.16, -viewDirLocal.z)));

  float orbit = uTime * (0.18 * uMotion);
  vec2 pointer = uPointer * 2.0 - 1.0;
  vec3 lightAWorld = normalize(vec3(-0.50 + pointer.x * 0.95 + sin(orbit) * 0.22, 0.42 - pointer.y * 0.55, 0.74));
  vec3 lightBWorld = normalize(vec3(0.72 + cos(orbit * 0.73) * 0.18, -0.22, 0.62));
  vec3 lightA = normalize(transpose(panelRot) * lightAWorld);
  vec3 lightB = normalize(transpose(panelRot) * lightBWorld);

  float ndlA = saturate(dot(nLocal, lightA));
  float ndlB = saturate(dot(nLocal, lightB));
  float shA = shadowRay(uv, hitHeight, lightA);
  float shB = shadowRay(uv, hitHeight, lightB);
  float ao = ambientOcclusion(uv, hitHeight);

  vec3 hA = normalize(lightAWorld + vWorld);
  vec3 hB = normalize(lightBWorld + vWorld);
  float rough = mix(0.12, 0.38, saturate(1.0 - hitHeight + lineTexture(uv) * 0.8));
  rough = mix(rough, 0.07, smoothstep(0.62, 1.0, hitHeight));
  float glossPower = mix(155.0, 38.0, rough);
  float specA = pow(saturate(dot(nWorld, hA)), glossPower) * (1.6 + 2.7 * hitHeight) * shA;
  float specB = pow(saturate(dot(nWorld, hB)), glossPower * 0.72) * (0.9 + 1.5 * hitHeight) * shB;

  vec3 metalTint = mix(vec3(0.19, 0.18, 0.145), vec3(0.78, 0.74, 0.62), smoothstep(0.12, 0.82, luma));
  vec3 transmitted = mix(base, metalTint, 0.52);
  vec3 diffuse = transmitted * (0.18 + ndlA * 0.70 * shA + ndlB * 0.30 * shB) * ao;

  vec3 reflected = environmentColor(reflect(-vWorld, nWorld));
  float fresnel = pow(1.0 - saturate(dot(nWorld, vWorld)), 5.0);
  float reflectMask = (0.22 + 0.58 * hitHeight + 0.35 * fresnel) * uReflectance;

  vec2 refractUv = uv + nLocal.xy * (0.010 + 0.012 * hitHeight) * uRelief;
  vec3 refracted = imageSample(refractUv) * vec3(0.82, 0.90, 0.88);

  float sparkleSeed = hash12(floor(uv * uTexSize * 0.36));
  float sparkleMask = smoothstep(0.965, 1.0, sparkleSeed) * smoothstep(0.44, 0.95, hitHeight);
  float sparklePhase = sin(uTime * 2.4 + sparkleSeed * 19.0 + dot(uv, vec2(41.0, -57.0)));
  vec3 sparkle = vec3(0.82, 1.0, 0.93) * pow(saturate(sparklePhase), 12.0) * sparkleMask * uMotion;

  vec3 color = diffuse;
  color = mix(color, refracted, 0.12 + fresnel * 0.08);
  color += reflected * reflectMask;
  color += vec3(1.0, 0.86, 0.54) * specA;
  color += vec3(0.62, 0.95, 0.92) * specB;
  color += sparkle * 2.4;

  float sourceDetail = smoothstep(0.03, 0.35, length(vec2(dFdx(luma), dFdy(luma))) * 180.0);
  color *= 0.88 + sourceDetail * 0.18;
  return color;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  ndc.x *= uResolution.x / max(1.0, uResolution.y);

  float breathe = sin(uTime * 0.16) * 0.018 * uMotion;
  mat3 panelRot = panelRotation();
  vec3 panelCenter = vec3(0.0, 0.0, 0.0);
  vec3 panelNormal = normalize(panelRot * vec3(0.0, 0.0, 1.0));
  vec3 cameraPos = vec3(0.0, 0.0, 2.68);
  vec3 rayWorld = normalize(vec3(ndc * (0.66 + breathe), -1.42));

  float denom = dot(rayWorld, panelNormal);
  float t = dot(panelCenter - cameraPos, panelNormal) / max(abs(denom), 0.0001) * sign(denom);
  vec3 hitPlaneWorld = cameraPos + rayWorld * t;
  vec3 hitPlaneLocal = transpose(panelRot) * (hitPlaneWorld - panelCenter);
  float texAspect = uTexSize.x / max(1.0, uTexSize.y);
  float panelH = mix(3.72, 2.56, uFullImage);
  float panelW = panelH * texAspect;
  vec2 baseUv = vec2(hitPlaneLocal.x / panelW + 0.5, hitPlaneLocal.y / panelH + 0.5);
  float onPanel = step(0.0, t) *
                  step(0.0, baseUv.x) * step(baseUv.x, 1.0) *
                  step(0.0, baseUv.y) * step(baseUv.y, 1.0);
  float coverFade = smoothstep(0.004, 0.020, min(min(baseUv.x, 1.0 - baseUv.x), min(baseUv.y, 1.0 - baseUv.y))) * onPanel;

  vec3 rayLocal = normalize(transpose(panelRot) * rayWorld);

  vec2 viewStep = rayLocal.xy / max(0.16, -rayLocal.z) * (0.078 * uRelief);
  float hitHeight = 0.0;
  vec2 hitUv = traceRelief(baseUv, viewStep, hitHeight);

  vec3 color = shade(hitUv, rayLocal, panelRot, hitHeight);

  float vignette = smoothstep(1.28, 0.20, length(ndc * vec2(0.70, 0.92)));
  vec3 border = environmentColor(normalize(vec3(ndc, 0.46))) * 0.16;
  color = mix(border, color, coverFade);
  color *= 0.72 + vignette * 0.44;

  color = vec3(1.0) - exp(-color * uExposure);
  color = toDisplay(color);
  color += (hash12(gl_FragCoord.xy + uTime * 17.0) - 0.5) / 255.0;

  fragColor = vec4(saturate(color), 1.0);
}
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'Shader compilation failed.');
  }

  return shader;
}

function createProgram() {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || 'Program link failed.');
  }

  return program;
}

const program = createProgram();
const uniforms = {
  image: gl.getUniformLocation(program, 'uImage'),
  resolution: gl.getUniformLocation(program, 'uResolution'),
  texSize: gl.getUniformLocation(program, 'uTexSize'),
  pointer: gl.getUniformLocation(program, 'uPointer'),
  time: gl.getUniformLocation(program, 'uTime'),
  relief: gl.getUniformLocation(program, 'uRelief'),
  micro: gl.getUniformLocation(program, 'uMicro'),
  reflectance: gl.getUniformLocation(program, 'uReflectance'),
  exposure: gl.getUniformLocation(program, 'uExposure'),
  fullImage: gl.getUniformLocation(program, 'uFullImage'),
  motion: gl.getUniformLocation(program, 'uMotion'),
  orbit: gl.getUniformLocation(program, 'uOrbit'),
};

const vao = gl.createVertexArray();
const quad = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1,
   3, -1,
  -1,  3,
]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

const texture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

let imageSize = { width: 1, height: 1 };
let startTime = performance.now();

function resize() {
  const pixelScale = Math.max(0.5, Math.min(1, Number(controls.resolution.value)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * pixelScale;
  const nextWidth = Math.max(1, Math.round(window.innerWidth * dpr));
  const nextHeight = Math.max(1, Math.round(window.innerHeight * dpr));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    state.width = nextWidth;
    state.height = nextHeight;
    state.dpr = dpr;
    gl.viewport(0, 0, nextWidth, nextHeight);
  }

  outputs.scale.textContent = pixelScale.toFixed(2);
}

function updateOutputs() {
  outputs.relief.textContent = Number(controls.relief.value).toFixed(2);
  outputs.micro.textContent = Number(controls.micro.value).toFixed(2);
  outputs.reflect.textContent = Number(controls.reflect.value).toFixed(2);
  outputs.exposure.textContent = Number(controls.exposure.value).toFixed(2);
  outputs.resolution.textContent = Number(controls.resolution.value).toFixed(2);
  outputs.scale.textContent = Number(controls.resolution.value).toFixed(2);
}

function render(now) {
  const dt = Math.max(1, now - state.lastFrame);
  state.lastFrame = now;
  state.fps = state.fps * 0.92 + (1000 / dt) * 0.08;
  outputs.fps.textContent = String(Math.round(state.fps));

  resize();
  updateOutputs();

  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.uniform1i(uniforms.image, 0);
  gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  gl.uniform2f(uniforms.texSize, imageSize.width, imageSize.height);
  gl.uniform2f(uniforms.pointer, state.pointer.x, state.pointer.y);
  gl.uniform1f(uniforms.time, (now - startTime) * 0.001);
  gl.uniform1f(uniforms.relief, Number(controls.relief.value));
  gl.uniform1f(uniforms.micro, Number(controls.micro.value));
  gl.uniform1f(uniforms.reflectance, Number(controls.reflect.value));
  gl.uniform1f(uniforms.exposure, Number(controls.exposure.value));
  gl.uniform1f(uniforms.fullImage, state.fullImage ? 1 : 0);
  gl.uniform1f(uniforms.motion, state.motion ? 1 : 0);
  gl.uniform2f(uniforms.orbit, state.orbit.yaw, state.orbit.pitch);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(render);
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  state.pointer.y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
}

canvas.addEventListener('pointerdown', (event) => {
  state.pointer.down = true;
  state.pointer.lastX = event.clientX;
  state.pointer.lastY = event.clientY;
  setPointerFromEvent(event);
  canvas.style.cursor = 'grabbing';
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (state.pointer.down) {
    const dx = event.clientX - state.pointer.lastX;
    const dy = event.clientY - state.pointer.lastY;
    state.orbit.yaw = Math.max(-1.05, Math.min(1.05, state.orbit.yaw + dx * 0.006));
    state.orbit.pitch = Math.max(-0.72, Math.min(0.72, state.orbit.pitch - dy * 0.006));
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
  }
  setPointerFromEvent(event);
});
canvas.addEventListener('pointerup', (event) => {
  state.pointer.down = false;
  canvas.style.cursor = 'crosshair';
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});
canvas.addEventListener('pointercancel', () => {
  state.pointer.down = false;
  canvas.style.cursor = 'crosshair';
});
canvas.addEventListener('dblclick', () => {
  state.orbit.yaw = -0.16;
  state.orbit.pitch = 0.08;
});

motionToggle.addEventListener('click', () => {
  state.motion = !state.motion;
  motionToggle.dataset.active = String(state.motion);
});

fitToggle.addEventListener('click', () => {
  state.fullImage = !state.fullImage;
  fitToggle.dataset.active = String(state.fullImage);
});

collapseToggle.addEventListener('click', () => {
  const collapsed = controlsPanel.classList.toggle('is-collapsed');
  collapseToggle.textContent = collapsed ? 'Show' : 'Hide';
});

controls.resolution.addEventListener('input', resize);
window.addEventListener('resize', resize);

async function loadTexture() {
  const image = new Image();
  image.decoding = 'async';
  image.src = './assets/taiwanese-motifs.webp';
  await image.decode();

  imageSize = { width: image.naturalWidth, height: image.naturalHeight };
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);

  loading.classList.add('is-hidden');
}

loadTexture()
  .then(() => {
    resize();
    updateOutputs();
    requestAnimationFrame((now) => {
      startTime = now;
      state.lastFrame = now;
      requestAnimationFrame(render);
    });
  })
  .catch((error) => {
    console.error(error);
    loading.textContent = 'Texture load failed';
  });
