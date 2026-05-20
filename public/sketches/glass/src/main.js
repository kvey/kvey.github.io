import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    if (leadAlpha < 0.001) {
      float lum = dot(tex.rgb, vec3(0.30, 0.59, 0.11));
      float translucency = smoothstep(0.08, 0.65, lum) * 0.55;
      vec3 transmitted = (skyColor + sunGlow) * tex.rgb * 1.6;
      vec3 finalGlass = mix(glassColor, transmitted, translucency);
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

// Raytraced glass — a custom ShaderMaterial that traces rays through the
// glass plane using real Snell-refraction, Schlick Fresnel, sky sampling in
// both refracted and reflected directions, and direct sun visibility check
// against the refracted ray. The lead came still gets bump shading. This is
// the "raytracer" mode the toggle picks.
const RAYTRACED_GLASS_FRAG_SRC = /* glsl */`
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
  uniform float uIOR;

  vec3 sampleSky(vec3 dir) {
    float lon = atan(dir.z, dir.x);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    return texture2D(uSkyTex, vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5)).rgb;
  }

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    vec3 glassColor = tex.rgb;
    vec2 texel = 1.0 / uTexSize;

    // Glass plane normal is +Z in world (our windows all face +Z toward camera).
    vec3 N = vec3(0.0, 0.0, 1.0);
    vec3 V = normalize(vWorldPos - uCameraPos);

    // Snell-refraction through the slab (a thin pane treated as one interface).
    vec3 refracted = refract(V, N, 1.0 / uIOR);
    if (dot(refracted, refracted) < 1e-4) refracted = V; // TIR fallback
    vec3 reflected = reflect(V, N);

    // Schlick Fresnel: how much of the view ray reflects vs. refracts.
    float cosI = max(0.0, -dot(V, N));
    float F0 = (uIOR - 1.0) / (uIOR + 1.0); F0 *= F0;
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosI, 5.0);

    vec3 skyRef  = sampleSky(refracted);
    vec3 skyRefl = sampleSky(reflected);

    // Direct sun visibility along the REFRACTED ray (the ray that actually
    // reaches the sky after passing through the pane).
    float sunDot = dot(refracted, -normalize(uSunDir));
    float sunCore = pow(max(0.0, sunDot), 280.0) * 9.0;
    float sunHalo = pow(max(0.0, sunDot), 14.0) * 0.6;
    vec3 sunGlow = vec3(1.0, 0.92, 0.78) * (sunCore + sunHalo);

    // Lead detection / blur (same 5-tap distance field path as standard).
    float Dc  = tex.a * uDistMaxPx;
    float Dxp = texture2D(uMap, vUv + vec2( texel.x, 0.0)).a * uDistMaxPx;
    float Dxm = texture2D(uMap, vUv + vec2(-texel.x, 0.0)).a * uDistMaxPx;
    float Dyp = texture2D(uMap, vUv + vec2(0.0,  texel.y)).a * uDistMaxPx;
    float Dym = texture2D(uMap, vUv + vec2(0.0, -texel.y)).a * uDistMaxPx;
    float D = (Dc * 2.0 + Dxp + Dxm + Dyp + Dym) * 0.16666667;
    float leadAlpha = 1.0 - smoothstep(uLeadR - 0.75, uLeadR + 0.75, D);

    // Glass body: refracted sky tinted by glass color, plus a Fresnel-weighted
    // reflection of the sky off the front face. Backlight boosts saturated
    // cells so they still glow rather than going washed-out.
    vec3 transmittedLight = (skyRef + sunGlow) * glassColor * 1.7 * uBacklight;
    vec3 glassResult = mix(transmittedLight, skyRefl, fresnel * 0.42);

    if (leadAlpha < 0.001) {
      gl_FragColor = vec4(glassResult, 1.0);
      return;
    }

    // Lead bump + specular + a tiny chromatic reflection of the actual sky.
    vec2 grad = vec2(Dxp - Dxm, Dyp - Dym) * 0.5;
    float gradLen = length(grad);
    vec3 Nlead = vec3(0.0, 0.0, 1.0);
    if (gradLen > 0.05) {
      vec2 outDir = grad / gradLen;
      float clampedD = min(D, uLeadR * 0.95);
      float h = sqrt(max(0.001, uLeadR * uLeadR - clampedD * clampedD));
      float hp = clampedD / h;
      Nlead = normalize(vec3(outDir * hp, 1.0));
    }
    vec3 lightDir = normalize(vec3(0.45, -0.50, 0.78));
    vec3 vDir = vec3(0.0, 0.0, 1.0);
    float NdotL = max(0.0, dot(Nlead, lightDir));
    vec3 H = normalize(lightDir + vDir);
    float spec = pow(max(0.0, dot(Nlead, H)), 36.0);
    vec3 leadSkyReflect = sampleSky(reflect(V, Nlead)) * 0.20;
    vec3 silverLit = uLeadTint * (0.30 + 0.62 * NdotL)
                     + vec3(0.85) * spec
                     + leadSkyReflect
                     + glassColor * 0.10;

    vec3 finalColor = mix(glassResult, silverLit, leadAlpha);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function makeRaytracedGlassMaterial(initialTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap:        { value: initialTexture },
      uTexSize:    { value: new THREE.Vector2(64, 64) },
      uBacklight:  { value: 1.35 },
      uLeadR:      { value: 2.0 },
      uDistMaxPx:  { value: 4.0 },
      uLeadTint:   { value: new THREE.Color(0x1f1f23) },
      uSkyTex:     { value: skyTexture },
      uSunDir:     { value: new THREE.Vector3(-0.22, -0.42, 0.92) },
      uCameraPos:  { value: new THREE.Vector3() },
      uIOR:        { value: 1.48 },
    },
    vertexShader: GLASS_VERT_SRC,
    fragmentShader: RAYTRACED_GLASS_FRAG_SRC,
    side: THREE.DoubleSide,
  });
}

function makeGlassMaterial(initialTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap:        { value: initialTexture },
      uTexSize:    { value: new THREE.Vector2(64, 64) },
      uBacklight:  { value: 1.25 },
      uLeadR:      { value: 2.0 },
      uDistMaxPx:  { value: 4.0 },
      uLeadTint:   { value: new THREE.Color(0x1f1f23) },
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
const frameWoodTex   = makeWoodTexture({ W: 1024, H: 256,  plankH: 220, hueShift: 6, dark: true });

// ---------- Wall around the glass + 3D wooden window frame ----------
// Two groups so they rebuild together on aspect change.
const WALL_W = 28, WALL_H = 18;
const WALL_Z = GLASS_Z - 0.05;                // plaster sits behind the glass plane
const wallMat = new THREE.MeshBasicMaterial({ map: wallPlasterTex, color: 0x4a4248 });
const trimMat = new THREE.MeshBasicMaterial({ color: 0x05040a });
// Wood — multiple tints so layered mouldings catch light differently.
const frameMatFront     = new THREE.MeshBasicMaterial({ map: frameWoodTex });
const frameMatSide      = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x9a8270 });
const frameMatBack      = new THREE.MeshBasicMaterial({ color: 0x1f140a });
const frameMatFrontDark = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x5a3d28 });
const frameMatFrontLight = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0xc4a585 });
// Gilded accents (antique gold) — used for inner bead and keystone highlight.
const goldFrontMat = new THREE.MeshBasicMaterial({ color: 0xb38a47 });
const goldSideMat  = new THREE.MeshBasicMaterial({ color: 0x8a6730 });
// Material arrays for BoxGeometry: [+x, -x, +y, -y, +z, -z]
const WOOD_MATS       = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFront,      frameMatBack];
const WOOD_DARK_MATS  = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFrontDark,  frameMatBack];
const WOOD_LIGHT_MATS = [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFrontLight, frameMatBack];
const GOLD_MATS       = [goldSideMat,  goldSideMat,  goldSideMat,  goldSideMat,  goldFrontMat,       frameMatBack];
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

  const box = (w, h, d, mats, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, y, z);
    group.add(m);
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
}

// ---- Windows (one per uploaded image) ----
const windows = [];
let activeWindowIdx = 0;
let useRaytracer = false;

function setRenderMode(toRaytracer) {
  useRaytracer = !!toRaytracer;
  for (const w of windows) {
    w.mesh.material = useRaytracer ? w.raytraceMat : w.shaderMat;
    w.mat = w.mesh.material;
  }
  // Bump god-ray density + step count in raytracer mode so the beams read as
  // physically integrated light volume rather than a faint atmospheric tint.
  raysMat.uniforms.uRaytraceMode.value = useRaytracer ? 1.0 : 0.0;
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
  // Two materials per window: the custom shader (with bump-shaded lead,
  // sky tinting, sun bleed) and a MeshPhysicalMaterial alternative with
  // proper screen-space transmission + IBL. The render-mode toggle swaps
  // `mesh.material` between them.
  const shaderMat = makeGlassMaterial(initialTex);
  const raytraceMat = makeRaytracedGlassMaterial(initialTex);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), useRaytracer ? raytraceMat : shaderMat);
  mesh.position.set(positionX, centerY, GLASS_Z);
  scene.add(mesh);

  const frameGroup = new THREE.Group();
  buildWindowFrame(frameGroup, w, h, centerY, positionX);
  scene.add(frameGroup);

  const win = {
    mesh, mat: shaderMat, shaderMat, raytraceMat, frameGroup, sourceCanvas, aspect,
    positionX, width: w, height: h, centerY,
    seed: Math.random(),
    leadR: 2.0, distMaxPx: 4.0, texture: initialTex,
  };
  windows.push(win);
  rebuildHallwayWall();
  rebuildRoomEnclosure();
  return win;
}

function setActiveWindow(idx) {
  if (idx < 0 || idx >= windows.length) return;
  activeWindowIdx = idx;
  const w = windows[idx];
  if (!w.texture) return;
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
const sunDir = new THREE.Vector3(-0.22, -0.42, 0.92).normalize();

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
  // Both glass shaders (standard and raytraced) carry uSunDir for direct sun
  // visibility tests; update them in lockstep.
  for (const w of windows) {
    w.shaderMat.uniforms.uSunDir.value.copy(sunDir);
    w.raytraceMat.uniforms.uSunDir.value.copy(sunDir);
  }
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
    // Mirror the same texture + lead params onto the raytraced material so
    // the toggle is instant without re-running the generator.
    win.raytraceMat.uniforms.uMap.value = tex;
    win.raytraceMat.uniforms.uTexSize.value.set(tw, th);
    win.raytraceMat.uniforms.uLeadR.value = lt;
    win.raytraceMat.uniforms.uDistMaxPx.value = distMaxPx;
    win.texture = tex;
    win.leadR = lt;
    win.distMaxPx = distMaxPx;

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
  fileInput:     document.getElementById('fileInput'),
  pickFile:      document.getElementById('pickFile'),
  thumb:         document.getElementById('thumb'),
  dropOverlay:   document.getElementById('dropOverlay'),
};

function setStatus(text) { if (ui.status) ui.status.textContent = text; }
function showSourceThumb(srcCanvas) {
  const w = 80;
  const h = Math.round((srcCanvas.height / srcCanvas.width) * w);
  ui.thumb.width = w;
  ui.thumb.height = h;
  ui.thumb.getContext('2d').drawImage(srcCanvas, 0, 0, w, h);
  ui.thumb.style.display = 'block';
}

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
  raysMesh.visible = state.raysIntensity > 0.01;
  updateReadouts();
});
// Initialize rays density from default state.
raysMat.uniforms.uDensity.value = state.raysIntensity * state.raysIntensity * 0.7;
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

// Raytracer toggle — switches all windows between the custom shader and the
// MeshPhysicalMaterial alternative.
const raytraceToggleEl = document.getElementById('raytraceToggle');
raytraceToggleEl?.addEventListener('click', () => {
  setRenderMode(!useRaytracer);
  raytraceToggleEl.textContent = `Raytracer: ${useRaytracer ? 'on' : 'off'}`;
  raytraceToggleEl.classList.toggle('primary', useRaytracer);
  raytraceToggleEl.setAttribute('aria-pressed', useRaytracer ? 'true' : 'false');
});

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
// A/D strafe along the right axis, Q/E shift vertically. Shift multiplies
// speed. Movement applied per-frame from a held-keys map so motion is smooth.
const moveKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // Ignore when typing into an input or contenteditable.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key.toLowerCase();
  if (k === 'shift') { moveKeys.shift = true; return; }
  if (k in moveKeys) { moveKeys[k] = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
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
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  applyMovement(dt);
  tickCameraTween(dt);
  controls.update(dt);
  clampSceneBounds();
  raysMat.uniforms.uCameraPos.value.copy(camera.position);
  for (const w of windows) {
    w.shaderMat.uniforms.uCameraPos.value.copy(camera.position);
    w.raytraceMat.uniforms.uCameraPos.value.copy(camera.position);
  }
  updateSunMesh();
  renderer.render(scene, camera);
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
