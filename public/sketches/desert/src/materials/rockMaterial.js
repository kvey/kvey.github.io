import * as THREE from 'three';

export function createRockMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    flatShading: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockDustColor = { value: new THREE.Color(0xd6c49f) };
    shader.uniforms.rockPebbleColor = { value: new THREE.Color(0x5f4632) };
    shader.uniforms.rockGroundColor = { value: new THREE.Color(0x8f7b59) };
    shader.uniforms.rockFaceColor = { value: new THREE.Color(0x6b4a32) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 rockDetail;
varying vec4 vRockDetail;
varying vec3 vRockObjectPosition;
varying vec3 vRockObjectNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRockDetail = rockDetail;
vRockObjectPosition = transformed;
vRockObjectNormal = normalize(normal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 rockDustColor;
uniform vec3 rockPebbleColor;
uniform vec3 rockGroundColor;
uniform vec3 rockFaceColor;
varying vec4 vRockDetail;
varying vec3 vRockObjectPosition;
varying vec3 vRockObjectNormal;

float rockHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float rockValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(rockHash(i + vec2(0.0, 0.0)), rockHash(i + vec2(1.0, 0.0)), u.x),
    mix(rockHash(i + vec2(0.0, 1.0)), rockHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float rockFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += rockValueNoise(p) * a;
    p = p * 2.03 + vec2(19.7, 7.3);
    a *= 0.5;
  }
  return v;
}

float rockPebbleShape(vec2 p, float scale) {
  vec2 cell = floor(p * scale);
  vec2 local = fract(p * scale) - 0.5;
  vec2 jitter = vec2(
    rockHash(cell + vec2(13.1, 7.7)),
    rockHash(cell + vec2(4.3, 29.9))
  ) - 0.5;
  float radius = 0.11 + rockHash(cell + vec2(91.0, 41.0)) * 0.21;
  float pebble = smoothstep(radius, radius * 0.28, length(local - jitter * 0.38));
  float presence = smoothstep(0.34, 0.98, rockHash(cell + vec2(scale * 1.7, 3.0)));
  return pebble * presence;
}

vec3 applyRockSurface(vec3 baseColor) {
  float height01 = clamp(vRockDetail.x, 0.0, 1.0);
  float strata = clamp(vRockDetail.y, 0.0, 1.0);
  float crack = clamp(vRockDetail.z, 0.0, 1.0);
  float grain = clamp(vRockDetail.w, 0.0, 1.0);
  float top = smoothstep(0.12, 0.88, vRockObjectNormal.y) * smoothstep(0.34, 0.95, height01);

  vec2 p = vRockObjectPosition.xz;
  float fineGrain = rockHash(floor(p * 34.0));
  float dust = rockFbm(p * 0.18 + grain * 2.0);
  float peaGravel = rockPebbleShape(p, 7.5) + rockPebbleShape(p + 21.0, 14.0) * 0.72;
  float coarseGravel = rockPebbleShape(p + vec2(37.0, 9.0), 3.8);
  float stoneField = clamp(peaGravel * 0.48 + coarseGravel * 0.62, 0.0, 1.0);
  float face = smoothstep(0.05, 0.82, 1.0 - abs(vRockObjectNormal.y)) * (0.35 + strata * 0.45);
  float fractured = smoothstep(0.42, 0.86, abs(rockValueNoise(p * 1.9 + 8.0) - rockValueNoise(p * 1.9 - 17.0))) * face;
  float softCrevice = crack * 0.24;

  vec3 c = baseColor;
  c *= 0.84 + fineGrain * 0.21 + dust * 0.09;
  c = mix(c, rockDustColor, top * 0.24 + strata * 0.10);
  c = mix(c, rockGroundColor, top * 0.08 + dust * 0.06);
  c = mix(c, rockPebbleColor, stoneField * 0.34);
  c = mix(c, rockFaceColor, face * 0.24 + fractured * 0.18);
  c *= 0.95 + stoneField * 0.04 - fractured * 0.06 - softCrevice;
  return c;
}

float rockSurfaceRoughness() {
  float height01 = clamp(vRockDetail.x, 0.0, 1.0);
  float strata = clamp(vRockDetail.y, 0.0, 1.0);
  float crack = clamp(vRockDetail.z, 0.0, 1.0);
  float grain = clamp(vRockDetail.w, 0.0, 1.0);
  float top = smoothstep(0.12, 0.88, vRockObjectNormal.y) * smoothstep(0.34, 0.95, height01);
  vec2 p = vRockObjectPosition.xz;
  float mica = smoothstep(0.88, 0.995, rockHash(floor(p * 19.0) + floor(p.yx * 3.0)));
  float exposedStone = smoothstep(0.38, 0.92, strata) * (1.0 - crack * 0.45);
  return clamp(0.985 - exposedStone * 0.075 - mica * 0.045 + top * 0.02 + grain * 0.018 + crack * 0.03, 0.74, 1.0);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = applyRockSurface(diffuseColor.rgb);`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * rockSurfaceRoughness(), 0.72, 1.0);`,
    );
  };

  material.customProgramCacheKey = () => 'rock-material-v3-ground-texture';
  return material;
}
