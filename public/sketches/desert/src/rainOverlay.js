import * as THREE from 'three';

const DROP_COUNT = 860;
const SPLASH_COUNT = 80;
const VOLUME_HALF_WIDTH = 36;
const VOLUME_TOP = 24;
const VOLUME_BOTTOM = -9;
const VOLUME_NEAR = 3;
const VOLUME_FAR = 68;
const BASE_WIND = new THREE.Vector3(-0.36, -1.0, -0.18).normalize();

export function createRainOverlay(scene, camera) {
  const positions = new Float32Array(DROP_COUNT * 4 * 3);
  const uvs = new Float32Array(DROP_COUNT * 4 * 2);
  const colors = new Float32Array(DROP_COUNT * 4 * 3);
  const indices = new Uint16Array(DROP_COUNT * 6);
  const drops = Array.from({ length: DROP_COUNT }, createDrop);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 90);
  fillQuadUvsAndIndices(uvs, indices);

  const rainTexture = createRainStreakTexture();
  const material = new THREE.MeshBasicMaterial({
    map: rainTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    fog: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  const rainMesh = new THREE.Mesh(geometry, material);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 30;

  const splashPositions = new Float32Array(SPLASH_COUNT * 2 * 3);
  const splashColors = new Float32Array(SPLASH_COUNT * 2 * 3);
  const splashes = Array.from({ length: SPLASH_COUNT }, createSplash);
  const splashGeometry = new THREE.BufferGeometry();
  splashGeometry.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
  splashGeometry.setAttribute('color', new THREE.BufferAttribute(splashColors, 3));
  splashGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 90);
  const splashMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  const splashLines = new THREE.LineSegments(splashGeometry, splashMaterial);
  splashLines.frustumCulled = false;
  splashLines.renderOrder = 31;

  const group = new THREE.Group();
  group.visible = false;
  group.add(rainMesh, splashLines);
  scene.add(group);

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const cameraHorizontal = new THREE.Vector3();
  const rainDirection = new THREE.Vector3();
  const streakRight = new THREE.Vector3();
  const head = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const splashA = new THREE.Vector3();
  const splashB = new THREE.Vector3();
  let active = false;
  let intensity = 0;

  function setActive(nextActive) {
    if (active === nextActive) return;
    active = nextActive;
    group.visible = nextActive;
    if (nextActive) {
      for (const drop of drops) resetDrop(drop, true);
      for (const splash of splashes) resetSplash(splash, true);
    } else {
      intensity = 0;
      material.opacity = 0;
      splashMaterial.opacity = 0;
    }
  }

  function update(deltaSeconds) {
    if (!active) return;
    intensity = Math.min(1, intensity + deltaSeconds * 2.4);
    updateCameraBasis(camera, right, up, forward);
    cameraHorizontal.copy(forward);
    cameraHorizontal.y = 0;
    if (cameraHorizontal.lengthSq() > 0.0001) {
      cameraHorizontal.normalize();
    } else {
      cameraHorizontal.set(0, 0, -1);
    }

    rainDirection.copy(BASE_WIND).addScaledVector(cameraHorizontal, 0.24).normalize();
    const vx = rainDirection.dot(right);
    const vy = rainDirection.dot(up);
    const vz = rainDirection.dot(forward);
    const dt = Math.min(deltaSeconds, 0.05);

    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      drop.x += vx * drop.speed * dt;
      drop.y += vy * drop.speed * dt;
      drop.z += vz * drop.speed * dt;

      if (
        drop.y < VOLUME_BOTTOM - drop.length ||
        drop.x < -VOLUME_HALF_WIDTH - 8 ||
        drop.x > VOLUME_HALF_WIDTH + 8 ||
        drop.z < VOLUME_NEAR - 8 ||
        drop.z > VOLUME_FAR + 8
      ) {
        resetDrop(drop, false);
      }

      head.copy(camera.position)
        .addScaledVector(right, drop.x)
        .addScaledVector(up, drop.y)
        .addScaledVector(forward, drop.z);
      tail.copy(head).addScaledVector(rainDirection, -drop.length);
      streakRight.crossVectors(rainDirection, forward);
      if (streakRight.lengthSq() < 0.0001) streakRight.copy(right);
      streakRight.normalize().multiplyScalar(drop.width);

      const offset = i * 12;
      corner.copy(head).add(streakRight);
      writePoint(positions, offset, corner);
      corner.copy(head).sub(streakRight);
      writePoint(positions, offset + 3, corner);
      corner.copy(tail).sub(streakRight);
      writePoint(positions, offset + 6, corner);
      corner.copy(tail).add(streakRight);
      writePoint(positions, offset + 9, corner);

      const colorOffset = i * 12;
      const lift = drop.brightness * intensity;
      writeColor(colors, colorOffset, 0.78 * lift, 0.86 * lift, 0.90 * lift);
      writeColor(colors, colorOffset + 3, 0.78 * lift, 0.86 * lift, 0.90 * lift);
      writeColor(colors, colorOffset + 6, 0.42 * lift, 0.55 * lift, 0.62 * lift);
      writeColor(colors, colorOffset + 9, 0.42 * lift, 0.55 * lift, 0.62 * lift);
    }

    updateSplashes(dt, right, up, forward, intensity);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    splashGeometry.attributes.position.needsUpdate = true;
    splashGeometry.attributes.color.needsUpdate = true;
    material.opacity = 0.92 * intensity;
    splashMaterial.opacity = 0.55 * intensity;
  }

  function updateSplashes(deltaSeconds, right, up, forward, amount) {
    for (let i = 0; i < splashes.length; i++) {
      const splash = splashes[i];
      splash.t += deltaSeconds * splash.speed;
      if (splash.t >= 1) resetSplash(splash, false);

      const wave = Math.sin(splash.t * Math.PI);
      const groundY = VOLUME_BOTTOM + splash.depth * 4.5;
      const x = splash.x + vxJitter(splash) * splash.t;
      const z = splash.z + splash.wind * splash.t;
      const spread = splash.size * wave;

      splashA.copy(camera.position)
        .addScaledVector(right, x - spread)
        .addScaledVector(up, groundY)
        .addScaledVector(forward, z);
      splashB.copy(camera.position)
        .addScaledVector(right, x + spread * 0.72)
        .addScaledVector(up, groundY + spread * 0.08)
        .addScaledVector(forward, z + spread * 0.10);

      const offset = i * 6;
      writePoint(splashPositions, offset, splashA);
      writePoint(splashPositions, offset + 3, splashB);

      const colorOffset = i * 6;
      const lift = (1 - splash.t) * amount * splash.brightness;
      splashColors[colorOffset] = 0.36 * lift;
      splashColors[colorOffset + 1] = 0.54 * lift;
      splashColors[colorOffset + 2] = 0.62 * lift;
      splashColors[colorOffset + 3] = 0.20 * lift;
      splashColors[colorOffset + 4] = 0.33 * lift;
      splashColors[colorOffset + 5] = 0.38 * lift;
    }
  }

  return { setActive, update, resize: () => {} };
}

function updateCameraBasis(camera, right, up, forward) {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  right.set(e[0], e[1], e[2]).normalize();
  up.set(e[4], e[5], e[6]).normalize();
  camera.getWorldDirection(forward);
}

function createDrop() {
  const drop = {};
  resetDrop(drop, true);
  return drop;
}

function resetDrop(drop, randomizeY) {
  const depth = Math.random();
  drop.x = randomRange(-VOLUME_HALF_WIDTH, VOLUME_HALF_WIDTH);
  drop.y = randomizeY ? randomRange(VOLUME_BOTTOM, VOLUME_TOP) : randomRange(VOLUME_TOP * 0.82, VOLUME_TOP + 14);
  drop.z = randomRange(VOLUME_NEAR, VOLUME_FAR);
  drop.length = randomRange(2.8, 7.2) * lerp(0.72, 1.35, depth);
  drop.width = randomRange(0.045, 0.14) * lerp(0.85, 1.7, depth);
  drop.speed = randomRange(38, 62) * lerp(0.80, 1.25, depth);
  drop.brightness = randomRange(0.36, 0.82) * lerp(0.75, 1.12, depth);
}

function createSplash() {
  const splash = {};
  resetSplash(splash, true);
  return splash;
}

function resetSplash(splash, randomizeTime) {
  splash.x = randomRange(-VOLUME_HALF_WIDTH * 0.92, VOLUME_HALF_WIDTH * 0.92);
  splash.z = randomRange(VOLUME_NEAR + 2, VOLUME_FAR * 0.78);
  splash.depth = Math.random();
  splash.size = randomRange(0.16, 0.56);
  splash.speed = randomRange(1.7, 4.1);
  splash.wind = randomRange(-1.5, 0.45);
  splash.side = randomRange(-0.8, 0.8);
  splash.brightness = randomRange(0.25, 0.72);
  splash.t = randomizeTime ? Math.random() : 0;
}

function vxJitter(splash) {
  return splash.side * 0.65;
}

function writePoint(array, offset, point) {
  array[offset] = point.x;
  array[offset + 1] = point.y;
  array[offset + 2] = point.z;
}

function writeColor(array, offset, r, g, b) {
  array[offset] = r;
  array[offset + 1] = g;
  array[offset + 2] = b;
}

function fillQuadUvsAndIndices(uvs, indices) {
  for (let i = 0; i < DROP_COUNT; i++) {
    const vertexOffset = i * 4;
    const uvOffset = i * 8;
    uvs[uvOffset] = 1;
    uvs[uvOffset + 1] = 1;
    uvs[uvOffset + 2] = 0;
    uvs[uvOffset + 3] = 1;
    uvs[uvOffset + 4] = 0;
    uvs[uvOffset + 5] = 0;
    uvs[uvOffset + 6] = 1;
    uvs[uvOffset + 7] = 0;

    const indexOffset = i * 6;
    indices[indexOffset] = vertexOffset;
    indices[indexOffset + 1] = vertexOffset + 1;
    indices[indexOffset + 2] = vertexOffset + 2;
    indices[indexOffset + 3] = vertexOffset;
    indices[indexOffset + 4] = vertexOffset + 2;
    indices[indexOffset + 5] = vertexOffset + 3;
  }
}

function createRainStreakTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const center = canvas.width / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const lengthFade = context.createLinearGradient(0, 0, 0, canvas.height);
  lengthFade.addColorStop(0.00, 'rgba(255,255,255,0.00)');
  lengthFade.addColorStop(0.10, 'rgba(255,255,255,0.34)');
  lengthFade.addColorStop(0.32, 'rgba(255,255,255,0.70)');
  lengthFade.addColorStop(0.70, 'rgba(255,255,255,0.25)');
  lengthFade.addColorStop(1.00, 'rgba(255,255,255,0.00)');

  const widthFade = context.createRadialGradient(center, canvas.height * 0.42, 0, center, canvas.height * 0.42, 14);
  widthFade.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  widthFade.addColorStop(0.22, 'rgba(255,255,255,0.56)');
  widthFade.addColorStop(0.62, 'rgba(255,255,255,0.16)');
  widthFade.addColorStop(1.00, 'rgba(255,255,255,0.00)');

  context.globalCompositeOperation = 'source-over';
  context.fillStyle = widthFade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = lengthFade;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function randomRange(min, max) {
  return min + (max - min) * Math.random();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
