import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

import { mulberry32 } from './random.js';
import { generateBarrelCactus } from './plants/barrelCactus.js';
import { generateCreosote } from './plants/creosote.js';
import { generateJumpingCholla } from './plants/jumpingCholla.js';
import { generateMesquite } from './plants/mesquite.js';
import { generateOcotillo } from './plants/ocotillo.js';
import { generatePaloVerde } from './plants/paloVerde.js';
import { generatePricklyPear } from './plants/pricklyPear.js';
import { generateSaguaro } from './plants/saguaro.js';
import { createCactusSpineMaterial } from './materials/cactusSpineMaterial.js';
import { createCreosoteMaterial } from './materials/creosoteMaterial.js';
import { createOcotilloMaterial } from './materials/ocotilloMaterial.js';
import { createTreeMaterial } from './materials/treeMaterial.js';
import { installUncharted2Tonemapping } from './tonemapping.js';

installUncharted2Tonemapping(THREE);

const PLANTS = [
  {
    key: 'saguaro',
    label: 'Saguaro',
    shortLabel: 'Saguaro',
    scientific: 'Carnegiea gigantea',
    icon: 'cactus',
    generator: generateSaguaro,
    material: 'cactus',
    defaults: {
      seed: 1101,
      age: 0.78,
      detailScale: 0.78,
      scale: 0.78,
      hydration: 0.36,
      armProbability: 0.90,
      maxHeight: 10,
      flowers: true,
      fruit: true,
    },
    controls: [
      slider('hydration', 'Hydration', 0, 1, 0.01),
      slider('armProbability', 'Arm chance', 0, 1, 0.01),
      slider('maxHeight', 'Max height', 4, 14, 0.1),
      toggle('flowers', 'Flowers'),
      toggle('fruit', 'Fruit'),
    ],
  },
  {
    key: 'barrel',
    label: 'Barrel Cactus',
    shortLabel: 'Barrel',
    scientific: 'Ferocactus wislizeni',
    icon: 'barrel',
    generator: generateBarrelCactus,
    material: 'cactus',
    defaults: {
      seed: 2217,
      age: 0.72,
      detailScale: 0.9,
      scale: 1.2,
      flowering: true,
    },
    controls: [
      toggle('flowering', 'Flowers'),
    ],
  },
  {
    key: 'jumpingCholla',
    label: 'Jumping Cholla',
    shortLabel: 'Cholla',
    scientific: 'Cylindropuntia fulgida',
    icon: 'branch',
    generator: generateJumpingCholla,
    material: 'cactus',
    defaults: {
      seed: 3373,
      age: 0.74,
      detailScale: 0.58,
      scale: 1.0,
      fruitChains: true,
      suppressCloneDetails: false,
      // Mode 11 spine blade controls. Cholla "fur" is many long thin quills
      // radiating in every direction — these knobs shape the halo.
      chollaFinLength: 1.47,     // length multiplier (legacy key, "Spine length")
      chollaSpineCoverage: 0.69, // density multiplier ("Spine density"). 1 = current dense fur, 0 = no fur.
      chollaSpineWidth: 2.7,
      chollaSpineTilt: 1.3,
      chollaSpineColor: '#ffd768',
    },
    controls: [
      slider('chollaFinLength', 'Spine length', 0.45, 1.8, 0.01),
      slider('chollaSpineWidth', 'Spine width', 0.2, 3.0, 0.01),
      slider('chollaSpineCoverage', 'Spine density', 0.0, 1.0, 0.01),
      slider('chollaSpineTilt', 'Spine spread', 0, 1.8, 0.01),
      colorControl('chollaSpineColor', 'Spine color'),
      toggle('fruitChains', 'Fruit chains'),
      toggle('suppressCloneDetails', 'Hide clones'),
    ],
  },
  {
    key: 'paloVerde',
    label: 'Palo Verde',
    shortLabel: 'Palo verde',
    scientific: 'Parkinsonia microphylla',
    icon: 'tree',
    generator: generatePaloVerde,
    material: 'tree',
    defaults: {
      seed: 4481,
      age: 0.70,
      detailScale: 0.68,
      scale: 0.86,
      leafDensity: 0.68,
      flowering: true,
      seedPods: false,
    },
    controls: [
      slider('leafDensity', 'Leaf density', 0, 1, 0.01),
      toggle('flowering', 'Flowers'),
      toggle('seedPods', 'Pods'),
    ],
  },
  {
    key: 'mesquite',
    label: 'Mesquite',
    shortLabel: 'Mesquite',
    scientific: 'Prosopis velutina',
    icon: 'tree',
    generator: generateMesquite,
    material: 'tree',
    defaults: {
      seed: 5519,
      age: 0.72,
      detailScale: 0.62,
      scale: 0.78,
      form: 'wash_floodplain_tree',
      seedPods: true,
      catkins: false,
    },
    controls: [
      choice('form', 'Form', ['upland_or_wash_unspecified', 'wash_floodplain_tree']),
      toggle('seedPods', 'Pods'),
      toggle('catkins', 'Catkins'),
    ],
  },
  {
    key: 'pricklyPear',
    label: 'Prickly Pear',
    shortLabel: 'Prickly pear',
    scientific: 'Opuntia engelmannii',
    icon: 'pad',
    generator: generatePricklyPear,
    material: 'cactus',
    defaults: {
      seed: 6629,
      age: 0.66,
      detailScale: 0.82,
      scale: 1.12,
      flowering: true,
      fruiting: true,
      maxPads: 24,
      suppressCloneDetails: false,
    },
    controls: [
      slider('maxPads', 'Max pads', 3, 48, 1),
      toggle('flowering', 'Flowers'),
      toggle('fruiting', 'Fruit'),
      toggle('suppressCloneDetails', 'Hide clones'),
    ],
  },
  {
    key: 'ocotillo',
    label: 'Ocotillo',
    shortLabel: 'Ocotillo',
    scientific: 'Fouquieria splendens',
    icon: 'wand',
    generator: generateOcotillo,
    material: 'ocotillo',
    defaults: {
      seed: 7741,
      age: 0.76,
      detailScale: 0.76,
      scale: 0.92,
      flowering: true,
      leafFlush: true,
    },
    controls: [
      toggle('flowering', 'Flowers'),
      toggle('leafFlush', 'Leaf flush'),
    ],
  },
  {
    key: 'creosote',
    label: 'Creosote',
    shortLabel: 'Creosote',
    scientific: 'Larrea tridentata',
    icon: 'shrub',
    generator: generateCreosote,
    material: 'creosote',
    defaults: {
      seed: 8837,
      age: 0.76,
      detailScale: 0.78,
      scale: 1.0,
      cloneRing: true,
      cloneRingRadius: 0.55,
      deadInterior: 0.62,
      rainFlush: false,
      flowering: true,
    },
    controls: [
      toggle('cloneRing', 'Clone ring'),
      slider('cloneRingRadius', 'Ring radius', 0, 0.92, 0.01),
      slider('deadInterior', 'Dead center', 0, 1, 0.01),
      toggle('rainFlush', 'Rain flush'),
      toggle('flowering', 'Flowers'),
    ],
  },
];

const PLANT_BY_KEY = Object.fromEntries(PLANTS.map(plant => [plant.key, plant]));
const LAYOUT = new Map(PLANTS.map((plant, index) => {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return [plant.key, new THREE.Vector3((col - 1.5) * 10.5, 0, (row - 0.5) * 10.5)];
}));

const app = document.getElementById('app');
const infoEl = document.getElementById('plant-info');
const toolbarEl = document.getElementById('plant-toolbar');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.CustomToneMapping;
renderer.toneMappingExposure = 1.02;
if ('useLegacyLights' in renderer) renderer.useLegacyLights = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbda780);
scene.fog = new THREE.FogExp2(0xcdb98f, 0.018);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(20, 12, 22);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 90;
controls.target.set(0, 2.5, 0);

const hemi = new THREE.HemisphereLight(0xcde8ff, 0x8c5e39, 0.92);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffefbd, 3.2);
sun.position.set(12, 18, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x87a9d8, 0.65);
fill.position.set(-10, 6, -12);
scene.add(fill);

const specimenRoot = new THREE.Group();
scene.add(specimenRoot);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(36, 96),
  new THREE.MeshStandardMaterial({ color: 0xb89566, roughness: 0.96 }),
);
ground.name = 'plant-lab-ground';
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(72, 24, 0x86694d, 0xa88a62);
grid.material.opacity = 0.18;
grid.material.transparent = true;
grid.position.y = 0.012;
scene.add(grid);

const chollaGlowResolution = new THREE.Vector2();
renderer.getDrawingBufferSize(chollaGlowResolution);
chollaGlowResolution
  .multiplyScalar(0.5)
  .floor()
  .max(new THREE.Vector2(1, 1));
const chollaGlowMaskTarget = new THREE.WebGLRenderTarget(
  chollaGlowResolution.x,
  chollaGlowResolution.y,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  },
);
chollaGlowMaskTarget.texture.name = 'plant-lab-cholla-glow-mask';
const chollaOcclusionTarget = new THREE.WebGLRenderTarget(
  chollaGlowResolution.x,
  chollaGlowResolution.y,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  },
);
chollaOcclusionTarget.texture.name = 'plant-lab-cholla-occlusion-mask';
const chollaGlowMaskMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
  fog: false,
  toneMapped: false,
});
const chollaOcclusionMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  depthTest: true,
  depthWrite: true,
  fog: false,
  toneMapped: false,
});
const chollaGlowMaterial = createChollaGlowMaterial(
  chollaGlowMaskTarget.texture,
  chollaOcclusionTarget.texture,
  chollaGlowResolution,
);
const chollaGlowMaskScene = new THREE.Scene();
const chollaGlowOverlayScene = new THREE.Scene();
const chollaGlowOverlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const chollaGlowOverlayQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), chollaGlowMaterial);
chollaGlowOverlayQuad.frustumCulled = false;
chollaGlowOverlayScene.add(chollaGlowOverlayQuad);
const chollaGlowPreviousClearColor = new THREE.Color();
let chollaGlowMaskMesh = null;

const materials = {
  cactus: createCactusSpineMaterial(),
  tree: createTreeMaterial(),
  ocotillo: createOcotilloMaterial(),
  creosote: createCreosoteMaterial(),
};
materials.cactus.userData.setSeasonalVisibility?.({
  saguaroFlowering: true,
  saguaroFruiting: true,
});
materials.tree.userData.setSeasonalVisibility?.({
  paloVerdeFlowering: true,
  mesquiteSeedPods: true,
});
materials.ocotillo.userData.setSeasonalVisibility?.({
  ocotilloFlowering: true,
});

const plantState = Object.fromEntries(
  PLANTS.map(plant => [plant.key, cloneDefaults(plant.defaults)]),
);

const viewState = {
  selected: 'saguaro',
  view: 'all',
  autoFrame: true,
  labels: true,
  ground: true,
  shadows: true,
  rotate: false,
};

const specimens = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const instanceTransform = new THREE.Object3D();
const chollaHaloCenter = new THREE.Vector3();
const SCATTER_RADIUS = 33;
const MAX_QUANTITY = 250;
let guiRoot = null;
let selectedController = null;
let speciesFolder = null;
let rebuildFrame = 0;

syncChollaHaloUniforms();
buildToolbar();
buildGui();
for (const plant of PLANTS) buildSpecimen(plant.key);
selectPlant(viewState.selected, false);
frameScene();
animate();

window.addEventListener('resize', onResize);
renderer.domElement.addEventListener('pointerdown', onPointerDown);

function buildSpecimen(key) {
  const plant = PLANT_BY_KEY[key];
  const state = plantState[key];
  const existing = specimens.get(key);
  const geometry = plant.generator(mulberry32(Math.floor(state.seed)), generatorOpts(plant, state));
  normalizeGeometry(geometry);
  const bounds = getBounds(geometry);
  const material = materials[plant.material];

  if (existing) {
    existing.group.remove(existing.mesh);
    existing.mesh.geometry.dispose();
    existing.mesh = makePlantMesh(plant, geometry, material, state, bounds);
    existing.group.add(existing.mesh);
    existing.bounds = bounds;
    existing.ring.geometry.dispose();
    existing.ring.geometry = selectionRingGeometry(bounds.radius * state.scale);
    existing.label.position.set(0, bounds.height * state.scale + 0.5, 0);
    syncSeasonalMaterials();
    applyView();
    syncChollaGlowMaskMesh();
    updateInfo();
    if (key === viewState.selected) retargetOrbitToSelected();
    return;
  }

  const mesh = makePlantMesh(plant, geometry, material, state, bounds);

  const group = new THREE.Group();
  group.name = `specimen-${plant.key}`;
  group.position.copy(LAYOUT.get(key));
  group.add(mesh);

  const ring = makeSelectionRing(bounds.radius * state.scale);
  ring.visible = false;
  group.add(ring);

  const label = makeLabelSprite(plant.shortLabel);
  label.position.set(0, bounds.height * state.scale + 0.5, 0);
  group.add(label);

  specimenRoot.add(group);
  specimens.set(key, { group, mesh, ring, label, bounds });
  syncSeasonalMaterials();
  applyView();
  syncChollaGlowMaskMesh();
  updateInfo();
}

function makePlantMesh(plant, geometry, material, state, bounds) {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_QUANTITY);
  mesh.name = plant.key;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.plantKey = plant.key;
  scatterInstances(mesh, plant.key, state, bounds);
  return mesh;
}

function syncChollaGlowMaskMesh() {
  const specimen = specimens.get('jumpingCholla');
  const source = specimen?.mesh;
  if (!source?.geometry) {
    if (chollaGlowMaskMesh) {
      chollaGlowMaskScene.remove(chollaGlowMaskMesh);
      chollaGlowMaskMesh = null;
    }
    return;
  }

  if (!chollaGlowMaskMesh || chollaGlowMaskMesh.geometry !== source.geometry) {
    if (chollaGlowMaskMesh) {
      chollaGlowMaskScene.remove(chollaGlowMaskMesh);
    }
    chollaGlowMaskMesh = new THREE.InstancedMesh(source.geometry, chollaGlowMaskMaterial, MAX_QUANTITY);
    chollaGlowMaskMesh.name = 'plant-lab-cholla-glow-mask';
    chollaGlowMaskMesh.castShadow = false;
    chollaGlowMaskMesh.receiveShadow = false;
    chollaGlowMaskMesh.frustumCulled = false;
    chollaGlowMaskMesh.matrixAutoUpdate = false;
    chollaGlowMaskScene.add(chollaGlowMaskMesh);
  }

  chollaGlowMaskMesh.count = source.count;
  chollaGlowMaskMesh.instanceMatrix.copy(source.instanceMatrix);
  chollaGlowMaskMesh.instanceMatrix.needsUpdate = true;
}

function scatterInstances(mesh, key, state, bounds) {
  const quantity = specimenQuantity(state);
  const rng = mulberry32(Math.floor(state.seed) ^ hashString(key) ^ 0x4c8f13);
  const origin = LAYOUT.get(key) ?? new THREE.Vector3();

  for (let index = 0; index < quantity; index++) {
    const anchored = index === 0;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * SCATTER_RADIUS;
    const x = anchored ? 0 : Math.cos(angle) * radius - origin.x;
    const z = anchored ? 0 : Math.sin(angle) * radius - origin.z;
    const scaleJitter = anchored ? 1 : THREE.MathUtils.lerp(0.82, 1.18, rng());
    instanceTransform.position.set(x, 0, z);
    instanceTransform.rotation.set(0, anchored ? 0 : rng() * Math.PI * 2, 0);
    instanceTransform.scale.setScalar(state.scale * scaleJitter);
    instanceTransform.updateMatrix();
    mesh.setMatrixAt(index, instanceTransform.matrix);
  }

  mesh.count = quantity;
  mesh.userData.quantity = quantity;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  const scatterBounds = Math.max(bounds.sphereRadius * state.scale, SCATTER_RADIUS + bounds.radius * state.scale);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(-origin.x, bounds.height * state.scale * 0.5, -origin.z), scatterBounds);
}

function generatorOpts(plant, state) {
  const opts = {
    age: state.age,
    detailScale: state.detailScale,
    structureDetailScale: 1,
  };
  for (const control of plant.controls) {
    if (!control.renderOnly) opts[control.key] = state[control.key];
  }
  return opts;
}

function normalizeGeometry(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box.min.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function getBounds(geometry) {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  return {
    box,
    height: size.y,
    radius: Math.max(0.8, Math.max(size.x, size.z) * 0.58),
    sphereRadius: geometry.boundingSphere?.radius ?? Math.max(size.x, size.y, size.z),
  };
}

function makeSelectionRing(radius) {
  const geometry = selectionRingGeometry(radius);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd07a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.022;
  return ring;
}

function selectionRingGeometry(radius) {
  return new THREE.RingGeometry(radius * 1.04, radius * 1.12, 96);
}

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 2;
  canvas.width = 256 * scale;
  canvas.height = 64 * scale;
  ctx.scale(scale, scale);
  ctx.font = '800 20px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(32, 22, 14, 0.62)';
  roundedRect(ctx, 18, 11, 220, 42, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 245, 223, 0.22)';
  roundedRect(ctx, 18.5, 11.5, 219, 41, 7);
  ctx.stroke();
  ctx.fillStyle = '#fff5df';
  ctx.fillText(text, 128, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.renderOrder = 100;
  return sprite;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildToolbar() {
  toolbarEl.innerHTML = '';
  for (const plant of PLANTS) {
    const button = document.createElement('button');
    button.className = 'plant-button';
    button.type = 'button';
    button.dataset.plant = plant.key;
    button.innerHTML = `<span class="plant-button__icon">${iconFor(plant.icon)}</span><span>${plant.shortLabel}</span>`;
    button.addEventListener('click', () => selectPlant(plant.key));
    toolbarEl.appendChild(button);
  }
}

function iconFor(name) {
  if (name === 'tree') {
    return '<svg viewBox="0 0 24 24"><path d="M12 21v-7"/><path d="M7 14c-2.5 0-4-1.7-4-3.7 0-1.8 1.2-3.1 2.8-3.5C6.5 4.5 8.6 3 11 3c3.1 0 5.6 2.3 5.9 5.2C19.3 8.7 21 10.6 21 13c0 2.3-1.8 4-4.2 4H8.4"/><path d="M12 14l-3 3"/><path d="M12 14l3 3"/></svg>';
  }
  if (name === 'barrel') {
    return '<svg viewBox="0 0 24 24"><path d="M8 20c-2-1.7-3-4.5-3-8s1-6.3 3-8"/><path d="M16 4c2 1.7 3 4.5 3 8s-1 6.3-3 8"/><path d="M12 3v18"/><path d="M7 8h10"/><path d="M7 16h10"/></svg>';
  }
  if (name === 'pad') {
    return '<svg viewBox="0 0 24 24"><path d="M10.5 20c-3.4-1.2-5.5-4-5.5-7.6C5 8.1 7.6 5 11 5c3.2 0 5.5 2.7 5.5 6.5 0 4.1-2.4 7-6 8.5Z"/><path d="M14.5 13.5c2.4-.7 4.5.8 4.5 3.2 0 2.2-1.5 3.7-3.7 4.1"/><path d="M9 9h.01"/><path d="M12 13h.01"/><path d="M9.5 16.5h.01"/></svg>';
  }
  if (name === 'branch') {
    return '<svg viewBox="0 0 24 24"><path d="M12 21V4"/><path d="M12 10c3.5-.2 5.3-1.6 6-4"/><path d="M12 14c-3-.1-5.2-1.5-6.5-4"/><path d="M12 17c2.8 0 4.8 1.1 6.2 3"/><path d="M9 5h6"/></svg>';
  }
  if (name === 'wand') {
    return '<svg viewBox="0 0 24 24"><path d="M5 21C8 13 8 8 7 3"/><path d="M10 21c1.5-7 2-12 .5-18"/><path d="M15 21c-.4-6 0-12 2-18"/><path d="M17 4l2-2"/><path d="M18.5 6.5l2.5-.7"/></svg>';
  }
  if (name === 'shrub') {
    return '<svg viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M7 20c-2-1-3-2.6-3-4.6 0-2.4 1.8-4.4 4.1-4.6C8.8 8.6 10.8 7 13.2 7c3.3 0 5.8 2.7 5.8 6 0 3.1-2 5.6-5.2 7"/><path d="M9 20c.8-3.3 2.8-5.3 6-6"/></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M12 21V4"/><path d="M8 8c-2 0-3.5 1.3-3.5 3.1S6 14.3 8 14.3"/><path d="M16 11c2 0 3.5 1.3 3.5 3.1S18 17.3 16 17.3"/><path d="M8 8v6"/><path d="M16 11v6"/></svg>';
}

function buildGui() {
  guiRoot = new GUI({ title: 'Plant Lab' });
  selectedController = guiRoot.add(viewState, 'selected', plantOptions()).name('Species').onChange(key => selectPlant(key));
  guiRoot.add(viewState, 'view', ['all', 'selected']).name('View').onChange(() => {
    applyView();
    if (viewState.autoFrame) frameScene();
  });
  guiRoot.add(viewState, 'autoFrame').name('Auto frame');
  guiRoot.add(viewState, 'labels').name('Labels').onChange(applyView);
  guiRoot.add(viewState, 'ground').name('Ground').onChange(applyView);
  guiRoot.add(viewState, 'shadows').name('Shadows').onChange(applyShadowState);
  guiRoot.add(viewState, 'rotate').name('Turntable');
  guiRoot.add({ randomize: () => randomizeSelected() }, 'randomize').name('Random seed');
  guiRoot.add({ reset: () => resetSelected() }, 'reset').name('Reset species');
  speciesFolder = guiRoot.addFolder('Saguaro Parameters');
  rebuildSpeciesFolder();
}

function rebuildSpeciesFolder() {
  if (speciesFolder) speciesFolder.destroy();
  const plant = PLANT_BY_KEY[viewState.selected];
  const state = plantState[plant.key];
  speciesFolder = guiRoot.addFolder(`${plant.label} Parameters`);
  speciesFolder.add(state, 'seed', 1, 99999, 1).name('Seed').onFinishChange(() => scheduleRebuild(plant.key));
  speciesFolder.add(state, 'age', 0, 1, 0.01).name('Age').onChange(() => scheduleRebuild(plant.key));
  speciesFolder.add(state, 'detailScale', 0.42, 1, 0.01).name('Render detail').onChange(() => scheduleRebuild(plant.key));
  speciesFolder.add(state, 'scale', 0.45, 1.7, 0.01).name('Display scale').onChange(() => {
    applySpecimenScale(plant.key);
    updateInfo();
  });
  speciesFolder.add(state, 'quantity', 1, MAX_QUANTITY, 1).name('Quantity').onChange(() => {
    applySpecimenScale(plant.key);
    updateInfo();
    if (plant.key === viewState.selected && viewState.autoFrame) frameScene();
  });
  for (const control of plant.controls) {
    let controller;
    if (control.type === 'slider') {
      controller = speciesFolder.add(state, control.key, control.min, control.max, control.step);
    } else if (control.type === 'toggle') {
      controller = speciesFolder.add(state, control.key);
    } else if (control.type === 'color') {
      controller = speciesFolder.addColor(state, control.key);
    } else {
      controller = speciesFolder.add(state, control.key, control.values);
    }
    controller.name(control.label).onChange(() => {
      // `renderOnly` once flagged controls that only updated render uniforms
      // (the halo pass). With the halo gone, every control rebuilds the mesh.
      if (control.renderOnly) return;
      syncSeasonalMaterials();
      scheduleRebuild(plant.key);
    });
  }
  speciesFolder.open();
}

function selectPlant(key, frame = true) {
  if (!PLANT_BY_KEY[key]) return;
  viewState.selected = key;
  selectedController?.updateDisplay();
  rebuildSpeciesFolder();
  updateToolbar();
  applyView();
  updateInfo();
  if (frame && viewState.autoFrame) {
    frameScene();
  } else {
    retargetOrbitToSelected();
  }
}

function updateToolbar() {
  toolbarEl.querySelectorAll('.plant-button').forEach(button => {
    button.classList.toggle('is-active', button.dataset.plant === viewState.selected);
  });
}

function applyView() {
  for (const [key, specimen] of specimens) {
    const selected = key === viewState.selected;
    specimen.group.visible = viewState.view === 'all' || selected;
    specimen.ring.visible = selected;
    specimen.label.visible = viewState.labels && specimen.group.visible;
  }
  ground.visible = viewState.ground;
  grid.visible = viewState.ground;
  applyShadowState();
}

function applyShadowState() {
  renderer.shadowMap.enabled = viewState.shadows;
  sun.castShadow = viewState.shadows;
  for (const specimen of specimens.values()) {
    specimen.mesh.castShadow = viewState.shadows;
    specimen.mesh.receiveShadow = viewState.shadows;
  }
  ground.receiveShadow = viewState.shadows;
}

function syncSeasonalMaterials() {
  const saguaro = plantState.saguaro;
  const paloVerde = plantState.paloVerde;
  const mesquite = plantState.mesquite;
  const ocotillo = plantState.ocotillo;
  materials.cactus.userData.setSeasonalVisibility?.({
    saguaroFlowering: saguaro.flowers,
    saguaroFruiting: saguaro.fruit,
  });
  materials.tree.userData.setSeasonalVisibility?.({
    paloVerdeFlowering: paloVerde.flowering,
    mesquiteSeedPods: mesquite.seedPods,
  });
  materials.ocotillo.userData.setSeasonalVisibility?.({
    ocotilloFlowering: ocotillo.flowering,
  });
}

// The screen-space halo pass is retired — geometric fur (mode 11 spine blades)
// replaces it. The chollaGlow* init code is left in place so the file stays
// minimally diffed; these stubs keep older call sites from crashing on the
// now-removed state.chollaHalo* keys.
function syncChollaHaloUniforms() {}
function updateChollaHaloDistanceUniforms() {}

function applySpecimenScale(key) {
  const specimen = specimens.get(key);
  if (!specimen) return;
  const state = plantState[key];
  scatterInstances(specimen.mesh, key, state, specimen.bounds);
  specimen.label.position.y = specimen.bounds.height * state.scale + 0.5;
  specimen.ring.geometry.dispose();
  specimen.ring.geometry = selectionRingGeometry(specimen.bounds.radius * state.scale);
  if (key === viewState.selected) retargetOrbitToSelected();
}

function updateInfo() {
  const plant = PLANT_BY_KEY[viewState.selected];
  const specimen = specimens.get(plant.key);
  if (!specimen) return;
  const state = plantState[plant.key];
  const data = specimen.mesh.geometry.userData ?? {};
  const height = specimen.bounds.height * state.scale;
  const diameter = specimen.bounds.radius * state.scale * 2;
  const quantity = specimenQuantity(state);
  const vertices = specimen.mesh.geometry.attributes.position.count * quantity;
  infoEl.innerHTML = `
    <div class="plant-info__eyebrow">${plant.scientific}</div>
    <h1 class="plant-info__title">${plant.label}</h1>
    <div class="plant-info__facts">
      <span>Age</span><strong>${formatNumber(data.age ?? state.age, 2)}</strong>
      <span>Stage</span><strong>${pretty(data.growthStage ?? 'specimen')}</strong>
      <span>Height</span><strong>${formatNumber(height, 2)} m</strong>
      <span>Spread</span><strong>${formatNumber(diameter, 2)} m</strong>
      <span>Quantity</span><strong>${quantity.toLocaleString()}</strong>
      <span>Vertices</span><strong>${vertices.toLocaleString()}</strong>
      <span>Seed</span><strong>${Math.floor(state.seed)}</strong>
    </div>
  `;
}

function scheduleRebuild(key) {
  window.cancelAnimationFrame(rebuildFrame);
  rebuildFrame = window.requestAnimationFrame(() => {
    buildSpecimen(key);
  });
}

function randomizeSelected() {
  const state = plantState[viewState.selected];
  state.seed = Math.floor(1 + Math.random() * 99998);
  rebuildSpeciesFolder();
  buildSpecimen(viewState.selected);
}

function resetSelected() {
  const plant = PLANT_BY_KEY[viewState.selected];
  plantState[plant.key] = cloneDefaults(plant.defaults);
  syncChollaHaloUniforms();
  rebuildSpeciesFolder();
  buildSpecimen(plant.key);
}

function frameScene() {
  const center = selectedPlantCenter();
  if (!center) return;

  if (viewState.view === 'selected') {
    const specimen = specimens.get(viewState.selected);
    if (!specimen) return;
    const state = plantState[viewState.selected];
    const radius = Math.max(2, selectedPlantRadius(specimen, state));
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(radius * 2.0, radius * 1.05, radius * 2.15));
    camera.near = Math.max(0.05, radius / 80);
    camera.far = Math.max(140, radius * 18);
    camera.updateProjectionMatrix();
    return;
  }

  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(22, 14, 23));
  camera.near = 0.1;
  camera.far = 300;
  camera.updateProjectionMatrix();
}

function selectedPlantCenter() {
  const specimen = specimens.get(viewState.selected);
  if (!specimen) return null;
  const state = plantState[viewState.selected];
  const center = specimenQuantity(state) > 1 ? new THREE.Vector3() : specimen.group.position.clone();
  center.y += specimen.bounds.height * state.scale * 0.45;
  return center;
}

function selectedPlantRadius(specimen, state) {
  const specimenRadius = specimen.bounds.sphereRadius * state.scale;
  return specimenQuantity(state) > 1 ? SCATTER_RADIUS + specimenRadius : specimenRadius;
}

function retargetOrbitToSelected() {
  const center = selectedPlantCenter();
  if (!center) return;
  controls.target.copy(center);
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...specimens.values()].map(specimen => specimen.mesh), false);
  const hit = hits.find(item => item.object.userData.plantKey);
  if (hit) selectPlant(hit.object.userData.plantKey);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.getDrawingBufferSize(chollaGlowResolution);
  chollaGlowResolution
    .multiplyScalar(0.5)
    .floor()
    .max(new THREE.Vector2(1, 1));
  chollaGlowMaskTarget.setSize(
    chollaGlowResolution.x,
    chollaGlowResolution.y,
  );
  chollaOcclusionTarget.setSize(
    chollaGlowResolution.x,
    chollaGlowResolution.y,
  );
}

function animate() {
  requestAnimationFrame(animate);
  if (viewState.rotate) {
    const specimen = specimens.get(viewState.selected);
    if (specimen) specimen.mesh.rotation.y += 0.0075;
  }
  controls.update();
  renderer.render(scene, camera);
}

function renderChollaGlow() {
  const specimen = specimens.get('jumpingCholla');
  const source = specimen?.mesh;
  if (
    !source ||
    !chollaGlowMaskMesh ||
    !source.visible ||
    !specimen.group.visible ||
    source.count <= 0
  ) {
    return;
  }

  source.updateMatrixWorld(true);
  chollaGlowMaskMesh.matrix.copy(source.matrixWorld);
  chollaGlowMaskMesh.count = source.count;
  chollaGlowMaskMesh.visible = true;

  renderer.getClearColor(chollaGlowPreviousClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  const previousRenderTarget = renderer.getRenderTarget();
  const previousOverrideMaterial = scene.overrideMaterial;
  const previousChollaVisible = source.visible;
  const previousGroundVisible = ground.visible;
  const previousGridVisible = grid.visible;
  const previousAdornmentVisibility = [];

  source.visible = false;
  ground.visible = false;
  grid.visible = false;
  for (const specimen of specimens.values()) {
    previousAdornmentVisibility.push([specimen.ring, specimen.ring.visible], [specimen.label, specimen.label.visible]);
    specimen.ring.visible = false;
    specimen.label.visible = false;
  }
  scene.overrideMaterial = chollaOcclusionMaterial;
  renderer.setRenderTarget(chollaOcclusionTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  scene.overrideMaterial = previousOverrideMaterial;
  source.visible = previousChollaVisible;
  ground.visible = previousGroundVisible;
  grid.visible = previousGridVisible;
  for (const [object, visible] of previousAdornmentVisibility) object.visible = visible;

  renderer.setRenderTarget(chollaGlowMaskTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(chollaGlowMaskScene, camera);
  renderer.setRenderTarget(previousRenderTarget);
  renderer.setClearColor(chollaGlowPreviousClearColor, previousClearAlpha);

  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(chollaGlowOverlayScene, chollaGlowOverlayCamera);
  renderer.autoClear = previousAutoClear;
}

function createChollaGlowMaterial(maskTexture, occlusionTexture, resolution) {
  return new THREE.ShaderMaterial({
    name: 'plant-lab-cholla-screen-spine-halo',
    uniforms: {
      maskTexture: { value: maskTexture },
      occlusionTexture: { value: occlusionTexture },
      spineColor: { value: new THREE.Color(0xffd870) },
      resolution: { value: resolution },
      spineReach: { value: 14.0 },
      spineLength: { value: 14.0 },
      spineStrength: { value: 0.72 },
      spineDensity: { value: 1.0 },
      innerFuzzStrength: { value: 0.10 },
    },
    vertexShader: /* glsl */`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: /* glsl */`
uniform sampler2D maskTexture;
uniform sampler2D occlusionTexture;
uniform vec3 spineColor;
uniform vec2 resolution;
uniform float spineReach;
uniform float spineLength;
uniform float spineStrength;
uniform float spineDensity;
uniform float innerFuzzStrength;
varying vec2 vUv;

const int MASK_RADIUS = 16;

float chollaHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float chollaSpineField(vec2 px, vec2 n) {
  vec2 t = vec2(-n.y, n.x);
  float along = dot(px, n);
  float field = 0.0;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float density = clamp(spineDensity, 0.35, 6.0);
    float spacing = mix(2.0, 4.0, fi / 4.0) / density;
    float slope = mix(-0.36, 0.36, chollaHash(fi * 31.7 + 4.1));
    float sideCoord = dot(px, t) + along * slope + fi * 17.0;
    float lane = floor(sideCoord / spacing);
    float laneHash = chollaHash(lane * 19.17 + fi * 71.31);
    float center = 0.5 + (laneHash - 0.5) * 0.62;
    float width = mix(0.055, 0.15, chollaHash(lane * 11.9 + fi * 8.3));
    float line = 1.0 - smoothstep(width, width + 0.10, abs(fract(sideCoord / spacing) - center));
    float broken = smoothstep(0.28, 0.96, chollaHash(lane * 29.41 + floor(along * 0.22) * 3.7 + fi));
    field += line * broken;
  }

  return clamp(field * mix(0.24, 0.58, clamp(spineDensity / 6.0, 0.0, 1.0)), 0.0, 1.0);
}

void main() {
  float center = texture2D(maskTexture, vUv).r;
  vec2 texel = 1.0 / resolution;
  float nearby = 0.0;
  float weights = 0.0;
  float edge = 0.0;
  float nearestMaskDistance = spineReach;

  for (int y = -MASK_RADIUS; y <= MASK_RADIUS; y++) {
    for (int x = -MASK_RADIUS; x <= MASK_RADIUS; x++) {
      vec2 offset = vec2(float(x), float(y)) * 3.0;
      float distancePx = length(offset);
      if (distancePx <= 0.5 || distancePx > spineReach) continue;
      float sampleMask = texture2D(maskTexture, vUv + offset * texel).r;
      float weight = exp(-distancePx * 0.24);
      nearby += sampleMask * weight;
      weights += weight;
      edge = max(edge, abs(sampleMask - center));
      if (sampleMask > 0.01) nearestMaskDistance = min(nearestMaskDistance, distancePx);
    }
  }

  nearby = weights > 0.0 ? nearby / weights : 0.0;

  float left = texture2D(maskTexture, vUv - vec2(texel.x * 2.0, 0.0)).r;
  float right = texture2D(maskTexture, vUv + vec2(texel.x * 2.0, 0.0)).r;
  float down = texture2D(maskTexture, vUv - vec2(0.0, texel.y * 2.0)).r;
  float up = texture2D(maskTexture, vUv + vec2(0.0, texel.y * 2.0)).r;
  vec2 normal = vec2(left - right, down - up);
  float normalLen = length(normal);
  normal = normalLen > 0.0001 ? normal / normalLen : normalize(vUv - vec2(0.5));

  float outsideBand = max(nearby - center * 0.38, 0.0);
  float innerFuzz = center * edge * innerFuzzStrength;
  float spineField = chollaSpineField(vUv * resolution, normal);
  float grain = chollaHash(dot(floor(vUv * resolution * 0.72), vec2(13.1, 91.7)));
  float maxSpineLength = max(0.5, spineLength);
  float lengthFade = 1.0 - smoothstep(maxSpineLength * 0.82, maxSpineLength, nearestMaskDistance);
  float bristles = outsideBand * lengthFade * mix(0.12, 1.0, spineField) * smoothstep(0.04, 0.22, normalLen);
  float alpha = clamp((bristles * 1.55 + innerFuzz * mix(0.20, 0.55, grain)) * spineStrength, 0.0, 0.48);
  float occlusion = texture2D(occlusionTexture, vUv).r;
  alpha *= 1.0 - smoothstep(0.02, 0.16, occlusion);
  if (alpha <= 0.004) discard;

  vec3 base = mix(vec3(0.86, 0.62, 0.22), spineColor, 0.84);
  vec3 color = base * (0.72 + spineField * 0.55 + outsideBand * 0.25);
  gl_FragColor = vec4(color * alpha, alpha);
}`,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusDstColorFactor,
    blendDst: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
    fog: false,
    lights: false,
    toneMapped: false,
  });
}

function plantOptions() {
  return Object.fromEntries(PLANTS.map(plant => [plant.label, plant.key]));
}

function slider(key, label, min, max, step, options = {}) {
  return { type: 'slider', key, label, min, max, step, ...options };
}

function toggle(key, label) {
  return { type: 'toggle', key, label };
}

function choice(key, label, values) {
  return { type: 'choice', key, label, values };
}

function colorControl(key, label, options = {}) {
  return { type: 'color', key, label, ...options };
}

function formatNumber(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function cloneDefaults(defaults) {
  return { ...defaults, quantity: 1 };
}

function specimenQuantity(state) {
  return THREE.MathUtils.clamp(Math.floor(state.quantity ?? 1), 1, MAX_QUANTITY);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
