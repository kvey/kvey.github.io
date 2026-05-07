import * as THREE from 'three';

// One shared material for cactus bodies. Geometry supplies a cactusSpine vec4:
//   x/y = procedural spine coordinates
//   z   = local strength
//   w   = mode: 1 ribbed cactus, 2 pad cactus, 0 disabled
export function createCactusSpineMaterial() {
  const seasonalUniforms = {
    saguaroFlowerVisibility: { value: 1 },
    saguaroFruitVisibility: { value: 1 },
  };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
  });
  material.extensions = { ...(material.extensions ?? {}), derivatives: true };
  material.userData.setSeasonalVisibility = ({
    saguaroFlowering = seasonalUniforms.saguaroFlowerVisibility.value > 0.5,
    saguaroFruiting = seasonalUniforms.saguaroFruitVisibility.value > 0.5,
  } = {}) => {
    seasonalUniforms.saguaroFlowerVisibility.value = saguaroFlowering ? 1 : 0;
    seasonalUniforms.saguaroFruitVisibility.value = saguaroFruiting ? 1 : 0;
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.cactusSpineColor = { value: new THREE.Color(0xf1e4bd) };
    shader.uniforms.cactusAreoleColor = { value: new THREE.Color(0xd7bd72) };
    shader.uniforms.saguaroFlowerVisibility = seasonalUniforms.saguaroFlowerVisibility;
    shader.uniforms.saguaroFruitVisibility = seasonalUniforms.saguaroFruitVisibility;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 cactusSpine;
varying vec4 vCactusSpine;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCactusSpine = cactusSpine;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 cactusSpineColor;
uniform vec3 cactusAreoleColor;
uniform float saguaroFlowerVisibility;
uniform float saguaroFruitVisibility;
varying vec4 vCactusSpine;

float cactusSpineHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float cactusSegmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

float cactusParticleDisk(vec2 p, float radius) {
  float d = length(p);
  float aa = clamp(fwidth(d) * 1.6, 0.002, 0.055);
  return 1.0 - smoothstep(radius - aa, radius + aa, d);
}

float cactusNeedleParticle(vec2 p, vec2 dir, float len, float width) {
  float d = cactusSegmentDistance(p, dir * 0.025, dir * len) - width;
  float aa = clamp((fwidth(p.x) + fwidth(p.y)) * 1.4, 0.002, 0.045);
  return 1.0 - smoothstep(0.0, aa, d);
}

float cactusMicroParticles(vec2 p, vec2 seedCell, float density) {
  vec2 microUv = p * density + vec2(
    cactusSpineHash(seedCell + 3.17),
    cactusSpineHash(seedCell + 8.41)
  );
  vec2 microCell = floor(microUv);
  vec2 micro = fract(microUv) - 0.5;
  float keep = step(0.58, cactusSpineHash(seedCell + microCell * 0.73));
  float size = mix(0.045, 0.085, cactusSpineHash(seedCell + microCell + 11.9));
  return keep * cactusParticleDisk(micro, size);
}

float cactusNeedleCluster(vec2 p, vec2 seedCell, float spread, float lengthScale) {
  float needles = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h0 = cactusSpineHash(seedCell + vec2(fi * 13.7, 2.3));
    float h1 = cactusSpineHash(seedCell + vec2(fi * 7.1, 19.4));
    float h2 = cactusSpineHash(seedCell + vec2(fi * 3.9, 41.6));
    float angle = (fi / 6.0) * 6.2831853 + (h0 - 0.5) * spread;
    vec2 dir = vec2(cos(angle), sin(angle));
    float len = mix(0.20, 0.42, h1) * lengthScale;
    float width = mix(0.010, 0.020, h2);
    needles = max(needles, cactusNeedleParticle(p, dir, len, width));
  }
  return needles;
}

float cactusScreenDetailFade() {
  vec2 footprint = fwidth(vCactusSpine.xy);
  float cellFootprint = max(footprint.x, footprint.y);
  return 1.0 - smoothstep(0.055, 0.18, cellFootprint);
}

vec3 cactusApplySpines(vec3 baseColor) {
  float strength = clamp(vCactusSpine.z, 0.0, 1.0);
  if (strength <= 0.0001) return baseColor;
  float detailFade = cactusScreenDetailFade();

  float areole = 0.0;
  float spine = 0.0;

  if (vCactusSpine.w < 1.5) {
    vec2 cellId = floor(vec2(vCactusSpine.x + 0.5, vCactusSpine.y));
    vec2 local = vec2(fract(vCactusSpine.x + 0.5) - 0.5, fract(vCactusSpine.y) - 0.5);
    vec2 cluster = vec2(local.x * 1.55, local.y);
    float ribGate = 1.0 - smoothstep(0.04, 0.18, abs(local.x));
    float rowGate = 1.0 - smoothstep(0.16, 0.48, abs(local.y));
    float breakup = 0.70 + cactusSpineHash(cellId) * 0.38;
    float density = mix(5.5, 8.0, cactusSpineHash(cellId + 5.31));

    areole = ribGate * (
      cactusParticleDisk(cluster, 0.105) * 0.88
      + cactusMicroParticles(cluster, cellId, density) * 0.34
    ) * rowGate * breakup;
    spine = ribGate * rowGate * cactusNeedleCluster(cluster, cellId, 1.85, 1.0) * breakup;
  } else {
    vec2 cellId = floor(vCactusSpine.xy);
    vec2 local = fract(vCactusSpine.xy) - 0.5;
    float faceFade = 1.0 - smoothstep(0.36, 0.62, length(local));
    float breakup = 0.66 + cactusSpineHash(cellId) * 0.42;
    float density = mix(5.0, 7.2, cactusSpineHash(cellId + 2.67));

    areole = (
      cactusParticleDisk(local, 0.135) * 0.82
      + cactusMicroParticles(local, cellId, density) * 0.28
    ) * faceFade * breakup;
    spine = cactusNeedleCluster(local, cellId, 2.65, 0.78) * faceFade * breakup;
  }

  areole *= mix(0.18, 1.0, detailFade);
  spine *= detailFade * detailFade;
  float areoleMix = clamp(areole * strength * 0.58, 0.0, 0.70);
  float spineMix = clamp(spine * strength * 0.72, 0.0, 0.82);
  vec3 c = mix(baseColor, cactusAreoleColor, areoleMix);
  c = mix(c, cactusSpineColor, spineMix);
  return c + cactusSpineColor * spineMix * 0.035;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vCactusSpine.w > 2.5 && vCactusSpine.w < 3.5 && saguaroFlowerVisibility < 0.5) discard;
if (vCactusSpine.w > 3.5 && vCactusSpine.w < 4.5 && saguaroFruitVisibility < 0.5) discard;
diffuseColor.rgb = cactusApplySpines(diffuseColor.rgb);`,
      );
  };

  material.customProgramCacheKey = () => 'cactus-spine-material-v4-saguaro-seasonal';
  return material;
}
