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
scene.background = new THREE.Color(0x07060a);
scene.fog = new THREE.Fog(0x07060a, 12, 38);

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

// ---------- Glass plane ----------
const glassMat = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: glassTexture },
    uBacklight: { value: 1.25 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D uMap;
    uniform float uBacklight;
    void main() {
      vec3 c = texture2D(uMap, vUv).rgb;
      // Backlit glass: scale uniformly so colored cells glow, dark lead stays dark.
      gl_FragColor = vec4(c * uBacklight, 1.0);
    }
  `,
  side: THREE.DoubleSide,
});
const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(GLASS_W, GLASS_H), glassMat);
glassMesh.position.set(0, GLASS_CENTER_Y, GLASS_Z);
scene.add(glassMesh);

// ---------- Procedural wood + plaster textures ----------
const wallPlasterTex = makePlasterTexture();
const floorWoodTex   = makeWoodTexture({ W: 1024, H: 1024, plankH: 110, hueShift: -8 });
const frameWoodTex   = makeWoodTexture({ W: 1024, H: 256,  plankH: 220, hueShift: 6, dark: true });

// ---------- Wall around the glass + 3D wooden window frame ----------
// Two groups so they rebuild together on aspect change.
const WALL_W = 28, WALL_H = 18;
const WALL_Z = GLASS_Z - 0.05;                // plaster sits behind the glass plane
const FRAME_BOARD = 0.26;                     // wood molding width (inner edge → outer edge)
const FRAME_DEPTH = 0.16;                     // depth of the frame protruding toward camera
const wallMat = new THREE.MeshBasicMaterial({ map: wallPlasterTex, color: 0x4a4248 });
const trimMat = new THREE.MeshBasicMaterial({ color: 0x05040a });
const frameMatFront = new THREE.MeshBasicMaterial({ map: frameWoodTex });
const frameMatSide  = new THREE.MeshBasicMaterial({ map: frameWoodTex, color: 0x9a8270 });
const frameMatBack  = new THREE.MeshBasicMaterial({ color: 0x1f140a });
const wallGroup = new THREE.Group();
const frameGroup = new THREE.Group();
scene.add(wallGroup);
scene.add(frameGroup);

function rebuildWall() {
  // Dispose previous geometries.
  for (const g of [wallGroup, frameGroup]) {
    while (g.children.length) {
      const c = g.children.pop();
      c.geometry?.dispose();
    }
  }

  // ---- Plaster wall: 4 strips around the glass opening ----
  const sideW = (WALL_W - GLASS_W) / 2;
  const sideH = (WALL_H - GLASS_H) / 2;
  const addWall = (w, h, x, y, repU, repV) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat.clone());
    // each strip has its own clone so it can set independent texture repeats
    m.material.map = wallPlasterTex.clone();
    m.material.map.wrapS = m.material.map.wrapT = THREE.RepeatWrapping;
    m.material.map.repeat.set(repU, repV);
    m.material.map.colorSpace = THREE.SRGBColorSpace;
    m.material.map.needsUpdate = true;
    m.position.set(x, y, WALL_Z);
    wallGroup.add(m);
  };
  addWall(WALL_W, sideH, 0, GLASS_CENTER_Y + GLASS_H / 2 + sideH / 2, WALL_W / 3, sideH / 3);
  addWall(WALL_W, sideH, 0, GLASS_CENTER_Y - GLASS_H / 2 - sideH / 2, WALL_W / 3, sideH / 3);
  addWall(sideW, GLASS_H, -GLASS_W / 2 - sideW / 2, GLASS_CENTER_Y, sideW / 3, GLASS_H / 3);
  addWall(sideW, GLASS_H,  GLASS_W / 2 + sideW / 2, GLASS_CENTER_Y, sideW / 3, GLASS_H / 3);

  // Dark inset trim sits just behind the glass to hide any sub-pixel seam.
  const inset = new THREE.Mesh(
    new THREE.PlaneGeometry(GLASS_W + 0.04, GLASS_H + 0.04),
    trimMat
  );
  inset.position.set(0, GLASS_CENTER_Y, GLASS_Z - 0.025);
  wallGroup.add(inset);

  // ---- 3D wooden window frame: four extruded boards bracketing the glass ----
  const innerW = GLASS_W;
  const innerH = GLASS_H;
  const frameInnerHalfW = innerW / 2;
  const frameInnerHalfH = innerH / 2;
  const boardZ = FRAME_DEPTH / 2; // frame extrudes from glass plane forward
  const board = (w, h, x, y) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, FRAME_DEPTH),
      [frameMatSide, frameMatSide, frameMatSide, frameMatSide, frameMatFront, frameMatBack]
    );
    m.position.set(x, y, boardZ);
    frameGroup.add(m);
  };
  // Top + bottom span the full outer width; left/right slot between them.
  const outerW = innerW + 2 * FRAME_BOARD;
  board(outerW, FRAME_BOARD, 0, GLASS_CENTER_Y + frameInnerHalfH + FRAME_BOARD / 2);
  board(outerW, FRAME_BOARD, 0, GLASS_CENTER_Y - frameInnerHalfH - FRAME_BOARD / 2);
  board(FRAME_BOARD, innerH, -frameInnerHalfW - FRAME_BOARD / 2, GLASS_CENTER_Y);
  board(FRAME_BOARD, innerH,  frameInnerHalfW + FRAME_BOARD / 2, GLASS_CENTER_Y);

  // ---- Windowsill: a horizontal wooden ledge below the bottom frame board,
  // overhanging both sides and sticking out a bit beyond the frame's depth.
  // Visually anchors the window as cut into the wall (the bottom frame "sits"
  // on the sill, and the wall continues below the sill down to the floor).
  const sillW = outerW + 0.20;
  const sillD = FRAME_DEPTH + 0.10;
  const sillH = 0.10;
  const sillY = GLASS_CENTER_Y - frameInnerHalfH - FRAME_BOARD - sillH / 2;
  const sillZ = sillD / 2;
  // Box face material order: +x, -x, +y(top), -y(bottom), +z(front), -z(back).
  const sillMats = [
    frameMatSide,  // right end of sill
    frameMatSide,  // left end of sill
    frameMatFront, // top of sill — visible from above
    frameMatBack,  // underside (mostly hidden)
    frameMatFront, // front face — visible from camera
    frameMatBack,  // back (against wall)
  ];
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(sillW, sillH, sillD),
    sillMats
  );
  sill.position.set(0, sillY, sillZ);
  frameGroup.add(sill);
}
rebuildWall();

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

    // Sample the glass texture where light reaching this floor point passed through.
    // Trace from worldPos backward along -uSunDir to the glass plane (z = uGlassPos.z),
    // then look up the glass UV at the hit. Returns vec3(0) if the trace misses the
    // glass rectangle or if the light direction can't reach this point physically.
    vec3 sampleGlassAt(vec3 worldPos) {
      vec3 toSun = -uSunDir;
      float denom = toSun.z;
      if (abs(denom) < 1e-4) return vec3(0.0);
      float t = (uGlassPos.z - worldPos.z) / denom;
      if (t <= 0.0) return vec3(0.0);
      vec3 hit = worldPos + toSun * t;
      vec2 uv = (hit.xy - (uGlassPos.xy - uGlassSize * 0.5)) / uGlassSize;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      return texture2D(uGlassTex, uv).rgb;
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
      float vignette = smoothstep(22.0, 3.0, r);

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

    vec3 sampleGlassAt(vec3 worldPos) {
      vec3 toSun = -uSunDir;
      float denom = toSun.z;
      if (abs(denom) < 1e-4) return vec3(0.0);
      float t = (uGlassPos.z - worldPos.z) / denom;
      if (t <= 0.0) return vec3(0.0);
      vec3 hit = worldPos + toSun * t;
      vec2 uv = (hit.xy - (uGlassPos.xy - uGlassSize * 0.5)) / uGlassSize;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
      return texture2D(uGlassTex, uv).rgb;
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

      const float STEPS = 28.0;
      float stepLen = (tExit - tEntry) / STEPS;
      float jitter = dither(gl_FragCoord.xy);

      vec3 accum = vec3(0.0);
      float trans = 1.0;
      for (float i = 0.0; i < STEPS; i++) {
        float t = tEntry + (i + jitter) * stepLen;
        vec3 p = uCameraPos + rayDir * t;
        vec3 light = sampleGlassAt(p);
        // In-scattering with simple extinction so far rays softly attenuate.
        accum += light * trans * stepLen;
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
  sourceCanvas: null,
  subdivCellRadius: 80,
  paletteSize: 12,
  minPieceRadius: 18,
  leadThickness: 2,
  warpAmp: 0.45,
  generating: false,
  pendingPreview: false,
  pendingFull: false,
  seed: Math.random(),
  timeOfDay: 0.45,
  sunElev: 0.42,
  raysIntensity: 0.55,
};

function resizeGlassForAspect(aspect) {
  // Pick W, H so glass area stays near GLASS_AREA — keeps the glass roughly
  // the same visual size regardless of source orientation. Cap at sensible
  // extremes so a panorama doesn't become a sliver.
  const a = Math.max(0.35, Math.min(2.8, aspect));
  const h = Math.sqrt(GLASS_AREA / a);
  const w = h * a;
  GLASS_W = w;
  GLASS_H = h;
  GLASS_CENTER_Y = GLASS_BOTTOM + GLASS_H / 2;

  glassMesh.geometry.dispose();
  glassMesh.geometry = new THREE.PlaneGeometry(GLASS_W, GLASS_H);
  glassMesh.position.set(0, GLASS_CENTER_Y, GLASS_Z);

  floorMat.uniforms.uGlassPos.value.set(0, GLASS_CENTER_Y, GLASS_Z);
  floorMat.uniforms.uGlassSize.value.set(GLASS_W, GLASS_H);
  raysMat.uniforms.uGlassPos.value.set(0, GLASS_CENTER_Y, GLASS_Z);
  raysMat.uniforms.uGlassSize.value.set(GLASS_W, GLASS_H);

  rebuildWall();
}

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
}
setSunFromControls();

function regenerate(opts = {}) {
  if (!state.sourceCanvas) return;
  const wantPreview = opts.preview === true;
  // While a generation is in flight, queue at most one pending request. If
  // the user keeps dragging the slider, only the latest position will run
  // next — we never stack a backlog.
  if (state.generating) {
    if (wantPreview) state.pendingPreview = true;
    else state.pendingFull = true;
    return;
  }
  state.generating = true;
  setStatus(wantPreview ? 'preview…' : 'Generating stained glass…');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const t0 = performance.now();
    const { canvas, pieceCount, paletteSize, aspect } = generateStainedGlass(state.sourceCanvas, {
      resolution: wantPreview ? 384 : 1024,
      subdivCellRadius: state.subdivCellRadius,
      paletteSize: state.paletteSize,
      minPieceRadius: state.minPieceRadius,
      leadThickness: state.leadThickness,
      warpAmp: state.warpAmp,
      previewMode: wantPreview,
      seed: state.seed,
    });
    resizeGlassForAspect(aspect);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    if (glassMat.uniforms.uMap.value) glassMat.uniforms.uMap.value.dispose?.();
    glassMat.uniforms.uMap.value = tex;
    floorMat.uniforms.uGlassTex.value = tex;
    raysMat.uniforms.uGlassTex.value = tex;

    const ms = (performance.now() - t0) | 0;
    setStatus(`${pieceCount} pieces · ${paletteSize}-color palette · ${ms} ms${wantPreview ? ' · preview' : ''}`);
    state.generating = false;

    // Drain the pending queue. Full-quality always wins over preview if both
    // are queued (the user moved a slider that needs a final-quality render).
    if (state.pendingFull) {
      state.pendingFull = false;
      state.pendingPreview = false;
      regenerate({ preview: false });
    } else if (state.pendingPreview) {
      state.pendingPreview = false;
      regenerate({ preview: true });
    }
  }));
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
  state.sourceCanvas = c;
  showSourceThumb(c);
  regenerate();
}

function loadFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    state.sourceCanvas = c;
    state.seed = Math.random();
    showSourceThumb(c);
    URL.revokeObjectURL(url);
    regenerate();
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
  state.seed = Math.random();
  regenerate();
});

const readouts = {
  cellDensityVal:   document.getElementById('cellDensityVal'),
  leadThicknessVal: document.getElementById('leadThicknessVal'),
  edgeCurveVal:     document.getElementById('edgeCurveVal'),
  pieceMergeVal:    document.getElementById('pieceMergeVal'),
  minPieceVal:      document.getElementById('minPieceVal'),
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
  controls.update(dt);
  raysMat.uniforms.uCameraPos.value.copy(camera.position);
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
