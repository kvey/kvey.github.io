import * as THREE from 'three';

// Far-LOD billboard impostors. Each plant variant's mid-LOD geometry is baked
// once into a tile of a per-chunk atlas (rendered with the real stage material
// so procedural spine/bark shading survives), and every far-LOD cell then
// draws camera-facing quads — 2 triangles per instance instead of hundreds.
//
// Baking happens with the renderer's tone mapping disabled, so tiles hold
// linear-light shaded color. The impostor shader re-applies fog, the global
// tone mapping curve, and the output color-space transform, which keeps the
// mid->far transition close to the real geometry. A per-frame `lightTint`
// uniform scales the baked lighting toward the current sun/sky state so the
// sprites track the day/night cycle approximately.

const IDENTITY = new THREE.Matrix4();

const VERTEX = /* glsl */ `
attribute mat4 instanceMatrix;
varying vec2 vUv;
varying float vFogDepth;

void main() {
  vec3 origin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float scale = length(instanceMatrix[0].xyz);
  vec3 worldOrigin = (modelMatrix * vec4(origin, 1.0)).xyz;

  // Cylindrical billboard: rotate the quad about +Y to face the camera.
  vec3 toCam = cameraPosition - worldOrigin;
  toCam.y = 0.0;
  float len = length(toCam);
  if (len > 0.001) { toCam /= len; } else { toCam = vec3(0.0, 0.0, 1.0); }
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);

  vec3 worldPos = worldOrigin + (right * position.x + vec3(0.0, 1.0, 0.0) * position.y) * scale;
  vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
  vUv = uv;
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D impostorMap;
uniform vec3 lightTint;
uniform vec3 fogColor;
uniform float fogDensity;
varying vec2 vUv;
varying float vFogDepth;

void main() {
  // Slight negative mip bias: trilinear filtering erodes thin plant
  // silhouettes to nothing at distance; sampling half a level sharper keeps
  // the far scrub reading as dense as the 3D geometry it replaced.
  vec4 tex = texture2D(impostorMap, vUv, -0.75);
  // Distance-ramped alpha test: deep mip levels average the tile's mostly
  // transparent pixels, so a fixed threshold makes distant sprites vanish
  // entirely. Relaxing the cutoff with distance keeps far plants visible at
  // the cost of blobbier edges nobody can see at that size.
  float alphaCut = mix(0.4, 0.04, clamp(vFogDepth / 130.0, 0.0, 1.0));
  if (tex.a < alphaCut) discard;
  vec3 color = tex.rgb * lightTint;
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  color = mix(color, fogColor, clamp(fogFactor, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ChunkImpostorAtlas {
  // lights: [{ isDirectional, color, intensity, direction }, { isHemisphere, skyColor, groundColor, intensity }]
  constructor(renderer, { tileSize = 160, tilesPerSide = 8, lights = [], fog = null } = {}) {
    this.renderer = renderer;
    this.tileSize = tileSize;
    this.tilesPerSide = tilesPerSide;
    this.cursor = 0;

    const size = tileSize * tilesPerSide;
    this.renderTarget = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.renderTarget.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.renderTarget.texture.magFilter = THREE.LinearFilter;
    this.renderTarget.texture.generateMipmaps = true;
    this.renderTarget.scissorTest = true;

    this.bakeScene = new THREE.Scene();
    for (const light of lights) {
      if (light.isDirectional) {
        const l = new THREE.DirectionalLight(light.color, light.intensity);
        l.position.copy(light.direction).multiplyScalar(60);
        this.bakeScene.add(l);
        this.bakeScene.add(l.target);
      } else if (light.isHemisphere) {
        this.bakeScene.add(new THREE.HemisphereLight(light.skyColor, light.groundColor, light.intensity));
      }
    }
    this.bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        impostorMap: { value: this.renderTarget.texture },
        lightTint: { value: new THREE.Color(1, 1, 1) },
        fogColor: { value: fog?.color ?? new THREE.Color(1, 1, 1) },
        fogDensity: { value: fog?.density ?? 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
  }

  get isFull() {
    return this.cursor >= this.tilesPerSide * this.tilesPerSide;
  }

  // Render `geometry` (with the real stage material) into the next free tile
  // and return a quad BufferGeometry sized/UV-mapped for it, or null if the
  // atlas is out of tiles.
  bake(geometry, material) {
    if (this.isFull) return null;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    if (bbox.isEmpty()) return null;

    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;
    const cy = (bbox.min.y + bbox.max.y) / 2;
    const width = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z) * 1.04 + 0.02;
    const height = (bbox.max.y - bbox.min.y) * 1.04 + 0.02;
    const viewDistance = width + height + 1;

    const camera = this.bakeCamera;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.near = 0.01;
    camera.far = viewDistance + width * 2;
    camera.position.set(cx + viewDistance, cy, cz);
    camera.lookAt(cx, cy, cz);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // Materials in this scene hard-code `instanceMatrix` in their injected
    // vertex shaders, so the bake mesh must be instanced too.
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setMatrixAt(0, IDENTITY);
    mesh.frustumCulled = false;
    this.bakeScene.add(mesh);

    const index = this.cursor++;
    const tx = index % this.tilesPerSide;
    const ty = Math.floor(index / this.tilesPerSide);
    const rt = this.renderTarget;
    rt.viewport.set(tx * this.tileSize, ty * this.tileSize, this.tileSize, this.tileSize);
    rt.scissor.copy(rt.viewport);

    const renderer = this.renderer;
    const prevTarget = renderer.getRenderTarget();
    const prevToneMapping = renderer.toneMapping;
    const prevClearColor = renderer.getClearColor(new THREE.Color());
    const prevClearAlpha = renderer.getClearAlpha();
    // Bake linear-light color; the impostor shader tone-maps at draw time.
    renderer.toneMapping = THREE.NoToneMapping;
    // Muted plant tone behind zero alpha keeps bilinear edge fringes plausible.
    renderer.setClearColor(0x55603e, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(this.bakeScene, camera);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClearColor, prevClearAlpha);
    renderer.toneMapping = prevToneMapping;

    this.bakeScene.remove(mesh);
    mesh.dispose();

    const inset = 0.5 / (this.tileSize * this.tilesPerSide);
    const uMin = tx / this.tilesPerSide + inset;
    const vMin = ty / this.tilesPerSide + inset;
    const uMax = (tx + 1) / this.tilesPerSide - inset;
    const vMax = (ty + 1) / this.tilesPerSide - inset;

    // Quad in plant-local units: x is the billboard's right axis, y is up.
    // The bake view is horizontally centered on the bbox, so the quad is too;
    // vertical placement preserves the geometry's true y-range.
    const x0 = -width / 2;
    const x1 = width / 2;
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0,
    ], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([
      uMin, vMin, uMax, vMin, uMax, vMax, uMin, vMax,
    ], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    // Billboard rotation sweeps the quad through a cylinder around the plant
    // origin; use that as the bounding volume so frustum culling stays valid
    // from every view angle.
    const radius = Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) * 1.42;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, cy, 0), radius);
    return quad;
  }

  setLightTint(color) {
    this.material.uniforms.lightTint.value.copy(color);
  }

  dispose() {
    this.renderTarget.dispose();
    this.material.dispose();
  }
}
