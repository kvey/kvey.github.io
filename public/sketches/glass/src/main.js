import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { generateStainedGlass } from './glassGenerator.js';

// ---------- Scene constants ----------
// The glass plane rebuilds to match the source image aspect, preserving area
// so the visual size stays roughly constant whether it's portrait or landscape.
const GLASS_AREA = 14.96;           // ~ 3.4 * 4.4 — keep the previous default scale
const GLASS_BOTTOM = 1.55;          // raised so the window sits cut into the wall, not on the floor
const GLASS_Z = 0;
let GLASS_W = 3.4;
let GLASS_H = 4.4;
let GLASS_CENTER_Y = GLASS_BOTTOM + GLASS_H / 2;

// ---------- Renderer ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const BASE_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(BASE_PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07060a, 12, 38);

// ---------- Skybox (equirectangular) ----------
// Loaded once at startup; the glass shader also samples this texture so light
// glass cells reveal hints of the sky behind the window.
const skyTexture = new THREE.TextureLoader().load('./sky.jpg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  // Wrap horizontally so longitude can flow across the seam without artifacts.
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
});
scene.background = skyTexture;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(1.8, 2.9, 7.0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.0, 1.4);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 3.5;
controls.maxDistance = 12;
controls.enablePan = false;

// ---------- Glass texture (filled in after first generation) ----------
const glassTexture = new THREE.CanvasTexture(makePlaceholderCanvas());
glassTexture.colorSpace = THREE.SRGBColorSpace;
glassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
glassTexture.minFilter = THREE.LinearMipmapLinearFilter;
glassTexture.magFilter = THREE.LinearFilter;

// ---------- Glass material factory ----------
// Each window in the hallway gets its own ShaderMaterial so it can hold its
// own texture / uniforms. The shader source is reused (extracted below).
const GLASS_VERT_SRC = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GLASS_FRAG_SRC = /* glsl */`
  #define PI 3.14159265359
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform sampler2D uMap;
  uniform vec2 uTexSize;
  uniform float uBacklight;
  uniform float uLeadR;
  uniform float uDistMaxPx;
  uniform vec3 uLeadTint;
  uniform sampler2D uSkyTex;
  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;

  vec3 sampleSky(vec3 dir) {
    float lon = atan(dir.z, dir.x);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    return texture2D(uSkyTex, uv).rgb;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    vec3 glassColor = tex.rgb * uBacklight;
    vec2 texel = 1.0 / uTexSize;

    vec3 viewThrough = normalize(vWorldPos - uCameraPos);
    vec3 skyColor = sampleSky(viewThrough);
    float sunDot = dot(viewThrough, -normalize(uSunDir));
    float sunCore = pow(max(0.0, sunDot), 320.0) * 6.0;
    float sunHalo = pow(max(0.0, sunDot), 16.0) * 0.55;
    vec3 sunGlow = vec3(1.0, 0.92, 0.78) * (sunCore + sunHalo);

    float Dc  = tex.a * uDistMaxPx;
    float Dxp = texture2D(uMap, vUv + vec2( texel.x, 0.0)).a * uDistMaxPx;
    float Dxm = texture2D(uMap, vUv + vec2(-texel.x, 0.0)).a * uDistMaxPx;
    float Dyp = texture2D(uMap, vUv + vec2(0.0,  texel.y)).a * uDistMaxPx;
    float Dym = texture2D(uMap, vUv + vec2(0.0, -texel.y)).a * uDistMaxPx;
    float D = (Dc * 2.0 + Dxp + Dxm + Dyp + Dym) * 0.16666667;

    float leadAlpha = 1.0 - smoothstep(uLeadR - 0.75, uLeadR + 0.75, D);
    vec2 glassSlope = vec2(
      dot(texture2D(uMap, vUv + vec2( texel.x, 0.0)).rgb - texture2D(uMap, vUv + vec2(-texel.x, 0.0)).rgb, vec3(0.30, 0.59, 0.11)),
      dot(texture2D(uMap, vUv + vec2(0.0,  texel.y)).rgb - texture2D(uMap, vUv + vec2(0.0, -texel.y)).rgb, vec3(0.30, 0.59, 0.11))
    );
    float paneSeed = hash12(tex.rg * 271.0 + tex.br * 97.0);
    vec2 waveDirA = normalize(vec2(0.92 + paneSeed * 0.22, 0.28 - paneSeed * 0.18));
    vec2 waveDirB = normalize(vec2(-0.18 - paneSeed * 0.26, 0.98));
    float freqA = mix(18.0, 31.0, paneSeed);
    float freqB = mix(10.0, 18.0, hash12(tex.gb * 193.0 + 5.1));
    float phaseA = paneSeed * 37.0;
    float phaseB = hash12(tex.br * 151.0 + 9.7) * 31.0;
    float leadClear = smoothstep(uLeadR + 0.10, uLeadR + 1.80, D);
    float waveA = sin(dot(vUv, waveDirA) * freqA + phaseA);
    float waveB = sin(dot(vUv, waveDirB) * freqB + phaseB);
    float textureSignal = smoothstep(0.006, 0.030, length(glassSlope));
    vec3 colorBucket = floor(tex.rgb * 10.0) / 10.0;
    float selectedPane = step(0.36, hash12(colorBucket.rg * 41.0 + colorBucket.br * 17.0));
    float rippleStrength = leadClear * max(textureSignal, selectedPane * 0.90);
    vec2 rippleSlope =
      waveDirA * cos(dot(vUv, waveDirA) * freqA + phaseA) * freqA * 0.0084 +
      waveDirB * cos(dot(vUv, waveDirB) * freqB + phaseB) * freqB * 0.0066;
    float paneWarp = (hash12(vUv * 4096.0 + tex.rg * 37.0) - 0.5) * 0.014;
    vec3 paneN = normalize(vec3(glassSlope * 0.22 + rippleSlope * rippleStrength + paneWarp, 1.0));
    if (leadAlpha < 0.001) {
      float lum = dot(tex.rgb, vec3(0.30, 0.59, 0.11));
      float translucency = smoothstep(0.08, 0.65, lum) * 0.55;
      float rippleBand = pow(clamp(0.5 + 0.5 * (waveA * 0.72 + waveB * 0.28), 0.0, 1.0), 2.4) * rippleStrength;
      vec3 rippledView = normalize(viewThrough + vec3(paneN.xy * 0.48, 0.0));
      vec3 reflectedSky = sampleSky(reflect(viewThrough, paneN));
      float paneSun = pow(max(0.0, dot(reflect(normalize(uSunDir), paneN), -viewThrough)), 72.0);
      vec3 transmitted = (sampleSky(rippledView) + sunGlow) * tex.rgb * 1.6;
      vec3 finalGlass = mix(glassColor, transmitted, translucency);
      finalGlass *= 0.92 + rippleBand * 0.20;
      finalGlass += reflectedSky * (0.035 + 0.13 * rippleStrength);
      finalGlass += vec3(1.0, 0.92, 0.76) * (paneSun * 0.34 + rippleBand * 0.18);
      gl_FragColor = vec4(finalGlass, 1.0);
      return;
    }

    vec2 grad = vec2(Dxp - Dxm, Dyp - Dym) * 0.5;
    float gradLen = length(grad);
    vec3 N = vec3(0.0, 0.0, 1.0);
    if (gradLen > 0.05) {
      vec2 outDir = grad / gradLen;
      float clampedD = min(D, uLeadR * 0.95);
      float h = sqrt(max(0.001, uLeadR * uLeadR - clampedD * clampedD));
      float hp = clampedD / h;
      N = normalize(vec3(outDir * hp, 1.0));
    }
    vec3 lightDir = normalize(vec3(0.45, -0.50, 0.78));
    vec3 viewDir  = vec3(0.0, 0.0, 1.0);
    float NdotL = max(0.0, dot(N, lightDir));
    vec3 H = normalize(lightDir + viewDir);
    float NdotH = max(0.0, dot(N, H));
    float spec = pow(NdotH, 36.0);
    vec3 silverLit = uLeadTint * (0.30 + 0.62 * NdotL)
                     + vec3(0.85) * spec
                     + glassColor * 0.10;
    vec3 finalColor = mix(glassColor, silverLit, leadAlpha);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function makeGlassMaterial(initialTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap:        { value: initialTexture },
      uTexSize:    { value: new THREE.Vector2(64, 64) },
      uBacklight:  { value: 1.25 },
      uLeadR:      { value: 2.0 },
      uDistMaxPx:  { value: 4.0 },
      uLeadTint:   { value: new THREE.Color(0xb8b2aa) },
      uSkyTex:     { value: skyTexture },
      uSunDir:     { value: new THREE.Vector3(-0.22, -0.42, 0.92) },
      uCameraPos:  { value: new THREE.Vector3() },
    },
    vertexShader: GLASS_VERT_SRC,
    fragmentShader: GLASS_FRAG_SRC,
    side: THREE.DoubleSide,
  });
}

// Windows are created lazily when images load — no initial glass mesh here.

// ---------- Procedural wood + plaster textures ----------
const wallPlasterTex = makePlasterTexture();
const floorWoodTex   = makeWoodTexture({ W: 1024, H: 1024, plankH: 110, hueShift: -8 });
const frameWoodTex   = makeFrameWoodTexture();

// ---------- Wall around the glass + 3D wooden window frame ----------
// Two groups so they rebuild together on aspect change.
const WALL_W = 28, WALL_H = 18;
const WALL_Z = GLASS_Z - 0.05;                // plaster sits behind the glass plane
const wallMat = new THREE.MeshBasicMaterial({ map: wallPlasterTex, color: 0x4a4248 });
const trimMat = new THREE.MeshBasicMaterial({ color: 0x05040a });
// Wood — multiple tints so layered mouldings catch light differently.
const frameMatFront     = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x9a704d });
const frameMatSide      = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x80624d });
const frameMatBack      = new THREE.MeshBasicMaterial({ color: 0x1f140a });
const frameMatFrontDark = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x6a4328 });
const frameMatFrontLight = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0xc89d72 });
// Gilded accents (antique gold) — used for inner bead and keystone highlight.
const goldFrontMat = new THREE.MeshBasicMaterial({ color: 0xb38a47 });
const goldSideMat  = new THREE.MeshBasicMaterial({ color: 0x8a6730 });
// Material arrays for BoxGeometry: [+x, -x, +y, -y, +z, -z]
const WOOD_MATS       = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFront,      frameMatBack];
const WOOD_DARK_MATS  = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFrontDark,  frameMatBack];
const WOOD_LIGHT_MATS = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFrontLight, frameMatBack];
const GOLD_MATS       = [goldSideMat,  goldSideMat,  goldSideMat,  goldSideMat,  goldFrontMat,       frameMatBack];
const RT_MAT_WOOD = 1;
const RT_MAT_WOOD_DARK = 2;
const RT_MAT_WOOD_LIGHT = 3;
const RT_MAT_GOLD = 4;
// ---- Hallway wall (plaster strips around every window) and per-window frame.
// As the user uploads more images, each becomes a new `window` object: its
// own glass mesh + frame group + sill, all sitting at its own x offset along
// the wall. `rebuildHallwayWall()` rebuilds the plaster strips that fill the
// gaps between windows.
const HALLWAY_TOP_Y = 14;
const HALLWAY_BOT_Y = -7;
const HALLWAY_EXT_MARGIN = 16;          // wall continues this far past first/last window
const WINDOW_SPACING = 1.6;             // gap between adjacent windows (world units)

const hallwayWall = new THREE.Group();
scene.add(hallwayWall);

function addHallwayStrip(w, h, x, y) {
  if (w < 0.01 || h < 0.01) return;
  const mat = wallMat.clone();
  const tex = wallPlasterTex.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(0.1, w / 3), Math.max(0.1, h / 3));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  mat.map = tex;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, WALL_Z);
  hallwayWall.add(m);
}

// ---- Enclosed room: ceiling + back wall + side walls ----
const ROOM_DEPTH  = 14;   // back wall sits at z = ROOM_DEPTH
const ROOM_HEIGHT = 12;   // ceiling at y = ROOM_HEIGHT
const roomEnclosure = new THREE.Group();
scene.add(roomEnclosure);

function rebuildRoomEnclosure() {
  while (roomEnclosure.children.length) {
    const c = roomEnclosure.children.pop();
    c.geometry?.dispose();
    if (c.material?.map?.dispose) c.material.map.dispose();
    if (c.material?.dispose) c.material.dispose();
  }
  // Match the hallway's left/right extents so the side walls meet the wall
  // we already build for the windows.
  let leftEdge = -16, rightEdge = 16;
  if (windows.length > 0) {
    leftEdge  = windows[0].positionX - windows[0].width / 2;
    rightEdge = windows[windows.length - 1].positionX + windows[windows.length - 1].width / 2;
  }
  const sideLeft  = leftEdge  - HALLWAY_EXT_MARGIN;
  const sideRight = rightEdge + HALLWAY_EXT_MARGIN;
  const roomWidth = sideRight - sideLeft;
  const cx        = (sideLeft + sideRight) / 2;
  const midZ      = (WALL_Z + ROOM_DEPTH) / 2;
  const depth     = ROOM_DEPTH - WALL_Z;

  const makePlasterPlane = (w, h) => {
    const mat = wallMat.clone();
    const tex = wallPlasterTex.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(0.1, w / 3), Math.max(0.1, h / 3));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    mat.map = tex;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  };

  // Ceiling (faces downward, slightly darker tint).
  const ceil = makePlasterPlane(roomWidth, depth);
  ceil.material.color = new THREE.Color(0x322c30);
  ceil.rotation.x =  Math.PI / 2;
  ceil.position.set(cx, ROOM_HEIGHT, midZ);
  roomEnclosure.add(ceil);

  // Back wall (faces -z, opposite the windows).
  const back = makePlasterPlane(roomWidth, ROOM_HEIGHT);
  back.rotation.y = Math.PI;
  back.position.set(cx, ROOM_HEIGHT / 2, ROOM_DEPTH);
  roomEnclosure.add(back);

  // Left side wall (faces +x — toward the room center).
  // Rotation about Y by +π/2 takes the plane's +Z normal to +X.
  const left = makePlasterPlane(depth, ROOM_HEIGHT);
  left.rotation.y = Math.PI / 2;
  left.position.set(sideLeft, ROOM_HEIGHT / 2, midZ);
  roomEnclosure.add(left);

  // Right side wall (faces -x — toward the room center).
  const right = makePlasterPlane(depth, ROOM_HEIGHT);
  right.rotation.y = -Math.PI / 2;
  right.position.set(sideRight, ROOM_HEIGHT / 2, midZ);
  roomEnclosure.add(right);

  // Stash bounds so the camera clamp can keep us inside the room.
  roomBounds.sideLeft  = sideLeft;
  roomBounds.sideRight = sideRight;
  roomBounds.backZ     = ROOM_DEPTH;
  roomBounds.ceilingY  = ROOM_HEIGHT;
}

const roomBounds = { sideLeft: -16, sideRight: 16, backZ: ROOM_DEPTH, ceilingY: ROOM_HEIGHT };

function rebuildHallwayWall() {
  while (hallwayWall.children.length) {
    const c = hallwayWall.children.pop();
    c.geometry?.dispose();
    if (c.material?.map?.dispose) c.material.map.dispose();
    if (c.material?.dispose) c.material.dispose();
  }
  if (windows.length === 0) {
    // No windows yet — just one big plaster wall so the scene isn't empty.
    addHallwayStrip(40, HALLWAY_TOP_Y - HALLWAY_BOT_Y, 0, (HALLWAY_TOP_Y + HALLWAY_BOT_Y) / 2);
    return;
  }
  const first = windows[0];
  const last  = windows[windows.length - 1];
  const leftMost  = first.positionX - first.width / 2;
  const rightMost = last.positionX  + last.width  / 2;
  const extLeft  = leftMost  - HALLWAY_EXT_MARGIN;
  const extRight = rightMost + HALLWAY_EXT_MARGIN;
  const totalW   = extRight - extLeft;
  const centerX  = (extLeft + extRight) / 2;

  const maxTopY = windows.reduce((m, w) => Math.max(m, w.centerY + w.height / 2), -Infinity);
  const minBotY = windows.reduce((m, w) => Math.min(m, w.centerY - w.height / 2),  Infinity);
  addHallwayStrip(totalW, HALLWAY_TOP_Y - maxTopY, centerX, (HALLWAY_TOP_Y + maxTopY) / 2);
  addHallwayStrip(totalW, minBotY - HALLWAY_BOT_Y, centerX, (minBotY + HALLWAY_BOT_Y) / 2);

  // Left & right end caps spanning the heights of the outermost windows.
  if (leftMost - extLeft > 0) {
    addHallwayStrip(leftMost - extLeft, first.height, (extLeft + leftMost) / 2, first.centerY);
  }
  if (extRight - rightMost > 0) {
    addHallwayStrip(extRight - rightMost, last.height, (rightMost + extRight) / 2, last.centerY);
  }
  // Plaster strips between consecutive windows.
  for (let i = 0; i + 1 < windows.length; i++) {
    const a = windows[i], b = windows[i + 1];
    const gL = a.positionX + a.width / 2;
    const gR = b.positionX - b.width / 2;
    if (gR - gL <= 0.01) continue;
    const bot = Math.min(a.centerY - a.height / 2, b.centerY - b.height / 2);
    const top = Math.max(a.centerY + a.height / 2, b.centerY + b.height / 2);
    addHallwayStrip(gR - gL, top - bot, (gL + gR) / 2, (top + bot) / 2);
  }
}

function buildWindowFrame(group, innerW, innerH, centerY, posX) {
  // Layered ornate frame: pilasters with capitals + bases, stepped cornice
  // with keystone, sill with apron, gilded inner bead. All boxes so depth +
  // overhang reads like real moulding from any angle in the room.
  const PILASTER_W = 0.30;
  const PILASTER_D = 0.16;
  const BEAD_W     = 0.05;
  const BEAD_D     = 0.20;   // protrudes past the pilaster face so it reads as a raised inner trim
  const CAP_H      = 0.13;
  const CAP_D      = 0.22;
  const CAP_OVER   = 0.05;
  const BASE_H     = 0.11;
  const BASE_D     = 0.20;
  const BASE_OVER  = 0.05;
  const ARCH_H     = 0.09;
  const ARCH_D     = 0.20;
  const FRIEZE_H   = 0.20;
  const FRIEZE_D   = 0.16;
  const CORNICE_H  = 0.16;
  const CORNICE_D  = 0.34;
  const CORN_OVER  = 0.12;
  const DENTIL_H   = 0.06;
  const DENTIL_D   = 0.24;
  const SILL_H     = 0.18;
  const SILL_D     = 0.36;
  const SILL_OVER  = 0.18;
  const APRON_H    = 0.22;
  const APRON_D    = 0.10;

  const innerL = posX - innerW / 2;
  const innerR = posX + innerW / 2;
  const pilOutL = innerL - PILASTER_W;
  const pilOutR = innerR + PILASTER_W;
  const pilCxL  = (innerL + pilOutL) / 2;
  const pilCxR  = (innerR + pilOutR) / 2;
  const trunkTopY = centerY + innerH / 2;       // top of the pilaster trunk = top of glass
  const trunkBotY = centerY - innerH / 2;
  const frameBoxes = [];

  const rtMatFor = (mats) => {
    if (mats === WOOD_DARK_MATS) return RT_MAT_WOOD_DARK;
    if (mats === WOOD_LIGHT_MATS) return RT_MAT_WOOD_LIGHT;
    if (mats === GOLD_MATS) return RT_MAT_GOLD;
    return RT_MAT_WOOD;
  };

  const box = (w, h, d, mats, x, y, z) => {
    const radius = Math.min(0.045, Math.max(0.006, Math.min(w, h, d) * 0.22));
    const material = Array.isArray(mats) ? mats[4] : mats;
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
    m.position.set(x, y, z);
    group.add(m);
    frameBoxes.push({
      min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      mat: rtMatFor(mats),
    });
    return m;
  };

  // --- Pilasters: vertical trunks beside the glass ---
  box(PILASTER_W, innerH, PILASTER_D, WOOD_MATS, pilCxL, centerY, PILASTER_D / 2);
  box(PILASTER_W, innerH, PILASTER_D, WOOD_MATS, pilCxR, centerY, PILASTER_D / 2);

  // EPS = small offset to keep adjacent faces from sharing a depth value and
  // z-fighting. ~3mm is invisible at scene scale but more than enough headroom
  // for the depth buffer at typical near/far ranges.
  const EPS = 0.003;

  // --- Capitals: decorative blocks above each pilaster ---
  const capW = PILASTER_W + 2 * CAP_OVER;
  const capY = trunkTopY + CAP_H / 2;
  box(capW, CAP_H, CAP_D, WOOD_LIGHT_MATS, pilCxL, capY, CAP_D / 2);
  box(capW, CAP_H, CAP_D, WOOD_LIGHT_MATS, pilCxR, capY, CAP_D / 2);
  // Thin gold band sitting just inside the top of each capital. Sits flush with
  // the capital sides (capW + 2*EPS so left/right faces don't coincide), top
  // recessed by EPS so its top face isn't coplanar with the capital's, and
  // pushed forward 2*EPS so its front face sticks out past the capital face.
  const capBandH = 0.025;
  const capBandCY = capY + CAP_H / 2 - capBandH / 2 - EPS;
  const capBandCZ = CAP_D / 2 + EPS;          // back at z=2*EPS (inside capital), front at z=CAP_D+2*EPS
  box(capW + 2 * EPS, capBandH, CAP_D, GOLD_MATS, pilCxL, capBandCY, capBandCZ);
  box(capW + 2 * EPS, capBandH, CAP_D, GOLD_MATS, pilCxR, capBandCY, capBandCZ);

  // --- Bases: matching blocks below each pilaster ---
  const baseW = PILASTER_W + 2 * BASE_OVER;
  const baseY = trunkBotY - BASE_H / 2;
  box(baseW, BASE_H, BASE_D, WOOD_LIGHT_MATS, pilCxL, baseY, BASE_D / 2);
  box(baseW, BASE_H, BASE_D, WOOD_LIGHT_MATS, pilCxR, baseY, BASE_D / 2);

  // --- Architrave: thin band spanning across the top of the capitals ---
  const archSpanW = pilOutR - pilOutL;
  const archY = capY + CAP_H / 2 + ARCH_H / 2;
  box(archSpanW, ARCH_H, ARCH_D, WOOD_DARK_MATS, posX, archY, ARCH_D / 2);

  // --- Dentil row: small repeating teeth between architrave and frieze ---
  const dentilY = archY + ARCH_H / 2 + DENTIL_H / 2;
  const dentilTargetW = 0.10;
  const dentilGap     = 0.06;
  const dentilStride  = dentilTargetW + dentilGap;
  const dentilCount   = Math.max(3, Math.floor((archSpanW - 0.10) / dentilStride));
  const dentilSpan    = dentilCount * dentilStride - dentilGap;
  const dentilStartX  = posX - dentilSpan / 2 + dentilTargetW / 2;
  for (let i = 0; i < dentilCount; i++) {
    box(dentilTargetW, DENTIL_H, DENTIL_D, WOOD_LIGHT_MATS, dentilStartX + i * dentilStride, dentilY, DENTIL_D / 2);
  }

  // --- Frieze: tall plain panel above the dentil row ---
  const friezeY = dentilY + DENTIL_H / 2 + FRIEZE_H / 2;
  box(archSpanW, FRIEZE_H, FRIEZE_D, WOOD_DARK_MATS, posX, friezeY, FRIEZE_D / 2);

  // --- Keystone: protruding decorative block at center of frieze ---
  const keystoneW = 0.34;
  const keystoneH = FRIEZE_H + DENTIL_H + 0.04;
  const keystoneD = CORNICE_D - 0.04;
  const keystoneYc = dentilY + (FRIEZE_H + DENTIL_H) / 2 - DENTIL_H / 2;
  box(keystoneW, keystoneH, keystoneD, WOOD_LIGHT_MATS, posX, keystoneYc, keystoneD / 2);
  // Two stacked gilded rosette dots on the keystone face. Each layer sits a
  // clear EPS in front of the layer behind it so no back face is coplanar.
  const rosetteD = 0.025;
  const rosette1Z = keystoneD + rosetteD / 2 + EPS;            // back at keystoneD + EPS
  const rosette2D = rosetteD + 0.005;
  const rosette2Z = keystoneD + rosetteD + EPS + rosette2D / 2 + EPS; // back at rosette1's front + EPS
  box(0.10, 0.10, rosetteD,  GOLD_MATS, posX, keystoneYc, rosette1Z);
  box(0.04, 0.04, rosette2D, GOLD_MATS, posX, keystoneYc, rosette2Z);

  // --- Cornice: crown moulding extending past the pilasters ---
  const corniceW = archSpanW + 2 * CORN_OVER;
  const corniceY = friezeY + FRIEZE_H / 2 + CORNICE_H / 2;
  box(corniceW, CORNICE_H, CORNICE_D, WOOD_MATS, posX, corniceY, CORNICE_D / 2);
  // Cornice undershelf — thin lighter band along the bottom of the cornice.
  // Bottom recessed by EPS so it doesn't share its bottom face with the cornice.
  const corniceBandH = 0.04;
  const corniceBandCY = corniceY - CORNICE_H / 2 + corniceBandH / 2 + EPS;
  const corniceBandCZ = CORNICE_D / 2 + EPS;
  box(corniceW + 2 * EPS, corniceBandH, CORNICE_D, WOOD_LIGHT_MATS,
      posX, corniceBandCY, corniceBandCZ);

  // --- Sill: stepped base extending past the pilasters ---
  const sillW = archSpanW + 2 * SILL_OVER;
  const sillY = baseY - BASE_H / 2 - SILL_H / 2;
  box(sillW, SILL_H, SILL_D, WOOD_MATS, posX, sillY, SILL_D / 2);
  // Light upper-step — top recessed by EPS so it doesn't share its top face
  // with the sill; pushed forward so its front face protrudes.
  const sillStepH = 0.045;
  const sillStepCY = sillY + SILL_H / 2 - sillStepH / 2 - EPS;
  const sillStepCZ = SILL_D / 2 + EPS;
  box(sillW - 0.04, sillStepH, SILL_D, WOOD_LIGHT_MATS,
      posX, sillStepCY, sillStepCZ);

  // --- Apron: tapered decorative panel under the sill ---
  const apronW = (pilOutR - pilOutL) * 0.62;
  const apronY = sillY - SILL_H / 2 - APRON_H / 2;
  box(apronW, APRON_H, APRON_D, WOOD_DARK_MATS, posX, apronY, APRON_D / 2);
  // Decorative diamond carved into the apron (small protruding block).
  const diamondS = 0.13;
  box(diamondS, diamondS, APRON_D + 0.02, WOOD_LIGHT_MATS, posX, apronY, APRON_D + 0.01);

  // --- Gilded inner bead: thin gold trim straddling the seam between glass and
  // pilaster on all four sides, protruding past the pilaster face. Vertical
  // and horizontal beads sit at slightly different z so their corner overlaps
  // don't share planar faces. Both pushed back by EPS so they don't sit at
  // exactly z=0 (pilaster back face). ---
  const beadZVert  = BEAD_D / 2 + EPS;
  const beadZHoriz = BEAD_D / 2 + EPS + 2 * EPS;   // 2*EPS forward of verticals
  const beadVertH  = innerH;                       // verticals stop at glass top/bottom
  const beadHorizW = innerW + 2 * BEAD_W;          // horizontals span past the verticals into the corner
  box(BEAD_W,     beadVertH, BEAD_D, GOLD_MATS, innerL, centerY,   beadZVert);
  box(BEAD_W,     beadVertH, BEAD_D, GOLD_MATS, innerR, centerY,   beadZVert);
  box(beadHorizW, BEAD_W,    BEAD_D, GOLD_MATS, posX,   trunkTopY, beadZHoriz);
  box(beadHorizW, BEAD_W,    BEAD_D, GOLD_MATS, posX,   trunkBotY, beadZHoriz);

  // --- Dark inset behind the glass to hide any sub-pixel seam ---
  const inset = new THREE.Mesh(
    new THREE.PlaneGeometry(innerW + 0.04, innerH + 0.04),
    trimMat
  );
  inset.position.set(posX, centerY, GLASS_Z - 0.025);
  group.add(inset);
  return frameBoxes;
}

// ---- Windows (one per uploaded image) ----
const windows = [];
let activeWindowIdx = 0;
let useRaytracer = false;
const sunDir = new THREE.Vector3(-0.22, -0.42, 0.92).normalize();

const RT_MAX_WINDOWS = 6;
const RT_MAX_BOXES = 128;
const RT_POINT_LIGHTS = [
  {
    position: new THREE.Vector3(roomBounds.sideLeft + 1.1, roomBounds.ceilingY - 0.55, roomBounds.backZ - 0.85),
    radius: 0.24,
    color: new THREE.Color(0xffc07a),
    power: 8.5,
  },
  {
    position: new THREE.Vector3(roomBounds.sideRight - 1.1, roomBounds.ceilingY - 0.55, roomBounds.backZ - 0.85),
    radius: 0.24,
    color: new THREE.Color(0xffd2a0),
    power: 6.2,
  },
];
const RT_DEFAULT_POINT_LIGHT_BRIGHTNESS = 0.40;
const RT_ATLAS_COLS = 3;
const RT_ATLAS_ROWS = 2;
const RT_ATLAS_TILE = 512;
const rtAtlasCanvas = document.createElement('canvas');
rtAtlasCanvas.width = RT_ATLAS_COLS * RT_ATLAS_TILE;
rtAtlasCanvas.height = RT_ATLAS_ROWS * RT_ATLAS_TILE;
const rtAtlasCtx = rtAtlasCanvas.getContext('2d');
const rtGlassAtlasTex = new THREE.CanvasTexture(rtAtlasCanvas);
rtGlassAtlasTex.colorSpace = THREE.SRGBColorSpace;
rtGlassAtlasTex.minFilter = THREE.LinearFilter;
rtGlassAtlasTex.magFilter = THREE.LinearFilter;
rtGlassAtlasTex.generateMipmaps = false;

const rtWindowRects = Array.from({ length: RT_MAX_WINDOWS }, () => new THREE.Vector4());
const rtAtlasRects = Array.from({ length: RT_MAX_WINDOWS }, () => new THREE.Vector4());
const rtWindowLead = Array.from({ length: RT_MAX_WINDOWS }, () => new THREE.Vector4(2.0, 4.0, 0, 0));
const rtBoxMinMat = Array.from({ length: RT_MAX_BOXES }, () => new THREE.Vector4());
const rtBoxMax = Array.from({ length: RT_MAX_BOXES }, () => new THREE.Vector4());
const rtPointLightPosRad = RT_POINT_LIGHTS.map((l) => new THREE.Vector4(l.position.x, l.position.y, l.position.z, l.radius));
const rtPointLightColorPower = RT_POINT_LIGHTS.map((l) => new THREE.Vector4(
  l.color.r,
  l.color.g,
  l.color.b,
  l.power * RT_DEFAULT_POINT_LIGHT_BRIGHTNESS
));
const roomPointLights = [];
const roomPointLightGlows = [];

for (const l of RT_POINT_LIGHTS) {
  const light = new THREE.PointLight(l.color, l.power * 3.2 * RT_DEFAULT_POINT_LIGHT_BRIGHTNESS, 10.0, 1.85);
  light.position.copy(l.position);
  scene.add(light);
  roomPointLights.push(light);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(l.radius * 0.45, 16, 8),
    new THREE.MeshBasicMaterial({ color: l.color, transparent: true, opacity: 0.72 * RT_DEFAULT_POINT_LIGHT_BRIGHTNESS })
  );
  glow.position.copy(l.position);
  scene.add(glow);
  roomPointLightGlows.push(glow);
}

const RAYTRACED_SCENE_VERT_SRC = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RAYTRACED_SCENE_FRAG_SRC = /* glsl */`
  precision highp float;
  #define PI 3.14159265359
  #define MAX_WINDOWS ${RT_MAX_WINDOWS}
  #define MAX_BOXES ${RT_MAX_BOXES}
  #define MAX_POINT_LIGHTS ${RT_POINT_LIGHTS.length}
  #define ATLAS_TILE ${RT_ATLAS_TILE}.0

  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform mat4 uCameraWorld;
  uniform mat4 uInvProjection;
  uniform sampler2D uSkyTex;
  uniform sampler2D uFloorTex;
  uniform sampler2D uWallTex;
  uniform sampler2D uFrameWoodTex;
  uniform sampler2D uPrimaryGlassTex;
  uniform sampler2D uGlassAtlas;
  uniform vec3 uSunDir;
  uniform vec2 uPrimaryTexSize;
  uniform vec4 uRoomBounds; // left, right, backZ, ceilingY
  uniform float uWallZ;
  uniform float uRaysDensity;
  uniform float uRtExposure;
  uniform float uGlassSurface;
  uniform float uGlassTransmission;
  uniform float uGlassReflection;
  uniform float uSolidSpecular;
  uniform float uSunDiffusion;
  uniform float uVolumeSteps;
  uniform sampler2D uPreviousFrame;
  uniform float uFrame;
  uniform vec2 uJitter;
  uniform int uPrimaryWindowIndex;
  uniform int uWindowCount;
  uniform int uBoxCount;
  uniform vec4 uWindowRect[MAX_WINDOWS]; // centerX, centerY, width, height
  uniform vec4 uAtlasRect[MAX_WINDOWS];  // u0, v0, du, dv
  uniform vec4 uWindowLead[MAX_WINDOWS]; // leadR, distMaxPx, unused, unused
  uniform vec4 uBoxMinMat[MAX_BOXES];    // min.xyz, material id
  uniform vec4 uBoxMax[MAX_BOXES];       // max.xyz, unused
  uniform vec4 uPointLightPosRad[MAX_POINT_LIGHTS];   // xyz, source radius
  uniform vec4 uPointLightColorPower[MAX_POINT_LIGHTS]; // rgb, power

  struct Hit {
    float t;
    vec3 p;
    vec3 n;
    float mat;
    float windowIdx;
    int boxIdx;
  };

  vec3 sampleSky(vec3 dir) {
    float lon = atan(dir.z, dir.x);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    return texture2D(uSkyTex, vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5)).rgb;
  }

  vec3 sampleSunSky(vec3 dir) {
    vec3 sky = sampleSky(dir);
    float sunDot = max(0.0, dot(normalize(dir), -normalize(uSunDir)));
    float diffusion = clamp(uSunDiffusion, 0.0, 1.0);
    vec3 sun = vec3(1.0, 0.91, 0.74) *
      (pow(sunDot, mix(950.0, 120.0, diffusion)) * mix(22.0, 8.5, diffusion) +
       pow(sunDot, mix(90.0, 10.0, diffusion)) * mix(1.75, 0.85, diffusion) +
       pow(sunDot, 8.0) * 0.06 * diffusion);
    return sky + sun;
  }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float rand(inout vec2 seed) {
    seed = fract(seed * mat2(127.1, 311.7, 269.5, 183.3));
    return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
  }

  vec3 cosineHemisphere(vec3 n, inout vec2 seed) {
    float r1 = rand(seed);
    float r2 = rand(seed);
    float phi = 2.0 * PI * r1;
    float r = sqrt(r2);
    vec3 u = normalize(abs(n.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), n) : cross(vec3(1.0, 0.0, 0.0), n));
    vec3 v = cross(n, u);
    return normalize(u * cos(phi) * r + v * sin(phi) * r + n * sqrt(max(0.0, 1.0 - r2)));
  }

  vec3 sunRayDirection(inout vec2 seed) {
    vec3 center = -normalize(uSunDir);
    vec3 u = normalize(abs(center.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), center) : cross(vec3(1.0, 0.0, 0.0), center));
    vec3 v = cross(center, u);
    float r = sqrt(rand(seed)) * mix(0.0025, 0.060, clamp(uSunDiffusion, 0.0, 1.0));
    float a = 2.0 * PI * rand(seed);
    return normalize(center + u * cos(a) * r + v * sin(a) * r);
  }

  bool pointInWindow(vec3 p, int i) {
    vec4 r = uWindowRect[i];
    vec2 lo = r.xy - r.zw * 0.5;
    vec2 hi = r.xy + r.zw * 0.5;
    return p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y;
  }

  vec2 windowUv(vec3 p, int i) {
    vec4 r = uWindowRect[i];
    return (p.xy - (r.xy - r.zw * 0.5)) / r.zw;
  }

  vec4 sampleGlass(int i, vec2 uv) {
    if (i == uPrimaryWindowIndex) {
      return texture2D(uPrimaryGlassTex, clamp(uv, 0.0, 1.0));
    }
    vec4 a = uAtlasRect[i];
    return texture2D(uGlassAtlas, a.xy + clamp(uv, 0.0, 1.0) * a.zw);
  }

  vec4 sampleGlassOffset(int i, vec2 uv, vec2 px) {
    if (i == uPrimaryWindowIndex) {
      return texture2D(uPrimaryGlassTex, clamp(uv + px / uPrimaryTexSize, 0.0, 1.0));
    }
    vec4 a = uAtlasRect[i];
    return texture2D(uGlassAtlas, a.xy + clamp(uv, 0.0, 1.0) * a.zw + px * a.zw / ATLAS_TILE);
  }

  struct GlassInfo {
    vec3 color;
    vec3 paneNormal;
    vec3 leadNormal;
    float leadAlpha;
    float open;
    float rippleStrength;
    float rippleBand;
  };

  GlassInfo readGlassInfo(int wi, vec2 uv) {
    vec4 tex = sampleGlass(wi, uv);
    vec4 txp = sampleGlassOffset(wi, uv, vec2( 1.0, 0.0));
    vec4 txm = sampleGlassOffset(wi, uv, vec2(-1.0, 0.0));
    vec4 typ = sampleGlassOffset(wi, uv, vec2(0.0,  1.0));
    vec4 tym = sampleGlassOffset(wi, uv, vec2(0.0, -1.0));
    vec4 lead = uWindowLead[wi];
    float dc = tex.a * lead.y;
    float dxp = txp.a * lead.y;
    float dxm = txm.a * lead.y;
    float dyp = typ.a * lead.y;
    float dym = tym.a * lead.y;
    float d = (dc * 2.0 + dxp + dxm + dyp + dym) * 0.16666667;
    float leadAlpha = 1.0 - smoothstep(lead.x - 0.75, lead.x + 0.75, d);

    vec3 nlead = vec3(0.0, 0.0, 1.0);
    vec2 grad = vec2(dxp - dxm, dyp - dym) * 0.5;
    float glen = length(grad);
    if (glen > 0.05) {
      vec2 outDir = grad / glen;
      float clampedD = min(d, lead.x * 0.95);
      float hh = sqrt(max(0.001, lead.x * lead.x - clampedD * clampedD));
      nlead = normalize(vec3(outDir * (clampedD / hh), 1.0));
    }

    GlassInfo gi;
    gi.color = max(tex.rgb, vec3(0.001));
    vec2 glassSlope = vec2(
      dot(txp.rgb - txm.rgb, vec3(0.30, 0.59, 0.11)),
      dot(typ.rgb - tym.rgb, vec3(0.30, 0.59, 0.11))
    );
    float paneSeed = hash12(gi.color.rg * 271.0 + gi.color.br * 97.0);
    vec2 waveDirA = normalize(vec2(0.92 + paneSeed * 0.22, 0.28 - paneSeed * 0.18));
    vec2 waveDirB = normalize(vec2(-0.18 - paneSeed * 0.26, 0.98));
    float freqA = mix(18.0, 31.0, paneSeed);
    float freqB = mix(10.0, 18.0, hash12(gi.color.gb * 193.0 + 5.1));
    float phaseA = paneSeed * 37.0;
    float phaseB = hash12(gi.color.br * 151.0 + 9.7) * 31.0;
    float leadClear = smoothstep(lead.x + 0.10, lead.x + 1.80, d);
    float waveA = sin(dot(uv, waveDirA) * freqA + phaseA);
    float waveB = sin(dot(uv, waveDirB) * freqB + phaseB);
    float textureSignal = smoothstep(0.006, 0.030, length(glassSlope));
    vec3 colorBucket = floor(gi.color * 10.0) / 10.0;
    float selectedPane = step(0.36, hash12(colorBucket.rg * 41.0 + colorBucket.br * 17.0));
    float rippleStrength = leadClear * max(textureSignal, selectedPane * 0.90);
    vec2 rippleSlope =
      waveDirA * cos(dot(uv, waveDirA) * freqA + phaseA) * freqA * 0.0084 +
      waveDirB * cos(dot(uv, waveDirB) * freqB + phaseB) * freqB * 0.0066;
    float paneWarp = (hash12(uv * 4096.0 + gi.color.rg * 37.0) - 0.5) * 0.014;
    gi.paneNormal = normalize(vec3(glassSlope * 0.22 + rippleSlope * rippleStrength + paneWarp, 1.0));
    gi.leadNormal = nlead;
    gi.leadAlpha = clamp(leadAlpha, 0.0, 1.0);
    gi.open = 1.0 - gi.leadAlpha;
    gi.rippleStrength = rippleStrength;
    gi.rippleBand = pow(clamp(0.5 + 0.5 * (waveA * 0.72 + waveB * 0.28), 0.0, 1.0), 2.4) * rippleStrength;
    return gi;
  }

  bool windowAtPoint(vec3 p, out int idx) {
    for (int i = 0; i < MAX_WINDOWS; i++) {
      if (i >= uWindowCount) break;
      if (pointInWindow(p, i)) {
        idx = i;
        return true;
      }
    }
    return false;
  }

  bool intersectAabb(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t, out vec3 n) {
    vec3 safeRd = vec3(
      abs(rd.x) < 1e-5 ? (rd.x < 0.0 ? -1e-5 : 1e-5) : rd.x,
      abs(rd.y) < 1e-5 ? (rd.y < 0.0 ? -1e-5 : 1e-5) : rd.y,
      abs(rd.z) < 1e-5 ? (rd.z < 0.0 ? -1e-5 : 1e-5) : rd.z
    );
    vec3 inv = 1.0 / safeRd;
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    float tNear = max(max(tn.x, tn.y), tn.z);
    float tFar = min(min(tf.x, tf.y), tf.z);
    if (tNear > tFar || tFar < 0.001) return false;
    t = tNear > 0.001 ? tNear : tFar;
    vec3 p = ro + rd * t;
    vec3 d0 = abs(p - bmin);
    vec3 d1 = abs(p - bmax);
    float m = min(min(min(d0.x, d1.x), min(d0.y, d1.y)), min(d0.z, d1.z));
    if (m == d0.x) n = vec3(-1.0, 0.0, 0.0);
    else if (m == d1.x) n = vec3(1.0, 0.0, 0.0);
    else if (m == d0.y) n = vec3(0.0, -1.0, 0.0);
    else if (m == d1.y) n = vec3(0.0, 1.0, 0.0);
    else if (m == d0.z) n = vec3(0.0, 0.0, -1.0);
    else n = vec3(0.0, 0.0, 1.0);
    return true;
  }

  bool intersectSphere(vec3 ro, vec3 rd, vec3 center, float radius, out float t, out vec3 n) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    float tNear = -b - h;
    float tFar = -b + h;
    t = tNear > 0.001 ? tNear : tFar;
    if (t <= 0.001) return false;
    vec3 p = ro + rd * t;
    n = normalize(p - center);
    return true;
  }

  vec3 bevelBoxNormal(int idx, vec3 p, vec3 faceN) {
    vec3 bmin = uBoxMinMat[idx].xyz;
    vec3 bmax = uBoxMax[idx].xyz;
    float bevel = 0.035;
    vec3 n = faceN * 1.8;
    n += vec3(-1.0, 0.0, 0.0) * smoothstep(bevel, 0.0, p.x - bmin.x);
    n += vec3( 1.0, 0.0, 0.0) * smoothstep(bevel, 0.0, bmax.x - p.x);
    n += vec3(0.0, -1.0, 0.0) * smoothstep(bevel, 0.0, p.y - bmin.y);
    n += vec3(0.0,  1.0, 0.0) * smoothstep(bevel, 0.0, bmax.y - p.y);
    n += vec3(0.0, 0.0, -1.0) * smoothstep(bevel, 0.0, p.z - bmin.z);
    n += vec3(0.0, 0.0,  1.0) * smoothstep(bevel, 0.0, bmax.z - p.z);
    return normalize(n);
  }

  bool occludedBySolid(vec3 ro, vec3 rd, float maxT) {
    float t;
    vec3 n;
    for (int i = 0; i < MAX_BOXES; i++) {
      if (i >= uBoxCount) break;
      if (intersectAabb(ro, rd, uBoxMinMat[i].xyz, uBoxMax[i].xyz, t, n) && t < maxT) {
        return true;
      }
    }
    return false;
  }

  Hit noHit() {
    Hit h;
    h.t = 1.0e20;
    h.p = vec3(0.0);
    h.n = vec3(0.0, 1.0, 0.0);
    h.mat = 0.0;
    h.windowIdx = -1.0;
    h.boxIdx = -1;
    return h;
  }

  bool inRoomBounds(vec3 p) {
    return p.x >= uRoomBounds.x - 0.002 && p.x <= uRoomBounds.y + 0.002 &&
           p.y >= -0.002 && p.y <= uRoomBounds.w + 0.002 &&
           p.z >= uWallZ - 0.002 && p.z <= uRoomBounds.z + 0.002;
  }

  void considerRoomPlane(
    vec3 ro,
    vec3 rd,
    float candT,
    vec3 candN,
    float candMat,
    int frontWall,
    inout float bestT,
    inout vec3 bestN,
    inout float bestMat
  ) {
    if (candT <= 0.001 || candT >= bestT) return;
    vec3 p = ro + rd * candT;
    if (!inRoomBounds(p)) return;
    if (frontWall == 1) {
      int holeIdx = -1;
      if (windowAtPoint(p, holeIdx)) return;
    }
    bestT = candT;
    bestN = candN;
    bestMat = candMat;
  }

  bool traceRoomSurface(vec3 ro, vec3 rd, out float t, out vec3 n, out float mat) {
    float bestT = 1.0e20;
    vec3 bestN = vec3(0.0, 1.0, 0.0);
    float bestMat = 6.0;

    if (abs(rd.y) > 1e-5) {
      considerRoomPlane(ro, rd, (0.0 - ro.y) / rd.y, vec3(0.0, 1.0, 0.0), 7.0, 0, bestT, bestN, bestMat);
      considerRoomPlane(ro, rd, (uRoomBounds.w - ro.y) / rd.y, vec3(0.0, -1.0, 0.0), 6.0, 0, bestT, bestN, bestMat);
    }
    if (abs(rd.x) > 1e-5) {
      considerRoomPlane(ro, rd, (uRoomBounds.x - ro.x) / rd.x, vec3(1.0, 0.0, 0.0), 6.0, 0, bestT, bestN, bestMat);
      considerRoomPlane(ro, rd, (uRoomBounds.y - ro.x) / rd.x, vec3(-1.0, 0.0, 0.0), 6.0, 0, bestT, bestN, bestMat);
    }
    if (abs(rd.z) > 1e-5) {
      considerRoomPlane(ro, rd, (uWallZ - ro.z) / rd.z, vec3(0.0, 0.0, 1.0), 6.0, 1, bestT, bestN, bestMat);
      considerRoomPlane(ro, rd, (uRoomBounds.z - ro.z) / rd.z, vec3(0.0, 0.0, -1.0), 6.0, 0, bestT, bestN, bestMat);
    }

    if (bestT >= 1.0e19) return false;
    t = bestT;
    n = bestN;
    mat = bestMat;
    return true;
  }

  Hit traceScene(vec3 ro, vec3 rd) {
    Hit h = noHit();
    float t;
    vec3 n;

    if (abs(rd.z) > 1e-5) {
      t = (0.0 - ro.z) / rd.z;
      if (t > 0.001) {
        vec3 p = ro + rd * t;
        int wi = -1;
        if (windowAtPoint(p, wi)) {
          h.t = t;
          h.p = p;
          h.n = vec3(0.0, 0.0, 1.0);
          h.mat = 5.0;
          h.windowIdx = float(wi);
          h.boxIdx = -1;
        }
      }
    }

    for (int i = 0; i < MAX_BOXES; i++) {
      if (i >= uBoxCount) break;
      if (intersectAabb(ro, rd, uBoxMinMat[i].xyz, uBoxMax[i].xyz, t, n) && t < h.t) {
        h.t = t;
        h.p = ro + rd * t;
        h.n = bevelBoxNormal(i, h.p, n);
        h.mat = uBoxMinMat[i].w;
        h.windowIdx = -1.0;
        h.boxIdx = i;
      }
    }

    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
      vec4 lp = uPointLightPosRad[i];
      if (intersectSphere(ro, rd, lp.xyz, lp.w, t, n) && t < h.t) {
        h.t = t;
        h.p = ro + rd * t;
        h.n = n;
        h.mat = 8.0 + float(i);
        h.windowIdx = -1.0;
        h.boxIdx = -1;
      }
    }

    float roomMat;
    if (traceRoomSurface(ro, rd, t, n, roomMat) && t < h.t) {
      h.t = t;
      h.p = ro + rd * t;
      h.n = n;
      h.mat = roomMat;
      h.windowIdx = -1.0;
      h.boxIdx = -1;
    }

    return h;
  }

  vec2 woodUv(vec3 p, vec3 n) {
    vec3 an = abs(n);
    if (an.z > an.x && an.z > an.y) return p.xy * vec2(0.55, 1.15);
    if (an.x > an.y) return p.zy * vec2(1.15, 1.2);
    return p.xz * vec2(0.55, 1.4);
  }

  vec3 materialAlbedo(float mat, vec3 p, vec3 n) {
    if (mat < 1.5) {
      vec3 w = texture2D(uFrameWoodTex, woodUv(p, n)).rgb;
      return w * vec3(0.96, 0.70, 0.48) + vec3(0.055, 0.030, 0.014);
    }
    if (mat < 2.5) {
      vec3 w = texture2D(uFrameWoodTex, woodUv(p, n)).rgb;
      return w * vec3(0.58, 0.39, 0.25) + vec3(0.030, 0.018, 0.009);
    }
    if (mat < 3.5) {
      vec3 w = texture2D(uFrameWoodTex, woodUv(p, n)).rgb;
      return w * vec3(1.08, 0.82, 0.58) + vec3(0.070, 0.044, 0.022);
    }
    if (mat < 4.5) return vec3(1.0, 0.72, 0.30);
    if (mat < 6.5) return texture2D(uWallTex, p.xy * 0.18 + p.zy * 0.08).rgb * vec3(0.62, 0.57, 0.62);
    return texture2D(uFloorTex, p.xz * 0.32).rgb;
  }

  vec3 traceSunThroughGlassRay(vec3 p, vec3 normal, vec3 toSun) {
    float transmission = clamp(uGlassTransmission, 0.0, 1.0);
    float denom = toSun.z;
    if (abs(denom) < 0.0001) return vec3(0.0);
    float tGlass = (0.0 - p.z) / denom;
    if (tGlass <= 0.001) return vec3(0.0);
    vec3 shadowOrigin = p + normal * 0.004 + toSun * 0.020;
    if (occludedBySolid(shadowOrigin, toSun, max(0.0, tGlass - 0.018))) return vec3(0.0);
    vec3 q = p + toSun * tGlass;
    for (int i = 0; i < MAX_WINDOWS; i++) {
      if (i >= uWindowCount) break;
      if (pointInWindow(q, i)) {
        vec2 uv = windowUv(q, i);
        GlassInfo gi = readGlassInfo(i, uv);
        vec3 absorption = mix(vec3(1.0), gi.color, transmission);
        float aperture = gi.open * max(0.0, normalize(uSunDir).z);
        return vec3(1.0, 0.86, 0.62) * absorption * aperture * transmission * 5.2;
      }
    }
    return vec3(0.0);
  }

  vec3 sampleSunThroughGlass(vec3 p, vec3 normal, inout vec2 seed, int sampleCount) {
    vec3 acc = vec3(0.0);
    float count = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= sampleCount) break;
      acc += traceSunThroughGlassRay(p, normal, sunRayDirection(seed));
      count += 1.0;
    }
    return count > 0.5 ? acc / count : vec3(0.0);
  }

  vec3 sampleWindowEnvironment(vec3 p, vec3 normal, inout vec2 seed) {
    vec3 acc = vec3(0.0);
    float transmission = clamp(uGlassTransmission, 0.0, 1.0);
    for (int i = 0; i < MAX_WINDOWS; i++) {
      if (i >= uWindowCount) break;
      vec4 r = uWindowRect[i];
      vec2 uv = vec2(rand(seed), rand(seed));
      vec3 q = vec3(r.xy - r.zw * 0.5 + uv * r.zw, 0.0);
      vec3 toWindow = q - p;
      float dist = length(toWindow);
      if (dist <= 0.001) continue;
      vec3 wi = toWindow / dist;
      float ndl = max(0.0, dot(normal, wi));
      if (ndl <= 0.0) continue;
      if (occludedBySolid(p + normal * 0.006 + wi * 0.006, wi, max(0.0, dist - 0.018))) continue;

      GlassInfo gi = readGlassInfo(i, uv);
      float area = r.z * r.w;
      float apertureCos = max(0.08, -wi.z);
      float solidAngle = area * apertureCos / max(0.25, dist * dist);
      vec3 tint = mix(vec3(1.0), gi.color, transmission);
      acc += sampleSunSky(wi) * tint * gi.open * ndl * solidAngle * transmission;
    }
    return acc;
  }

  vec3 samplePointLights(vec3 p, vec3 normal, inout vec2 seed) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
      vec4 lp = uPointLightPosRad[i];
      vec3 toCenter = lp.xyz - p;
      float centerDist = length(toCenter);
      if (centerDist <= 0.001) continue;
      vec3 centerDir = toCenter / centerDist;
      vec3 tangent = normalize(abs(centerDir.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), centerDir) : cross(vec3(1.0, 0.0, 0.0), centerDir));
      vec3 bitangent = cross(centerDir, tangent);
      float r = sqrt(rand(seed)) * lp.w;
      float a = 2.0 * PI * rand(seed);
      vec3 lightPos = lp.xyz + tangent * cos(a) * r + bitangent * sin(a) * r;
      vec3 toLight = lightPos - p;
      float dist2 = max(0.04, dot(toLight, toLight));
      float dist = sqrt(dist2);
      vec3 wi = toLight / dist;
      float ndl = max(0.0, dot(normal, wi));
      if (ndl <= 0.0) continue;
      if (occludedBySolid(p + normal * 0.008 + wi * 0.006, wi, max(0.0, dist - lp.w - 0.018))) continue;
      vec4 cp = uPointLightColorPower[i];
      float falloff = 1.0 / (1.0 + dist2 * 0.55);
      acc += cp.rgb * cp.a * ndl * falloff;
    }
    return acc;
  }

  vec3 samplePointLightSpecular(vec3 p, vec3 normal, vec3 viewDir, float shininess, inout vec2 seed) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
      vec4 lp = uPointLightPosRad[i];
      vec3 toCenter = lp.xyz - p;
      float centerDist = length(toCenter);
      if (centerDist <= 0.001) continue;
      vec3 centerDir = toCenter / centerDist;
      vec3 tangent = normalize(abs(centerDir.y) < 0.99 ? cross(vec3(0.0, 1.0, 0.0), centerDir) : cross(vec3(1.0, 0.0, 0.0), centerDir));
      vec3 bitangent = cross(centerDir, tangent);
      float r = sqrt(rand(seed)) * lp.w;
      float a = 2.0 * PI * rand(seed);
      vec3 lightPos = lp.xyz + tangent * cos(a) * r + bitangent * sin(a) * r;
      vec3 toLight = lightPos - p;
      float dist2 = max(0.04, dot(toLight, toLight));
      float dist = sqrt(dist2);
      vec3 wi = toLight / dist;
      float ndl = max(0.0, dot(normal, wi));
      if (ndl <= 0.0) continue;
      if (occludedBySolid(p + normal * 0.008 + wi * 0.006, wi, max(0.0, dist - lp.w - 0.018))) continue;
      vec4 cp = uPointLightColorPower[i];
      vec3 halfDir = normalize(wi + viewDir);
      float spec = pow(max(0.0, dot(normal, halfDir)), shininess);
      float falloff = 1.0 / (1.0 + dist2 * 0.55);
      acc += cp.rgb * cp.a * spec * ndl * falloff;
    }
    return acc;
  }

  vec3 samplePointLightsVolume(vec3 p, inout vec2 seed) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
      vec4 lp = uPointLightPosRad[i];
      vec3 toLight = lp.xyz - p;
      float dist2 = max(0.04, dot(toLight, toLight));
      float dist = sqrt(dist2);
      vec3 wi = toLight / dist;
      if (occludedBySolid(p + wi * 0.012, wi, max(0.0, dist - lp.w - 0.018))) continue;
      vec4 cp = uPointLightColorPower[i];
      float falloff = 1.0 / (1.0 + dist2 * 0.65);
      acc += cp.rgb * cp.a * falloff;
    }
    return acc;
  }

  vec3 glassSlabScatter(GlassInfo gi, vec3 rd, vec3 paneN, vec3 p, inout vec2 seed) {
    float transmission = clamp(uGlassTransmission, 0.0, 1.0);
    float surface = clamp(uGlassSurface, 0.0, 1.8);
    float viewGrazing = pow(1.0 - max(0.0, dot(abs(paneN), abs(-rd))), 2.0);
    float bubbles = hash12(p.xy * 155.0 + gi.color.rb * 41.0);
    float fine = hash12(p.xy * 690.0 + gi.color.gr * 23.0);
    float inclusions = 0.72 + 0.18 * bubbles + 0.10 * fine;
    float edgeCatch = gi.open * (1.0 - gi.open) * 4.0;
    vec3 towardSun = sampleSunThroughGlass(p + paneN * 0.006, paneN, seed, 1);
    vec3 sideSky = sampleWindowEnvironment(p + paneN * 0.006, paneN, seed);
    vec3 stainedBody = gi.color * (0.08 + 0.18 * surface + 0.22 * viewGrazing + 0.20 * edgeCatch) * inclusions;
    vec3 trappedLight = gi.color * (towardSun * 0.32 + sideSky * 0.85) * (0.16 + 0.38 * surface);
    vec3 rippleSheen = mix(vec3(1.0, 0.92, 0.76), gi.color, 0.42) *
      gi.rippleBand * (0.10 + 0.24 * surface) * (0.55 + 0.45 * viewGrazing);
    stainedBody *= 0.88 + gi.rippleBand * 0.32;
    trappedLight += gi.color * gi.rippleStrength * gi.rippleBand * (towardSun * 0.22 + sideSky * 0.30);
    return gi.open * (stainedBody + trappedLight + rippleSheen) * (0.35 + 0.65 * transmission);
  }

  vec3 pathTrace(vec3 ro, vec3 rd) {
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);
    vec2 seed = gl_FragCoord.xy + vec2(uFrame * 19.19 + 3.7, uFrame * 7.13 + 11.0);
    int maxBounces = int(clamp(floor(uVolumeSteps), 1.0, 80.0));

    for (int bounce = 0; bounce < 80; bounce++) {
      if (bounce >= maxBounces) break;
      Hit h = traceScene(ro, rd);
      if (h.t >= 1.0e19) {
        bool outsideRoom = ro.z <= uWallZ + 0.01 || ro.z >= uRoomBounds.z + 0.01 ||
                           ro.x <= uRoomBounds.x - 0.01 || ro.x >= uRoomBounds.y + 0.01 ||
                           ro.y <= -0.01 || ro.y >= uRoomBounds.w + 0.01;
        radiance += throughput * (outsideRoom ? sampleSunSky(rd) : vec3(0.006, 0.005, 0.006));
        break;
      }

      if (h.mat > 7.5) {
        vec3 emit = vec3(0.0);
        for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
          if (h.mat > 7.5 + float(i) && h.mat < 8.5 + float(i)) {
            vec4 cp = uPointLightColorPower[i];
            emit = cp.rgb * cp.a * 1.8;
          }
        }
        radiance += throughput * emit;
        break;
      }

      if (h.mat > 4.5 && h.mat < 5.5) {
        int wi = int(h.windowIdx + 0.5);
        GlassInfo gi = readGlassInfo(wi, windowUv(h.p, wi));
        vec3 paneN = gi.paneNormal;
        if (dot(paneN, -rd) < 0.0) paneN = -paneN;

        if (rand(seed) < gi.leadAlpha) {
          vec3 leadN = gi.leadNormal;
          if (dot(leadN, -rd) < 0.0) leadN = -leadN;
          vec3 viewDir = normalize(-rd);
          vec3 leadMetal = vec3(0.82, 0.80, 0.76);
          float leadFresnel = 0.48 + 0.52 * pow(1.0 - max(0.0, dot(leadN, viewDir)), 5.0);
          vec3 glassLight = sampleSunThroughGlass(h.p, leadN, seed, 2);
          vec3 roomLight = samplePointLights(h.p, leadN, seed);
          vec3 roomSpec = samplePointLightSpecular(h.p, leadN, viewDir, 118.0, seed);
          float directNdl = max(0.0, dot(leadN, -normalize(uSunDir)));
          float facing = 0.28 + 0.72 * max(0.0, dot(leadN, viewDir));
          float sunGlint = pow(max(0.0, dot(reflect(normalize(uSunDir), leadN), viewDir)), 150.0);
          radiance += throughput * leadMetal * roomLight * 0.32 * facing;
          radiance += throughput * leadMetal * glassLight * directNdl * 0.08;
          radiance += throughput * (roomSpec * 1.85 + glassLight * sunGlint * 2.4) * leadMetal;

          if (rand(seed) < clamp((0.84 + 0.12 * leadFresnel) * uSolidSpecular, 0.20, 0.96)) {
            vec3 refl = reflect(rd, leadN);
            rd = normalize(mix(refl, cosineHemisphere(refl, seed), 0.07));
            throughput *= leadMetal * (0.74 + 0.22 * leadFresnel);
          } else {
            rd = cosineHemisphere(leadN, seed);
            throughput *= leadMetal * 0.16;
          }
          ro = h.p + leadN * 0.016;
          continue;
        }

        float cosI = max(0.0, dot(paneN, -rd));
        float fresnel = 0.038 + (1.0 - 0.038) * pow(1.0 - cosI, 5.0);
        float reflectChance = clamp(fresnel * max(0.0, uGlassReflection), 0.0, 0.82);
        if (rand(seed) < reflectChance) {
          rd = reflect(rd, paneN);
          throughput *= vec3(0.90) * max(0.15, uGlassReflection);
          ro = h.p + paneN * 0.020;
          continue;
        }

        radiance += throughput * glassSlabScatter(gi, rd, paneN, h.p, seed);

        vec3 refr = refract(rd, paneN, 1.0 / 1.48);
        if (dot(refr, refr) < 0.0001) refr = rd;
        vec3 microWarp = normalize(paneN + vec3((rand(seed) - 0.5) * 0.022, (rand(seed) - 0.5) * 0.022, 0.0));
        vec3 warpedRefr = refract(rd, microWarp, 1.0 / 1.48);
        if (dot(warpedRefr, warpedRefr) < 0.0001) warpedRefr = refr;
        rd = normalize(mix(rd, warpedRefr, 0.20 + 0.35 * gi.rippleStrength));
        float transmission = clamp(uGlassTransmission, 0.0, 1.0);
        float surface = clamp(uGlassSurface, 0.0, 1.8);
        throughput *= mix(vec3(1.0), gi.color, transmission) *
                      transmission *
                      mix(0.97, 0.82, min(surface / 1.8, 1.0));
        ro = h.p + rd * 0.030;
        continue;
      }

      vec3 n = normalize(h.n);
      if (dot(n, -rd) < 0.0) n = -n;
      vec3 albedo = materialAlbedo(h.mat, h.p, n);
      int sunSamples = bounce == 0 ? 4 : 1;
      vec3 glassLight = sampleSunThroughGlass(h.p, n, seed, sunSamples);
      vec3 windowEnv = sampleWindowEnvironment(h.p, n, seed);
      vec3 roomLight = samplePointLights(h.p, n, seed);
      float directNdl = max(0.0, dot(n, -normalize(uSunDir)));
      float firstBounce = bounce == 0 ? 1.0 : 0.0;
      radiance += throughput * albedo * glassLight * directNdl * (1.45 * firstBounce + 0.08 * (1.0 - firstBounce));
      radiance += throughput * albedo * windowEnv * (0.95 * firstBounce + 0.20 * (1.0 - firstBounce));
      radiance += throughput * albedo * roomLight * (0.80 * firstBounce + 0.18 * (1.0 - firstBounce));

      float isWood = step(0.5, h.mat) * step(h.mat, 3.5);
      float isGold = step(3.5, h.mat) * step(h.mat, 4.5);
      float specProb = clamp(isGold * 0.62 + isWood * 0.075, 0.0, 0.70) * uSolidSpecular;
      float pick = rand(seed);
      if (pick < specProb) {
        vec3 refl = reflect(rd, n);
        rd = normalize(mix(refl, cosineHemisphere(refl, seed), isGold > 0.5 ? 0.10 : 0.28));
        throughput *= mix(vec3(0.62), albedo, isGold) * 0.62;
      } else {
        rd = cosineHemisphere(n, seed);
        throughput *= albedo * 0.55;
      }

      ro = h.p + n * 0.012;
      if (bounce > 2) {
        float p = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.08, 0.95);
        if (rand(seed) > p) break;
        throughput /= p;
      }
    }
    return radiance;
  }

  vec3 volumeAlong(vec3 ro, vec3 rd, float maxT) {
    if (uRaysDensity <= 0.001) return vec3(0.0);
    float tExit = min(maxT, 24.0);
    float tEntry = 0.0;
    if (rd.y < -0.0001) {
      float tf = -ro.y / rd.y;
      if (tf > 0.0) tExit = min(tExit, tf);
    }
    if (tExit <= tEntry) return vec3(0.0);
    float jitter = hash12(gl_FragCoord.xy + vec2(uFrame * 17.13, uFrame * 3.71));
    float steps = clamp(uVolumeSteps, 8.0, 80.0);
    float stepLen = (tExit - tEntry) / steps;
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (float i = 0.0; i < 80.0; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * (tEntry + (i + jitter) * stepLen);
      if (p.y < 0.0 || p.y > uRoomBounds.w || p.z < uWallZ || p.z > uRoomBounds.z) continue;
      vec2 seed = gl_FragCoord.xy + p.xy * 17.0 + vec2(i * 13.1, uFrame * 5.7);
      vec3 light = sampleSunThroughGlass(p, vec3(0.0, 1.0, 0.0), seed, 2);
      vec3 warmLight = samplePointLightsVolume(p, seed);
      acc += (light + warmLight * 0.14) * trans * stepLen;
      trans *= exp(-0.04 * stepLen);
    }
    return acc * uRaysDensity * 0.36;
  }

  vec3 rayDirFromCamera(vec2 uv) {
    vec2 jitteredUv = uv + uJitter / uResolution;
    vec2 ndc = jitteredUv * 2.0 - 1.0;
    vec4 view = uInvProjection * vec4(ndc, 1.0, 1.0);
    view /= view.w;
    return normalize((uCameraWorld * vec4(view.xyz, 0.0)).xyz);
  }

  void main() {
    vec3 ro = uCameraWorld[3].xyz;
    vec3 rd = rayDirFromCamera(vUv);
    Hit h = traceScene(ro, rd);
    vec3 col = pathTrace(ro, rd);
    float maxT = 24.0;
    if (h.t < 1.0e19) {
      maxT = h.t;
      float fog = smoothstep(12.0, 36.0, h.t);
      vec3 roomHaze = vec3(0.010, 0.008, 0.010);
      col = mix(col, roomHaze, fog * 0.45);
    } else if (ro.z > uWallZ - 0.25 && ro.z < uRoomBounds.z + 0.25 &&
               ro.x > uRoomBounds.x - 0.25 && ro.x < uRoomBounds.y + 0.25 &&
               ro.y > -0.25 && ro.y < uRoomBounds.w + 0.25) {
      col = texture2D(uWallTex, rd.xy * 0.2 + rd.zy * 0.11).rgb * vec3(0.05, 0.045, 0.05);
    }
    col += volumeAlong(ro, rd, maxT);
    vec3 current = aces(col * uRtExposure);
    vec3 previous = texture2D(uPreviousFrame, vUv).rgb;
    float blend = uFrame < 0.5 ? 1.0 : 1.0 / (uFrame + 1.0);
    gl_FragColor = vec4(mix(previous, current, blend), 1.0);
  }
`;

const raytraceScene = new THREE.Scene();
const raytraceCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
raytraceCamera.position.z = 1;
const raytracedSceneMat = new THREE.ShaderMaterial({
  uniforms: {
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uCameraWorld: { value: new THREE.Matrix4() },
    uInvProjection: { value: new THREE.Matrix4() },
    uSkyTex: { value: skyTexture },
    uFloorTex: { value: floorWoodTex },
    uWallTex: { value: wallPlasterTex },
    uFrameWoodTex: { value: frameWoodTex },
    uPrimaryGlassTex: { value: glassTexture },
    uGlassAtlas: { value: rtGlassAtlasTex },
    uSunDir: { value: sunDir },
    uPrimaryTexSize: { value: new THREE.Vector2(64, 64) },
    uRoomBounds: { value: new THREE.Vector4(roomBounds.sideLeft, roomBounds.sideRight, roomBounds.backZ, roomBounds.ceilingY) },
    uWallZ: { value: WALL_Z },
    uRaysDensity: { value: 0.55 * 0.55 * 0.7 },
    uRtExposure: { value: 1.18 },
    uGlassSurface: { value: 1.0 },
    uGlassTransmission: { value: 0.72 },
    uGlassReflection: { value: 0.18 },
    uSolidSpecular: { value: 1.0 },
    uSunDiffusion: { value: 0.22 },
    uVolumeSteps: { value: 34.0 },
    uPreviousFrame: { value: null },
    uFrame: { value: 0.0 },
    uJitter: { value: new THREE.Vector2() },
    uPrimaryWindowIndex: { value: 0 },
    uWindowCount: { value: 0 },
    uBoxCount: { value: 0 },
    uWindowRect: { value: rtWindowRects },
    uAtlasRect: { value: rtAtlasRects },
    uWindowLead: { value: rtWindowLead },
    uBoxMinMat: { value: rtBoxMinMat },
    uBoxMax: { value: rtBoxMax },
    uPointLightPosRad: { value: rtPointLightPosRad },
    uPointLightColorPower: { value: rtPointLightColorPower },
  },
  vertexShader: RAYTRACED_SCENE_VERT_SRC,
  fragmentShader: RAYTRACED_SCENE_FRAG_SRC,
  depthWrite: false,
  depthTest: false,
});
raytraceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), raytracedSceneMat));

const raytraceDisplayScene = new THREE.Scene();
const raytraceDisplayMat = new THREE.MeshBasicMaterial({ map: null, depthWrite: false, depthTest: false });
raytraceDisplayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), raytraceDisplayMat));

function makeRaytraceTarget() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.generateMipmaps = false;
  return target;
}

const raytraceTargets = [makeRaytraceTarget(), makeRaytraceTarget()];
let raytraceReadTarget = raytraceTargets[0];
let raytraceWriteTarget = raytraceTargets[1];
let raytraceSampleFrame = 0;
let raytraceFirstFramePending = false;
let raytracePreviewFramePending = false;
let raytraceSamplingStartPending = false;
let raytraceStatusOverride = '';
let raytraceWarmupState = 'cold';
let raytraceLastCameraChangeTime = 0;
const _raytraceBufferSize = new THREE.Vector2();
const _lastRaytraceCameraMatrix = new THREE.Matrix4();
const _lastRaytraceProjectionMatrix = new THREE.Matrix4();
const RAYTRACE_STABLE_DELAY_MS = 80;
const RAYTRACE_MATRIX_EPSILON = 0.00001;

function matrixChangedEnough(a, b, epsilon = RAYTRACE_MATRIX_EPSILON) {
  const ae = a.elements;
  const be = b.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(ae[i] - be[i]) > epsilon) return true;
  }
  return false;
}

function resizeRaytraceTargets() {
  renderer.getDrawingBufferSize(_raytraceBufferSize);
  const w = Math.max(1, _raytraceBufferSize.x);
  const h = Math.max(1, _raytraceBufferSize.y);
  raytracedSceneMat.uniforms.uResolution.value.set(w, h);
  for (const target of raytraceTargets) {
    if (target.width !== w || target.height !== h) target.setSize(w, h);
  }
}

function resetRaytraceAccumulation() {
  raytraceSampleFrame = 0;
  _lastRaytraceCameraMatrix.copy(camera.matrixWorld);
  _lastRaytraceProjectionMatrix.copy(camera.projectionMatrix);
}

function renderRaytracePass({ preview = false, accumulate = true } = {}) {
  const actualSteps = raytracedSceneMat.uniforms.uVolumeSteps.value;
  if (preview) raytracedSceneMat.uniforms.uVolumeSteps.value = Math.min(actualSteps, 12);

  const jitterScale = accumulate && raytraceSampleFrame > 0 ? 1.0 : 0.0;
  raytracedSceneMat.uniforms.uPreviousFrame.value = raytraceReadTarget.texture;
  raytracedSceneMat.uniforms.uFrame.value = accumulate ? raytraceSampleFrame : 0.0;
  raytracedSceneMat.uniforms.uJitter.value.set(
    (Math.random() - 0.5) * jitterScale,
    (Math.random() - 0.5) * jitterScale
  );

  renderer.setRenderTarget(raytraceWriteTarget);
  renderer.render(raytraceScene, raytraceCamera);
  renderer.setRenderTarget(null);

  raytraceDisplayMat.map = raytraceWriteTarget.texture;
  renderer.render(raytraceDisplayScene, raytraceCamera);

  if (preview) raytracedSceneMat.uniforms.uVolumeSteps.value = actualSteps;
  if (!accumulate) return;

  const tmp = raytraceReadTarget;
  raytraceReadTarget = raytraceWriteTarget;
  raytraceWriteTarget = tmp;
  raytraceSampleFrame = Math.min(raytraceSampleFrame + 1, 4096);
}

function renderCustomRaytracer() {
  resizeRaytraceTargets();
  const now = performance.now();
  if (
    matrixChangedEnough(_lastRaytraceCameraMatrix, camera.matrixWorld) ||
    matrixChangedEnough(_lastRaytraceProjectionMatrix, camera.projectionMatrix)
  ) {
    resetRaytraceAccumulation();
    raytracePreviewFramePending = true;
    raytraceSamplingStartPending = false;
    raytraceLastCameraChangeTime = now;
  }

  if (raytraceFirstFramePending) {
    raytraceFirstFramePending = false;
    raytraceStatusOverride = 'Raytracer starting...';
    raytraceDisplayMat.map = raytraceReadTarget.texture;
    renderer.render(raytraceDisplayScene, raytraceCamera);
    return;
  }

  if (raytracePreviewFramePending) {
    raytracePreviewFramePending = false;
    raytraceSamplingStartPending = true;
    raytraceStatusOverride = 'Raytracer preview...';
    renderRaytracePass({ preview: true, accumulate: false });
    return;
  }

  const waitingForStableCamera = now - raytraceLastCameraChangeTime < RAYTRACE_STABLE_DELAY_MS;
  if (waitingForStableCamera) {
    raytraceStatusOverride = 'Raytracer waiting for camera...';
    renderer.render(raytraceDisplayScene, raytraceCamera);
    return;
  }

  const maxSamples = Math.max(1, Math.min(4096, Math.round(state?.rtMaxSamples ?? 512)));
  if (raytraceSampleFrame >= maxSamples) {
    raytraceStatusOverride = '';
    raytraceDisplayMat.map = raytraceReadTarget.texture;
    renderer.render(raytraceDisplayScene, raytraceCamera);
    return;
  }

  if (raytraceSamplingStartPending && raytraceSampleFrame === 0) {
    raytraceSamplingStartPending = false;
    raytraceStatusOverride = 'Raytracer sampling...';
    updateRaytraceStatus();
    renderer.render(raytraceDisplayScene, raytraceCamera);
    return;
  }

  raytraceStatusOverride = '';
  renderRaytracePass();
}

let lastRaytraceStatusText = '';
function updateRaytraceStatus() {
  if (!ui?.rtStatus) return;
  const maxSamples = Math.max(1, Math.min(4096, Math.round(state?.rtMaxSamples ?? 512)));
  const scale = Math.round((state?.rtResolution ?? 1) * 100);
  const steps = Math.round(state?.rtVolumeSteps ?? 0);
  const text = raytraceStatusOverride || (useRaytracer
    ? `Raytracer ${Math.min(raytraceSampleFrame, maxSamples)}/${maxSamples} samples · ${scale}% res · ${steps} steps`
    : 'Raytracer off');
  if (text !== lastRaytraceStatusText) {
    ui.rtStatus.textContent = text;
    lastRaytraceStatusText = text;
  }
}

function scheduleRaytraceWarmup() {
  if (raytraceWarmupState !== 'cold') return;
  raytraceWarmupState = 'scheduled';
  const warm = () => {
    if (raytraceWarmupState === 'warm') return;
    raytraceWarmupState = 'warming';
    try {
      raytracedSceneMat.uniforms.uPreviousFrame.value = raytraceReadTarget.texture;
      raytracedSceneMat.uniforms.uFrame.value = 0.0;
      raytracedSceneMat.uniforms.uJitter.value.set(0, 0);
      raytracedSceneMat.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
      raytracedSceneMat.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
      renderer.compile(raytraceScene, raytraceCamera);
      raytraceWarmupState = 'warm';
    } catch (err) {
      raytraceWarmupState = 'cold';
      console.warn('Raytracer warmup failed; will compile on first use.', err);
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 250 });
  } else {
    window.setTimeout(warm, 80);
  }
}

function updateRaytraceSceneData({ rebuildAtlas = true } = {}) {
  const rtWindows = windows.slice(0, RT_MAX_WINDOWS);
  raytracedSceneMat.uniforms.uWindowCount.value = rtWindows.length;
  raytracedSceneMat.uniforms.uRoomBounds.value.set(
    roomBounds.sideLeft,
    roomBounds.sideRight,
    roomBounds.backZ,
    roomBounds.ceilingY
  );
  if (rebuildAtlas) {
    rtAtlasCtx.fillStyle = '#05040a';
    rtAtlasCtx.fillRect(0, 0, rtAtlasCanvas.width, rtAtlasCanvas.height);
  }
  for (let i = 0; i < RT_MAX_WINDOWS; i++) {
    const win = rtWindows[i];
    const col = i % RT_ATLAS_COLS;
    const row = Math.floor(i / RT_ATLAS_COLS);
    rtAtlasRects[i].set(col / RT_ATLAS_COLS, row / RT_ATLAS_ROWS, 1 / RT_ATLAS_COLS, 1 / RT_ATLAS_ROWS);
    if (!win) {
      rtWindowRects[i].set(0, 0, 0, 0);
      rtWindowLead[i].set(2.0, 4.0, 0, 0);
      continue;
    }
    rtWindowRects[i].set(win.positionX, win.centerY, win.width, win.height);
    rtWindowLead[i].set(win.leadR, win.distMaxPx, 0, 0);
    if (rebuildAtlas) {
      const img = win.texture?.image || glassTexture.image;
      rtAtlasCtx.drawImage(img, col * RT_ATLAS_TILE, row * RT_ATLAS_TILE, RT_ATLAS_TILE, RT_ATLAS_TILE);
    }
  }
  if (rebuildAtlas) rtGlassAtlasTex.needsUpdate = true;

  let boxCount = 0;
  const pushRtBox = (minX, minY, minZ, maxX, maxY, maxZ, mat) => {
    if (boxCount >= RT_MAX_BOXES) return;
    rtBoxMinMat[boxCount].set(minX, minY, minZ, mat);
    rtBoxMax[boxCount].set(maxX, maxY, maxZ, 0);
    boxCount++;
  };

  const wallT = 0.18;
  pushRtBox(roomBounds.sideLeft, -wallT, WALL_Z, roomBounds.sideRight, 0, roomBounds.backZ, 7);
  pushRtBox(roomBounds.sideLeft, roomBounds.ceilingY, WALL_Z, roomBounds.sideRight, roomBounds.ceilingY + wallT, roomBounds.backZ, 6);
  pushRtBox(roomBounds.sideLeft, 0, roomBounds.backZ, roomBounds.sideRight, roomBounds.ceilingY, roomBounds.backZ + wallT, 6);
  pushRtBox(roomBounds.sideLeft - wallT, 0, WALL_Z, roomBounds.sideLeft, roomBounds.ceilingY, roomBounds.backZ, 6);
  pushRtBox(roomBounds.sideRight, 0, WALL_Z, roomBounds.sideRight + wallT, roomBounds.ceilingY, roomBounds.backZ, 6);
  for (const strip of hallwayWall.children) {
    strip.geometry.computeBoundingBox();
    const box = strip.geometry.boundingBox;
    const w = (box.max.x - box.min.x) * strip.scale.x;
    const h = (box.max.y - box.min.y) * strip.scale.y;
    if (w <= 0.001 || h <= 0.001) continue;
    pushRtBox(
      strip.position.x - w * 0.5,
      strip.position.y - h * 0.5,
      WALL_Z - wallT,
      strip.position.x + w * 0.5,
      strip.position.y + h * 0.5,
      WALL_Z,
      6
    );
  }

  for (const win of rtWindows) {
    for (const b of win.frameBoxes || []) {
      if (boxCount >= RT_MAX_BOXES) break;
      rtBoxMinMat[boxCount].set(b.min.x, b.min.y, b.min.z, b.mat);
      rtBoxMax[boxCount].set(b.max.x, b.max.y, b.max.z, 0);
      boxCount++;
    }
    if (boxCount >= RT_MAX_BOXES) break;
  }
  for (let i = boxCount; i < RT_MAX_BOXES; i++) {
    rtBoxMinMat[i].set(0, 0, 0, 0);
    rtBoxMax[i].set(0, 0, 0, 0);
  }
  raytracedSceneMat.uniforms.uBoxCount.value = boxCount;
  scheduleRaytraceWarmup();
}

function applyRendererResolution() {
  const scale = useRaytracer ? Math.max(0.25, Math.min(1.0, state.rtResolution)) : 1.0;
  renderer.setPixelRatio(BASE_PIXEL_RATIO * scale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  raytracedSceneMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
  if (useRaytracer) resizeRaytraceTargets();
  resetRaytraceAccumulation();
}

function markPathTraceDirty() {
  resetRaytraceAccumulation();
}

function setRenderMode(toRaytracer) {
  useRaytracer = !!toRaytracer;
  for (const w of windows) w.mesh.visible = !useRaytracer;
  hallwayWall.visible = !useRaytracer;
  roomEnclosure.visible = !useRaytracer;
  floor.visible = !useRaytracer;
  raysMesh.visible = !useRaytracer && state.raysIntensity > 0.01;
  // Bump god-ray density + step count in raytracer mode so the beams read as
  // physically integrated light volume rather than a faint atmospheric tint.
  raysMat.uniforms.uRaytraceMode.value = useRaytracer ? 1.0 : 0.0;
  renderer.toneMappingExposure = useRaytracer ? state.rtExposure : 1.0;
  applyRendererResolution();
  resetRaytraceAccumulation();
  if (useRaytracer) {
    raytraceFirstFramePending = true;
    raytracePreviewFramePending = true;
    raytraceSamplingStartPending = false;
    raytraceLastCameraChangeTime = performance.now();
    raytraceStatusOverride = 'Raytracer starting...';
    applyRaytraceSettings();
    updateRaytraceStatus();
    scheduleRaytraceWarmup();
  } else {
    raytraceFirstFramePending = false;
    raytracePreviewFramePending = false;
    raytraceSamplingStartPending = false;
    raytraceStatusOverride = '';
  }
}

function aspectToSize(aspect) {
  const a = Math.max(0.35, Math.min(2.8, aspect));
  const h = Math.sqrt(GLASS_AREA / a);
  const w = h * a;
  const centerY = GLASS_BOTTOM + h / 2;
  return { w, h, centerY };
}

function createWindow({ sourceCanvas, aspect }) {
  const { w, h, centerY } = aspectToSize(aspect);
  // First window centered at x=0; each subsequent window slots to the right.
  let positionX = 0;
  if (windows.length > 0) {
    const last = windows[windows.length - 1];
    positionX = last.positionX + last.width / 2 + WINDOW_SPACING + w / 2;
  }

  // Each window gets its own material so it can hold its own texture/uniforms.
  const initialTex = new THREE.CanvasTexture(makePlaceholderCanvas());
  initialTex.colorSpace = THREE.SRGBColorSpace;
  initialTex.minFilter = THREE.LinearFilter;
  initialTex.magFilter = THREE.LinearFilter;
  initialTex.generateMipmaps = false;
  const shaderMat = makeGlassMaterial(initialTex);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), shaderMat);
  mesh.position.set(positionX, centerY, GLASS_Z);
  scene.add(mesh);

  const frameGroup = new THREE.Group();
  const frameBoxes = buildWindowFrame(frameGroup, w, h, centerY, positionX);
  scene.add(frameGroup);

  const win = {
    mesh, mat: shaderMat, shaderMat, frameGroup, frameBoxes, sourceCanvas, aspect,
    positionX, width: w, height: h, centerY,
    seed: Math.random(),
    leadR: 2.0, distMaxPx: 4.0, texture: initialTex,
    texWidth: 64, texHeight: 64,
  };
  windows.push(win);
  rebuildHallwayWall();
  rebuildRoomEnclosure();
  updateRaytraceSceneData();
  markPathTraceDirty();
  return win;
}

function setActiveWindow(idx) {
  if (idx < 0 || idx >= windows.length) return;
  activeWindowIdx = idx;
  const w = windows[idx];
  if (!w.texture) return;
  raytracedSceneMat.uniforms.uPrimaryWindowIndex.value = idx;
  raytracedSceneMat.uniforms.uPrimaryGlassTex.value = w.texture;
  raytracedSceneMat.uniforms.uPrimaryTexSize.value.set(w.texWidth || 64, w.texHeight || 64);
  floorMat.uniforms.uGlassTex.value = w.texture;
  floorMat.uniforms.uGlassPos.value.set(w.positionX, w.centerY, GLASS_Z);
  floorMat.uniforms.uGlassSize.value.set(w.width, w.height);
  floorMat.uniforms.uLeadR.value = w.leadR;
  floorMat.uniforms.uDistMaxPx.value = w.distMaxPx;
  raysMat.uniforms.uGlassTex.value = w.texture;
  raysMat.uniforms.uGlassPos.value.set(w.positionX, w.centerY, GLASS_Z);
  raysMat.uniforms.uGlassSize.value.set(w.width, w.height);
  raysMat.uniforms.uLeadR.value = w.leadR;
  raysMat.uniforms.uDistMaxPx.value = w.distMaxPx;
}

// ---- Smooth camera transition to a specific window ----
const cameraTween = {
  active: false,
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
function startCameraTransition(win) {
  // Same offset relative to the window's center as the default camera setup.
  cameraTween.pos.set(win.positionX + 1.8, 2.9, 7.0);
  cameraTween.target.set(win.positionX, 2.0, 1.4);
  cameraTween.active = true;
}
function tickCameraTween(dt) {
  if (!cameraTween.active) return;
  const ease = 1 - Math.pow(0.001, dt); // ~3.5 1/s, smoothly decaying
  camera.position.lerp(cameraTween.pos, ease);
  controls.target.lerp(cameraTween.target, ease);
  if (camera.position.distanceTo(cameraTween.pos) < 0.04 &&
      controls.target.distanceTo(cameraTween.target) < 0.04) {
    cameraTween.active = false;
  }
}

// First scene fill — no windows yet, just empty plaster + a generic room.
rebuildHallwayWall();
rebuildRoomEnclosure();

// ---------- Floor with light-projection shader ----------
const floorMat = new THREE.ShaderMaterial({
  uniforms: {
    uGlassTex:    { value: glassTexture },
    uFloorTex:    { value: floorWoodTex },
    uFloorScale:  { value: 0.32 },          // world-units per texture tile
    uGlassPos:    { value: new THREE.Vector3(0, GLASS_CENTER_Y, GLASS_Z) },
    uGlassSize:   { value: new THREE.Vector2(GLASS_W, GLASS_H) },
    uSunDir:      { value: sunDir },
    uExposure:    { value: 1.15 },
    uPoolSoftness:{ value: 0.012 },
    uLeadR:       { value: 2.0 },
    uDistMaxPx:   { value: 4.0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vWorldPos;
    uniform sampler2D uGlassTex;
    uniform sampler2D uFloorTex;
    uniform float uFloorScale;
    uniform vec3 uGlassPos;
    uniform vec2 uGlassSize;
    uniform vec3 uSunDir;
    uniform float uExposure;
    uniform float uPoolSoftness;
    uniform float uLeadR;
    uniform float uDistMaxPx;

    // Sample the glass texture where light reaching this floor point passed through.
    // Trace from worldPos backward along -uSunDir to the glass plane (z = uGlassPos.z),
    // then look up the glass UV at the hit. Returns vec3(0) if the trace misses the
    // glass rectangle or if the light direction can't reach this point physically.
    // Lead (encoded in alpha as small distance) blocks transmission entirely.
    vec3 sampleGlassAt(vec3 worldPos) {
      vec3 toSun = -uSunDir;
      float denom = toSun.z;
      if (abs(denom) < 1e-4) return vec3(0.0);
      float t = (uGlassPos.z - worldPos.z) / denom;
      if (t <= 0.0) return vec3(0.0);
      vec3 hit = worldPos + toSun * t;
      vec2 uv = (hit.xy - (uGlassPos.xy - uGlassSize * 0.5)) / uGlassSize;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      vec4 tex = texture2D(uGlassTex, uv);
      float D = tex.a * uDistMaxPx;
      float openness = smoothstep(uLeadR - 0.5, uLeadR + 0.5, D);
      return tex.rgb * openness;
    }

    void main() {
      // 5-tap soft sample so the projected lead lines don't alias on the floor.
      vec3 light = vec3(0.0);
      float s = uPoolSoftness;
      light += sampleGlassAt(vWorldPos);
      light += sampleGlassAt(vWorldPos + vec3( s, 0.0, 0.0));
      light += sampleGlassAt(vWorldPos + vec3(-s, 0.0, 0.0));
      light += sampleGlassAt(vWorldPos + vec3(0.0, 0.0,  s));
      light += sampleGlassAt(vWorldPos + vec3(0.0, 0.0, -s));
      light *= 0.2;

      // Soft Lambertian-ish falloff. Compressed (pow 0.5) so shallow sun still
      // produces a vivid pool, instead of crushing to black at low elevation.
      float cosI = max(0.0, dot(vec3(0.0, 1.0, 0.0), -uSunDir));
      float falloff = pow(cosI, 0.5);

      float r = length(vWorldPos.xz - vec2(0.0, 1.5));
      // Wider falloff so the colored pool reads farther across the floor as
      // the indirect bounce contribution we're about to add to the wall is
      // physically rooted in light covering a real area.
      float vignette = smoothstep(34.0, 3.0, r);

      // Sample the wood plank albedo at this world-space (x, z) position so
      // the floor reads as actual material, not a flat color.
      vec3 albedo = texture2D(uFloorTex, vWorldPos.xz * uFloorScale).rgb;
      // The floor reads primarily as wood. The colored gobo is a subtle
      // tint applied on top — desaturated and low-exposure so it looks like
      // light passing through colored glass, not a vivid projector.
      float lightLum = dot(light, vec3(0.30, 0.59, 0.11));
      vec3 lightDesat = mix(vec3(lightLum), light, 0.55);
      vec3 base = albedo * 0.32 * vignette;
      vec3 gobo = lightDesat * albedo * uExposure * falloff * vignette;
      gl_FragColor = vec4(base + gobo, 1.0);
    }
  `,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// ---------- Volumetric god-rays ----------
// We march the view ray through a bounding box that wraps the light shaft.
// At each step we project the sample point back to the glass via the same
// gobo trick the floor uses, and accumulate the colored light additively.
const RAY_BOX_MIN = new THREE.Vector3(-12, -1, -0.4);
const RAY_BOX_MAX = new THREE.Vector3( 12, 10, 16);
const rayBoxCenter = RAY_BOX_MIN.clone().add(RAY_BOX_MAX).multiplyScalar(0.5);
const rayBoxSize = RAY_BOX_MAX.clone().sub(RAY_BOX_MIN);

const raysMat = new THREE.ShaderMaterial({
  uniforms: {
    uGlassTex:  { value: glassTexture },
    uGlassPos:  { value: new THREE.Vector3(0, GLASS_CENTER_Y, GLASS_Z) },
    uGlassSize: { value: new THREE.Vector2(GLASS_W, GLASS_H) },
    uSunDir:    { value: sunDir },
    uBoxMin:    { value: RAY_BOX_MIN },
    uBoxMax:    { value: RAY_BOX_MAX },
    uCameraPos: { value: new THREE.Vector3() },
    uDensity:   { value: 0.30 },
    uExtinction:{ value: 0.05 },
    uLeadR:     { value: 2.0 },
    uDistMaxPx: { value: 4.0 },
    uRaytraceMode: { value: 0.0 },     // 0 = standard, 1 = full-quality raytraced beams
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    varying vec3 vWorldPos;
    uniform sampler2D uGlassTex;
    uniform vec3 uGlassPos;
    uniform vec2 uGlassSize;
    uniform vec3 uSunDir;
    uniform vec3 uBoxMin;
    uniform vec3 uBoxMax;
    uniform vec3 uCameraPos;
    uniform float uDensity;
    uniform float uExtinction;
    uniform float uLeadR;
    uniform float uDistMaxPx;
    uniform float uRaytraceMode;

    vec3 sampleGlassAt(vec3 worldPos) {
      vec3 toSun = -uSunDir;
      float denom = toSun.z;
      if (abs(denom) < 1e-4) return vec3(0.0);
      float t = (uGlassPos.z - worldPos.z) / denom;
      if (t <= 0.0) return vec3(0.0);
      vec3 hit = worldPos + toSun * t;
      vec2 uv = (hit.xy - (uGlassPos.xy - uGlassSize * 0.5)) / uGlassSize;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      vec4 tex = texture2D(uGlassTex, uv);
      float D = tex.a * uDistMaxPx;
      float openness = smoothstep(uLeadR - 0.5, uLeadR + 0.5, D);
      return tex.rgb * openness;
    }

    // Hash-based dither to mask banding from a low step count.
    float dither(vec2 c) {
      return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec3 rayDir = normalize(vWorldPos - uCameraPos);
      vec3 invDir = 1.0 / rayDir;
      vec3 t1 = (uBoxMin - uCameraPos) * invDir;
      vec3 t2 = (uBoxMax - uCameraPos) * invDir;
      vec3 tnear = min(t1, t2);
      vec3 tfar  = max(t1, t2);
      float tEntry = max(0.0, max(tnear.x, max(tnear.y, tnear.z)));
      float tExit  = min(tfar.x,  min(tfar.y,  tfar.z));
      // Clip the exit at the floor plane y=0 when looking downward so the rays
      // don't stack on top of pixels that are visually below the floor.
      if (rayDir.y < -1e-4) {
        float tFloor = -uCameraPos.y / rayDir.y;
        if (tFloor > 0.0) tExit = min(tExit, tFloor);
      }
      if (tEntry >= tExit) discard;

      // Raytracer mode bumps the step count and the scattering density so
      // beams render as integrated rays rather than a thin tint.
      const float STEPS_STD = 28.0;
      const float STEPS_RT  = 56.0;
      bool rt = uRaytraceMode > 0.5;
      float STEPS = rt ? STEPS_RT : STEPS_STD;
      float densityScale = rt ? 1.9 : 1.0;
      float stepLen = (tExit - tEntry) / STEPS;
      float jitter = dither(gl_FragCoord.xy);

      vec3 accum = vec3(0.0);
      float trans = 1.0;
      for (float i = 0.0; i < 64.0; i++) {
        if (i >= STEPS) break;
        float t = tEntry + (i + jitter) * stepLen;
        vec3 p = uCameraPos + rayDir * t;
        vec3 light = sampleGlassAt(p);
        accum += light * trans * stepLen * densityScale;
        trans *= exp(-uExtinction * stepLen);
      }

      gl_FragColor = vec4(accum * uDensity, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false,
  side: THREE.BackSide,
});
const raysMesh = new THREE.Mesh(
  new THREE.BoxGeometry(rayBoxSize.x, rayBoxSize.y, rayBoxSize.z),
  raysMat
);
raysMesh.position.copy(rayBoxCenter);
raysMesh.renderOrder = 1; // draw rays after the opaque scene
scene.add(raysMesh);

// ---------- Visible sun in the sky ----------
// A camera-facing billboard parked far along -sunDir; its custom shader paints
// a hot core + soft halo. The same uSunDir uniform drives the floor gobo and
// the god rays, so when the user moves the elevation/azimuth sliders the sun
// drifts across the sky AND the light pool on the floor moves with it.
const SUN_DISTANCE = 200;
const sunMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(46, 46),
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffe7b5) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform vec3 uColor;
      void main() {
        vec2 d = (vUv - 0.5) * 2.0;
        float r = length(d);
        float core = smoothstep(0.18, 0.03, r);
        float halo = smoothstep(1.0, 0.18, r) * 0.45;
        float a = clamp(core + halo, 0.0, 1.0);
        if (a < 0.005) discard;
        gl_FragColor = vec4(uColor * (core * 1.6 + halo), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })
);
sunMesh.renderOrder = -1; // drawn before transparent stuff
scene.add(sunMesh);

const _sunOff = new THREE.Vector3();
function updateSunMesh() {
  // Sun position = camera + (-sunDir) * distance, so it stays at a fixed
  // angle relative to the camera and tracks with sun-direction sliders.
  _sunOff.copy(sunDir).multiplyScalar(-SUN_DISTANCE);
  sunMesh.position.copy(camera.position).add(_sunOff);
  sunMesh.lookAt(camera.position);
}

// ---------- Soft contact shadow under the wall (cheap baked vignette) ----------
const shadowTex = makeContactShadowTexture();
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  depthWrite: false,
  opacity: 0.55,
});
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, 2.2), shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, 0.001, 1.0);
scene.add(shadow);

// ---------- State and generation ----------
const state = {
  // Per-window source canvas + seed live on `windows[i]`. Sliders below mutate
  // these global params, which apply to the most-recently-uploaded window
  // when regenerate runs.
  subdivCellRadius: 80,
  paletteSize: 12,
  minPieceRadius: 18,
  leadThickness: 2,
  warpAmp: 0.45,
  maxElongation: 4.0,    // anisotropic stretch cap (1 = isotropic, 5 = ribbon-y)
  generating: false,
  currentGenId: 0,    // monotonically bumped; in-flight gens with stale ID self-cancel at checkpoints
  timeOfDay: 0.45,
  sunElev: 0.42,
  raysIntensity: 0.55,
  rtExposure: 1.18,
  rtGlassSurface: 1.0,
  rtGlassTransmission: 0.72,
  rtReflection: 0.18,
  rtSpecular: 1.0,
  rtSunDiffusion: 0.22,
  rtPointLightBrightness: RT_DEFAULT_POINT_LIGHT_BRIGHTNESS,
  rtVolumeSteps: 34,
  rtMaxSamples: 512,
  rtResolution: 0.55,
};

function setSunFromControls() {
  // azimuth: -55deg to +55deg as t goes 0..1
  const az = (state.timeOfDay - 0.5) * (110 * Math.PI / 180);
  const el = state.sunElev; // 0..1 → 5° to 70°
  const elev = 0.09 + el * 1.1;
  // sun direction is the direction light travels (toward +z in front of glass)
  const dx = -Math.sin(az);
  const dy = -Math.sin(elev);
  const dz =  Math.cos(az) * Math.cos(elev);
  sunDir.set(dx, dy, dz).normalize();
  floorMat.uniforms.uSunDir.value.copy(sunDir);
  raysMat.uniforms.uSunDir.value.copy(sunDir);
  raytracedSceneMat.uniforms.uSunDir.value.copy(sunDir);
  for (const w of windows) {
    w.shaderMat.uniforms.uSunDir.value.copy(sunDir);
  }
  markPathTraceDirty();
  if (typeof updateSunMesh === 'function') updateSunMesh();
}
setSunFromControls();

// Regenerate the stained-glass texture for a specific window (default: the
// most recently added one). Slider changes re-target the latest window. Each
// call bumps a gen-id so in-flight gens self-cancel at their next yield.
async function regenerate(opts = {}) {
  const winIdx = opts.windowIdx ?? (windows.length - 1);
  if (winIdx < 0 || winIdx >= windows.length) return;
  const win = windows[winIdx];
  if (!win.sourceCanvas) return;
  const wantPreview = opts.preview === true;

  const myGenId = ++state.currentGenId;
  state.generating = true;
  setStatus(wantPreview ? 'preview…' : 'Generating stained glass…');
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (state.currentGenId !== myGenId) return;

    const t0 = performance.now();
    const result = await generateStainedGlass(win.sourceCanvas, {
      resolution: wantPreview ? 384 : 1024,
      subdivCellRadius: state.subdivCellRadius,
      paletteSize: state.paletteSize,
      minPieceRadius: state.minPieceRadius,
      leadThickness: state.leadThickness,
      warpAmp: state.warpAmp,
      maxElongation: state.maxElongation,
      previewMode: wantPreview,
      seed: win.seed,
      shouldAbort: () => state.currentGenId !== myGenId,
    });
    if (!result || state.currentGenId !== myGenId) return;

    const { canvas, pieceCount, paletteSize, leadThickness: lt, distMaxPx, width: tw, height: th } = result;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;

    if (win.shaderMat.uniforms.uMap.value && win.shaderMat.uniforms.uMap.value !== tex) {
      win.shaderMat.uniforms.uMap.value.dispose?.();
    }
    win.shaderMat.uniforms.uMap.value = tex;
    win.shaderMat.uniforms.uTexSize.value.set(tw, th);
    win.shaderMat.uniforms.uLeadR.value = lt;
    win.shaderMat.uniforms.uDistMaxPx.value = distMaxPx;
    win.texture = tex;
    win.leadR = lt;
    win.distMaxPx = distMaxPx;
    win.texWidth = tw;
    win.texHeight = th;
    updateRaytraceSceneData();
    markPathTraceDirty();

    // Route the floor + rays gobo to whichever window the camera last focused
    // on. Newly generated windows become the active one (they're what the
    // user just acted on).
    setActiveWindow(winIdx);

    // If this is a brand-new window and we just finished its FULL render,
    // smoothly transition the camera to face it.
    if (!wantPreview && opts.transitionCameraAfter) startCameraTransition(win);

    const ms = (performance.now() - t0) | 0;
    setStatus(`#${winIdx + 1}: ${pieceCount} pieces · ${paletteSize}-color palette · ${ms} ms${wantPreview ? ' · preview' : ''}`);
  } finally {
    if (state.currentGenId === myGenId) state.generating = false;
  }
}

// Slider input: render an immediate low-res preview, then a full-quality
// render 250ms after the user stops touching the slider. The full timer
// resets on every input so a continuous drag never triggers a mid-drag full.
let fullResTimer = null;
function scheduleLiveRegen() {
  regenerate({ preview: true });
  if (fullResTimer) clearTimeout(fullResTimer);
  fullResTimer = setTimeout(() => {
    fullResTimer = null;
    regenerate({ preview: false });
  }, 250);
}

async function loadDefaultSource() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = './default.jpg';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  // First window — no camera tween (this IS the initial view).
  const win = createWindow({ sourceCanvas: c, aspect: c.width / c.height });
  showSourceThumb(c);
  await regenerate({ windowIdx: windows.indexOf(win), preview: false });
}

function loadFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    // Append a new window to the hallway.
    const win = createWindow({ sourceCanvas: c, aspect: c.width / c.height });
    showSourceThumb(c);
    // Generate at full quality, then transition camera to face it.
    await regenerate({
      windowIdx: windows.indexOf(win),
      preview: false,
      transitionCameraAfter: true,
    });
  };
  img.src = url;
}

// ---------- UI wiring ----------
const ui = {
  status:        document.getElementById('status'),
  rtStatus:      document.getElementById('rtStatus'),
  regenerate:    document.getElementById('regenerate'),
  cellDensity:   document.getElementById('cellDensity'),
  leadThickness: document.getElementById('leadThickness'),
  edgeCurve:     document.getElementById('edgeCurve'),
  pieceMerge:    document.getElementById('pieceMerge'),
  minPiece:      document.getElementById('minPiece'),
  flowAlign:     document.getElementById('flowAlign'),
  timeOfDay:     document.getElementById('timeOfDay'),
  sunElev:       document.getElementById('sunElev'),
  raysIntensity: document.getElementById('raysIntensity'),
  raytraceSettings: document.getElementById('raytraceSettings'),
  rtExposure:    document.getElementById('rtExposure'),
  rtGlassSurface: document.getElementById('rtGlassSurface'),
  rtGlassTransmission: document.getElementById('rtGlassTransmission'),
  rtReflection:  document.getElementById('rtReflection'),
  rtSpecular:    document.getElementById('rtSpecular'),
  rtSunDiffusion: document.getElementById('rtSunDiffusion'),
  rtPointLightBrightness: document.getElementById('rtPointLightBrightness'),
  rtVolumeSteps: document.getElementById('rtVolumeSteps'),
  rtMaxSamples: document.getElementById('rtMaxSamples'),
  rtResolution:  document.getElementById('rtResolution'),
  fileInput:     document.getElementById('fileInput'),
  pickFile:      document.getElementById('pickFile'),
  thumb:         document.getElementById('thumb'),
  sourceHud:     document.querySelector('.source'),
  dropOverlay:   document.getElementById('dropOverlay'),
};

function setStatus(text) { if (ui.status) ui.status.textContent = text; }
function showSourceThumb(srcCanvas) {
  const displayW = 80;
  const backingScale = 3;
  const w = displayW * backingScale;
  const h = Math.round((srcCanvas.height / srcCanvas.width) * w);
  ui.thumb.width = w;
  ui.thumb.height = h;
  ui.thumb.getContext('2d').drawImage(srcCanvas, 0, 0, w, h);
  ui.thumb.style.display = 'block';
  updateSourceCenterTransform();
}

function updateSourceCenterTransform() {
  if (!ui.sourceHud) return;
  const rect = ui.sourceHud.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dx = window.innerWidth * 0.5 - (rect.left + rect.width * 0.5);
  const dy = window.innerHeight * 0.5 - (rect.top + rect.height * 0.5);
  ui.sourceHud.style.setProperty('--source-center-x', `${dx.toFixed(1)}px`);
  ui.sourceHud.style.setProperty('--source-center-y', `${dy.toFixed(1)}px`);
}

function pointerInSourceCorner(clientX, clientY) {
  if (!ui.sourceHud) return false;
  const rect = ui.sourceHud.getBoundingClientRect();
  const pad = 14;
  return (
    clientX >= rect.left - pad &&
    clientX <= rect.right + pad &&
    clientY >= rect.top - pad &&
    clientY <= rect.bottom + pad
  );
}

function setSourceCentered(centered) {
  if (!ui.sourceHud) return;
  if (centered) updateSourceCenterTransform();
  ui.sourceHud.classList.toggle('is-centered', centered);
}

ui.sourceHud?.addEventListener('pointerenter', (e) => {
  if (pointerInSourceCorner(e.clientX, e.clientY)) setSourceCentered(true);
});
document.addEventListener('pointermove', (e) => {
  if (!ui.sourceHud?.classList.contains('is-centered')) return;
  if (!pointerInSourceCorner(e.clientX, e.clientY)) setSourceCentered(false);
}, { passive: true });
window.addEventListener('blur', () => setSourceCentered(false));

ui.regenerate.addEventListener('click', () => {
  const win = windows[windows.length - 1];
  if (!win) return;
  win.seed = Math.random();
  regenerate({ preview: false });
});

const readouts = {
  cellDensityVal:   document.getElementById('cellDensityVal'),
  leadThicknessVal: document.getElementById('leadThicknessVal'),
  edgeCurveVal:     document.getElementById('edgeCurveVal'),
  pieceMergeVal:    document.getElementById('pieceMergeVal'),
  minPieceVal:      document.getElementById('minPieceVal'),
  flowAlignVal:     document.getElementById('flowAlignVal'),
  timeOfDayVal:     document.getElementById('timeOfDayVal'),
  sunElevVal:       document.getElementById('sunElevVal'),
  raysIntensityVal: document.getElementById('raysIntensityVal'),
  rtExposureVal:    document.getElementById('rtExposureVal'),
  rtGlassSurfaceVal: document.getElementById('rtGlassSurfaceVal'),
  rtGlassTransmissionVal: document.getElementById('rtGlassTransmissionVal'),
  rtReflectionVal:  document.getElementById('rtReflectionVal'),
  rtSpecularVal:    document.getElementById('rtSpecularVal'),
  rtSunDiffusionVal: document.getElementById('rtSunDiffusionVal'),
  rtPointLightBrightnessVal: document.getElementById('rtPointLightBrightnessVal'),
  rtVolumeStepsVal: document.getElementById('rtVolumeStepsVal'),
  rtMaxSamplesVal: document.getElementById('rtMaxSamplesVal'),
  rtResolutionVal:  document.getElementById('rtResolutionVal'),
};
function updateReadouts() {
  readouts.cellDensityVal.textContent   = `r=${state.subdivCellRadius}px`;
  readouts.leadThicknessVal.textContent = `${state.leadThickness}px`;
  readouts.edgeCurveVal.textContent     = `${Math.round(state.warpAmp * 100)}%`;
  readouts.pieceMergeVal.textContent    = `${state.paletteSize} colors`;
  readouts.minPieceVal.textContent      = state.minPieceRadius > 0
    ? `≥${state.minPieceRadius * state.minPieceRadius}px²`
    : `off`;
  readouts.flowAlignVal.textContent     = state.maxElongation > 1.01
    ? `max ${state.maxElongation.toFixed(1)}×`
    : 'off';
  const az = Math.round((state.timeOfDay - 0.5) * 110);
  readouts.timeOfDayVal.textContent     = `${az >= 0 ? '+' : ''}${az}°`;
  const el = Math.round((0.09 + state.sunElev * 1.1) * 180 / Math.PI);
  readouts.sunElevVal.textContent       = `${el}°`;
  readouts.raysIntensityVal.textContent = `${Math.round(state.raysIntensity * 100)}%`;
  readouts.rtExposureVal.textContent = `${Math.round(state.rtExposure * 100)}%`;
  readouts.rtGlassSurfaceVal.textContent = `${Math.round(state.rtGlassSurface * 100)}%`;
  readouts.rtGlassTransmissionVal.textContent = `${Math.round(state.rtGlassTransmission * 100)}%`;
  readouts.rtReflectionVal.textContent = `${Math.round(state.rtReflection * 100)}%`;
  readouts.rtSpecularVal.textContent = `${Math.round(state.rtSpecular * 100)}%`;
  readouts.rtSunDiffusionVal.textContent = `${Math.round(state.rtSunDiffusion * 100)}%`;
  readouts.rtPointLightBrightnessVal.textContent = `${Math.round(state.rtPointLightBrightness * 100)}%`;
  readouts.rtVolumeStepsVal.textContent = `${state.rtVolumeSteps}`;
  readouts.rtMaxSamplesVal.textContent = `${state.rtMaxSamples}`;
  readouts.rtResolutionVal.textContent = `${Math.round(state.rtResolution * 100)}%`;
}

function applyRaytraceSettings() {
  raytracedSceneMat.uniforms.uRtExposure.value = state.rtExposure;
  raytracedSceneMat.uniforms.uGlassSurface.value = state.rtGlassSurface;
  raytracedSceneMat.uniforms.uGlassTransmission.value = state.rtGlassTransmission;
  raytracedSceneMat.uniforms.uGlassReflection.value = state.rtReflection;
  raytracedSceneMat.uniforms.uSolidSpecular.value = state.rtSpecular;
  raytracedSceneMat.uniforms.uSunDiffusion.value = state.rtSunDiffusion;
  raytracedSceneMat.uniforms.uVolumeSteps.value = state.rtVolumeSteps;
  applyPointLightBrightness();
  renderer.toneMappingExposure = useRaytracer ? state.rtExposure : 1.0;
  markPathTraceDirty();
}

function applyPointLightBrightness() {
  const brightness = Math.max(0, Math.min(1.5, state.rtPointLightBrightness));
  for (let i = 0; i < RT_POINT_LIGHTS.length; i++) {
    const cfg = RT_POINT_LIGHTS[i];
    rtPointLightColorPower[i].set(cfg.color.r, cfg.color.g, cfg.color.b, cfg.power * brightness);
    const light = roomPointLights[i];
    if (light) {
      light.intensity = cfg.power * 3.2 * brightness;
      light.visible = brightness > 0.01;
    }
    const glow = roomPointLightGlows[i];
    if (glow) {
      glow.material.opacity = Math.min(0.82, 0.72 * brightness);
      glow.visible = brightness > 0.01;
    }
  }
}

ui.cellDensity.addEventListener('input', (e) => {
  const t = +e.target.value / 100;
  state.subdivCellRadius = Math.round(140 - t * 100); // 140 → 40 px
  updateReadouts();
  scheduleLiveRegen();
});

ui.leadThickness.addEventListener('input', (e) => {
  state.leadThickness = Math.round(+e.target.value);
  updateReadouts();
  scheduleLiveRegen();
});

ui.edgeCurve.addEventListener('input', (e) => {
  state.warpAmp = +e.target.value / 100;
  updateReadouts();
  scheduleLiveRegen();
});

ui.pieceMerge.addEventListener('input', (e) => {
  const t = +e.target.value / 100;
  state.paletteSize = Math.round(4 + t * 18);
  updateReadouts();
  scheduleLiveRegen();
});

ui.minPiece.addEventListener('input', (e) => {
  const t = +e.target.value / 100;
  state.minPieceRadius = Math.round(t * 40);
  updateReadouts();
  scheduleLiveRegen();
});

ui.flowAlign.addEventListener('input', (e) => {
  // slider 0..100 → max stretch 1×..5×. At 1× regions stay isotropic; at 5×
  // an elongated region can run essentially as a single ribbon.
  const t = +e.target.value / 100;
  state.maxElongation = 1 + t * 4;
  updateReadouts();
  scheduleLiveRegen();
});

ui.timeOfDay.addEventListener('input', (e) => {
  state.timeOfDay = +e.target.value / 100;
  setSunFromControls();
  updateReadouts();
});
ui.sunElev.addEventListener('input', (e) => {
  state.sunElev = +e.target.value / 100;
  setSunFromControls();
  updateReadouts();
});
ui.raysIntensity.addEventListener('input', (e) => {
  state.raysIntensity = +e.target.value / 100;
  // map slider 0..1 → density 0..0.7 with mild ease so the high end isn't flat
  raysMat.uniforms.uDensity.value = state.raysIntensity * state.raysIntensity * 0.7;
  raytracedSceneMat.uniforms.uRaysDensity.value = state.raysIntensity * state.raysIntensity * 0.7;
  raysMesh.visible = !useRaytracer && state.raysIntensity > 0.01;
  if (useRaytracer) markPathTraceDirty();
  updateReadouts();
});
ui.rtExposure.addEventListener('input', (e) => {
  state.rtExposure = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtGlassSurface.addEventListener('input', (e) => {
  state.rtGlassSurface = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtGlassTransmission.addEventListener('input', (e) => {
  state.rtGlassTransmission = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtReflection.addEventListener('input', (e) => {
  state.rtReflection = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtSpecular.addEventListener('input', (e) => {
  state.rtSpecular = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtSunDiffusion.addEventListener('input', (e) => {
  state.rtSunDiffusion = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtPointLightBrightness.addEventListener('input', (e) => {
  state.rtPointLightBrightness = +e.target.value / 100;
  applyRaytraceSettings();
  updateReadouts();
});
ui.rtVolumeSteps.addEventListener('input', (e) => {
  state.rtVolumeSteps = Math.round(+e.target.value);
  raytracedSceneMat.uniforms.uVolumeSteps.value = state.rtVolumeSteps;
  resetRaytraceAccumulation();
  updateReadouts();
});
ui.rtMaxSamples.addEventListener('input', (e) => {
  state.rtMaxSamples = Math.round(+e.target.value);
  updateReadouts();
});
ui.rtResolution.addEventListener('input', (e) => {
  state.rtResolution = +e.target.value / 100;
  applyRendererResolution();
  updateReadouts();
});
// Initialize rays density from default state.
raysMat.uniforms.uDensity.value = state.raysIntensity * state.raysIntensity * 0.7;
raytracedSceneMat.uniforms.uRaysDensity.value = state.raysIntensity * state.raysIntensity * 0.7;
applyRaytraceSettings();
updateReadouts();

ui.pickFile.addEventListener('click', () => ui.fileInput.click());
ui.fileInput.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) loadFromFile(f);
});

// Header info-panel toggle (chrome matches desert: pill of icon buttons + a
// collapsible glass panel that holds the long-form description).
const infoToggleEl = document.getElementById('infoToggle');
const infoPanelEl  = document.getElementById('infoPanel');
infoToggleEl?.addEventListener('click', () => {
  const willOpen = infoPanelEl.hidden;
  infoPanelEl.hidden = !willOpen;
  infoToggleEl.classList.toggle('is-active', willOpen);
  infoToggleEl.setAttribute('aria-pressed', willOpen ? 'true' : 'false');
});

// Mobile controls drawer — collapsed by default on narrow screens to free
// up the viewport, expanded on desktop. Tap the chevron to toggle.
const controlsEl = document.getElementById('controls');
const controlsToggleEl = document.getElementById('controlsToggle');
const MOBILE_BREAKPOINT = 720;
function isMobileWidth() { return window.innerWidth <= MOBILE_BREAKPOINT; }
if (isMobileWidth() && controlsEl) controlsEl.classList.add('is-collapsed');
controlsToggleEl?.addEventListener('click', () => {
  const collapsed = controlsEl.classList.toggle('is-collapsed');
  controlsToggleEl.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});

// Raytracer toggle — switches from the live Three scene to the fullscreen
// scene tracer, with the button state mirrored for deep links/tests.
const raytraceToggleEl = document.getElementById('raytraceToggle');
function syncRaytraceToggleButton() {
  if (!raytraceToggleEl) return;
  raytraceToggleEl.textContent = `Raytracer: ${useRaytracer ? 'on' : 'off'}`;
  raytraceToggleEl.classList.toggle('primary', useRaytracer);
  raytraceToggleEl.setAttribute('aria-pressed', useRaytracer ? 'true' : 'false');
  if (ui.raytraceSettings) ui.raytraceSettings.hidden = !useRaytracer;
}
raytraceToggleEl?.addEventListener('click', () => {
  setRenderMode(!useRaytracer);
  syncRaytraceToggleButton();
});
if (new URLSearchParams(window.location.search).get('raytrace') === '1') {
  setRenderMode(true);
  syncRaytraceToggleButton();
}

// Drag-and-drop anywhere on the window.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  ui.dropOverlay.classList.add('is-active');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth--;
  if (dragDepth <= 0) { dragDepth = 0; ui.dropOverlay.classList.remove('is-active'); }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  ui.dropOverlay.classList.remove('is-active');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFromFile(f);
});

// ---------- Scene bounds (wall + floor collision) ----------
// The glass plane sits at z = 0 with the plaster wall just behind it. The
// wood frame protrudes to z ≈ 0.16. Keep the camera (and target) safely in
// front of the wall and above the floor so neither WASD nor orbit can clip
// through. Lateral / upper bounds are loose — only depth and floor matter.
const BOUND_MIN_Z_CAM = 0.45;
const BOUND_MIN_Z_TGT = 0.10;
const BOUND_MIN_Y_CAM = 0.30;
const BOUND_MIN_Y_TGT = 0.00;
const ROOM_MARGIN     = 0.4;  // keep camera off the room walls/ceiling
function clampSceneBounds() {
  // Window-wall front face + floor minimums.
  if (camera.position.z < BOUND_MIN_Z_CAM) camera.position.z = BOUND_MIN_Z_CAM;
  if (camera.position.y < BOUND_MIN_Y_CAM) camera.position.y = BOUND_MIN_Y_CAM;
  if (controls.target.z < BOUND_MIN_Z_TGT) controls.target.z = BOUND_MIN_Z_TGT;
  if (controls.target.y < BOUND_MIN_Y_TGT) controls.target.y = BOUND_MIN_Y_TGT;
  // Room enclosure: back wall, ceiling, and side walls.
  const xMin = roomBounds.sideLeft  + ROOM_MARGIN;
  const xMax = roomBounds.sideRight - ROOM_MARGIN;
  const zMax = roomBounds.backZ     - ROOM_MARGIN;
  const yMax = roomBounds.ceilingY  - ROOM_MARGIN;
  if (camera.position.x < xMin) camera.position.x = xMin;
  if (camera.position.x > xMax) camera.position.x = xMax;
  if (camera.position.z > zMax) camera.position.z = zMax;
  if (camera.position.y > yMax) camera.position.y = yMax;
  if (controls.target.x < xMin) controls.target.x = xMin;
  if (controls.target.x > xMax) controls.target.x = xMax;
  if (controls.target.z > zMax) controls.target.z = zMax;
  if (controls.target.y > yMax) controls.target.y = yMax;
}

// ---------- WASD fly-around movement ----------
// Pan the camera + orbit target in lockstep so orbit/zoom keep working from
// wherever you've moved to. W/S go along the camera's horizontal forward axis,
// A/D strafe along the right axis, Q/E shift vertically. Space rises, and
// Shift+Space descends. Shift also multiplies speed for all movement.
// Movement applied per-frame from a held-keys map so motion is smooth.
const moveKeys = { w: false, a: false, s: false, d: false, q: false, e: false, space: false, shift: false };
function moveKeyFromEvent(e) {
  return e.code === 'Space' ? 'space' : e.key.toLowerCase();
}
window.addEventListener('keydown', (e) => {
  // Ignore when typing into an input or contenteditable.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = moveKeyFromEvent(e);
  if (e.repeat && k !== 'space') return;
  if (k === 'shift') { moveKeys.shift = true; return; }
  if (k in moveKeys) { moveKeys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = moveKeyFromEvent(e);
  if (k === 'shift') { moveKeys.shift = false; return; }
  if (k in moveKeys) moveKeys[k] = false;
});
window.addEventListener('blur', () => {
  for (const k of Object.keys(moveKeys)) moveKeys[k] = false;
});

const _moveFwd   = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _moveDelta = new THREE.Vector3();
function applyMovement(dt) {
  const horizSpeed = (moveKeys.shift ? 8.5 : 3.5);
  const vertSpeed  = (moveKeys.shift ? 6.0 : 2.5);

  // Forward = camera look direction projected onto the horizontal plane.
  camera.getWorldDirection(_moveFwd);
  _moveFwd.y = 0;
  if (_moveFwd.lengthSq() < 1e-6) return; // looking straight up/down — skip
  _moveFwd.normalize();
  _moveRight.crossVectors(_moveFwd, camera.up).normalize();

  _moveDelta.set(0, 0, 0);
  if (moveKeys.w) _moveDelta.add(_moveFwd);
  if (moveKeys.s) _moveDelta.sub(_moveFwd);
  if (moveKeys.d) _moveDelta.add(_moveRight);
  if (moveKeys.a) _moveDelta.sub(_moveRight);
  const horizLen = _moveDelta.length();
  if (horizLen > 1e-6) _moveDelta.multiplyScalar(horizSpeed * dt / horizLen);

  // Vertical motion is independent of horizontal speed/normalization.
  if (moveKeys.e) _moveDelta.y += vertSpeed * dt;
  if (moveKeys.q) _moveDelta.y -= vertSpeed * dt;
  if (moveKeys.space) _moveDelta.y += (moveKeys.shift ? -1 : 1) * vertSpeed * dt;

  // Clamp the delta so neither the camera nor the target can be pushed past
  // the wall or below the floor. We tighten the most-restrictive of the two
  // (camera vs target) on each axis so they stay in sync.
  if (_moveDelta.z !== 0) {
    const camMinDz = BOUND_MIN_Z_CAM - camera.position.z;
    const tgtMinDz = BOUND_MIN_Z_TGT - controls.target.z;
    const allowedMinDz = Math.max(camMinDz, tgtMinDz);
    if (_moveDelta.z < allowedMinDz) _moveDelta.z = allowedMinDz;
  }
  if (_moveDelta.y !== 0) {
    const camMinDy = BOUND_MIN_Y_CAM - camera.position.y;
    const tgtMinDy = BOUND_MIN_Y_TGT - controls.target.y;
    const allowedMinDy = Math.max(camMinDy, tgtMinDy);
    if (_moveDelta.y < allowedMinDy) _moveDelta.y = allowedMinDy;
  }

  if (_moveDelta.lengthSq() > 0) {
    camera.position.add(_moveDelta);
    controls.target.add(_moveDelta);
  }
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRendererResolution();
  updateSourceCenterTransform();
});

// ---------- Loop ----------
let lastFrameTime = performance.now();
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  applyMovement(dt);
  tickCameraTween(dt);
  controls.update(dt);
  clampSceneBounds();
  raysMat.uniforms.uCameraPos.value.copy(camera.position);
  for (const w of windows) {
    w.shaderMat.uniforms.uCameraPos.value.copy(camera.position);
  }
  raytracedSceneMat.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
  raytracedSceneMat.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
  updateSunMesh();
  if (useRaytracer) {
    renderCustomRaytracer();
  } else {
    renderer.render(scene, camera);
  }
  updateRaytraceStatus();
}
tick();

loadDefaultSource().catch((err) => {
  console.error(err);
  setStatus('Could not load default image. Drop one or pick a file.');
});

// ---------- Helpers ----------
function makePlaceholderCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, '#0c0a14');
  g.addColorStop(1, '#1c1322');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function makeContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural wood texture: horizontal planks with staggered seams, grain lines,
// occasional knots, and per-plank tonal variation. Returns a CanvasTexture
// already configured for sRGB color space and seamless repeat tiling.
function makeFrameWoodTexture() {
  const fallback = makeWoodTexture({ W: 1024, H: 512, plankH: 155, hueShift: -2, dark: false });
  const tex = new THREE.TextureLoader().load('./wood-frame.jpg', (loaded) => {
    configureFrameWoodTexture(loaded);
    loaded.needsUpdate = true;
  });
  tex.image = fallback.image;
  configureFrameWoodTexture(tex);
  tex.needsUpdate = true;
  return tex;
}

function configureFrameWoodTexture(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities?.getMaxAnisotropy?.() || 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.repeat.set(1.08, 0.92);
}

function makeWoodTexture({ W = 1024, H = 1024, plankH = 96, hueShift = 0, dark = false } = {}) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const baseR = (dark ? 86 : 118) + hueShift;
  const baseG = (dark ? 54 : 76)  + Math.floor(hueShift * 0.5);
  const baseB = (dark ? 28 : 42)  + Math.floor(hueShift * 0.2);
  ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
  ctx.fillRect(0, 0, W, H);

  const numPlanks = Math.ceil(H / plankH);
  const breakSeed = Math.random() * 200;

  for (let p = 0; p < numPlanks; p++) {
    const py = p * plankH;
    const v = 0.78 + Math.random() * 0.38;
    const sR = Math.max(0, Math.min(255, baseR * v));
    const sG = Math.max(0, Math.min(255, baseG * v));
    const sB = Math.max(0, Math.min(255, baseB * v));
    ctx.fillStyle = `rgb(${sR | 0}, ${sG | 0}, ${sB | 0})`;
    ctx.fillRect(0, py, W, plankH);

    // Plank seam (above this row).
    ctx.strokeStyle = 'rgba(8, 4, 0, 0.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();

    // Staggered vertical breaks (plank ends).
    let x = (p * 220 + breakSeed) % 380;
    while (x < W) {
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plankH);
      ctx.strokeStyle = 'rgba(6, 3, 0, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      x += 320 + (Math.random() - 0.5) * 140;
    }

    // Wood grain — long wavy near-horizontal strokes.
    const grainCount = 8 + Math.floor(plankH / 18);
    for (let g = 0; g < grainCount; g++) {
      const gy = py + (g + 0.5) * (plankH / (grainCount + 1));
      const grainAlpha = 0.04 + Math.random() * 0.16;
      ctx.strokeStyle = `rgba(15, 8, 2, ${grainAlpha})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      let gx = 0;
      while (gx < W) {
        const seg = 60 + Math.random() * 90;
        const dy = (Math.random() - 0.5) * 4;
        ctx.quadraticCurveTo(gx + seg / 2, gy + dy * 1.7, gx + seg, gy + dy);
        gx += seg;
      }
      ctx.stroke();
    }

    // Occasional knot.
    if (Math.random() < 0.28) {
      const kx = Math.random() * W;
      const ky = py + plankH * (0.25 + Math.random() * 0.5);
      const kr = 4 + Math.random() * 9;
      const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      grad.addColorStop(0,   'rgba(18, 8, 0, 0.95)');
      grad.addColorStop(0.55,'rgba(40, 22, 8, 0.55)');
      grad.addColorStop(1,   'rgba(40, 22, 8, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(kx, ky, kr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fine speckle noise.
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 20;
    data[i]     = Math.max(0, Math.min(255, data[i]     + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Procedural plaster wall: dim base with subtle radial color patches and
// fine grain so the wall doesn't read as flat shaded.
function makePlasterTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#221a1e';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 280; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 18 + Math.random() * 90;
    const tone = 0.6 + Math.random() * 0.7;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${(34 * tone) | 0}, ${(26 * tone) | 0}, ${(30 * tone) | 0}, 0.6)`);
    grad.addColorStop(1, 'rgba(34, 26, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine noise.
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 12;
    data[i]     = Math.max(0, Math.min(255, data[i]     + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
