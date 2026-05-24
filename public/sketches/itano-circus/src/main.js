import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const app = document.getElementById('app');
const scoreEl = document.getElementById('score');
const waveEl = document.getElementById('wave');
const speedEl = document.getElementById('speed');
const afterburnerEl = document.getElementById('afterburner');
const hullEl = document.getElementById('hull');
const flaresEl = document.getElementById('flares');
// On-screen Start/Pause/Flare buttons were replaced by the tactical radar.
// Fall back to detached elements so existing wiring/textContent stays harmless.
const startButton = document.getElementById('startButton') || document.createElement('button');
const overlayStart = document.getElementById('overlayStart');
const pauseButton = document.getElementById('pauseButton') || document.createElement('button');
const flareButton = document.getElementById('flareButton') || document.createElement('button');
const startOverlay = document.getElementById('startOverlay');
const overlayControls = startOverlay.querySelector('.controls');
const controlsPanel = document.querySelector('.bottom-left');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

const CITY_START_Y = -180;
const CITY_EDGE_Y = -22;
const TARGET_Y = 228;
const CITY_Z = -1.25;
const FLIGHT_Z = 4.2;
const PLAYER_RADIUS = 0.48;
const SHIELD_MAX = 3;
const SHIELD_RADIUS = 1.08;
const MAX_MISSILES = 110;
const MISSILE_TRAIL_POINTS = 140;
const MISSILE_TRAIL_MIN_DISTANCE = 0.32;
const PLAYER_ENGINE_TRAIL_POINTS = 48;
const PLAYER_ENGINE_TRAIL_MIN_DISTANCE = 0.18;
const FLARE_TRAIL_POINTS = 18;
const HUD_UPDATE_INTERVAL = 0.1;
const FLARE_BURST_SIZE = 8;
const FLARE_BURST_INTERVAL = 0.075;
const GAME_SPEED = 1.75;
const TARGET_RADIUS = 2.5;
const TARGET = new THREE.Vector2(0, TARGET_Y);
const TARGET_ADVANCE_MIN = 92;
const TARGET_ADVANCE_MAX = 138;
const TARGET_LATERAL_RANGE = 42;
const TOWER_SCORE = 1600;
const TOWER_STREAK_BONUS = 220;
const FLARE_DEFENSE_SCORE = 180;
const SHIELD_DEFENSE_SCORE = 90;
const CHUNK_SIZE = 52;
const CHUNK_RENDER_RADIUS = 4;
const MAX_RENDER_PIXEL_RATIO = 1.5;
const RIVER_WIDTH = 7.5;
const BRIDGE_SPACING = 58;
const AVENUE_SPACING = 26;
const STREET_SPACING = 8.5;
const TERRAIN_GRID_STEP = 4;
const TERRAIN_BASE_Z = CITY_Z - 0.72;
const TERRAIN_HEIGHT_SCALE = 1.35;
const PLAYER_TERRAIN_CLEARANCE = 5.15;
const PLAYER_ALTITUDE_VARIATION = 0.34;
const PLAYER_ALTITUDE_RESPONSE = 3.8;
const MISSILE_TERRAIN_CLEARANCE = PLAYER_TERRAIN_CLEARANCE - 0.18;
const DOWNTOWN_CENTER_Y = 128;
const CAMERA_HEIGHT = 56;
const CAMERA_BACK_OFFSET = 7.5;
const CAMERA_LOOK_AHEAD = 18;
const CAMERA_THREAT_RADIUS = 44;
const CAMERA_INTRO_DURATION = 1.8;
const CAMERA_END_HEIGHT = 17;
const CAMERA_END_BACK_OFFSET = 2.2;
const CAMERA_END_ORBIT_SPEED = 0.24;
const CAMERA_SHAKE_DURATION = 0.34;
const CAMERA_SHAKE_STRENGTH = 0.82;
const PLAYER_ACCELERATION = 62.5;
const PLAYER_ASSIST_ACCELERATION = 27.5;
const PLAYER_MAX_SPEED = 52;
const PLAYER_THROTTLE_SPEED = PLAYER_MAX_SPEED * 0.62;
const PLAYER_CRUISE_SPEED = PLAYER_THROTTLE_SPEED * 0.5;
const PLAYER_BRAKE_SPEED = PLAYER_CRUISE_SPEED * 0.62;
const PLAYER_SPEED_MATCH_RATE = 2.35;
const INTRO_AUTO_SPEED = PLAYER_MAX_SPEED * 0.42;
const PLAYER_IDLE_DRAG = 0.14;
const PLAYER_ACTIVE_DRAG = 0.035;
const PLAYER_BRAKE_DRAG = 0.002;
const PLAYER_MAX_ROLL = 0.82;
const PLAYER_ROLL_TURN_WEIGHT = 0.78;
const PLAYER_TURN_COMMAND_LIMIT = 1.35;
const PLAYER_MIN_TURN_SCALE = 0.42;
const PLAYER_SPEED_TURN_GAIN = 1.55;
const PLAYER_HIT_IMPULSE = 12;
const PLAYER_HIT_PUSH_DURATION = 0.42;
const PLAYER_HIT_ROLL_IMPULSE = 1.25;
const PLAYER_HIT_YAW_IMPULSE = 0.34;
const PLAYER_HIT_ROTATION_DAMPING = 6.5;
const AFTERBURNER_MAX = 100;
const AFTERBURNER_DRAIN = 34;
const AFTERBURNER_RECHARGE = 18;
const AFTERBURNER_RECHARGE_DELAY = 1.15;
const AFTERBURNER_ACCEL_MULT = 1.65;
const AFTERBURNER_MAX_SPEED_MULT = 1.28;
const AFTERBURNER_SHOCKWAVE_FADE_RATE = 8.5;
const AFTERBURNER_LENS_SAMPLES = 8;
const AFTERBURNER_LENS_EMIT_INTERVAL = 0.045;
const AFTERBURNER_LENS_SAMPLE_LIFE = 0.62;
const MISSILE_LAUNCH_SPEED = PLAYER_MAX_SPEED * 0.28;
const MISSILE_MAX_SPEED = PLAYER_MAX_SPEED * 0.56;
const MISSILE_ACCELERATION = PLAYER_MAX_SPEED * 0.045;
const MISSILE_FUEL_TIME = 4.8;
const MISSILE_CRASH_DRAG = 0.09;
const MISSILE_CRASH_FALL_SPEED = 3.4;
const MISSILE_TURN_RATE_BASE = 1.35;
const MISSILE_TURN_RATE_GROWTH = 0.045;
const MISSILE_TURN_RATE_CAP = 1.2;
const MISSILE_SPIRAL_STRENGTH = 0.42;
const MISSILE_SPIRAL_VERTICAL_STRENGTH = 0.72;
const MISSILE_SPIRAL_FREQUENCY_MIN = 5.2;
const MISSILE_SPIRAL_FREQUENCY_MAX = 8.7;
const LAUNCH_WARNING_TIME = 18 / PLAYER_MAX_SPEED;
const LAUNCH_FLASH_RATE = 18;
const LAUNCHER_STAGGER_TIME = LAUNCH_WARNING_TIME * 0.035;
const LAUNCHER_SHOT_COOLDOWN = LAUNCH_WARNING_TIME * 0.22;
const LAUNCH_ENGAGE_RADIUS = PLAYER_MAX_SPEED * 3.1;
const LAUNCHER_BURST_MIN = 3;
const LAUNCHER_BURST_MAX = 5;
const LAUNCHER_AMMO_MIN = 9;
const LAUNCHER_AMMO_MAX = 15;
const LAUNCHER_ANGLE_SPREAD = 0.42;
const REPLAY_DURATION = 15;
const REPLAY_SAMPLE_INTERVAL = 0.055;
const REPLAY_MAX_MISSILES = 70;
const REPLAY_TRAIL_POINTS = 128;
const REPLAY_TRAIL_MIN_DISTANCE = 0.14;
const REPLAY_TRAIL_RESET_DISTANCE = 18;
const REPLAY_MISSILE_SMOOTHING = 28;
const LIVE_CHASE_BACK_DISTANCE = 15.5;
const LIVE_CHASE_HEIGHT = 8.8;
const LIVE_CHASE_LOOK_AHEAD = 3.4;
const LIVE_CHASE_LATERAL_MAX = 2.4;
const LIVE_CHASE_LATERAL_RESPONSE = 2.2;
const REPLAY_SIDE_DISTANCE = 24;
const REPLAY_SIDE_HEIGHT = 10.5;
const REPLAY_LOOK_AHEAD = 6.5;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010604);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 0, 26);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0x2f7a44, 0.78));
const keyLight = new THREE.DirectionalLight(0x9dff7a, 1.15);
keyLight.position.set(3, 6, 8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff3030, 2.2, 28);
rimLight.position.set(-5, 7, 8);
scene.add(rimLight);

// Bloom post-processing — gives emissive geometry the NERV phosphor glow.
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.63, // strength
  0.6, // radius
  0.16 // threshold
);
composer.addPass(bloomPass);
const afterburnerLensPass = new ShaderPass(makeAfterburnerLensShader());
afterburnerLensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
composer.addPass(afterburnerLensPass);
composer.addPass(new OutputPass());

// Tactical radar (minimap). Looks much further than the camera window so
// incoming volleys and launchers are visible long before they are on screen.
const MINIMAP_FORWARD = 150; // world units of corridor shown ahead of the ship
const MINIMAP_PLAYER_Y = 0.7; // player anchored 70% down the canvas -> more space ahead
const minimap = { w: 0, h: 0, scale: 1, dpr: 1 };

function sizeMinimap() {
  if (!minimapCanvas || !minimapCtx) return;
  const rect = minimapCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  minimap.dpr = Math.min(window.devicePixelRatio || 1, 2);
  minimap.w = rect.width;
  minimap.h = rect.height;
  minimapCanvas.width = Math.round(rect.width * minimap.dpr);
  minimapCanvas.height = Math.round(rect.height * minimap.dpr);
  minimapCtx.setTransform(minimap.dpr, 0, 0, minimap.dpr, 0, 0);
  // Uniform world->screen scale chosen so MINIMAP_FORWARD fits above the ship.
  minimap.scale = (minimap.h * MINIMAP_PLAYER_Y) / MINIMAP_FORWARD;
}

const city = new THREE.Group();
scene.add(city);
const cityChunks = new Map();
const neededChunkKeys = new Set();
const launchPads = [];
let targetTower = makeTargetTower();
city.add(targetTower);
const starField = makeStarField();
scene.add(starField);
const targetGuide = makeTargetGuide();
scene.add(targetGuide);

const sharedMissileGeometry = new THREE.ConeGeometry(0.1, 0.58, 6);
const sharedFlareGeometry = new THREE.SphereGeometry(0.22, 10, 8);
const sharedShieldGeometry = new THREE.SphereGeometry(SHIELD_RADIUS, 18, 10);
const sharedExplosionBubbleGeometry = new THREE.SphereGeometry(0.34, 10, 8);
const sharedBlastShellGeometry = new THREE.SphereGeometry(0.42, 12, 8);
const staticCityLineMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 1,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
staticCityLineMaterial.userData.keepAlive = true;

const player = {
  mesh: makePlayerMesh(),
  pos: new THREE.Vector2(0, 0),
  vel: new THREE.Vector2(0, 0),
  altitude: FLIGHT_Z,
  heading: 0,
  bank: 0,
  maxTurnRate: 1.65,
  invulnerable: 0,
  hitPush: new THREE.Vector2(),
  hitPushTimer: 0,
  hitRollVelocity: 0,
  hitYawVelocity: 0,
};
scene.add(player.mesh);
const afterburnerLens = {
  intensity: 0,
  time: 0,
  emitTimer: 0,
  samples: [],
  origins: Array.from({ length: AFTERBURNER_LENS_SAMPLES }, () => new THREE.Vector2(-2, -2)),
  dirs: Array.from({ length: AFTERBURNER_LENS_SAMPLES }, () => new THREE.Vector2(0, 1)),
  ages: new Float32Array(AFTERBURNER_LENS_SAMPLES),
  strengths: new Float32Array(AFTERBURNER_LENS_SAMPLES),
};
const replayBuffer = [];
const replay = {
  active: false,
  frames: [],
  elapsed: 0,
  duration: 0,
  sampleTimer: 0,
  sideSign: 1,
  cameraFocus: new THREE.Vector2(),
  cameraPosition: new THREE.Vector3(),
  cameraLookAt: new THREE.Vector3(),
  player: null,
  missiles: [],
  missileSlots: new Map(),
  frameIndex: 0,
  idScratch: new Set(),
};
const engineTrails = makePlayerEngineTrails();
replay.player = makePlayerMesh();
replay.player.visible = false;
scene.add(replay.player);
for (let i = 0; i < REPLAY_MAX_MISSILES; i += 1) {
  const mesh = makeMissileMesh();
  const trailRawPositions = new Float32Array(REPLAY_TRAIL_POINTS * 3);
  const trailPositions = new Float32Array(REPLAY_TRAIL_POINTS * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: 0xfff2d0,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.visible = false;
  trail.visible = false;
  trail.frustumCulled = false;
  scene.add(mesh, trail);
  replay.missiles.push({
    mesh,
    trail,
    trailRawPositions,
    trailPositions,
    trailLimit: REPLAY_TRAIL_POINTS,
    trailCursor: 0,
    trailCount: 0,
    hasTrailPoint: false,
    lastTrailX: 0,
    lastTrailY: 0,
    lastTrailZ: 0,
    renderPosition: new THREE.Vector3(),
    hasRenderPosition: false,
    activeId: null,
  });
}

const missiles = [];
let nextMissileId = 1;
const flares = [];
const particles = [];
const keys = new Set();
const flareBurst = {
  active: false,
  auto: false,
  remaining: 0,
  index: 0,
  timer: 0,
};
const cameraRig = {
  focus: new THREE.Vector2(0, 0),
  position: new THREE.Vector3(0, -CAMERA_BACK_OFFSET, FLIGHT_Z + CAMERA_HEIGHT),
  lookAt: new THREE.Vector3(0, CAMERA_LOOK_AHEAD, FLIGHT_Z),
  motion: new THREE.Vector2(0, 1),
  introTimer: 0,
  shakeTimer: 0,
  shakeDuration: CAMERA_SHAKE_DURATION,
  shakeStrength: 0,
  shakePhase: 0,
  shakeElapsed: 0,
  chaseLateralOffset: 0,
};

const state = {
  mode: 'ready',
  score: 0,
  wave: 1,
  towersReached: 0,
  shield: SHIELD_MAX,
  flareCharges: 3,
  flareRecharge: 0,
  afterburner: AFTERBURNER_MAX,
  afterburnerActive: false,
  afterburnerRechargeDelay: 0,
  cameraMode: 'side',
  waveTimer: 1.2,
  hudTimer: 0,
  runTime: 0,
  wallRunTime: 0,
  endTime: 0,
  endOrbitAngle: 0,
};
const hudCache = {
  score: '',
  wave: '',
  speed: '',
  afterburner: '',
  shield: '',
  flares: '',
};

const clock = new THREE.Clock();
const scratchV2 = new THREE.Vector2();
const scratchV2b = new THREE.Vector2();
const scratchV2c = new THREE.Vector2();
const desiredFocusVector = new THREE.Vector2();
const threatFocusVector = new THREE.Vector2();
const scratchV3 = new THREE.Vector3();
const cameraShakeOffset = new THREE.Vector3();
const lensShipWorld = new THREE.Vector3();
const lensForwardWorld = new THREE.Vector3();
const lensShipScreen = new THREE.Vector3();
const lensForwardScreen = new THREE.Vector3();
const lensOriginUv = new THREE.Vector2();
const lensDirUv = new THREE.Vector2();
const baseMissileDir = new THREE.Vector3(0, 1, 0);
const yawAxis = new THREE.Vector3(0, 0, 1);
const rollAxis = new THREE.Vector3(0, 1, 0);
const scratchQuatA = new THREE.Quaternion();
const scratchQuatB = new THREE.Quaternion();

startButton.addEventListener('click', startRun);
overlayStart.addEventListener('click', handleOverlayButton);
pauseButton.addEventListener('click', togglePause);
flareButton.addEventListener('click', dropFlares);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) beginFlareBurst(false);
    return;
  }
  if (event.code === 'KeyP' || event.code === 'Escape') {
    togglePause();
    return;
  }
  if (event.code === 'Digit1') {
    state.cameraMode = 'top';
    return;
  }
  if (event.code === 'Digit2') {
    state.cameraMode = 'side';
    return;
  }
  // W starts / resumes while the non-terminal overlay is up. Run-end restarts require the button.
  if (event.code === 'KeyW' && (state.mode === 'ready' || state.mode === 'paused') && !event.repeat) {
    handleOverlayButton();
  }
  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    endFlareBurst();
    return;
  }
  keys.delete(event.code);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  afterburnerLensPass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  sizeMinimap();
});

sizeMinimap();
updateHud();
animate();

function startRun() {
  clearRun();
  stopReplayPlayback();
  replayBuffer.length = 0;
  replay.sampleTimer = 0;
  nextMissileId = 1;
  state.mode = 'playing';
  state.score = 0;
  state.wave = 1;
  state.towersReached = 0;
  state.shield = SHIELD_MAX;
  state.flareCharges = 3;
  state.flareRecharge = 0;
  state.afterburner = AFTERBURNER_MAX;
  state.afterburnerActive = false;
  state.afterburnerRechargeDelay = 0;
  state.waveTimer = 0.35;
  state.hudTimer = 0;
  state.runTime = 0;
  state.wallRunTime = 0;
  state.endTime = 0;
  state.endOrbitAngle = 0;
  player.pos.set(0, CITY_START_Y);
  player.vel.set(0, PLAYER_CRUISE_SPEED);
  player.altitude = getPlayerFlightZ(player.pos.x, player.pos.y, 0, player.vel.length(), 0);
  player.heading = 0;
  player.bank = 0;
  player.hitPush.set(0, 0);
  player.hitPushTimer = 0;
  player.hitRollVelocity = 0;
  player.hitYawVelocity = 0;
  setTarget(0, TARGET_Y);
  for (const launcher of launchPads) resetLauncher(launcher);
  ensureCityChunks();
  cameraRig.focus.copy(player.pos);
  cameraRig.introTimer = CAMERA_INTRO_DURATION;
  cameraRig.motion.set(0, 1);
  cameraRig.shakeTimer = 0;
  cameraRig.shakeStrength = 0;
  cameraRig.shakeElapsed = 0;
  afterburnerLens.intensity = 0;
  afterburnerLens.time = 0;
  afterburnerLens.emitTimer = 0;
  afterburnerLens.samples.length = 0;
  afterburnerLens.ages.fill(0);
  afterburnerLens.strengths.fill(0);
  afterburnerLensPass.uniforms.uTime.value = 0;
  afterburnerLensPass.uniforms.uIntensity.value = 0;
  afterburnerLensPass.uniforms.uScreenChroma.value = 0;
  afterburnerLensPass.uniforms.uSampleCount.value = 0;
  cameraRig.position.set(player.pos.x, player.pos.y - 3.5, player.altitude + 9);
  cameraRig.lookAt.set(player.pos.x, player.pos.y + 2.5, player.altitude);
  camera.position.copy(cameraRig.position);
  startOverlay.classList.remove('run-end');
  startOverlay.classList.add('hide');
  overlayControls?.classList.remove('hide');
  controlsPanel?.classList.remove('hide');
  startButton.textContent = 'Restart';
  pauseButton.textContent = 'Pause';
  updateHud();
}

function togglePause() {
  if (state.mode === 'ready' || state.mode === 'gameover' || state.mode === 'complete') return;
  state.mode = state.mode === 'paused' ? 'playing' : 'paused';
  pauseButton.textContent = state.mode === 'paused' ? 'Resume' : 'Pause';
  startOverlay.classList.remove('run-end');
  overlayControls?.classList.remove('hide');
  controlsPanel?.classList.remove('hide');
  startOverlay.classList.toggle('hide', state.mode !== 'paused');
  startOverlay.querySelector('h1').textContent = 'Paused';
  startOverlay.querySelector('p').textContent = 'Resume when you are ready to re-enter the volley.';
  overlayStart.textContent = 'Resume';
}

function handleOverlayButton() {
  if (state.mode === 'paused') {
    togglePause();
  } else {
    startRun();
  }
}

function gameOver() {
  state.mode = 'gameover';
  state.afterburnerActive = false;
  state.endTime = 0;
  state.endOrbitAngle = Math.atan2(cameraRig.motion.y, cameraRig.motion.x);
  startReplayPlayback();
  startOverlay.classList.add('run-end');
  startOverlay.classList.remove('hide');
  overlayControls?.classList.add('hide');
  controlsPanel?.classList.add('hide');
  startOverlay.querySelector('h1').textContent = 'Run Ended';
  startOverlay.querySelector('p').textContent = `Score ${Math.floor(state.score)}. The next run starts at the city edge.`;
  overlayStart.textContent = 'Restart';
  startButton.textContent = 'Restart';
  pauseButton.textContent = 'Pause';
}

function reachTargetTower() {
  const towerBonus = TOWER_SCORE + state.towersReached * TOWER_STREAK_BONUS + Math.max(0, state.shield) * 120;
  state.score += towerBonus;
  state.towersReached += 1;
  state.wave = Math.max(state.wave, state.towersReached + 1);
  spark(TARGET, 0xffae2b, 22, scratchV2.set(0, 1));
  blastRing(TARGET, 0xffae2b, scratchV2.set(0, 1));
  moveTargetTower();
  updateTargetGuide();
  updateHud();
}

function moveTargetTower() {
  const forward = scratchV2.copy(player.vel);
  if (forward.lengthSq() > 0.1) {
    forward.normalize();
  } else {
    forward.set(-Math.sin(player.heading), Math.cos(player.heading));
  }
  const right = scratchV2b.set(forward.y, -forward.x);
  const advance = TARGET_ADVANCE_MIN + Math.random() * (TARGET_ADVANCE_MAX - TARGET_ADVANCE_MIN);
  let bestX = player.pos.x + forward.x * advance;
  let bestY = player.pos.y + forward.y * advance;
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i += 1) {
    const lateral = (Math.random() - 0.5) * TARGET_LATERAL_RANGE * (i === 0 ? 0.3 : 1);
    const extraForward = (Math.random() - 0.25) * 18;
    const x = player.pos.x + forward.x * (advance + extraForward) + right.x * lateral;
    const y = player.pos.y + forward.y * (advance + extraForward) + right.y * lateral;
    if (y < CITY_EDGE_Y + 24) continue;
    const riverPenalty = isInRiver(x, y, 6.5) ? 1 : 0;
    const roadPenalty = isNearRoad(x, y, 1.0) ? 0.35 : 0;
    const densityScore = getDensity(x, y);
    const distanceScore = Math.hypot(x - TARGET.x, y - TARGET.y) * 0.004;
    const score = densityScore + distanceScore - riverPenalty - roadPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestX = x;
      bestY = y;
    }
  }
  setTarget(bestX, bestY);
}

function setTarget(x, y) {
  TARGET.set(x, y);
  if (targetTower) {
    city.remove(targetTower);
    disposeObjectTree(targetTower);
  }
  targetTower = makeTargetTower();
  city.add(targetTower);
}

function clearRun() {
  for (const missile of missiles.splice(0)) {
    scene.remove(missile.mesh, missile.trail);
    missile.mesh.material.dispose();
    missile.trail.geometry.dispose();
    missile.trail.material.dispose();
  }
  flareBurst.active = false;
  flareBurst.remaining = 0;
  for (const flare of flares.splice(0)) {
    scene.remove(flare.mesh, flare.trail);
    flare.mesh.material.dispose();
    flare.trail.geometry.dispose();
    flare.trail.material.dispose();
  }
  for (const particle of particles.splice(0)) {
    if (particle.points) scene.remove(particle.points);
    if (particle.ring) scene.remove(particle.ring);
    if (particle.flareBurst) scene.remove(particle.flareBurst);
    if (particle.flareBurstGroup) scene.remove(particle.flareBurstGroup);
    if (particle.shieldBubble) scene.remove(particle.shieldBubble);
    if (particle.shieldContact) scene.remove(particle.shieldContact);
  }
  resetEngineTrails();
}

function animate() {
  requestAnimationFrame(animate);
  const frameDt = Math.min(clock.getDelta(), 0.033);
  const dt = frameDt * GAME_SPEED;
  if (state.mode === 'playing') {
    state.wallRunTime += frameDt;
    update(dt);
  }
  render(frameDt);
}

function update(dt) {
  state.runTime += dt;

  updatePlayer(dt);
  ensureCityChunks();
  updateLaunchers(dt);
  updateFlares(dt);
  updateMissiles(dt);
  updateParticles(dt);
  updateSpawns(dt);
  state.hudTimer -= dt;
  if (state.hudTimer <= 0) {
    updateHud();
    state.hudTimer = HUD_UPDATE_INTERVAL;
  }
  recordReplayFrame(dt);

  if (player.pos.distanceToSquared(TARGET) <= TARGET_RADIUS * TARGET_RADIUS) reachTargetTower();
}

function recordReplayFrame(dt) {
  if (state.mode !== 'playing') return;
  const realDt = dt / GAME_SPEED;
  replay.sampleTimer += realDt;
  if (replay.sampleTimer < REPLAY_SAMPLE_INTERVAL && replayBuffer.length > 0) return;
  replay.sampleTimer = 0;
  const missileFrames = [];
  const missileCount = Math.min(REPLAY_MAX_MISSILES, missiles.length);
  for (let i = 0; i < missileCount; i += 1) {
    const missile = missiles[i];
    missileFrames.push({
      id: missile.id,
      x: missile.pos.x,
      y: missile.pos.y,
      z: missile.altitude,
      vx: missile.vel.x,
      vy: missile.vel.y,
    });
  }
  replayBuffer.push({
    t: state.wallRunTime,
    player: {
      x: player.pos.x,
      y: player.pos.y,
      vx: player.vel.x,
      vy: player.vel.y,
      heading: player.heading,
      bank: player.bank,
      afterburner: state.afterburnerActive,
    },
    missiles: missileFrames,
  });
  const cutoff = state.wallRunTime - REPLAY_DURATION;
  while (replayBuffer.length > 2 && replayBuffer[0].t < cutoff) replayBuffer.shift();
}

function startReplayPlayback() {
  if (replayBuffer.length < 2) return;
  replay.active = true;
  replay.frames = replayBuffer.map((frame) => ({
    t: frame.t,
    player: { ...frame.player },
    missiles: frame.missiles.map((missile) => ({ ...missile })),
  }));
  for (const frame of replay.frames) {
    frame.missileById = new Map(frame.missiles.map((missile) => [missile.id, missile]));
  }
  const lastFrame = replay.frames[replay.frames.length - 1];
  replay.sideSign = lastFrame.player.bank >= 0 ? 1 : -1;
  replay.elapsed = 0;
  replay.frameIndex = 0;
  replay.duration = Math.max(0.1, replay.frames[replay.frames.length - 1].t - replay.frames[0].t);
  const firstFrame = replay.frames[0];
  const replayStartZ = getPlayerFlightZ(firstFrame.player.x, firstFrame.player.y, 0, Math.hypot(firstFrame.player.vx, firstFrame.player.vy), firstFrame.player.bank);
  replay.cameraFocus.set(firstFrame.player.x, firstFrame.player.y);
  replay.cameraPosition.set(firstFrame.player.x, firstFrame.player.y, replayStartZ + REPLAY_SIDE_HEIGHT);
  replay.cameraLookAt.set(firstFrame.player.x, firstFrame.player.y, replayStartZ);
  resetAfterburnerLens();
  resetReplayTrails();
  setLiveSceneVisible(false);
}

function stopReplayPlayback() {
  replay.active = false;
  replay.frames.length = 0;
  replay.elapsed = 0;
  replay.duration = 0;
  replay.frameIndex = 0;
  replay.player.visible = false;
  replay.missileSlots.clear();
  for (const missile of replay.missiles) {
    missile.activeId = null;
    missile.hasRenderPosition = false;
    missile.mesh.visible = false;
    missile.trail.visible = false;
    resetTrailBuffer(missile);
  }
  setLiveSceneVisible(true);
}

function resetReplayTrails() {
  replay.missileSlots.clear();
  for (const missile of replay.missiles) {
    missile.activeId = null;
    missile.hasRenderPosition = false;
    resetTrailBuffer(missile);
  }
}

function setLiveSceneVisible(visible) {
  player.mesh.visible = visible;
  targetGuide.visible = visible;
  for (const missile of missiles) {
    missile.mesh.visible = visible;
    missile.trail.visible = visible;
  }
  for (const flare of flares) {
    flare.mesh.visible = visible;
    flare.trail.visible = visible;
  }
  for (const particle of particles) {
    if (particle.points) particle.points.visible = visible;
    if (particle.ring) particle.ring.visible = visible;
    if (particle.flareBurst) particle.flareBurst.visible = visible;
    if (particle.flareBurstGroup) particle.flareBurstGroup.visible = visible;
    if (particle.shieldBubble) particle.shieldBubble.visible = visible;
    if (particle.shieldContact) particle.shieldContact.visible = visible;
  }
  for (const trail of engineTrails) trail.line.visible = visible;
}

function updatePlayer(dt) {
  const previousHeading = player.heading;
  const introActive = isIntroActive();
  const rollInput = introActive ? 0 : getRollInput();
  const accelerating = !introActive && (keys.has('KeyW') || keys.has('ArrowUp'));
  const braking = !introActive && (keys.has('KeyS') || keys.has('ArrowDown'));
  const requestingAfterburner = !introActive && accelerating && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  const wantsAfterburner = requestingAfterburner && state.afterburner > 0;
  state.afterburnerActive = wantsAfterburner;
  if (wantsAfterburner) {
    state.afterburner = Math.max(0, state.afterburner - AFTERBURNER_DRAIN * dt);
    state.afterburnerRechargeDelay = AFTERBURNER_RECHARGE_DELAY;
  } else if (requestingAfterburner) {
    state.afterburnerRechargeDelay = AFTERBURNER_RECHARGE_DELAY;
  } else if (state.afterburnerRechargeDelay > 0) {
    state.afterburnerRechargeDelay = Math.max(0, state.afterburnerRechargeDelay - dt);
  } else {
    state.afterburner = Math.min(AFTERBURNER_MAX, state.afterburner + AFTERBURNER_RECHARGE * dt);
  }

  if (introActive) {
    const headingDelta = getSignedAngleDelta(player.heading, 0);
    player.heading += THREE.MathUtils.clamp(headingDelta, -player.maxTurnRate * dt, player.maxTurnRate * dt);
  } else {
    const speedRatio = THREE.MathUtils.clamp(player.vel.length() / PLAYER_MAX_SPEED, 0, AFTERBURNER_MAX_SPEED_MULT);
    const turnScale = PLAYER_MIN_TURN_SCALE + speedRatio * speedRatio * PLAYER_SPEED_TURN_GAIN;
    const rollTurnInput = -(player.bank / PLAYER_MAX_ROLL) * PLAYER_ROLL_TURN_WEIGHT;
    const turnCommand = THREE.MathUtils.clamp(rollTurnInput, -PLAYER_TURN_COMMAND_LIMIT, PLAYER_TURN_COMMAND_LIMIT);
    player.heading += turnCommand * player.maxTurnRate * turnScale * dt;
  }
  player.heading += player.hitYawVelocity * dt;
  player.hitYawVelocity *= Math.exp(-PLAYER_HIT_ROTATION_DAMPING * dt);

  const forward = scratchV2.set(-Math.sin(player.heading), Math.cos(player.heading));
  if (introActive) {
    player.vel.lerp(forward.multiplyScalar(INTRO_AUTO_SPEED), Math.min(1, dt * 2.6));
  } else {
    const targetSpeed = braking
      ? PLAYER_BRAKE_SPEED
      : (state.afterburnerActive ? PLAYER_MAX_SPEED * AFTERBURNER_MAX_SPEED_MULT : (accelerating ? PLAYER_THROTTLE_SPEED : PLAYER_CRUISE_SPEED));
    const speed = player.vel.length();
    if (speed < targetSpeed) {
      const burnMult = state.afterburnerActive ? AFTERBURNER_ACCEL_MULT : 1;
      const throttleMult = accelerating ? 1 : 0.42;
      player.vel.addScaledVector(forward, PLAYER_ACCELERATION * burnMult * throttleMult * dt);
    }
    const desiredVel = scratchV2b.copy(forward).multiplyScalar(targetSpeed);
    player.vel.lerp(desiredVel, getDampingFactor(PLAYER_SPEED_MATCH_RATE, dt));
  }

  if (!introActive && accelerating) {
    const burnMult = state.afterburnerActive ? AFTERBURNER_ACCEL_MULT : 1;
    player.vel.addScaledVector(forward, PLAYER_ASSIST_ACCELERATION * burnMult * dt);
  }

  if (!introActive) {
    const drag = accelerating ? PLAYER_ACTIVE_DRAG : PLAYER_IDLE_DRAG;
    player.vel.multiplyScalar(Math.pow(braking ? PLAYER_BRAKE_DRAG : drag, dt));
    const minSpeed = braking ? PLAYER_BRAKE_SPEED : PLAYER_CRUISE_SPEED;
    if (player.vel.length() < minSpeed) player.vel.setLength(minSpeed);
  }
  const maxSpeed = PLAYER_MAX_SPEED * (state.afterburnerActive ? AFTERBURNER_MAX_SPEED_MULT : 1);
  if (player.vel.length() > maxSpeed) player.vel.setLength(maxSpeed);
  if (player.hitPushTimer > 0) {
    const pushStrength = player.hitPushTimer / PLAYER_HIT_PUSH_DURATION;
    player.vel.addScaledVector(player.hitPush, pushStrength * dt);
    player.hitPushTimer = Math.max(0, player.hitPushTimer - dt);
  }
  const impulseMaxSpeed = PLAYER_MAX_SPEED * AFTERBURNER_MAX_SPEED_MULT;
  if (player.vel.length() > impulseMaxSpeed) player.vel.setLength(impulseMaxSpeed);
  player.pos.addScaledVector(player.vel, dt);
  const targetAltitude = getPlayerFlightZ(player.pos.x, player.pos.y, state.runTime, player.vel.length(), player.bank);
  player.altitude += (targetAltitude - player.altitude) * getDampingFactor(PLAYER_ALTITUDE_RESPONSE, dt);
  updateTargetGuide();

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  const turnDelta = getSignedAngleDelta(previousHeading, player.heading);
  const turnRate = turnDelta / Math.max(dt, 0.0001);
  const yawBank = -turnRate * 0.28;
  const manualRoll = rollInput * PLAYER_MAX_ROLL;
  const desiredBank = THREE.MathUtils.clamp(yawBank + manualRoll, -PLAYER_MAX_ROLL, PLAYER_MAX_ROLL);
  player.bank += (desiredBank - player.bank) * Math.min(1, dt * 10);
  player.bank += player.hitRollVelocity * dt;
  player.hitRollVelocity *= Math.exp(-PLAYER_HIT_ROTATION_DAMPING * dt);
  player.bank = THREE.MathUtils.clamp(player.bank, -PLAYER_MAX_ROLL * 1.45, PLAYER_MAX_ROLL * 1.45);
  player.mesh.position.set(player.pos.x, player.pos.y, player.altitude);
  scratchQuatA.setFromAxisAngle(yawAxis, player.heading);
  scratchQuatB.setFromAxisAngle(rollAxis, player.bank);
  player.mesh.quaternion.copy(scratchQuatA).multiply(scratchQuatB);
  updateEngineTrails();
  setObjectOpacity(player.mesh, player.invulnerable > 0 ? 0.44 + Math.sin(state.runTime * 46) * 0.22 : 1);
}

function getRollInput() {
  let roll = 0;
  if (keys.has('KeyQ') || keys.has('KeyD') || keys.has('ArrowLeft')) roll += 1;
  if (keys.has('KeyE') || keys.has('KeyA') || keys.has('ArrowRight')) roll -= 1;
  return roll;
}

function setObjectOpacity(object, opacity) {
  const materials = object.userData?.materials || (object.material ? [object.material] : []);
  for (const material of materials) {
    material.opacity = opacity;
  }
}

function getSignedAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function isIntroActive() {
  return state.mode === 'playing' && cameraRig.introTimer > 0;
}

function isRunEnded() {
  return state.mode === 'gameover' || state.mode === 'complete';
}

function ensureCityChunks() {
  const cx = Math.floor(player.pos.x / CHUNK_SIZE);
  const cy = Math.floor(player.pos.y / CHUNK_SIZE);
  const forward = scratchV2.copy(player.vel);
  if (forward.lengthSq() > 0.08) {
    forward.normalize();
  } else {
    forward.set(-Math.sin(player.heading), Math.cos(player.heading));
  }
  const leadCx = Math.floor((player.pos.x + forward.x * CHUNK_SIZE * 2) / CHUNK_SIZE);
  const leadCy = Math.floor((player.pos.y + forward.y * CHUNK_SIZE * 2) / CHUNK_SIZE);
  const needed = neededChunkKeys;
  needed.clear();

  for (let x = cx - CHUNK_RENDER_RADIUS; x <= cx + CHUNK_RENDER_RADIUS; x += 1) {
    for (let y = cy - CHUNK_RENDER_RADIUS; y <= cy + CHUNK_RENDER_RADIUS; y += 1) {
      const key = getChunkKey(x, y);
      needed.add(key);
      if (!cityChunks.has(key)) spawnCityChunk(x, y);
    }
  }

  for (let x = leadCx - 2; x <= leadCx + 2; x += 1) {
    for (let y = leadCy - 2; y <= leadCy + 2; y += 1) {
      const key = getChunkKey(x, y);
      needed.add(key);
      if (!cityChunks.has(key)) spawnCityChunk(x, y);
    }
  }

  for (const [key, chunk] of cityChunks) {
    if (!needed.has(key)) {
      city.remove(chunk.group);
      disposeObjectTree(chunk.group);
      for (const pad of chunk.pads) {
        const index = launchPads.indexOf(pad);
        if (index >= 0) launchPads.splice(index, 1);
      }
      cityChunks.delete(key);
    }
  }
}

function spawnCityChunk(cx, cy) {
  const key = getChunkKey(cx, cy);
  if (cityChunks.has(key)) return;
  const rng = makeChunkRng(cx, cy);
  const chunkGroup = new THREE.Group();
  const pads = [];
  chunkGroup.add(makeTerrainMap(cx, cy));
  chunkGroup.add(makeNeonGrid(cx, cy, rng));
  chunkGroup.add(makeCityBlocks(cx, cy, rng, pads));
  mergeStaticChunkLines(chunkGroup);
  freezeStaticObject(chunkGroup);
  launchPads.push(...pads);
  city.add(chunkGroup);
  cityChunks.set(key, { group: chunkGroup, pads });
}

function getChunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function makeChunkRng(cx, cy) {
  let seed = (Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263) ^ 0x9e3779b9) >>> 0;
  if (seed === 0) seed = 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function updateFlares(dt) {
  state.flareRecharge += dt;
  if (state.flareCharges < 3 && state.flareRecharge >= 3.35) {
    state.flareRecharge = 0;
    state.flareCharges += 1;
  }

  if (flareBurst.active) {
    flareBurst.timer -= dt;
    while (flareBurst.timer <= 0 && flareBurst.remaining > 0) {
      launchFlare(getFlareSpread(flareBurst.index), 0.75 + Math.random() * 0.85);
      flareBurst.index += 1;
      flareBurst.remaining -= 1;
      flareBurst.timer += FLARE_BURST_INTERVAL;
    }
    if (flareBurst.remaining <= 0) {
      flareBurst.active = false;
      flareBurst.auto = false;
    }
  }

  for (let i = flares.length - 1; i >= 0; i -= 1) {
    const flare = flares[i];
    flare.life -= dt;
    flare.pos.addScaledVector(flare.vel, dt);
    flare.vel.multiplyScalar(Math.pow(0.16, dt));
    const flareZ = getMissileFlightZ(flare.pos.x, flare.pos.y) - 0.18;
    flare.mesh.position.set(flare.pos.x, flare.pos.y, flareZ);
    flare.mesh.scale.setScalar(0.85 + Math.sin(state.runTime * 16 + flare.phase) * 0.18);
    flare.mesh.material.opacity = Math.max(0, Math.min(1, flare.life / 2.4));
    updateEntityTrail(flare, flareZ - 0.1);
    flare.trail.material.opacity = Math.max(0, Math.min(0.72, flare.life / 2.9));
    if (flare.life <= 0) {
      scene.remove(flare.mesh, flare.trail);
      flare.mesh.material.dispose();
      flare.trail.geometry.dispose();
      flare.trail.material.dispose();
      flares.splice(i, 1);
    }
  }
}

function dropFlares() {
  beginFlareBurst(true);
}

function beginFlareBurst(auto) {
  if (flareBurst.active || state.mode !== 'playing' || isIntroActive() || state.flareCharges <= 0) return;
  flareBurst.active = true;
  flareBurst.auto = auto;
  flareBurst.remaining = FLARE_BURST_SIZE;
  flareBurst.index = 0;
  flareBurst.timer = 0;
  state.flareCharges -= 1;
  state.flareRecharge = 0;
}

function endFlareBurst() {
  if (!flareBurst.auto) flareBurst.active = false;
}

function getFlareSpread(index) {
  const spreads = [-1.35, 1.35, -0.92, 0.92, -0.5, 0.5, -0.16, 0.16];
  return spreads[index % spreads.length];
}

function launchFlare(spread, speedBoost) {
  if (state.mode !== 'playing') return;
  const forwardX = -Math.sin(player.heading);
  const forwardY = Math.cos(player.heading);
  const backX = -forwardX;
  const backY = -forwardY;
  const sideX = forwardY;
  const sideY = -forwardX;
  const backOffset = 0.92 + Math.random() * 0.25;
  const sideOffset = spread * 0.24;
  const pos = new THREE.Vector2(
    player.pos.x + backX * backOffset + sideX * sideOffset,
    player.pos.y + backY * backOffset + sideY * sideOffset
  );
  const backSpeed = 4.0 + speedBoost + Math.abs(spread) * 0.4;
  const sideSpeed = spread * (2.0 + Math.random() * 0.65);
  const vel = new THREE.Vector2(
    backX * backSpeed + sideX * sideSpeed + player.vel.x * 0.14,
    backY * backSpeed + sideY * sideSpeed + player.vel.y * 0.14
  );
  const mesh = makeFlareMesh();
  const flareZ = getMissileFlightZ(pos.x, pos.y) - 0.18;
  mesh.position.set(pos.x, pos.y, flareZ);
  const trailRawPositions = new Float32Array(FLARE_TRAIL_POINTS * 3);
  const trailPositions = new Float32Array(FLARE_TRAIL_POINTS * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({ color: 0xffe66d, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending })
  );
  trail.frustumCulled = false;
  scene.add(mesh, trail);
  flares.push({
    pos,
    vel,
    mesh,
    trail,
    trailRawPositions,
    trailPositions,
    trailCursor: 0,
    trailCount: 0,
    trailLimit: FLARE_TRAIL_POINTS,
    life: 3.15,
    phase: Math.random() * Math.PI * 2,
  });
}

function updateSpawns(dt) {
  if (player.pos.y < CITY_EDGE_Y) return;
  state.waveTimer -= dt;
  const alivePressure = missiles.length / MAX_MISSILES;
  if (state.waveTimer <= 0 && alivePressure < 0.88) {
    if (!queueVolley()) {
      state.waveTimer = 0.2;
      return;
    }
    state.wave += 1;
    const pressure = Math.max(0, Math.min(1, state.shield / SHIELD_MAX));
    state.waveTimer = Math.max(0.9, 3.8 - state.wave * 0.08 - pressure * 1.0);
  }
}

function queueVolley() {
  const count = Math.min(8, 2 + Math.floor(state.wave * 0.35));
  const engageRadiusSq = LAUNCH_ENGAGE_RADIUS * LAUNCH_ENGAGE_RADIUS;
  const nearbyLaunchers = [];
  for (const launcher of launchPads) {
    const dx = launcher.x - player.pos.x;
    const dy = launcher.y - player.pos.y;
    const distSq = dx * dx + dy * dy;
    if (
      launcher.launchTimer <= 0 &&
      launcher.shotsQueued <= 0 &&
      launcher.ammo >= LAUNCHER_BURST_MIN &&
      distSq < engageRadiusSq
    ) {
      launcher._distSq = distSq;
      nearbyLaunchers.push(launcher);
    }
  }
  nearbyLaunchers.sort((a, b) => a._distSq - b._distSq);
  if (nearbyLaunchers.length === 0) return false;

  const selected = [];
  const poolSize = Math.min(nearbyLaunchers.length, Math.max(count * 2, 8));
  const pool = nearbyLaunchers.slice(0, poolSize);
  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }

  for (let i = 0; i < selected.length; i += 1) {
    const launcher = selected[i];
    const burstSize = LAUNCHER_BURST_MIN + Math.floor(Math.random() * (LAUNCHER_BURST_MAX - LAUNCHER_BURST_MIN + 1));
    launcher.launchTimer = LAUNCH_WARNING_TIME + i * LAUNCHER_STAGGER_TIME;
    launcher.shotsQueued = Math.min(launcher.ammo, burstSize);
    launcher.shotCooldown = 0;
  }
  return selected.length > 0;
}

function updateLaunchers(dt) {
  for (const launcher of launchPads) {
    const armed = launcher.launchTimer > 0 || launcher.shotsQueued > 0;
    if (launcher.launchTimer > 0) {
      launcher.launchTimer -= dt;
      const flashOn = Math.floor(launcher.launchTimer * LAUNCH_FLASH_RATE) % 2 === 0;
      launcher.material.color.setHex(flashOn ? 0xffffff : 0xff2b2b);
      launcher.material.opacity = flashOn ? 1 : 0.64;
      launcher.mesh.scale.setScalar(flashOn ? 1.65 : 1.12);
      if (launcher.launchTimer <= 0) launcher.shotCooldown = 0;
    } else if (launcher.shotsQueued > 0) {
      launcher.shotCooldown -= dt;
      launcher.material.color.setHex(0xffffff);
      launcher.material.opacity = 1;
      launcher.mesh.scale.setScalar(1.45);
      if (launcher.shotCooldown <= 0 && missiles.length < MAX_MISSILES) {
        if (fireLauncher(launcher)) {
          launcher.shotsQueued -= 1;
        } else {
          launcher.shotsQueued = 0;
        }
        launcher.shotCooldown = LAUNCHER_SHOT_COOLDOWN;
      }
    }

    if (!armed || (launcher.launchTimer <= 0 && launcher.shotsQueued <= 0)) {
      const ready = launcher.ammo >= LAUNCHER_BURST_MIN;
      launcher.material.color.setHex(ready ? 0xff2b2b : 0x402021);
      launcher.material.opacity = ready ? 0.66 : 0.24;
      launcher.mesh.scale.setScalar(ready ? 1 : 0.86);
    }
  }
}

function fireLauncher(launcher) {
  if (launcher.ammo <= 0) return false;
  const pos = new THREE.Vector2(launcher.x, launcher.y);
  let aimX = player.pos.x - launcher.x;
  let aimY = player.pos.y - launcher.y;
  const aimLength = Math.hypot(aimX, aimY);
  if (aimLength < 0.001) {
    aimX = 0;
    aimY = 1;
  } else {
    aimX /= aimLength;
    aimY /= aimLength;
  }
  const angle = Math.atan2(aimY, aimX) + (Math.random() - 0.5) * LAUNCHER_ANGLE_SPREAD;
  const speed = MISSILE_LAUNCH_SPEED + Math.min(PLAYER_MAX_SPEED * 0.16, state.wave * 0.85) + Math.random() * PLAYER_MAX_SPEED * 0.08;
  const vel = new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(speed);
  spark(pos, 0xffffff, 8, scratchV2b.copy(vel).normalize());
  addMissile(pos, vel);
  launcher.ammo -= 1;
  if (launcher.ammo <= 0) {
    launcher.launchTimer = 0;
    launcher.shotsQueued = 0;
  }
  return true;
}

function addMissile(pos, vel) {
  const mesh = makeMissileMesh();
  const trailRawPositions = new Float32Array(MISSILE_TRAIL_POINTS * 3);
  const trailPositions = new Float32Array(MISSILE_TRAIL_POINTS * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setDrawRange(0, 1);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: 0xfff2d0,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  trail.frustumCulled = false;
  scene.add(mesh, trail);
  missiles.push({
    id: nextMissileId,
    pos,
    vel,
    mesh,
    trail,
    trailRawPositions,
    trailPositions,
    trailLimit: MISSILE_TRAIL_POINTS,
    trailCursor: 1,
    trailCount: 1,
    lastTrailX: pos.x,
    lastTrailY: pos.y,
    fuel: MISSILE_FUEL_TIME + Math.random() * 1.7,
    crashLife: 2.2,
    altitude: getMissileFlightZ(pos.x, pos.y) - 0.08,
    crashing: false,
    age: 0,
    spiralPhase: Math.random() * Math.PI * 2,
    verticalSpiralPhase: Math.random() * Math.PI * 2,
    spiralFrequency: MISSILE_SPIRAL_FREQUENCY_MIN + Math.random() * (MISSILE_SPIRAL_FREQUENCY_MAX - MISSILE_SPIRAL_FREQUENCY_MIN),
    spiralSide: Math.random() < 0.5 ? -1 : 1,
    spiralStrength: MISSILE_SPIRAL_STRENGTH * (0.72 + Math.random() * 0.56),
    verticalSpiralStrength: MISSILE_SPIRAL_VERTICAL_STRENGTH * (0.72 + Math.random() * 0.56),
    turnRate: MISSILE_TURN_RATE_BASE + Math.min(MISSILE_TURN_RATE_CAP, state.wave * MISSILE_TURN_RATE_GROWTH) + Math.random() * 0.55,
  });
  trailRawPositions[0] = pos.x;
  trailRawPositions[1] = pos.y;
  trailRawPositions[2] = getMissileFlightZ(pos.x, pos.y) - 0.18;
  trailPositions[0] = pos.x;
  trailPositions[1] = pos.y;
  trailPositions[2] = getMissileFlightZ(pos.x, pos.y) - 0.18;
  nextMissileId += 1;
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i -= 1) {
    const missile = missiles[i];
    missile.age += dt;
    if (!missile.crashing) {
      missile.fuel -= dt;
      if (missile.fuel <= 0) {
        missile.crashing = true;
        missile.mesh.material.color.setHex(0xffae2b);
        missile.trail.material.opacity = 0.46;
      }
    }

    if (missile.crashing) {
      missile.crashLife -= dt;
      missile.vel.multiplyScalar(Math.pow(MISSILE_CRASH_DRAG, dt));
      missile.altitude -= MISSILE_CRASH_FALL_SPEED * dt;
    } else {
      const spiralPhase = missile.age * missile.spiralFrequency + missile.spiralPhase;
      const weave = 0.35 + Math.min(0.65, missile.age * 1.8);
      scratchV2.copy(chooseMissileTarget(missile.pos)).sub(missile.pos);
      if (scratchV2.lengthSq() > 0.0001) {
        scratchV2.normalize();
        const lateral = Math.sin(spiralPhase) * missile.spiralStrength * missile.spiralSide;
        const targetX = scratchV2.x;
        const targetY = scratchV2.y;
        scratchV2.set(targetX - targetY * lateral * weave, targetY + targetX * lateral * weave).normalize();
        rotateVelocityToward(missile.vel, scratchV2, missile.turnRate * dt);
      }
      const speed = missile.vel.length();
      missile.vel.setLength(Math.min(MISSILE_MAX_SPEED, speed + dt * MISSILE_ACCELERATION));
    }

    missile.pos.addScaledVector(missile.vel, dt);
    if (!missile.crashing) {
      const verticalWeave = Math.cos(missile.age * missile.spiralFrequency * 1.07 + missile.verticalSpiralPhase) * missile.verticalSpiralStrength * (0.35 + Math.min(0.65, missile.age * 1.8));
      const targetAltitude = getMissileFlightZ(missile.pos.x, missile.pos.y) - 0.08 + verticalWeave;
      missile.altitude += (targetAltitude - missile.altitude) * getDampingFactor(6.8, dt);
    }
    missile.mesh.position.set(missile.pos.x, missile.pos.y, missile.altitude);
    orientMissile(missile.mesh, missile.vel);
    updateTrail(missile);

    const playerDistanceSq = missile.pos.distanceToSquared(player.pos);
    if (playerDistanceSq < SHIELD_RADIUS * SHIELD_RADIUS) {
      placeMissileAtShieldImpact(missile);
      triggerCameraShake(missile);
      applyShipExplosionImpulse(missile);
      shieldImpactVisual(missile.pos);
      if (state.shield > 0) {
        state.score += SHIELD_DEFENSE_SCORE;
        state.shield -= 1;
      } else {
        gameOver();
      }
      player.invulnerable = 0.85;
      explodeMissile(i, 0xff4d3a, 34);
      if (state.mode !== 'playing') return;
      continue;
    }

    let flareHit = null;
    for (const flare of flares) {
      if (flare.pos.distanceToSquared(missile.pos) < 0.62 * 0.62) {
        flareHit = flare;
        break;
      }
    }
    if (flareHit) {
      state.score += FLARE_DEFENSE_SCORE;
      explodeMissile(i, 0xffae2b, 18);
      continue;
    }

    if (
      missile.altitude <= getTerrainZ(missile.pos.x, missile.pos.y) + 0.22 ||
      missile.crashLife <= 0 ||
      missile.pos.x < player.pos.x - 90 ||
      missile.pos.x > player.pos.x + 90 ||
      missile.pos.y < player.pos.y - 90 ||
      missile.pos.y > player.pos.y + 130
    ) {
      explodeMissile(i, 0xfff2d0, 24);
    }
  }
}

function chooseMissileTarget(pos) {
  let best = player.pos;
  let bestD = Infinity;
  for (const flare of flares) {
    const d = flare.pos.distanceToSquared(pos);
    if (d < bestD && d < 115) {
      bestD = d;
      best = flare.pos;
    }
  }
  return best;
}

function placeMissileAtShieldImpact(missile) {
  scratchV2.copy(missile.pos).sub(player.pos);
  if (scratchV2.lengthSq() < 0.0001) {
    scratchV2.copy(missile.vel).multiplyScalar(-1);
  }
  scratchV2.normalize();
  missile.pos.copy(player.pos).addScaledVector(scratchV2, SHIELD_RADIUS);
  missile.altitude = player.altitude - 0.08;
  missile.mesh.position.set(missile.pos.x, missile.pos.y, missile.altitude);
}

function shieldImpactVisual(impactPos) {
  const bubbleMaterial = new THREE.MeshBasicMaterial({
    color: 0x86fff0,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    wireframe: true,
  });
  const bubble = new THREE.Mesh(sharedShieldGeometry, bubbleMaterial);
  bubble.position.set(player.pos.x, player.pos.y, player.altitude);
  bubble.frustumCulled = false;
  scene.add(bubble);

  const contactSegments = 34;
  const contactPositions = new Float32Array((contactSegments + 1) * 3);
  const contactGeometry = new THREE.BufferGeometry();
  contactGeometry.setAttribute('position', new THREE.BufferAttribute(contactPositions, 3));
  const contactMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const contact = new THREE.Line(contactGeometry, contactMaterial);
  contact.frustumCulled = false;
  scene.add(contact);
  particles.push({
    shieldBubble: bubble,
    shieldContact: contact,
    contactPositions,
    impact: impactPos.clone(),
    life: 0.34,
    maxLife: 0.34,
  });
}

function applyShipExplosionImpulse(missile) {
  const forward = scratchV2b.set(-Math.sin(player.heading), Math.cos(player.heading));
  const right = scratchV2c.set(forward.y, -forward.x);
  const impactX = missile.pos.x - player.pos.x;
  const impactY = missile.pos.y - player.pos.y;
  const sideHit = THREE.MathUtils.clamp((impactX * right.x + impactY * right.y) / PLAYER_RADIUS, -1, 1);
  const noseTailHit = THREE.MathUtils.clamp((impactX * forward.x + impactY * forward.y) / PLAYER_RADIUS, -1, 1);
  const missileVelLen = Math.max(0.0001, missile.vel.length());
  const incomingSide = THREE.MathUtils.clamp((missile.vel.x * right.x + missile.vel.y * right.y) / missileVelLen, -1, 1);
  scratchV2.copy(player.pos).sub(missile.pos);
  if (scratchV2.lengthSq() < 0.0001) {
    scratchV2.copy(missile.vel).multiplyScalar(-1);
  }
  scratchV2.normalize();
  const missileSpeed = THREE.MathUtils.clamp(missileVelLen / Math.max(1, MISSILE_MAX_SPEED), 0.35, 1);
  const easedImpulse = (PLAYER_HIT_IMPULSE * 2 * missileSpeed) / PLAYER_HIT_PUSH_DURATION;
  player.hitPush.copy(scratchV2).multiplyScalar(easedImpulse);
  player.hitPushTimer = PLAYER_HIT_PUSH_DURATION;
  player.hitRollVelocity += (-sideHit * PLAYER_HIT_ROLL_IMPULSE + incomingSide * 0.32) * missileSpeed;
  player.hitYawVelocity += (-sideHit * (0.65 + Math.abs(noseTailHit) * 0.55) * PLAYER_HIT_YAW_IMPULSE) * missileSpeed;
}

function triggerCameraShake(missile) {
  const speedRatio = THREE.MathUtils.clamp(missile.vel.length() / Math.max(1, MISSILE_MAX_SPEED), 0.45, 1);
  cameraRig.shakeTimer = CAMERA_SHAKE_DURATION;
  cameraRig.shakeDuration = CAMERA_SHAKE_DURATION;
  cameraRig.shakeStrength = CAMERA_SHAKE_STRENGTH * speedRatio;
  cameraRig.shakePhase = Math.random() * Math.PI * 2;
  cameraRig.shakeElapsed = 0;
}

function rotateVelocityToward(velocity, desiredDir, maxTurn) {
  const currentAngle = Math.atan2(velocity.y, velocity.x);
  const desiredAngle = Math.atan2(desiredDir.y, desiredDir.x);
  let delta = desiredAngle - currentAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const clamped = Math.max(-maxTurn, Math.min(maxTurn, delta));
  const speed = velocity.length();
  velocity.set(Math.cos(currentAngle + clamped), Math.sin(currentAngle + clamped)).multiplyScalar(speed);
}

function updateTrail(missile) {
  const dx = missile.pos.x - missile.lastTrailX;
  const dy = missile.pos.y - missile.lastTrailY;
  const z = missile.altitude - 0.1;
  if (dx * dx + dy * dy >= MISSILE_TRAIL_MIN_DISTANCE * MISSILE_TRAIL_MIN_DISTANCE) {
    addTrailPoint(missile, missile.pos.x, missile.pos.y, z);
    missile.lastTrailX = missile.pos.x;
    missile.lastTrailY = missile.pos.y;
  } else {
    updateLastTrailPoint(missile, missile.pos.x, missile.pos.y, z);
    missile.lastTrailX = missile.pos.x;
    missile.lastTrailY = missile.pos.y;
  }
  refreshTrailGeometry(missile);
  missile.trail.material.opacity = THREE.MathUtils.clamp(missile.vel.length() / MISSILE_MAX_SPEED, 0.62, 0.92);
}

function updateEntityTrail(entity, z) {
  addTrailPoint(entity, entity.pos.x, entity.pos.y, z);
  refreshTrailGeometry(entity);
}

function addTrailPoint(entity, x, y, z) {
  const limit = entity.trailLimit || FLARE_TRAIL_POINTS;
  const offset = entity.trailCursor * 3;
  const raw = entity.trailRawPositions || entity.trailPositions;
  raw[offset] = x;
  raw[offset + 1] = y;
  raw[offset + 2] = z;
  entity.trailCursor = (entity.trailCursor + 1) % limit;
  entity.trailCount = Math.min(limit, entity.trailCount + 1);
}

function updateLastTrailPoint(entity, x, y, z) {
  if (entity.trailCount <= 0) return;
  const limit = entity.trailLimit || FLARE_TRAIL_POINTS;
  const raw = entity.trailRawPositions || entity.trailPositions;
  const index = (entity.trailCursor - 1 + limit) % limit;
  const offset = index * 3;
  raw[offset] = x;
  raw[offset + 1] = y;
  raw[offset + 2] = z;
}

function resetTrailBuffer(entity) {
  entity.trailCursor = 0;
  entity.trailCount = 0;
  entity.hasTrailPoint = false;
  const trailObject = entity.trail || entity.line;
  trailObject.geometry.setDrawRange(0, 0);
}

function refreshTrailGeometry(entity) {
  const limit = entity.trailLimit || FLARE_TRAIL_POINTS;
  const raw = entity.trailRawPositions || entity.trailPositions;
  const trailObject = entity.trail || entity.line;
  const ordered = trailObject.geometry.attributes.position.array;
  for (let i = 0; i < entity.trailCount; i += 1) {
    const srcIndex = (entity.trailCursor - entity.trailCount + i + limit) % limit;
    ordered[i * 3] = raw[srcIndex * 3];
    ordered[i * 3 + 1] = raw[srcIndex * 3 + 1];
    ordered[i * 3 + 2] = raw[srcIndex * 3 + 2];
  }
  trailObject.geometry.attributes.position.needsUpdate = true;
  trailObject.geometry.setDrawRange(0, entity.trailCount);
}

function explodeMissile(index, color, amount) {
  const missile = missiles[index];
  const direction = getExplosionDirection(missile.vel);
  flareBurstExplosion(missile.pos, color, direction);
  spark(missile.pos, color, Math.max(8, Math.floor(amount * 0.45)), direction);
  blastRing(missile.pos, color, direction);
  scene.remove(missile.mesh, missile.trail);
  missile.mesh.material.dispose();
  missile.trail.geometry.dispose();
  missile.trail.material.dispose();
  missiles.splice(index, 1);
}

function getExplosionDirection(velocity) {
  const direction = scratchV2c.copy(velocity);
  if (direction.lengthSq() < 0.0001) direction.set(0, 1);
  return direction.normalize();
}

function flareBurstExplosion(pos, color, direction) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, getMissileFlightZ(pos.x, pos.y) - 0.08);
  group.rotation.z = Math.atan2(-direction.x, direction.y);
  group.frustumCulled = false;
  const materials = [];
  const bubbles = [
    { x: 0, y: -0.12, s: 0.56, stretch: 1.08, opacity: 0.58 },
    { x: -0.16, y: 0.14, s: 0.72, stretch: 1.18, opacity: 0.68 },
    { x: 0.18, y: 0.3, s: 0.9, stretch: 1.34, opacity: 0.78 },
    { x: 0, y: 0.58, s: 1.16, stretch: 1.58, opacity: 0.92 },
  ];
  for (const bubble of bubbles) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: bubble.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(sharedExplosionBubbleGeometry, material);
    mesh.position.set(bubble.x, bubble.y, 0);
    mesh.scale.set(bubble.s, bubble.s * bubble.stretch, bubble.s);
    mesh.userData.baseX = bubble.x;
    mesh.userData.baseY = bubble.y;
    mesh.userData.baseS = bubble.s;
    mesh.userData.stretch = bubble.stretch;
    mesh.userData.baseOpacity = bubble.opacity;
    mesh.frustumCulled = false;
    materials.push(material);
    group.add(mesh);
  }
  scene.add(group);
  particles.push({ flareBurstGroup: group, materials, life: 0.42, maxLife: 0.42 });
}

function spark(pos, color, amount, direction = null) {
  const positions = new Float32Array(amount * 3);
  const velocities = new Float32Array(amount * 2);
  let forwardX = 0;
  let forwardY = 0;
  let rightX = 0;
  let rightY = 0;
  if (direction) {
    const length = Math.max(0.0001, direction.length());
    forwardX = direction.x / length;
    forwardY = direction.y / length;
    rightX = forwardY;
    rightY = -forwardX;
  }
  for (let i = 0; i < amount; i += 1) {
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y;
    positions[i * 3 + 2] = getMissileFlightZ(pos.x, pos.y) - 0.1;
    if (direction) {
      const lateral = (Math.random() - 0.5) * (2.2 + Math.random() * 2.8);
      const along = 1.8 + Math.random() * 5.8;
      const backwash = Math.random() < 0.24 ? -(0.6 + Math.random() * 1.4) : 0;
      const speed = along + backwash;
      velocities[i * 2] = forwardX * speed + rightX * lateral;
      velocities[i * 2 + 1] = forwardY * speed + rightY * lateral;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 4.2;
      velocities[i * 2] = Math.cos(angle) * speed;
      velocities[i * 2 + 1] = Math.sin(angle) * speed;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  particles.push({ points, positions, velocities, life: 0.58 });
}

function blastRing(pos, color, direction) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    wireframe: true,
  });
  const ring = new THREE.Mesh(sharedBlastShellGeometry, material);
  ring.position.set(pos.x + direction.x * 0.28, pos.y + direction.y * 0.28, getMissileFlightZ(pos.x, pos.y) - 0.08);
  ring.rotation.z = Math.atan2(-direction.x, direction.y);
  ring.scale.set(0.58, 1.42, 0.58);
  ring.frustumCulled = false;
  scene.add(ring);
  particles.push({
    ring,
    life: 0.34,
    maxLife: 0.34,
    baseScale: new THREE.Vector3(0.58, 1.42, 0.58),
    flareShell: true,
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    if (particle.ring) {
      if (particle.flareShell) {
        const progress = 1 - particle.life / particle.maxLife;
        particle.ring.scale.copy(particle.baseScale).multiplyScalar(1 + progress * 4.8);
      } else {
        const age = particle.maxLife - particle.life;
        const radius = particle.radius + particle.expansion * age;
        const segments = particle.positions.length / 3 - 1;
        for (let j = 0; j <= segments; j += 1) {
          const angle = (j / segments) * Math.PI * 2;
          particle.positions[j * 3] = particle.origin.x + Math.cos(angle) * radius;
          particle.positions[j * 3 + 1] = particle.origin.y + Math.sin(angle) * radius;
        }
        particle.ring.geometry.attributes.position.needsUpdate = true;
      }
      particle.ring.material.opacity = Math.max(0, particle.life / particle.maxLife) * (particle.flareShell ? 0.58 : 0.78);
      if (particle.life <= 0) {
        scene.remove(particle.ring);
        if (!particle.flareShell) particle.ring.geometry.dispose();
        particle.ring.material.dispose();
        particles.splice(i, 1);
      }
      continue;
    }
    if (particle.flareBurst) {
      const progress = 1 - particle.life / particle.maxLife;
      particle.flareBurst.scale.setScalar(1 + progress * 4.6);
      particle.flareBurst.material.opacity = Math.max(0, particle.life / particle.maxLife) * 0.92;
      if (particle.life <= 0) {
        scene.remove(particle.flareBurst);
        particle.flareBurst.geometry.dispose();
        particle.flareBurst.material.dispose();
        particles.splice(i, 1);
      }
      continue;
    }
    if (particle.flareBurstGroup) {
      const progress = 1 - particle.life / particle.maxLife;
      const fade = Math.max(0, particle.life / particle.maxLife);
      for (const child of particle.flareBurstGroup.children) {
        const baseS = child.userData.baseS;
        const scale = baseS * (1 + progress * 4.4);
        child.position.set(
          child.userData.baseX * (1 + progress * 2.6),
          child.userData.baseY * (1 + progress * 3.2),
          0
        );
        child.scale.set(scale, scale * child.userData.stretch, scale);
        child.material.opacity = fade * child.userData.baseOpacity;
      }
      if (particle.life <= 0) {
        scene.remove(particle.flareBurstGroup);
        for (const child of particle.flareBurstGroup.children) child.material.dispose();
        particles.splice(i, 1);
      }
      continue;
    }
    if (particle.shieldBubble) {
      const progress = 1 - particle.life / particle.maxLife;
      const fade = Math.max(0, particle.life / particle.maxLife);
      particle.shieldBubble.position.set(player.pos.x, player.pos.y, player.altitude);
      particle.shieldBubble.scale.setScalar(1 + progress * 0.32);
      particle.shieldBubble.material.opacity = fade * 0.46;

      const radius = 0.1 + progress * 0.82;
      const segments = particle.contactPositions.length / 3 - 1;
      for (let j = 0; j <= segments; j += 1) {
        const angle = (j / segments) * Math.PI * 2;
        particle.contactPositions[j * 3] = particle.impact.x + Math.cos(angle) * radius;
        particle.contactPositions[j * 3 + 1] = particle.impact.y + Math.sin(angle) * radius;
        particle.contactPositions[j * 3 + 2] = player.altitude + 0.04;
      }
      particle.shieldContact.geometry.attributes.position.needsUpdate = true;
      particle.shieldContact.material.opacity = fade * 0.92;
      if (particle.life <= 0) {
        scene.remove(particle.shieldBubble, particle.shieldContact);
        particle.shieldBubble.material.dispose();
        particle.shieldContact.geometry.dispose();
        particle.shieldContact.material.dispose();
        particles.splice(i, 1);
      }
      continue;
    }
    const drag = Math.pow(0.08, dt);
    for (let j = 0; j < particle.velocities.length / 2; j += 1) {
      const velocityIndex = j * 2;
      particle.positions[j * 3] += particle.velocities[velocityIndex] * dt;
      particle.positions[j * 3 + 1] += particle.velocities[velocityIndex + 1] * dt;
      particle.velocities[velocityIndex] *= drag;
      particle.velocities[velocityIndex + 1] *= drag;
    }
    particle.points.geometry.attributes.position.needsUpdate = true;
    particle.points.material.opacity = Math.max(0, particle.life / 0.58);
    if (particle.life <= 0) {
      scene.remove(particle.points);
      particle.points.geometry.dispose();
      particle.points.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function render(dt) {
  if (replay.active) {
    renderReplay(dt);
    return;
  }
  const ended = isRunEnded();
  if (ended) state.endTime += dt;
  const desiredMotion = scratchV2.copy(player.vel);
  if (ended) {
    const orbitAngle = state.endOrbitAngle + state.endTime * CAMERA_END_ORBIT_SPEED;
    desiredMotion.set(Math.cos(orbitAngle), Math.sin(orbitAngle));
  } else if (desiredMotion.lengthSq() > 0.08) {
    desiredMotion.normalize();
  } else {
    desiredMotion.set(-Math.sin(player.heading), Math.cos(player.heading));
  }
  cameraRig.motion.lerp(desiredMotion, getDampingFactor(ended ? 1.5 : (state.mode === 'playing' ? 2.2 : 0.9), dt));
  if (cameraRig.motion.lengthSq() > 0.0001) cameraRig.motion.normalize();
  const motion = cameraRig.motion;

  const speedRatio = THREE.MathUtils.clamp(player.vel.length() / PLAYER_MAX_SPEED, 0, 1);
  const lead = ended ? 0 : CAMERA_LOOK_AHEAD + speedRatio * 14;
  const back = ended ? CAMERA_END_BACK_OFFSET : CAMERA_BACK_OFFSET + speedRatio * 8;
  cameraRig.introTimer = Math.max(0, cameraRig.introTimer - dt);
  const introProgress = 1 - cameraRig.introTimer / CAMERA_INTRO_DURATION;
  const introEase = introProgress * introProgress * (3 - 2 * introProgress);
  const introBack = THREE.MathUtils.lerp(3.5, back, introEase);
  const targetHeight = ended ? CAMERA_END_HEIGHT : CAMERA_HEIGHT + speedRatio * 12;
  const introHeight = THREE.MathUtils.lerp(9, targetHeight, introEase);
  const introLead = THREE.MathUtils.lerp(2.5, lead, introEase);
  const desiredFocus = desiredFocusVector.set(player.pos.x, player.pos.y);
  const threatFocus = getThreatFocus();
  const chaseCamera = !ended && state.cameraMode === 'side';
  if (!chaseCamera && !ended && threatFocus) desiredFocus.lerp(threatFocus, 0.24);

  cameraRig.focus.lerp(desiredFocus, getDampingFactor(ended ? 3.2 : (state.mode === 'playing' ? 4.2 : 1.4), dt));

  if (chaseCamera) {
    const right = scratchV2b.set(motion.y, -motion.x);
    const desiredLateral = THREE.MathUtils.clamp(-player.bank / PLAYER_MAX_ROLL, -1, 1) * LIVE_CHASE_LATERAL_MAX;
    cameraRig.chaseLateralOffset += (desiredLateral - cameraRig.chaseLateralOffset) * getDampingFactor(LIVE_CHASE_LATERAL_RESPONSE, dt);
    const chaseBack = THREE.MathUtils.lerp(4.8, LIVE_CHASE_BACK_DISTANCE + speedRatio * 3.2, introEase);
    const chaseHeight = THREE.MathUtils.lerp(7.2, LIVE_CHASE_HEIGHT + speedRatio * 2.0, introEase);
    const desiredPosition = scratchV3.set(
      cameraRig.focus.x - motion.x * chaseBack + right.x * cameraRig.chaseLateralOffset,
      cameraRig.focus.y - motion.y * chaseBack + right.y * cameraRig.chaseLateralOffset,
      player.altitude + chaseHeight
    );
    cameraRig.position.lerp(desiredPosition, getDampingFactor(state.mode === 'playing' ? 3.1 : 1.4, dt));
    camera.position.copy(cameraRig.position);

    const desiredLookAt = scratchV3.set(
      cameraRig.focus.x + motion.x * LIVE_CHASE_LOOK_AHEAD + right.x * cameraRig.chaseLateralOffset * 0.35,
      cameraRig.focus.y + motion.y * LIVE_CHASE_LOOK_AHEAD + right.y * cameraRig.chaseLateralOffset * 0.35,
      player.altitude + 0.5
    );
    cameraRig.lookAt.lerp(desiredLookAt, getDampingFactor(4.4, dt));
  } else {
    const desiredPosition = scratchV3.set(
      cameraRig.focus.x - motion.x * introBack,
      cameraRig.focus.y - motion.y * introBack,
      player.altitude + introHeight
    );
    cameraRig.position.lerp(desiredPosition, getDampingFactor(ended ? 1.85 : (state.mode === 'playing' ? 2.7 : 1.2), dt));
    camera.position.copy(cameraRig.position);

    const desiredLookAt = scratchV3.set(
      cameraRig.focus.x + motion.x * (ended ? 0 : introLead),
      cameraRig.focus.y + motion.y * (ended ? 0 : introLead),
      ended ? player.altitude : player.altitude - 0.25
    );
    cameraRig.lookAt.lerp(desiredLookAt, getDampingFactor(5.5, dt));
  }
  starField.position.set(player.pos.x, player.pos.y, -20);
  if (chaseCamera) {
    camera.up.set(0, 0, 1);
  } else {
    camera.up.set(motion.x, motion.y, 0);
  }
  let shakeChroma = 0;
  if (cameraRig.shakeTimer > 0) {
    cameraRig.shakeTimer = Math.max(0, cameraRig.shakeTimer - dt);
    cameraRig.shakeElapsed += dt;
    const decay = cameraRig.shakeTimer / cameraRig.shakeDuration;
    const amplitude = cameraRig.shakeStrength * decay * decay;
    shakeChroma = THREE.MathUtils.clamp(decay * decay * cameraRig.shakeStrength / CAMERA_SHAKE_STRENGTH, 0, 1);
    const t = cameraRig.shakeElapsed * 82 + cameraRig.shakePhase;
    const rightX = motion.y;
    const rightY = -motion.x;
    const offsetX = Math.sin(t * 1.17) * amplitude;
    const offsetY = Math.cos(t * 0.91) * amplitude * 0.72;
    cameraShakeOffset.set(
      rightX * offsetX + motion.x * offsetY,
      rightY * offsetX + motion.y * offsetY,
      0
    );
    camera.position.add(cameraShakeOffset);
    scratchV3.copy(cameraRig.lookAt).add(cameraShakeOffset);
    camera.lookAt(scratchV3);
  } else {
    camera.lookAt(cameraRig.lookAt);
  }
  afterburnerLensPass.uniforms.uScreenChroma.value = shakeChroma;
  updateAfterburnerLens(dt, state.afterburnerActive, player.pos.x, player.pos.y, player.heading, player.altitude);
  composer.render();
  drawMinimap();
}

function renderReplay(dt) {
  replay.elapsed = Math.min(replay.duration, replay.elapsed + dt);
  const frame = getReplayFrame(replay.elapsed);
  if (!frame) {
    composer.render();
    drawMinimap();
    return;
  }

  player.pos.set(frame.player.x, frame.player.y);
  player.vel.set(frame.player.vx, frame.player.vy);
  ensureCityChunks();
  starField.position.set(frame.player.x, frame.player.y, -20);

  replay.player.visible = true;
  const replayPlayerZ = getPlayerFlightZ(frame.player.x, frame.player.y, replay.elapsed, Math.hypot(frame.player.vx, frame.player.vy), frame.player.bank);
  replay.player.position.set(frame.player.x, frame.player.y, replayPlayerZ);
  scratchQuatA.setFromAxisAngle(yawAxis, frame.player.heading);
  scratchQuatB.setFromAxisAngle(rollAxis, frame.player.bank);
  replay.player.quaternion.copy(scratchQuatA).multiply(scratchQuatB);

  for (const replayMissile of replay.missiles) {
    replayMissile._seen = false;
  }
  for (const missile of frame.missiles) {
    const replayMissile = getReplayMissileSlot(missile.id);
    if (!replayMissile) {
      continue;
    }
    replayMissile._seen = true;
    replayMissile.mesh.visible = true;
    replayMissile.trail.visible = true;
    scratchV3.set(missile.x, missile.y, missile.z);
    if (
      !replayMissile.hasRenderPosition ||
      replayMissile.renderPosition.distanceToSquared(scratchV3) > REPLAY_TRAIL_RESET_DISTANCE * REPLAY_TRAIL_RESET_DISTANCE
    ) {
      replayMissile.renderPosition.copy(scratchV3);
      replayMissile.hasRenderPosition = true;
    } else {
      replayMissile.renderPosition.lerp(scratchV3, getDampingFactor(REPLAY_MISSILE_SMOOTHING, dt));
    }
    replayMissile.mesh.position.copy(replayMissile.renderPosition);
    scratchV2.set(missile.vx, missile.vy);
    if (scratchV2.lengthSq() < 0.0001) scratchV2.set(0, 1);
    orientMissile(replayMissile.mesh, scratchV2);
    updateReplayMissileTrail(replayMissile);
  }
  for (const replayMissile of replay.missiles) {
    if (replayMissile._seen) continue;
    if (replayMissile.activeId !== null) replay.missileSlots.delete(replayMissile.activeId);
    replayMissile.activeId = null;
    replayMissile.hasRenderPosition = false;
    replayMissile.mesh.visible = false;
    replayMissile.trail.visible = false;
    resetTrailBuffer(replayMissile);
  }

  const forward = scratchV2.set(frame.player.vx, frame.player.vy);
  if (forward.lengthSq() < 0.0001) forward.set(-Math.sin(frame.player.heading), Math.cos(frame.player.heading));
  forward.normalize();
  const right = scratchV2b.set(forward.y, -forward.x);
  replay.cameraFocus.lerp(scratchV2c.set(frame.player.x, frame.player.y), getDampingFactor(2.4, dt));
  scratchV3.set(
    replay.cameraFocus.x + right.x * REPLAY_SIDE_DISTANCE * replay.sideSign - forward.x * 4.8,
    replay.cameraFocus.y + right.y * REPLAY_SIDE_DISTANCE * replay.sideSign - forward.y * 4.8,
    replayPlayerZ + REPLAY_SIDE_HEIGHT
  );
  replay.cameraPosition.lerp(scratchV3, getDampingFactor(1.65, dt));
  camera.position.copy(replay.cameraPosition);
  camera.up.set(0, 0, 1);
  scratchV3.set(
    replay.cameraFocus.x + forward.x * REPLAY_LOOK_AHEAD,
    replay.cameraFocus.y + forward.y * REPLAY_LOOK_AHEAD,
    replayPlayerZ + 0.75
  );
  replay.cameraLookAt.lerp(scratchV3, getDampingFactor(2.8, dt));
  camera.lookAt(replay.cameraLookAt);
  afterburnerLensPass.uniforms.uScreenChroma.value = 0;
  updateAfterburnerLens(dt, frame.player.afterburner, frame.player.x, frame.player.y, frame.player.heading, replayPlayerZ);
  composer.render();
  drawMinimap();
}

function getReplayMissileSlot(id) {
  let slot = replay.missileSlots.get(id);
  if (slot) return slot;
  slot = replay.missiles.find((missile) => missile.activeId === null);
  if (!slot) return null;
  slot.activeId = id;
  slot.hasRenderPosition = false;
  resetTrailBuffer(slot);
  replay.missileSlots.set(id, slot);
  return slot;
}

function updateReplayMissileTrail(replayMissile) {
  const pointX = replayMissile.renderPosition.x;
  const pointY = replayMissile.renderPosition.y;
  const pointZ = replayMissile.renderPosition.z - 0.1;
  const dx = pointX - replayMissile.lastTrailX;
  const dy = pointY - replayMissile.lastTrailY;
  const dz = pointZ - replayMissile.lastTrailZ;
  const distanceSq = dx * dx + dy * dy + dz * dz;
  if (!replayMissile.hasTrailPoint || distanceSq > REPLAY_TRAIL_RESET_DISTANCE * REPLAY_TRAIL_RESET_DISTANCE) {
    resetTrailBuffer(replayMissile);
    addTrailPoint(replayMissile, pointX, pointY, pointZ);
  } else if (distanceSq >= REPLAY_TRAIL_MIN_DISTANCE * REPLAY_TRAIL_MIN_DISTANCE) {
    const startX = replayMissile.lastTrailX;
    const startY = replayMissile.lastTrailY;
    const startZ = replayMissile.lastTrailZ;
    const distance = Math.sqrt(distanceSq);
    const steps = Math.min(8, Math.max(1, Math.ceil(distance / REPLAY_TRAIL_MIN_DISTANCE)));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      addTrailPoint(
        replayMissile,
        THREE.MathUtils.lerp(startX, pointX, t),
        THREE.MathUtils.lerp(startY, pointY, t),
        THREE.MathUtils.lerp(startZ, pointZ, t)
      );
    }
  } else {
    updateLastTrailPoint(replayMissile, pointX, pointY, pointZ);
  }
  replayMissile.hasTrailPoint = true;
  replayMissile.lastTrailX = pointX;
  replayMissile.lastTrailY = pointY;
  replayMissile.lastTrailZ = pointZ;
  refreshTrailGeometry(replayMissile);
}

function getReplayFrame(elapsed) {
  if (replay.frames.length === 0) return null;
  if (replay.frames.length === 1) return replay.frames[0];
  const t = replay.frames[0].t + elapsed;
  let index = replay.frameIndex;
  while (index < replay.frames.length - 2 && replay.frames[index + 1].t < t) index += 1;
  while (index > 0 && replay.frames[index].t > t) index -= 1;
  replay.frameIndex = index;
  const a = replay.frames[index];
  const b = replay.frames[Math.min(index + 1, replay.frames.length - 1)];
  const span = Math.max(0.0001, b.t - a.t);
  const alpha = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  return interpolateReplayFrame(a, b, alpha);
}

function hermiteReplayPosition(p0, v0, p1, v1, alpha, span) {
  const t2 = alpha * alpha;
  const t3 = t2 * alpha;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + alpha;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const velocitySpan = span * GAME_SPEED;
  return h00 * p0 + h10 * v0 * velocitySpan + h01 * p1 + h11 * v1 * velocitySpan;
}

function interpolateReplayFrame(a, b, alpha) {
  const span = Math.max(0.0001, b.t - a.t);
  const playerFrame = {
    x: THREE.MathUtils.lerp(a.player.x, b.player.x, alpha),
    y: THREE.MathUtils.lerp(a.player.y, b.player.y, alpha),
    vx: THREE.MathUtils.lerp(a.player.vx, b.player.vx, alpha),
    vy: THREE.MathUtils.lerp(a.player.vy, b.player.vy, alpha),
    heading: a.player.heading + getSignedAngleDelta(a.player.heading, b.player.heading) * alpha,
    bank: THREE.MathUtils.lerp(a.player.bank, b.player.bank, alpha),
    afterburner: a.player.afterburner || b.player.afterburner,
  };
  const aMissiles = a.missileById;
  const bMissiles = b.missileById;
  const missileIds = replay.idScratch;
  missileIds.clear();
  for (const missile of a.missiles) missileIds.add(missile.id);
  for (const missile of b.missiles) missileIds.add(missile.id);
  const missileFrames = [];
  for (const id of missileIds) {
    if (missileFrames.length >= REPLAY_MAX_MISSILES) break;
    const ma = aMissiles.get(id);
    const mb = bMissiles.get(id);
    if (!ma || !mb) continue;
    missileFrames.push({
      id,
      x: hermiteReplayPosition(ma.x, ma.vx, mb.x, mb.vx, alpha, span),
      y: hermiteReplayPosition(ma.y, ma.vy, mb.y, mb.vy, alpha, span),
      z: THREE.MathUtils.lerp(ma.z, mb.z, alpha),
      vx: THREE.MathUtils.lerp(ma.vx, mb.vx, alpha),
      vy: THREE.MathUtils.lerp(ma.vy, mb.vy, alpha),
    });
  }
  return { player: playerFrame, missiles: missileFrames };
}

function drawMinimap() {
  const ctx = minimapCtx;
  if (!ctx || !minimap.w) return;
  const { w, h, scale } = minimap;
  const cx = w / 2;
  const py = h * MINIMAP_PLAYER_Y;
  const toX = (wx) => cx + (wx - player.pos.x) * scale;
  const toY = (wy) => py - (wy - player.pos.y) * scale;
  const inView = (sx, sy, pad = 6) => sx >= -pad && sx <= w + pad && sy >= -pad && sy <= h + pad;

  ctx.clearRect(0, 0, w, h);

  // Distance grid (every 30 world units) + central corridor line at world x = 0.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(54, 255, 110, 0.10)';
  const step = 30;
  const firstY = Math.ceil((player.pos.y - py / scale) / step) * step;
  for (let wy = firstY; toY(wy) >= 0; wy += step) {
    const sy = toY(wy);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(54, 255, 110, 0.16)';
  ctx.beginPath();
  ctx.moveTo(toX(0), 0);
  ctx.lineTo(toX(0), h);
  ctx.stroke();

  // Target tower: plotted in place, or pinned to the top edge with an arrow.
  const tx = toX(TARGET.x);
  const ty = toY(TARGET.y);
  ctx.fillStyle = '#ffae2b';
  ctx.shadowColor = '#ffae2b';
  ctx.shadowBlur = 8;
  if (ty >= 2) {
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
  } else {
    const ax = Math.max(8, Math.min(w - 8, tx));
    ctx.beginPath();
    ctx.moveTo(ax, 4);
    ctx.lineTo(ax - 5, 12);
    ctx.lineTo(ax + 5, 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Launchers — armed ones flash red, dormant ones sit as dim amber pips.
  for (const pad of launchPads) {
    const sx = toX(pad.x);
    const sy = toY(pad.y);
    if (!inView(sx, sy)) continue;
    const armed = pad.launchTimer > 0 || pad.shotsQueued > 0;
    if (armed) {
      const flash = Math.floor(state.runTime * LAUNCH_FLASH_RATE) % 2 === 0;
      ctx.fillStyle = flash ? '#ff5a5a' : '#ff2b2b';
      ctx.shadowColor = '#ff2b2b';
      ctx.shadowBlur = 8;
      ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
      ctx.shadowBlur = 0;
    } else if (pad.ammo < LAUNCHER_BURST_MIN) {
      ctx.fillStyle = 'rgba(96, 48, 48, 0.35)';
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    } else {
      ctx.fillStyle = 'rgba(255, 174, 43, 0.55)';
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
  }

  // Flares (amber) and incoming missiles (red).
  ctx.fillStyle = 'rgba(255, 200, 90, 0.85)';
  for (const flare of flares) {
    const sx = toX(flare.pos.x);
    const sy = toY(flare.pos.y);
    if (inView(sx, sy)) ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
  ctx.fillStyle = '#ff2b2b';
  ctx.shadowColor = '#ff2b2b';
  ctx.shadowBlur = 6;
  for (const missile of missiles) {
    const sx = toX(missile.pos.x);
    const sy = toY(missile.pos.y);
    if (inView(sx, sy)) {
      ctx.beginPath();
      ctx.arc(sx, sy, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;

  // Player ship — a green triangle pointed along its current velocity.
  const heading = player.vel.lengthSq() > 0.02
    ? Math.atan2(player.vel.y, player.vel.x)
    : Math.PI / 2;
  ctx.save();
  ctx.translate(cx, py);
  ctx.rotate(-heading + Math.PI / 2); // world +Y (north) -> up on the radar
  ctx.fillStyle = '#aaffc0';
  ctx.shadowColor = '#36ff6e';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

function getThreatFocus() {
  let count = 0;
  let x = 0;
  let y = 0;
  const radiusSq = CAMERA_THREAT_RADIUS * CAMERA_THREAT_RADIUS;
  for (const missile of missiles) {
    const dx = missile.pos.x - player.pos.x;
    const dy = missile.pos.y - player.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue;
    const weight = 1 - distSq / radiusSq;
    x += missile.pos.x * weight;
    y += missile.pos.y * weight;
    count += weight;
  }
  if (count <= 0) return null;
  return threatFocusVector.set(
    player.pos.x * 0.62 + (x / count) * 0.38,
    player.pos.y * 0.62 + (y / count) * 0.38
  );
}

function getDampingFactor(response, dt) {
  return 1 - Math.exp(-response * dt);
}

function updateHud() {
  setHudText('score', scoreEl, Math.floor(state.score).toString());
  setHudText('wave', waveEl, `${Math.max(0, Math.ceil(player.pos.distanceTo(TARGET)))}m`);
  setHudText('speed', speedEl, Math.round(player.vel.length() * 10).toString());
  setHudText('afterburner', afterburnerEl, Math.ceil(state.afterburner).toString());
  setHudText('shield', hullEl, Math.max(0, Math.ceil(state.shield)).toString());
  setHudText('flares', flaresEl, state.flareCharges.toString());
}

function setHudText(key, element, value) {
  if (hudCache[key] === value) return;
  hudCache[key] = value;
  element.textContent = value;
}

function makeTargetGuide() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Line(geometry, material);
}

function updateTargetGuide() {
  scratchV2.copy(TARGET).sub(player.pos);
  const distance = scratchV2.length();
  if (distance < 0.001) return;
  scratchV2.multiplyScalar(1 / distance);
  const start = 1.35;
  const end = Math.min(8.2, Math.max(3.2, distance * 0.12));
  const positions = targetGuide.geometry.attributes.position.array;
  positions[0] = player.pos.x + scratchV2.x * start;
  positions[1] = player.pos.y + scratchV2.y * start;
  positions[2] = player.altitude - 0.36;
  positions[3] = player.pos.x + scratchV2.x * end;
  positions[4] = player.pos.y + scratchV2.y * end;
  positions[5] = getPlayerFlightZ(positions[3], positions[4], state.runTime, player.vel.length(), player.bank) - 0.36;
  targetGuide.geometry.attributes.position.needsUpdate = true;
  targetGuide.material.opacity = THREE.MathUtils.clamp(distance / 22, 0.18, 0.72);
}

function makePlayerMesh() {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0xaaffc0,
    transparent: true,
    opacity: 1,
    wireframe: true,
    side: THREE.DoubleSide,
  });
  const wingMaterial = new THREE.MeshBasicMaterial({
    color: 0x36ff6e,
    transparent: true,
    opacity: 0.82,
    wireframe: true,
    side: THREE.DoubleSide,
  });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 5), bodyMaterial);
  nose.position.y = 0.34;
  group.add(nose);

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.28), bodyMaterial);
  fuselage.position.y = -0.18;
  group.add(fuselage);

  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        -0.18, 0.02, 0.04,
        -0.44, -0.1, 0.12,
        -1.18, -0.78, 0.08,
        -0.54, -0.5, 0.02,
        0.18, 0.02, 0.04,
        0.44, -0.1, 0.12,
        1.18, -0.78, 0.08,
        0.54, -0.5, 0.02,
      ]),
      3
    )
  );
  wingGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  wingGeometry.computeVertexNormals();
  const wings = new THREE.Mesh(wingGeometry, wingMaterial);
  wings.position.y = -0.12;
  group.add(wings);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.32), wingMaterial);
  tail.position.y = -0.72;
  tail.position.z = 0.08;
  group.add(tail);

  group.userData.materials = [bodyMaterial, wingMaterial];
  return group;
}

function makeAfterburnerLensShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uOrigins: { value: Array.from({ length: AFTERBURNER_LENS_SAMPLES }, () => new THREE.Vector2(-2, -2)) },
      uDirs: { value: Array.from({ length: AFTERBURNER_LENS_SAMPLES }, () => new THREE.Vector2(0, 1)) },
      uAges: { value: new Float32Array(AFTERBURNER_LENS_SAMPLES) },
      uStrengths: { value: new Float32Array(AFTERBURNER_LENS_SAMPLES) },
      uSampleCount: { value: 0 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uScreenChroma: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      #define LENS_SAMPLE_COUNT 8

      uniform sampler2D tDiffuse;
      uniform vec2 uOrigins[LENS_SAMPLE_COUNT];
      uniform vec2 uDirs[LENS_SAMPLE_COUNT];
      uniform float uAges[LENS_SAMPLE_COUNT];
      uniform float uStrengths[LENS_SAMPLE_COUNT];
      uniform int uSampleCount;
      uniform float uAspect;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uScreenChroma;
      varying vec2 vUv;

      void main() {
        vec2 screenP = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
        vec2 screenDir = normalize(screenP + vec2(0.0001));
        vec2 screenChroma = vec2(screenDir.x / uAspect, screenDir.y) * uScreenChroma * (0.003 + length(screenP) * 0.0045);
        vec4 base = vec4(
          texture2D(tDiffuse, clamp(vUv + screenChroma, vec2(0.001), vec2(0.999))).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, clamp(vUv - screenChroma, vec2(0.001), vec2(0.999))).b,
          texture2D(tDiffuse, vUv).a
        );
        vec2 metricOffset = vec2(0.0);
        float lens = 0.0;
        float edge = 0.0;

        for (int i = 0; i < LENS_SAMPLE_COUNT; i += 1) {
          if (i >= uSampleCount) break;
          vec2 dir = normalize(vec2(uDirs[i].x * uAspect, uDirs[i].y));
          vec2 right = vec2(-dir.y, dir.x);
          vec2 p = vec2((vUv.x - uOrigins[i].x) * uAspect, vUv.y - uOrigins[i].y);

          float age = clamp(uAges[i], 0.0, 1.0);
          float fade = (1.0 - smoothstep(0.72, 1.0, age)) * smoothstep(0.0, 0.12, age) * uStrengths[i] * uIntensity;
          float along = dot(p, -dir);
          float side = dot(p, right);
          float waveFront = mix(0.07, 0.43, age);
          float waveTail = max(0.0, waveFront - mix(0.06, 0.16, age));
          float coneWidth = 0.032 + along * 0.68;
          float coneBand = smoothstep(waveTail, waveTail + 0.035, along) * (1.0 - smoothstep(waveFront, waveFront + 0.055, along));
          float insideCone = coneBand * (1.0 - smoothstep(coneWidth, coneWidth + 0.05, abs(side)));
          float coneEdge = 1.0 - smoothstep(0.0, 0.024, abs(abs(side) - coneWidth));
          coneEdge *= coneBand;
          float compression = sin((along - waveTail) * 105.0 - uTime * 10.0);
          float bands = pow(max(0.0, compression), 4.0) * insideCone;
          float shimmer = sin(side * 118.0 + along * 26.0 - uTime * 18.0) * 0.5 + 0.5;
          float sampleLens = (insideCone * 0.16 + coneEdge * 1.15 + bands * 0.58) * fade;

          lens += sampleLens;
          edge += coneEdge * fade;
          metricOffset +=
            right * side * (0.074 * sampleLens) +
            (-dir) * (0.009 * sampleLens + bands * 0.006 * fade) +
            right * (shimmer - 0.5) * 0.006 * insideCone * fade;
        }

        vec2 uvOffset = vec2(metricOffset.x / uAspect, metricOffset.y);

        vec2 chroma = normalize(uvOffset + vec2(0.00001)) * (0.0065 * clamp(lens + edge, 0.0, 1.0));
        vec2 uvR = clamp(vUv + uvOffset + chroma, vec2(0.001), vec2(0.999));
        vec2 uvG = clamp(vUv + uvOffset, vec2(0.001), vec2(0.999));
        vec2 uvB = clamp(vUv + uvOffset - chroma, vec2(0.001), vec2(0.999));
        vec4 refracted = vec4(
          texture2D(tDiffuse, uvR).r,
          texture2D(tDiffuse, uvG).g,
          texture2D(tDiffuse, uvB).b,
          base.a
        );
        gl_FragColor = vec4(mix(base.rgb, refracted.rgb, clamp(lens * 1.28, 0.0, 0.96)), base.a);
      }
    `,
  };
}

function resetAfterburnerLens() {
  afterburnerLens.intensity = 0;
  afterburnerLens.time = 0;
  afterburnerLens.emitTimer = 0;
  afterburnerLens.samples.length = 0;
  afterburnerLensPass.uniforms.uTime.value = 0;
  afterburnerLensPass.uniforms.uIntensity.value = 0;
  afterburnerLensPass.uniforms.uSampleCount.value = 0;
}

function updateAfterburnerLens(dt, active, x, y, heading, altitude = getPlayerFlightZ(x, y, afterburnerLens.time, 0, 0)) {
  afterburnerLens.time += dt;
  const target = active ? 1 : 0;
  afterburnerLens.intensity += (target - afterburnerLens.intensity) * getDampingFactor(AFTERBURNER_SHOCKWAVE_FADE_RATE, dt);
  afterburnerLensPass.uniforms.uTime.value = afterburnerLens.time;
  afterburnerLensPass.uniforms.uIntensity.value = afterburnerLens.intensity;

  camera.updateMatrixWorld();
  const forward = scratchV2.set(-Math.sin(heading), Math.cos(heading));
  lensShipWorld.set(x + forward.x * 0.58, y + forward.y * 0.58, altitude);
  lensForwardWorld.set(x + forward.x * 3, y + forward.y * 3, altitude);
  lensShipScreen.copy(lensShipWorld).project(camera);
  lensForwardScreen.copy(lensForwardWorld).project(camera);

  lensOriginUv.set(lensShipScreen.x * 0.5 + 0.5, lensShipScreen.y * 0.5 + 0.5);
  lensDirUv.set(lensForwardScreen.x - lensShipScreen.x, lensForwardScreen.y - lensShipScreen.y);
  if (lensDirUv.lengthSq() < 0.00001) lensDirUv.set(0, 1);
  lensDirUv.normalize();

  for (let i = afterburnerLens.samples.length - 1; i >= 0; i -= 1) {
    const sample = afterburnerLens.samples[i];
    sample.age += dt / AFTERBURNER_LENS_SAMPLE_LIFE;
    if (sample.age >= 1) afterburnerLens.samples.splice(i, 1);
  }

  if (active) {
    afterburnerLens.emitTimer -= dt;
    while (afterburnerLens.emitTimer <= 0) {
      afterburnerLens.samples.unshift({
        origin: lensOriginUv.clone(),
        dir: lensDirUv.clone(),
        age: 0,
        strength: afterburnerLens.intensity,
      });
      if (afterburnerLens.samples.length > AFTERBURNER_LENS_SAMPLES) afterburnerLens.samples.pop();
      afterburnerLens.emitTimer += AFTERBURNER_LENS_EMIT_INTERVAL;
    }
  } else {
    afterburnerLens.emitTimer = 0;
  }

  const origins = afterburnerLensPass.uniforms.uOrigins.value;
  const dirs = afterburnerLensPass.uniforms.uDirs.value;
  const ages = afterburnerLensPass.uniforms.uAges.value;
  const strengths = afterburnerLensPass.uniforms.uStrengths.value;
  for (let i = 0; i < AFTERBURNER_LENS_SAMPLES; i += 1) {
    const sample = afterburnerLens.samples[i];
    if (sample) {
      origins[i].copy(sample.origin);
      dirs[i].copy(sample.dir);
      ages[i] = sample.age;
      strengths[i] = sample.strength;
    } else {
      origins[i].set(-2, -2);
      dirs[i].set(0, 1);
      ages[i] = 1;
      strengths[i] = 0;
    }
  }
  afterburnerLensPass.uniforms.uSampleCount.value = afterburnerLens.samples.length;
}

function makePlayerEngineTrails() {
  const trails = [];
  const material = new THREE.LineBasicMaterial({
    transparent: true,
    opacity: 0.78,
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  for (const offsetX of [-0.24, 0.24]) {
    const rawPositions = new Float32Array(PLAYER_ENGINE_TRAIL_POINTS * 3);
    const positions = new Float32Array(PLAYER_ENGINE_TRAIL_POINTS * 3);
    const colors = new Float32Array(PLAYER_ENGINE_TRAIL_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, material.clone());
    line.frustumCulled = false;
    line.renderOrder = 8;
    scene.add(line);
    trails.push({
      line,
      trailRawPositions: rawPositions,
      trailPositions: positions,
      trailLimit: PLAYER_ENGINE_TRAIL_POINTS,
      trailCursor: 0,
      trailCount: 0,
      hasTrailPoint: false,
      lastTrailX: 0,
      lastTrailY: 0,
      lastTrailZ: 0,
      positions,
      colors,
      localOffset: new THREE.Vector3(offsetX, -0.82, 0.02),
      worldPoint: new THREE.Vector3(),
    });
  }
  return trails;
}

function resetEngineTrails() {
  for (const trail of engineTrails) {
    resetTrailBuffer(trail);
  }
}

function updateEngineTrails() {
  const speedRatio = THREE.MathUtils.clamp(player.vel.length() / PLAYER_MAX_SPEED, 0, 1);
  const burnGlow = state.afterburnerActive ? 1 : 0;
  for (const trail of engineTrails) {
    const point = trail.worldPoint.copy(trail.localOffset).applyQuaternion(player.mesh.quaternion).add(player.mesh.position);
    const pointZ = point.z - 0.03;
    const dx = point.x - trail.lastTrailX;
    const dy = point.y - trail.lastTrailY;
    const dz = pointZ - trail.lastTrailZ;
    if (!trail.hasTrailPoint || dx * dx + dy * dy + dz * dz >= PLAYER_ENGINE_TRAIL_MIN_DISTANCE * PLAYER_ENGINE_TRAIL_MIN_DISTANCE) {
      addTrailPoint(trail, point.x, point.y, pointZ);
    } else {
      updateLastTrailPoint(trail, point.x, point.y, pointZ);
    }
    trail.hasTrailPoint = true;
    trail.lastTrailX = point.x;
    trail.lastTrailY = point.y;
    trail.lastTrailZ = pointZ;
    refreshTrailGeometry(trail);
    for (let i = 0; i < trail.trailCount; i += 1) {
      const t = trail.trailCount <= 1 ? 1 : i / (trail.trailCount - 1);
      const intensity = THREE.MathUtils.clamp(t * t + burnGlow * 0.72, 0, 1.6);
      trail.colors[i * 3] = 1.0 * intensity;
      trail.colors[i * 3 + 1] = (0.68 + burnGlow * 0.22) * intensity;
      trail.colors[i * 3 + 2] = (0.17 + burnGlow * 0.55) * intensity;
    }
    trail.line.material.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.28, 0.84, speedRatio) + burnGlow * 0.36, 0.28, 1);
    trail.line.geometry.attributes.color.needsUpdate = true;
  }
}

function makeMissileMesh() {
  const material = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
  return new THREE.Mesh(sharedMissileGeometry, material);
}

function makeFlareMesh() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    wireframe: true,
  });
  return new THREE.Mesh(sharedFlareGeometry, material);
}

function makeLauncher(x, y, z, rng = Math.random) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xff2b2b,
    transparent: true,
    opacity: 0.66,
    wireframe: true,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.18, 6), material);
  const tube = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.72, 6), material);
  tube.position.z = 0.36;
  tube.rotation.x = Math.PI / 2;
  mesh.add(base, tube);
  mesh.position.set(x, y, z);
  mesh.userData.materials = [material];
  const ammo = LAUNCHER_AMMO_MIN + Math.floor(rng() * (LAUNCHER_AMMO_MAX - LAUNCHER_AMMO_MIN + 1));
  const launcher = {
    x,
    y,
    z,
    mesh,
    material,
    maxAmmo: ammo,
    ammo,
    launchTimer: 0,
    shotsQueued: 0,
    shotCooldown: 0,
  };
  return launcher;
}

function resetLauncher(launcher) {
  launcher.ammo = launcher.maxAmmo;
  launcher.launchTimer = 0;
  launcher.shotsQueued = 0;
  launcher.shotCooldown = 0;
  launcher.material.color.setHex(0xff2b2b);
  launcher.material.opacity = 0.66;
  launcher.mesh.scale.setScalar(1);
}

function orientMissile(mesh, velocity) {
  scratchV3.set(velocity.x, velocity.y, 0).normalize();
  mesh.quaternion.setFromUnitVectors(baseMissileDir, scratchV3);
}

function makeLineBatch(material) {
  return { material, positions: [] };
}

function addBatchLine3D(batch, x1, y1, z1, x2, y2, z2) {
  batch.positions.push(x1, y1, z1, x2, y2, z2);
}

function addBatchLine(batch, x1, y1, x2, y2, z = CITY_Z) {
  addBatchLine3D(batch, x1, y1, z, x2, y2, z);
}

function addTerrainLine(batch, x1, y1, x2, y2, offset = 0.04, maxSegmentLength = 4.2) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(distance / maxSegmentLength));
  let prevX = x1;
  let prevY = y1;
  let prevZ = getTerrainZ(x1, y1) + offset;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(x1, x2, t);
    const y = THREE.MathUtils.lerp(y1, y2, t);
    const z = getTerrainZ(x, y) + offset;
    addBatchLine3D(batch, prevX, prevY, prevZ, x, y, z);
    prevX = x;
    prevY = y;
    prevZ = z;
  }
}

function addBatchRectLine(batch, x, y, w, h, z = getTerrainZ(x, y) + 0.08) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  addBatchLine(batch, x0, y0, x1, y0, z);
  addBatchLine(batch, x1, y0, x1, y1, z);
  addBatchLine(batch, x1, y1, x0, y1, z);
  addBatchLine(batch, x0, y1, x0, y0, z);
}

function addBatchWireBox(batch, x, y, w, h, height, baseZ = getTerrainZ(x, y) + 0.05) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const y0 = y - h / 2;
  const y1 = y + h / 2;
  const z0 = baseZ;
  const z1 = baseZ + height;
  addBatchLine3D(batch, x0, y0, z0, x1, y0, z0);
  addBatchLine3D(batch, x1, y0, z0, x1, y1, z0);
  addBatchLine3D(batch, x1, y1, z0, x0, y1, z0);
  addBatchLine3D(batch, x0, y1, z0, x0, y0, z0);
  addBatchLine3D(batch, x0, y0, z1, x1, y0, z1);
  addBatchLine3D(batch, x1, y0, z1, x1, y1, z1);
  addBatchLine3D(batch, x1, y1, z1, x0, y1, z1);
  addBatchLine3D(batch, x0, y1, z1, x0, y0, z1);
  addBatchLine3D(batch, x0, y0, z0, x0, y0, z1);
  addBatchLine3D(batch, x1, y0, z0, x1, y0, z1);
  addBatchLine3D(batch, x1, y1, z0, x1, y1, z1);
  addBatchLine3D(batch, x0, y1, z0, x0, y1, z1);
}

function flushLineBatch(group, batch) {
  if (batch.positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(batch.positions), 3));
  const lines = new THREE.LineSegments(geometry, batch.material);
  lines.frustumCulled = false;
  group.add(lines);
  return lines;
}

function disposeObjectTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const material = object.material;
    if (Array.isArray(material)) {
      for (const item of material) materials.add(item);
    } else if (material) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    if (!material.userData?.keepAlive) material.dispose();
  }
}

function freezeStaticObject(root) {
  root.traverse((object) => {
    if (!object.isLineSegments) return;
    object.updateMatrix();
    object.updateMatrixWorld(true);
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
  });
}

function mergeStaticChunkLines(chunkGroup) {
  const lineObjects = [];
  chunkGroup.traverse((object) => {
    if (object.isLineSegments && object.geometry?.attributes?.position) lineObjects.push(object);
  });
  if (lineObjects.length <= 1) return;

  chunkGroup.updateMatrixWorld(true);
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const localPoint = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const chunkPoint = new THREE.Vector3();
  const chunkWorldInverse = new THREE.Matrix4().copy(chunkGroup.matrixWorld).invert();

  for (const line of lineObjects) {
    const position = line.geometry.attributes.position;
    const material = Array.isArray(line.material) ? line.material[0] : line.material;
    color.copy(material?.color || new THREE.Color(0x36ff6e));
    const alpha = material?.opacity ?? 1;
    for (let i = 0; i < position.count; i += 1) {
      localPoint.fromBufferAttribute(position, i);
      worldPoint.copy(localPoint).applyMatrix4(line.matrixWorld);
      chunkPoint.copy(worldPoint).applyMatrix4(chunkWorldInverse);
      positions.push(chunkPoint.x, chunkPoint.y, chunkPoint.z);
      colors.push(color.r * alpha, color.g * alpha, color.b * alpha);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  const merged = new THREE.LineSegments(geometry, staticCityLineMaterial);
  merged.frustumCulled = false;

  for (const line of lineObjects) {
    line.parent?.remove(line);
    line.geometry.dispose();
    const material = Array.isArray(line.material) ? line.material : [line.material];
    for (const item of material) {
      if (item && !item.userData?.keepAlive) item.dispose();
    }
  }
  pruneEmptyGroups(chunkGroup);
  chunkGroup.add(merged);
}

function pruneEmptyGroups(root) {
  for (let i = root.children.length - 1; i >= 0; i -= 1) {
    const child = root.children[i];
    pruneEmptyGroups(child);
    if (child.isGroup && child.children.length === 0) root.remove(child);
  }
}

function makeTerrainMap(chunkX, chunkY) {
  const originX = chunkX * CHUNK_SIZE;
  const originY = chunkY * CHUNK_SIZE;
  if (originY + CHUNK_SIZE < CITY_EDGE_Y) return new THREE.Group();

  const segments = Math.ceil(CHUNK_SIZE / TERRAIN_GRID_STEP);
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  let cursor = 0;
  for (let iy = 0; iy <= segments; iy += 1) {
    const y = originY + (iy / segments) * CHUNK_SIZE;
    for (let ix = 0; ix <= segments; ix += 1) {
      const x = originX + (ix / segments) * CHUNK_SIZE;
      const z = getTerrainZ(x, y);
      positions[cursor * 3] = x;
      positions[cursor * 3 + 1] = y;
      positions[cursor * 3 + 2] = z;
      cursor += 1;
    }
  }

  const stride = segments + 1;
  const gridBatch = makeLineBatch(new THREE.LineBasicMaterial({
    color: 0x284f5e,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
  }));
  const contourBatch = makeLineBatch(new THREE.LineBasicMaterial({
    color: 0x86c7d7,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
  }));
  const dropBatch = makeLineBatch(new THREE.LineBasicMaterial({
    color: 0x1a3945,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
  }));

  for (let iy = 0; iy <= segments; iy += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = (iy * stride + ix) * 3;
      const b = a + 3;
      addBatchLine3D(gridBatch, positions[a], positions[a + 1], positions[a + 2], positions[b], positions[b + 1], positions[b + 2]);
    }
  }
  for (let ix = 0; ix <= segments; ix += 1) {
    for (let iy = 0; iy < segments; iy += 1) {
      const a = (iy * stride + ix) * 3;
      const b = ((iy + 1) * stride + ix) * 3;
      addBatchLine3D(gridBatch, positions[a], positions[a + 1], positions[a + 2], positions[b], positions[b + 1], positions[b + 2]);
    }
  }

  const contourLevels = [-1.34, -1.04, -0.74, -0.44, -0.14, 0.16, 0.46];
  for (let iy = 0; iy < segments; iy += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      addTerrainContoursForCell(contourBatch, positions, stride, ix, iy, contourLevels);
      if ((ix + iy) % 4 === 0) {
        const index = (iy * stride + ix) * 3;
        const z = positions[index + 2];
        addBatchLine3D(dropBatch, positions[index], positions[index + 1], TERRAIN_BASE_Z - 0.18, positions[index], positions[index + 1], z);
      }
    }
  }

  const group = new THREE.Group();
  flushLineBatch(group, gridBatch);
  flushLineBatch(group, contourBatch);
  flushLineBatch(group, dropBatch);
  return group;
}

function makeNeonGrid(chunkX, chunkY, rng) {
  const group = new THREE.Group();
  const originX = chunkX * CHUNK_SIZE;
  const originY = chunkY * CHUNK_SIZE;
  if (originY + CHUNK_SIZE < CITY_EDGE_Y) return group;
  const minX = originX - CHUNK_SIZE * 0.2;
  const maxX = originX + CHUNK_SIZE * 1.2;
  const minY = Math.max(CITY_EDGE_Y, originY - CHUNK_SIZE * 0.2);
  const maxY = originY + CHUNK_SIZE * 1.2;
  const streetMaterial = new THREE.LineBasicMaterial({
    color: 0x0a3a22,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
  });
  const routeMaterial = new THREE.LineBasicMaterial({
    color: 0x36ff6e,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
  });
  const trafficMaterial = new THREE.LineBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
  });
  const riverMaterial = new THREE.LineBasicMaterial({
    color: 0x0b6274,
    transparent: true,
    opacity: 0.24,
  });
  const bridgeMaterial = new THREE.LineBasicMaterial({
    color: 0x587f74,
    transparent: true,
    opacity: 0.42,
  });
  const streetBatch = makeLineBatch(streetMaterial);
  const routeBatch = makeLineBatch(routeMaterial);
  const trafficBatch = makeLineBatch(trafficMaterial);
  const riverBatch = makeLineBatch(riverMaterial);
  const bridgeBatch = makeLineBatch(bridgeMaterial);

  addRiverBatch(riverBatch, minY, maxY);

  const yStart = Math.floor(minY / STREET_SPACING) * STREET_SPACING;
  for (let y = yStart; y <= maxY; y += STREET_SPACING) {
    const batch = isMajorRoad(y, AVENUE_SPACING) ? routeBatch : streetBatch;
    addRoadAcrossRiverBatch(batch, bridgeBatch, minX, maxX, y);
  }
  if (CITY_EDGE_Y >= minY && CITY_EDGE_Y <= maxY) {
    addTerrainLine(routeBatch, minX, CITY_EDGE_Y, maxX, CITY_EDGE_Y, 0.12);
  }
  for (let x = Math.floor(minX / STREET_SPACING) * STREET_SPACING; x <= maxX; x += STREET_SPACING) {
    const batch = isMajorRoad(x, AVENUE_SPACING) ? routeBatch : streetBatch;
    addTerrainLine(batch, x, minY, x, maxY, 0.085);
  }

  for (let y = getFirstBridgeY(minY); y <= maxY; y += BRIDGE_SPACING) {
    addBridgeBatch(bridgeBatch, y);
  }

  const markerX = originX + (rng() - 0.5) * 0.2;
  const markerBatch = makeLineBatch(new THREE.LineBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
  }));
  addTerrainLine(markerBatch, markerX, minY, markerX, Math.min(maxY, minY + 11), 0.16);
  for (let y = Math.floor(minY / 3.2) * 3.2; y <= maxY + 2; y += 3.2) {
    for (const x of [-22.8, -18.2, -13.6, -9.4, -2.2, 3.4, 8.8, 14.7, 18.6, 23.2]) {
      const dash = 0.55 + rng() * 0.7;
      const worldX = x + originX;
      const worldY = y + (rng() - 0.5) * 0.35;
      if (!isInRiver(worldX, worldY, 1.6)) addTerrainLine(trafficBatch, worldX, worldY, worldX, worldY + dash, 0.14, 1.8);
    }
  }
  flushLineBatch(group, riverBatch);
  flushLineBatch(group, streetBatch);
  flushLineBatch(group, routeBatch);
  flushLineBatch(group, bridgeBatch);
  flushLineBatch(group, trafficBatch);
  flushLineBatch(group, markerBatch);
  return group;
}

function makeCityBlocks(chunkX, chunkY, rng, chunkPads) {
  const group = new THREE.Group();
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x36ff6e,
    transparent: true,
    opacity: 0.44,
    blending: THREE.AdditiveBlending,
  });
  const detailMaterial = new THREE.LineBasicMaterial({
    color: 0x12693a,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
  });
  const accentMaterial = new THREE.LineBasicMaterial({
    color: 0xff2b2b,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
  });
  const batches = {
    edge: makeLineBatch(edgeMaterial),
    detail: makeLineBatch(detailMaterial),
    accent: makeLineBatch(accentMaterial),
  };

  const originX = chunkX * CHUNK_SIZE;
  const originY = chunkY * CHUNK_SIZE;
  if (originY + CHUNK_SIZE < CITY_EDGE_Y) return group;
  const startX = Math.floor(originX / STREET_SPACING) * STREET_SPACING;
  const startY = Math.floor(Math.max(CITY_EDGE_Y, originY) / STREET_SPACING) * STREET_SPACING;
  for (let x = startX; x < originX + CHUNK_SIZE + STREET_SPACING; x += STREET_SPACING) {
    for (let y = startY; y < originY + CHUNK_SIZE + STREET_SPACING; y += STREET_SPACING) {
      const blockCx = x + STREET_SPACING * 0.5;
      const blockCy = y + STREET_SPACING * 0.5;
      if (blockCy < CITY_EDGE_Y + 1 || isInRiver(blockCx, blockCy, STREET_SPACING * 0.78)) continue;
      addCityBlock(group, batches, blockCx, blockCy, STREET_SPACING * 0.74, STREET_SPACING * 0.74, rng, chunkPads);
    }
  }

  const stripCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < stripCount; i += 1) {
    const y = Math.max(CITY_EDGE_Y + 1, originY + rng() * CHUNK_SIZE);
    const width = CHUNK_SIZE * 0.9;
    const x0 = originX - width * 0.45;
    const x1 = originX + width * 0.55;
    addTerrainLine(batches.accent, x0, y, x1, y + (rng() - 0.5) * 2.4, 0.18);
    addTerrainLine(batches.accent, x0, y + 2.4, x1, y, 0.18);
  }

  const groundLauncherCount = (rng() < 0.62 ? 1 : 0) + (rng() < 0.18 ? 1 : 0);
  for (let i = 0; i < groundLauncherCount; i += 1) {
    const x = originX + rng() * CHUNK_SIZE;
    const y = Math.max(CITY_EDGE_Y + 1, originY + rng() * CHUNK_SIZE);
    if (!canPlaceBuilding(x, y)) continue;
    const launcher = makeLauncher(x, y, getTerrainZ(x, y) + 0.24, rng);
    group.add(launcher.mesh);
    chunkPads.push(launcher);
  }
  flushLineBatch(group, batches.edge);
  flushLineBatch(group, batches.detail);
  flushLineBatch(group, batches.accent);
  return group;
}

function addCityBlock(group, batches, cx, cy, blockW, blockH, rng, chunkPads) {
  const density = getDensity(cx, cy);
  if (rng() > 0.14 + density * 0.86) return;
  addBatchRectLine(batches.detail, cx, cy, blockW, blockH, getTerrainZ(cx, cy) + 0.095);

  const district = getDistrictType(cx, cy);
  const parcelGrid = density > 0.74 ? 3 : (density > 0.42 ? 2 : 1);
  const parcelW = blockW / parcelGrid;
  const parcelH = blockH / parcelGrid;
  for (let ix = 0; ix < parcelGrid; ix += 1) {
    for (let iy = 0; iy < parcelGrid; iy += 1) {
      const parcelDensity = density + (rng() - 0.5) * 0.18;
      if (rng() > 0.22 + parcelDensity * 0.78) continue;
      const x = cx - blockW * 0.5 + parcelW * (ix + 0.5) + (rng() - 0.5) * parcelW * 0.15;
      const y = cy - blockH * 0.5 + parcelH * (iy + 0.5) + (rng() - 0.5) * parcelH * 0.15;
      if (!canPlaceBuilding(x, y)) continue;
      const localDistrict = district === 'tower' && rng() < 0.18 ? 'commercial' : district;
      const dimensions = getBuildingDimensions(localDistrict, rng, parcelW, parcelH);
      addBuilding(group, batches, x, y, dimensions.w, dimensions.h, localDistrict, rng, chunkPads);
    }
  }
}

function addBuilding(group, batches, x, y, w, h, district, rng, chunkPads) {
  const height = getBuildingHeight(district, x, y, rng);
  const baseZ = getTerrainZ(x, y) + 0.06;
  const roofZ = baseZ + height;
  addBatchWireBox(batches.edge, x, y, w, h, height, baseZ);
  addBatchRectLine(batches.detail, x, y, w * 0.68, h * 0.68, roofZ + 0.02);
  addBuildingTypeDetails(batches, x, y, w, h, height, baseZ, district, rng);

  const insetW = Math.max(0.34, w * 0.22);
  const insetH = Math.max(0.36, h * 0.18);
  addBatchRectLine(
    batches.accent,
    x + (rng() - 0.5) * w * 0.26,
    y + (rng() - 0.5) * h * 0.26,
    insetW,
    insetH,
    roofZ + 0.04
  );

  const verticals = Math.max(1, Math.floor(w / 0.55));
  for (let i = 1; i < verticals; i += 1) {
    const px = x - w / 2 + (i / verticals) * w;
    addBatchLine3D(batches.detail, px, y - h / 2, baseZ + 0.04, px, y - h / 2, roofZ - 0.08);
    addBatchLine3D(batches.detail, px, y + h / 2, baseZ + 0.04, px, y + h / 2, roofZ - 0.08);
  }

  const floors = Math.max(1, Math.floor(height / 0.42));
  for (let i = 1; i < floors; i += 1) {
    const z = baseZ + (i / floors) * height;
    addBatchLine3D(batches.detail, x - w / 2, y - h / 2, z, x + w / 2, y - h / 2, z);
    addBatchLine3D(batches.detail, x - w / 2, y + h / 2, z, x + w / 2, y + h / 2, z);
    addBatchLine3D(batches.detail, x - w / 2, y - h / 2, z, x - w / 2, y + h / 2, z);
    addBatchLine3D(batches.detail, x + w / 2, y - h / 2, z, x + w / 2, y + h / 2, z);
  }

  if (rng() < 0.7) {
    const antennaX = x + (rng() - 0.5) * w * 0.5;
    const antennaY = y + (rng() - 0.5) * h * 0.5;
    addBatchLine3D(batches.accent, antennaX, antennaY, roofZ, antennaX + (rng() - 0.5) * 0.45, antennaY + (rng() - 0.5) * 0.45, roofZ + 0.55 + rng() * 0.75);
  }

  if (rng() < (district === 'industrial' ? 0.075 : 0.035) && chunkPads) {
    const launcher = makeLauncher(x, y, roofZ + 0.16, rng);
    group.add(launcher.mesh);
    chunkPads.push(launcher);
  }
}

function getRiverCenterX(y) {
  return Math.sin(y * 0.032) * 10.5 + Math.sin(y * 0.011 + 1.7) * 5.5;
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getTerrainZ(x, y) {
  const hills =
    Math.sin(x * 0.043 + y * 0.017) * 0.46 +
    Math.sin(x * 0.021 - y * 0.037 + 1.8) * 0.34 +
    Math.sin((x + y) * 0.014 + Math.sin(y * 0.018) * 1.4) * 0.28;
  const density = getDensity(x, y);
  const downtownGrade = density * 0.48;
  const riverDistance = Math.abs(x - getRiverCenterX(y));
  const riverCut = 1 - smoothstep(RIVER_WIDTH * 0.42, RIVER_WIDTH * 1.35, riverDistance);
  const bankLift = smoothstep(RIVER_WIDTH * 0.75, RIVER_WIDTH * 2.7, riverDistance) * 0.24;
  return TERRAIN_BASE_Z + hills * TERRAIN_HEIGHT_SCALE * 0.5 + downtownGrade + bankLift - riverCut * 0.82;
}

function getPlayerFlightZ(x, y, time = 0, speed = PLAYER_CRUISE_SPEED, bank = 0) {
  const speed01 = THREE.MathUtils.clamp(speed / PLAYER_MAX_SPEED, 0, AFTERBURNER_MAX_SPEED_MULT);
  const bankLift = Math.abs(bank) / PLAYER_MAX_ROLL * PLAYER_ALTITUDE_VARIATION * 0.42;
  const speedLift = speed01 * PLAYER_ALTITUDE_VARIATION * 0.34;
  const terrainBreathing =
    Math.sin(y * 0.049 + time * 1.2) * PLAYER_ALTITUDE_VARIATION * 0.18 +
    Math.sin(x * 0.081 - time * 0.85) * PLAYER_ALTITUDE_VARIATION * 0.11;
  return getTerrainZ(x, y) + PLAYER_TERRAIN_CLEARANCE + speedLift + bankLift + terrainBreathing;
}

function getMissileFlightZ(x, y) {
  return getTerrainZ(x, y) + MISSILE_TERRAIN_CLEARANCE;
}

function addTerrainContoursForCell(batch, positions, stride, ix, iy, levels) {
  const corners = [
    getTerrainGridPoint(positions, stride, ix, iy),
    getTerrainGridPoint(positions, stride, ix + 1, iy),
    getTerrainGridPoint(positions, stride, ix + 1, iy + 1),
    getTerrainGridPoint(positions, stride, ix, iy + 1),
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (const level of levels) {
    const hits = [];
    for (const [aIndex, bIndex] of edges) {
      const a = corners[aIndex];
      const b = corners[bIndex];
      const minZ = Math.min(a.z, b.z);
      const maxZ = Math.max(a.z, b.z);
      if (level < minZ || level > maxZ || Math.abs(a.z - b.z) < 0.0001) continue;
      const t = (level - a.z) / (b.z - a.z);
      hits.push({
        x: THREE.MathUtils.lerp(a.x, b.x, t),
        y: THREE.MathUtils.lerp(a.y, b.y, t),
        z: level + 0.045,
      });
    }
    if (hits.length >= 2) {
      addBatchLine3D(batch, hits[0].x, hits[0].y, hits[0].z, hits[1].x, hits[1].y, hits[1].z);
      if (hits.length >= 4) addBatchLine3D(batch, hits[2].x, hits[2].y, hits[2].z, hits[3].x, hits[3].y, hits[3].z);
    }
  }
}

function getTerrainGridPoint(positions, stride, ix, iy) {
  const index = (iy * stride + ix) * 3;
  return {
    x: positions[index],
    y: positions[index + 1],
    z: positions[index + 2],
  };
}

function isInRiver(x, y, padding = 0) {
  return Math.abs(x - getRiverCenterX(y)) < RIVER_WIDTH * 0.5 + padding;
}

function isMajorRoad(value, spacing) {
  return Math.abs(value / spacing - Math.round(value / spacing)) < 0.04;
}

function isNearRoad(x, y, padding = 1.25) {
  const xRoad = Math.abs(x / STREET_SPACING - Math.round(x / STREET_SPACING)) * STREET_SPACING;
  const yRoad = Math.abs(y / STREET_SPACING - Math.round(y / STREET_SPACING)) * STREET_SPACING;
  return xRoad < padding || yRoad < padding;
}

function canPlaceBuilding(x, y) {
  return !isInRiver(x, y, 3.1) && !isNearRoad(x, y, 1.15);
}

function getDensity(x, y) {
  const downtownDx = x / 34;
  const downtownDy = (y - DOWNTOWN_CENTER_Y) / 82;
  const downtown = Math.max(0, 1 - Math.sqrt(downtownDx * downtownDx + downtownDy * downtownDy));
  const innerCity = Math.max(0, 1 - Math.abs(y - DOWNTOWN_CENTER_Y) / 190) * Math.max(0, 1 - Math.abs(x) / 95);
  return THREE.MathUtils.clamp(0.12 + downtown * 0.78 + innerCity * 0.28, 0.08, 1);
}

function getDistrictType(x, y) {
  const density = getDensity(x, y);
  if (density > 0.72) return 'tower';
  if (x < -34 || y < CITY_EDGE_Y + 52) return 'industrial';
  if (Math.abs(x - getRiverCenterX(y)) < RIVER_WIDTH * 1.8) return 'commercial';
  return 'residential';
}

function getBuildingDimensions(district, rng, parcelW = STREET_SPACING * 0.7, parcelH = STREET_SPACING * 0.7) {
  const maxW = Math.max(0.8, parcelW * 0.82);
  const maxH = Math.max(0.8, parcelH * 0.82);
  if (district === 'tower') return { w: Math.min(maxW, 1.6 + rng() * 1.8), h: Math.min(maxH, 1.8 + rng() * 2.1) };
  if (district === 'industrial') return { w: Math.min(maxW, 3.0 + rng() * 2.8), h: Math.min(maxH, 2.8 + rng() * 2.7) };
  if (district === 'commercial') return { w: Math.min(maxW, 2.3 + rng() * 2.2), h: Math.min(maxH, 2.2 + rng() * 2.4) };
  return { w: Math.min(maxW, 1.6 + rng() * 1.9), h: Math.min(maxH, 1.8 + rng() * 2.0) };
}

function getBuildingHeight(district, x, y, rng) {
  const density = getDensity(x, y);
  if (district === 'tower') return 6.5 + density * 9.5 + rng() * 8.5;
  if (district === 'industrial') return 0.75 + rng() * 1.65;
  if (district === 'commercial') return 1.8 + density * 2.2 + rng() * 3.4;
  const roadBoost = isNearRoad(x, y, 2.6) ? 0.8 : 0;
  return 0.9 + roadBoost + density * 1.6 + rng() * 2.1;
}

function addBuildingTypeDetails(batches, x, y, w, h, height, baseZ, district, rng) {
  const roofZ = baseZ + height;
  if (district === 'tower') {
    addBatchRectLine(batches.accent, x, y, w * 0.46, h * 0.46, roofZ + 0.16);
    addBatchLine3D(batches.accent, x, y, roofZ, x, y, roofZ + 1.2 + rng() * 1.4);
    if (rng() < 0.55) {
      addBatchRectLine(batches.detail, x, y, w * 1.22, h * 1.22, baseZ + height * 0.58);
    }
    return;
  }
  if (district === 'industrial') {
    const stackX = x + (rng() - 0.5) * w * 0.58;
    const stackY = y + (rng() - 0.5) * h * 0.58;
    addBatchWireBox(batches.accent, stackX, stackY, 0.34, 0.34, 1.0 + rng() * 1.2, roofZ);
    addBatchLine(batches.detail, x - w * 0.42, y, x + w * 0.42, y, roofZ + 0.08);
    addBatchLine(batches.detail, x, y - h * 0.42, x, y + h * 0.42, roofZ + 0.08);
    if (rng() < 0.72) addBatchRectLine(batches.accent, x, y, w * 0.62, h * 0.36, roofZ + 0.12);
    return;
  }
  if (district === 'commercial') {
    addBatchRectLine(batches.accent, x, y, w * 0.9, h * 0.18, baseZ + height * 0.45);
    addBatchRectLine(batches.accent, x, y, w * 0.9, h * 0.18, baseZ + height * 0.75);
    if (rng() < 0.5) addBatchLine3D(batches.detail, x - w * 0.5, y, baseZ + 0.14, x + w * 0.5, y, baseZ + 0.14);
    return;
  }
  const rowCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < rowCount; i += 1) {
    const py = y - h * 0.35 + (i / Math.max(1, rowCount - 1)) * h * 0.7;
    addBatchLine(batches.detail, x - w * 0.42, py, x + w * 0.42, py, roofZ + 0.05);
  }
}

function addRiverBatch(batch, minY, maxY) {
  let prev = null;
  let prevLeft = null;
  let prevRight = null;
  for (let y = minY - 4; y <= maxY + 4; y += 3.5) {
    const x = getRiverCenterX(y);
    const center = { x, y, z: getTerrainZ(x, y) + 0.09 };
    const left = { x: x - RIVER_WIDTH * 0.5, y, z: getTerrainZ(x - RIVER_WIDTH * 0.5, y) + 0.1 };
    const right = { x: x + RIVER_WIDTH * 0.5, y, z: getTerrainZ(x + RIVER_WIDTH * 0.5, y) + 0.1 };
    if (prev) addBatchLine3D(batch, prev.x, prev.y, prev.z, center.x, center.y, center.z);
    if (prevLeft) addBatchLine3D(batch, prevLeft.x, prevLeft.y, prevLeft.z, left.x, left.y, left.z);
    if (prevRight) addBatchLine3D(batch, prevRight.x, prevRight.y, prevRight.z, right.x, right.y, right.z);
    prev = center;
    prevLeft = left;
    prevRight = right;
  }
}

function addRoadAcrossRiverBatch(batch, bridgeBatch, minX, maxX, y) {
  const riverX = getRiverCenterX(y);
  const margin = RIVER_WIDTH * 0.62;
  if (isBridgeY(y)) {
    addTerrainLine(batch, minX, y, maxX, y, 0.1);
    addBridgeBatch(bridgeBatch, y);
    return;
  }
  addTerrainLine(batch, minX, y, riverX - margin, y, 0.085);
  addTerrainLine(batch, riverX + margin, y, maxX, y, 0.085);
}

function isBridgeY(y) {
  const offset = Math.abs(y - getFirstBridgeY(y));
  return offset < 1.6 || Math.abs(offset - BRIDGE_SPACING) < 1.6;
}

function getFirstBridgeY(minY) {
  return Math.ceil((minY - CITY_EDGE_Y) / BRIDGE_SPACING) * BRIDGE_SPACING + CITY_EDGE_Y;
}

function addBridgeBatch(batch, y) {
  const x = getRiverCenterX(y);
  const half = RIVER_WIDTH * 0.76;
  const z = Math.max(getTerrainZ(x - half, y), getTerrainZ(x + half, y)) + 0.32;
  addBatchLine(batch, x - half, y - 1.15, x + half, y - 1.15, z);
  addBatchLine(batch, x - half, y + 1.15, x + half, y + 1.15, z);
  addBatchLine(batch, x - half, y - 1.15, x + half, y + 1.15, z);
  addBatchLine(batch, x - half, y + 1.15, x + half, y - 1.15, z);
}

function makeTargetTower() {
  const group = new THREE.Group();
  const targetX = TARGET.x;
  const targetY = TARGET.y;
  const baseZ = getTerrainZ(targetX, targetY) + 0.08;
  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 0.26,
    wireframe: true,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xffae2b,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
  });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 3.0), bodyMaterial);
  tower.position.set(targetX, targetY, baseZ + 1.5);
  tower.rotation.z = Math.PI / 4;
  group.add(tower);

  const towerTopZ = baseZ + 3.08;
  for (const scale of [1, 1.55, 2.1]) {
    const marker = makeRectLine(targetX, targetY, 4.4 * scale, 4.4 * scale, edgeMaterial, towerTopZ);
    marker.rotation.z = Math.PI / 4;
    group.add(marker);
  }
  group.add(makeLine(targetX - 2.9, targetY, targetX + 2.9, targetY, edgeMaterial, towerTopZ));
  group.add(makeLine(targetX, targetY - 2.9, targetX, targetY + 2.9, edgeMaterial, towerTopZ));
  return group;
}

function makeLine(x1, y1, x2, y2, material, z = CITY_Z) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x2, y2, z),
    ]),
    material
  );
}

function makeLine3D(x1, y1, z1, x2, y2, z2, material) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]),
    material
  );
}

function makeRectLine(x, y, w, h, material, z = CITY_Z + 0.02) {
  const points = [
    new THREE.Vector3(x - w / 2, y - h / 2, z),
    new THREE.Vector3(x + w / 2, y - h / 2, z),
    new THREE.Vector3(x + w / 2, y + h / 2, z),
    new THREE.Vector3(x - w / 2, y + h / 2, z),
    new THREE.Vector3(x - w / 2, y - h / 2, z),
  ];
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function makeWireBox(x, y, w, h, height, material) {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, height));
  const box = new THREE.LineSegments(geometry, material);
  box.position.set(x, y, CITY_Z + height / 2);
  return box;
}

function makeStarField() {
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const x = (Math.random() - 0.5) * 52;
    const y = (Math.random() - 0.5) * 180;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = -8 - Math.random() * 16;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0x36ff6e, size: 0.035, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
  );
}
