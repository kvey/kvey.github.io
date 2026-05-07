import * as THREE from 'three';

export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.0,
    flatShading: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainDustColor = { value: new THREE.Color(0xd6c49f) };
    shader.uniforms.terrainPebbleColor = { value: new THREE.Color(0x5f4632) };
    shader.uniforms.terrainWashColor = { value: new THREE.Color(0x8f7b59) };
    shader.uniforms.terrainRockColor = { value: new THREE.Color(0x6b4a32) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 terrainDetail;
varying vec4 vTerrainDetail;
varying vec3 vTerrainWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTerrainDetail = terrainDetail;
vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 terrainDustColor;
uniform vec3 terrainPebbleColor;
uniform vec3 terrainWashColor;
uniform vec3 terrainRockColor;
varying vec4 vTerrainDetail;
varying vec3 vTerrainWorldPosition;

float terrainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float terrainValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(terrainHash(i + vec2(0.0, 0.0)), terrainHash(i + vec2(1.0, 0.0)), u.x),
    mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float terrainFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += terrainValueNoise(p) * a;
    p = p * 2.03 + vec2(19.7, 7.3);
    a *= 0.5;
  }
  return v;
}

float terrainPebbleShape(vec2 p, float scale) {
  vec2 cell = floor(p * scale);
  vec2 local = fract(p * scale) - 0.5;
  vec2 jitter = vec2(
    terrainHash(cell + vec2(13.1, 7.7)),
    terrainHash(cell + vec2(4.3, 29.9))
  ) - 0.5;
  float radius = 0.11 + terrainHash(cell + vec2(91.0, 41.0)) * 0.21;
  float pebble = smoothstep(radius, radius * 0.28, length(local - jitter * 0.38));
  float presence = smoothstep(0.34, 0.98, terrainHash(cell + vec2(scale * 1.7, 3.0)));
  return pebble * presence;
}

float terrainRockMask(float wash, float shoulder, float slope) {
  return clamp(wash * 0.72 + shoulder * 0.55 + slope * 0.72, 0.0, 1.0);
}

float terrainBumpHeight(vec2 p, float gravel, float rockFace) {
  float grit = terrainFbm(p * 3.7);
  float peaGravel = terrainPebbleShape(p, 6.5) * 0.55 + terrainPebbleShape(p + 18.0, 13.0) * 0.36;
  float coarseGravel = terrainPebbleShape(p + vec2(47.0, 12.0), 3.6) * 0.82;
  float fractured = abs(terrainValueNoise(p * 2.1 + 9.0) - terrainValueNoise(p * 2.1 - 14.0));
  float strata = smoothstep(0.42, 0.95, sin(p.x * 1.65 + p.y * 0.34 + terrainFbm(p * 0.07) * 7.0) * 0.5 + 0.5);
  float gravelHeight = peaGravel + coarseGravel + grit * 0.24;
  float rockHeight = fractured * 0.42 + strata * 0.22;
  return (gravelHeight * (0.28 + gravel * 0.9) + rockHeight * rockFace) * (0.42 + gravel * 0.7 + rockFace * 0.75);
}

vec3 terrainApplyMicroNormal(vec3 surfaceNormal, vec2 p, float gravel, float rockFace) {
  vec3 tangent = normalize(vec3(1.0, 0.0, 0.0) - surfaceNormal * surfaceNormal.x);
  vec3 bitangent = normalize(cross(surfaceNormal, tangent));
  vec2 normalNoise = vec2(
    terrainValueNoise(p * 18.0 + vec2(1.7, 3.1)) - terrainValueNoise(p * 18.0 - vec2(8.2, 2.6)),
    terrainValueNoise(p * 18.0 + vec2(11.4, 5.9)) - terrainValueNoise(p * 18.0 - vec2(4.1, 12.7))
  );
  float chip = terrainPebbleShape(p, 10.5) + terrainPebbleShape(p + 33.0, 22.0) * 0.65;
  float strength = 0.08 + gravel * 0.32 + rockFace * 0.24 + chip * 0.14;
  return normalize(surfaceNormal + (tangent * normalNoise.x + bitangent * normalNoise.y) * strength);
}

vec3 terrainApplyBumpMap(vec3 surfaceNormal, float height, float strength) {
  vec3 dpdx = dFdx(vTerrainWorldPosition);
  vec3 dpdy = dFdy(vTerrainWorldPosition);
  float dhdx = dFdx(height);
  float dhdy = dFdy(height);
  vec3 r1 = cross(dpdy, surfaceNormal);
  vec3 r2 = cross(surfaceNormal, dpdx);
  float det = dot(dpdx, r1);
  vec3 gradient = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * surfaceNormal - gradient * strength);
}

vec3 applyTerrainNormalAndBump(vec3 surfaceNormal) {
  vec2 p = vTerrainWorldPosition.xz;
  float wash = clamp(vTerrainDetail.x, 0.0, 1.0);
  float shoulder = clamp(vTerrainDetail.y, 0.0, 1.0);
  float slope = clamp(vTerrainDetail.w, 0.0, 1.0);
  float rockFace = smoothstep(0.18, 0.78, slope) * (0.34 + shoulder * 0.86);
  float gravel = terrainRockMask(wash, shoulder, slope);
  float bumpHeight = terrainBumpHeight(p, gravel, rockFace);
  vec3 mappedNormal = terrainApplyMicroNormal(surfaceNormal, p, gravel, rockFace);
  float bumpStrength = 0.030 + gravel * 0.070 + rockFace * 0.055;
  return terrainApplyBumpMap(mappedNormal, bumpHeight, bumpStrength);
}

vec3 applyTerrainSurface(vec3 baseColor) {
  vec2 p = vTerrainWorldPosition.xz;
  float wash = clamp(vTerrainDetail.x, 0.0, 1.0);
  float shoulder = clamp(vTerrainDetail.y, 0.0, 1.0);
  float basin = clamp(vTerrainDetail.z, 0.0, 1.0);
  float slope = clamp(vTerrainDetail.w, 0.0, 1.0);

  float fineGrain = terrainHash(floor(p * 34.0));
  float pebble = smoothstep(0.80, 0.985, terrainHash(floor(p * 8.5) + floor(p.yx * 2.0)));
  float gravel = terrainRockMask(wash, shoulder, slope);
  float peaGravel = terrainPebbleShape(p, 7.5) + terrainPebbleShape(p + 21.0, 14.0) * 0.72;
  float coarseGravel = terrainPebbleShape(p + vec2(37.0, 9.0), 3.8);
  float stoneField = clamp(pebble * 0.72 + peaGravel * 0.58 + coarseGravel * 0.86, 0.0, 1.0) * (0.24 + gravel * 0.98);
  float dust = terrainFbm(p * 0.18);
  float crust = terrainFbm(p * 0.72 + 12.0) * basin * (1.0 - wash);

  float ripplePhase = p.x * 0.62 + p.y * 1.72 + terrainFbm(p * 0.08) * 5.5;
  float ripple = (sin(ripplePhase) * 0.5 + 0.5) * basin * (1.0 - wash);
  ripple = smoothstep(0.48, 0.86, ripple) * 0.18;

  float washStrand = sin(p.x * 0.85 + terrainFbm(p * 0.12) * 7.0) * 0.5 + 0.5;
  washStrand = smoothstep(0.38, 0.9, washStrand) * wash;

  float rockFace = smoothstep(0.22, 0.8, slope) * shoulder;
  float fracturedRock = smoothstep(0.42, 0.86, abs(terrainValueNoise(p * 1.9 + 8.0) - terrainValueNoise(p * 1.9 - 17.0))) * rockFace;
  vec3 c = baseColor;
  c *= 0.84 + fineGrain * 0.23 + dust * 0.09;
  c = mix(c, terrainDustColor, crust * 0.13 + ripple * 0.08);
  c = mix(c, terrainWashColor, wash * 0.15 + washStrand * 0.14);
  c = mix(c, terrainPebbleColor, stoneField * (0.42 + gravel * 0.34));
  c = mix(c, terrainRockColor, rockFace * 0.42 + fracturedRock * 0.28);
  c = mix(c, terrainDustColor, (1.0 - gravel) * basin * 0.07);
  c += terrainDustColor * ripple * 0.035;
  c *= 0.92 + stoneField * 0.08 - fracturedRock * 0.08;
  return c;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = applyTerrainSurface(diffuseColor.rgb);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = applyTerrainNormalAndBump(normal);`,
      );
  };

  material.customProgramCacheKey = () => 'terrain-material-v2';
  return material;
}
