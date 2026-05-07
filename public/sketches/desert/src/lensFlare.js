import * as THREE from 'three';

function createRadialTexture({
  size = 256,
  inner = 'rgba(255,245,210,1)',
  middle = 'rgba(255,150,68,0.45)',
  outer = 'rgba(255,110,45,0)',
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0.0, inner);
  gradient.addColorStop(0.18, middle);
  gradient.addColorStop(1.0, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRingTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size * 0.5;
  const gradient = ctx.createRadialGradient(center, center, size * 0.20, center, center, center);
  gradient.addColorStop(0.0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.46, 'rgba(255,190,110,0.10)');
  gradient.addColorStop(0.57, 'rgba(255,238,205,0.48)');
  gradient.addColorStop(0.70, 'rgba(245,84,78,0.18)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStreakTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size * 0.5;

  const horizontal = ctx.createLinearGradient(0, center, size, center);
  horizontal.addColorStop(0.0, 'rgba(255,150,70,0)');
  horizontal.addColorStop(0.42, 'rgba(255,185,95,0.12)');
  horizontal.addColorStop(0.50, 'rgba(255,245,210,0.52)');
  horizontal.addColorStop(0.58, 'rgba(255,185,95,0.12)');
  horizontal.addColorStop(1.0, 'rgba(255,150,70,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, center - size * 0.018, size, size * 0.036);

  const vertical = ctx.createLinearGradient(center, 0, center, size);
  vertical.addColorStop(0.0, 'rgba(255,170,90,0)');
  vertical.addColorStop(0.48, 'rgba(255,220,150,0.13)');
  vertical.addColorStop(0.50, 'rgba(255,245,210,0.30)');
  vertical.addColorStop(0.52, 'rgba(255,220,150,0.13)');
  vertical.addColorStop(1.0, 'rgba(255,170,90,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(center - size * 0.010, 0, size * 0.020, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFlareSprite(texture, color, opacity, size, distance) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    opacity,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.frustumCulled = false;
  sprite.renderOrder = 1000;
  return { sprite, material, baseOpacity: opacity, baseSize: size, distance };
}

export function createSunLensFlare(scene) {
  const glowTexture = createRadialTexture();
  const softTexture = createRadialTexture({
    inner: 'rgba(255,236,185,0.9)',
    middle: 'rgba(255,127,69,0.22)',
    outer: 'rgba(255,80,30,0)',
  });
  const violetTexture = createRadialTexture({
    inner: 'rgba(210,190,255,0.58)',
    middle: 'rgba(145,95,255,0.18)',
    outer: 'rgba(80,40,255,0)',
  });
  const ringTexture = createRingTexture();
  const streakTexture = createStreakTexture();

  const group = new THREE.Group();
  group.renderOrder = 1000;
  scene.add(group);

  const elements = [
    createFlareSprite(streakTexture, 0xffcf8a, 0.62, 0.78, 0.00),
    createFlareSprite(glowTexture, 0xffdd9b, 0.70, 0.26, 0.00),
    createFlareSprite(ringTexture, 0xffad72, 0.22, 0.34, 0.35),
    createFlareSprite(softTexture, 0xff865f, 0.26, 0.14, 0.58),
    createFlareSprite(violetTexture, 0x9c78ff, 0.20, 0.20, 0.78),
    createFlareSprite(softTexture, 0xffc27d, 0.18, 0.10, 1.07),
    createFlareSprite(ringTexture, 0xffd2a5, 0.16, 0.26, 1.28),
  ];

  for (const element of elements) {
    group.add(element.sprite);
  }

  const sunWorld = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const flareNdc = new THREE.Vector3();
  const viewportWorld = new THREE.Vector3();

  function setVisible(isVisible) {
    group.visible = isVisible;
  }

  function update({ camera, sunDirection, sunElevation, enabled }) {
    const elevationRelevance = 1 - THREE.MathUtils.smoothstep(sunElevation, 16, 42);
    const horizonLift = THREE.MathUtils.smoothstep(sunElevation, -2, 4);
    const relevance = elevationRelevance * horizonLift;
    if (!enabled || relevance <= 0.01) {
      setVisible(false);
      return;
    }

    sunWorld.copy(camera.position).addScaledVector(sunDirection, 520);
    ndc.copy(sunWorld).project(camera);

    const inFront = ndc.z > -1 && ndc.z < 1;
    const nearScreen = Math.abs(ndc.x) < 1.18 && Math.abs(ndc.y) < 1.18;
    if (!inFront || !nearScreen) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const edgeFade = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 0.78, 1.18);
    const intensity = relevance * edgeFade;
    const depth = 0.16;

    for (const element of elements) {
      flareNdc.set(
        THREE.MathUtils.lerp(ndc.x, -ndc.x, element.distance),
        THREE.MathUtils.lerp(ndc.y, -ndc.y, element.distance),
        depth,
      );
      viewportWorld.copy(flareNdc).unproject(camera);
      element.sprite.position.copy(viewportWorld);

      const distanceToCamera = camera.position.distanceTo(viewportWorld);
      const scale = element.baseSize * distanceToCamera * (0.92 + intensity * 0.38);
      element.sprite.scale.setScalar(scale);
      element.material.opacity = element.baseOpacity * intensity;
    }
  }

  function dispose() {
    scene.remove(group);
    for (const element of elements) {
      element.material.dispose();
    }
    glowTexture.dispose();
    softTexture.dispose();
    violetTexture.dispose();
    ringTexture.dispose();
    streakTexture.dispose();
  }

  return { group, update, dispose };
}
