import * as THREE from 'three';

export function createTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.0,
    flatShading: false,
  });
  material.userData.terrainDebugMode = 0;
  material.userData.setTerrainDebugMode = (mode) => {
    const numericMode = {
      natural: 0,
      landform: 1,
      soilTexture: 2,
      runon: 3,
      frost: 4,
      rockCover: 5,
    }[mode] ?? 0;
    material.userData.terrainDebugMode = numericMode;
    if (material.userData.terrainDebugUniform) {
      material.userData.terrainDebugUniform.value = numericMode;
    }
  };
  material.userData.terrainCameraPosition = new THREE.Vector3();
  material.userData.setTerrainCameraPosition = (position) => {
    material.userData.terrainCameraPosition.copy(position);
    if (material.userData.terrainCameraPositionUniform) {
      material.userData.terrainCameraPositionUniform.value.copy(position);
    }
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainDebugMode = { value: material.userData.terrainDebugMode };
    shader.uniforms.terrainCameraPosition = { value: material.userData.terrainCameraPosition };
    shader.uniforms.terrainDustColor = { value: new THREE.Color(0xd6c49f) };
    shader.uniforms.terrainPebbleColor = { value: new THREE.Color(0x5f4632) };
    shader.uniforms.terrainWashColor = { value: new THREE.Color(0x8f7b59) };
    shader.uniforms.terrainRockColor = { value: new THREE.Color(0x6b4a32) };
    material.userData.terrainDebugUniform = shader.uniforms.terrainDebugMode;
    material.userData.terrainCameraPositionUniform = shader.uniforms.terrainCameraPosition;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 terrainDetail;
attribute float terrainLandform;
attribute vec4 terrainDebugData;
varying vec4 vTerrainDetail;
varying float vTerrainLandform;
varying vec4 vTerrainDebugData;
varying vec3 vTerrainWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTerrainDetail = terrainDetail;
vTerrainLandform = terrainLandform;
vTerrainDebugData = terrainDebugData;
vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float terrainDebugMode;
uniform vec3 terrainCameraPosition;
uniform vec3 terrainDustColor;
uniform vec3 terrainPebbleColor;
uniform vec3 terrainWashColor;
uniform vec3 terrainRockColor;
varying vec4 vTerrainDetail;
varying float vTerrainLandform;
varying vec4 vTerrainDebugData;
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

float terrainCameraDistance() {
  return distance(terrainCameraPosition, vTerrainWorldPosition);
}

float terrainNearDetailFade() {
  return 1.0 - smoothstep(42.0, 145.0, terrainCameraDistance());
}

float terrainMidDetailFade() {
  return 1.0 - smoothstep(120.0, 360.0, terrainCameraDistance());
}

vec2 terrainRotate(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, s, -s, c) * p;
}

float terrainRidgedFbm(vec2 p) {
  float v = 0.0;
  float a = 0.56;
  for (int i = 0; i < 5; i++) {
    float n = terrainValueNoise(p);
    v += (1.0 - abs(n * 2.0 - 1.0)) * a;
    p = terrainRotate(p * 2.08 + vec2(12.7, -4.4), 0.72);
    a *= 0.48;
  }
  return v;
}

vec2 terrainDomainWarp(vec2 p) {
  vec2 large = vec2(
    terrainFbm(p * 0.030 + vec2(17.0, 9.0)),
    terrainFbm(p * 0.037 + vec2(-23.0, 31.0))
  ) - 0.5;
  vec2 medium = vec2(
    terrainFbm(terrainRotate(p, 0.58) * 0.115 + vec2(7.0, 41.0)),
    terrainFbm(terrainRotate(p, -0.81) * 0.138 + vec2(37.0, -11.0))
  ) - 0.5;
  return p + large * 5.0 + medium * 1.35;
}

vec2 terrainDetailWarp(vec2 p) {
  vec2 warped = terrainDomainWarp(p);
  return mix(p, warped, 0.24);
}

float terrainVoronoiStone(vec2 p, float scale, float density) {
  vec2 g = floor(p * scale);
  vec2 f = fract(p * scale);
  float nearest = 8.0;
  float stoneSize = 0.0;
  float edgeNoise = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = g + vec2(float(x), float(y));
      float present = step(1.0 - density, terrainHash(cell + vec2(71.3, 19.7)));
      vec2 jitter = vec2(
        terrainHash(cell + vec2(13.1, 7.7)),
        terrainHash(cell + vec2(4.3, 29.9))
      );
      vec2 delta = vec2(float(x), float(y)) + jitter - f;
      float angle = terrainHash(cell + vec2(53.0, 17.0)) * 6.2831853;
      vec2 chip = terrainRotate(delta, angle);
      float size = mix(0.10, 0.28, terrainHash(cell + vec2(91.0, 41.0))) * present;
      float angular = max(abs(chip.x) * mix(1.10, 1.85, terrainHash(cell + 5.0)), abs(chip.y) * mix(1.35, 2.25, terrainHash(cell + 9.0)));
      float rounded = length(chip / vec2(1.10 + size * 0.42, 0.72 + size * 0.24));
      float d = mix(angular, rounded, 0.32);
      if (d < nearest) {
        nearest = d;
        stoneSize = size;
        edgeNoise = terrainHash(cell + floor(f * 4.0) + vec2(23.0, 61.0));
      }
    }
  }
  float chip = smoothstep(stoneSize + 0.08, max(0.01, stoneSize * 0.58), nearest + (edgeNoise - 0.5) * 0.035);
  float brokenCenter = mix(0.72, 1.0, edgeNoise);
  return chip * brokenCenter * smoothstep(0.02, 0.24, stoneSize);
}

float terrainSandVein(vec2 p, float direction, float frequency, float softness) {
  vec2 q = terrainRotate(p, direction);
  float center = sin(q.x * frequency + terrainFbm(q * 0.075) * 8.0 + terrainFbm(q * 0.21) * 2.2);
  return smoothstep(softness, 1.0, center * 0.5 + 0.5);
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
  vec2 warped = terrainDetailWarp(p);
  float nearDetail = terrainNearDetailFade();
  float midDetail = terrainMidDetailFade();
  float grit = terrainFbm(warped * 3.7);
  float peaGravel = terrainVoronoiStone(warped, 6.2, 0.46) * 0.58 +
    terrainVoronoiStone(terrainRotate(warped + 18.0, 0.74), 13.0, 0.32) * 0.34;
  float coarseGravel = terrainVoronoiStone(terrainRotate(warped + vec2(47.0, 12.0), -0.48), 3.4, 0.38) * 0.88;
  float fractured = terrainRidgedFbm(terrainRotate(warped, 0.42) * 1.72 + 9.0);
  float strata = terrainSandVein(warped, 1.28, 1.38, 0.56);
  float gravelHeight = peaGravel * nearDetail * 0.46 + coarseGravel * midDetail * 0.38 + grit * (0.12 + midDetail * 0.12);
  float rockHeight = fractured * (0.10 + midDetail * 0.18) + strata * (0.07 + midDetail * 0.10);
  return (gravelHeight * (0.28 + gravel * 0.9) + rockHeight * rockFace) * (0.42 + gravel * 0.7 + rockFace * 0.75);
}

vec3 terrainApplyMicroNormal(vec3 surfaceNormal, vec2 p, float gravel, float rockFace) {
  vec2 warped = terrainDetailWarp(p);
  float nearDetail = terrainNearDetailFade();
  float midDetail = terrainMidDetailFade();
  vec3 tangent = normalize(vec3(1.0, 0.0, 0.0) - surfaceNormal * surfaceNormal.x);
  vec3 bitangent = normalize(cross(surfaceNormal, tangent));
  vec2 normalNoise = vec2(
    terrainValueNoise(warped * 17.0 + vec2(1.7, 3.1)) - terrainValueNoise(warped * 19.0 - vec2(8.2, 2.6)),
    terrainValueNoise(terrainRotate(warped, 0.37) * 18.0 + vec2(11.4, 5.9)) - terrainValueNoise(terrainRotate(warped, -0.53) * 16.0 - vec2(4.1, 12.7))
  );
  float chip = terrainVoronoiStone(warped, 9.6, 0.42) + terrainVoronoiStone(warped + 33.0, 21.0, 0.24) * 0.65;
  float strength = (0.035 + gravel * 0.13 + rockFace * 0.10) * midDetail +
    (0.035 + gravel * 0.13 + rockFace * 0.11 + chip * 0.055) * nearDetail;
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
  float detailFade = mix(terrainMidDetailFade(), terrainNearDetailFade(), 0.55);
  // The bump strength is scaled by detailFade, so past its fade range the
  // perturbation is negligible — skip the whole bump-height + micro-normal
  // computation (its own sand veins and surface-gradient noise) out there.
  if (detailFade < 0.004) return surfaceNormal;
  vec2 p = vTerrainWorldPosition.xz;
  float wash = clamp(vTerrainDetail.x, 0.0, 1.0);
  float shoulder = clamp(vTerrainDetail.y, 0.0, 1.0);
  float slope = clamp(vTerrainDetail.w, 0.0, 1.0);
  float rockFace = smoothstep(0.18, 0.78, slope) * (0.34 + shoulder * 0.86);
  float gravel = terrainRockMask(wash, shoulder, slope);
  float bumpHeight = terrainBumpHeight(p, gravel, rockFace);
  vec3 mappedNormal = terrainApplyMicroNormal(surfaceNormal, p, gravel, rockFace);
  float bumpStrength = (0.030 + gravel * 0.070 + rockFace * 0.055) * (0.22 + detailFade * 0.78);
  return terrainApplyBumpMap(mappedNormal, bumpHeight, bumpStrength);
}

vec3 terrainSoilBaseColor(vec3 baseColor, float soilId, float wash, float basin, float slope, float rockCover) {
  vec3 rock = vec3(0.38, 0.31, 0.25);
  vec3 gravel = vec3(0.50, 0.42, 0.32);
  vec3 alluvium = vec3(0.62, 0.56, 0.43);
  vec3 sand = vec3(0.76, 0.64, 0.43);
  vec3 loam = vec3(0.54, 0.45, 0.32);
  vec3 clay = vec3(0.46, 0.45, 0.40);
  vec3 soil = sand;
  if (soilId < 0.5) soil = rock;
  else if (soilId < 1.5) soil = gravel;
  else if (soilId < 2.5) soil = alluvium;
  else if (soilId < 3.5) soil = sand;
  else if (soilId < 4.5) soil = loam;
  else soil = clay;
  float vertexWeight = 0.42 + basin * 0.18 + wash * 0.14 - slope * 0.10;
  vec3 blended = mix(soil, baseColor, clamp(vertexWeight, 0.22, 0.62));
  return mix(blended, rock, rockCover * smoothstep(0.18, 0.86, slope) * 0.32);
}

vec3 applyTerrainSurface(vec3 baseColor) {
  vec2 p = vTerrainWorldPosition.xz;
  vec2 warped = terrainDomainWarp(p);
  float wash = clamp(vTerrainDetail.x, 0.0, 1.0);
  float shoulder = clamp(vTerrainDetail.y, 0.0, 1.0);
  float basin = clamp(vTerrainDetail.z, 0.0, 1.0);
  float slope = clamp(vTerrainDetail.w, 0.0, 1.0);
  float soilId = floor(vTerrainDebugData.x + 0.5);
  float runon = clamp(vTerrainDebugData.y, 0.0, 1.0);
  float rockCover = clamp(vTerrainDebugData.w, 0.0, 1.0);
  float nearDetail = terrainNearDetailFade();
  float midDetail = terrainMidDetailFade();

  // Always-on base tint (cheap: a handful of fbm calls). The heavy detail
  // (voronoi stones, sand veins, ripples) is distance-gated below — it is
  // already multiplied to ~0 by nearDetail/midDetail past its fade range, so
  // skipping the computation there is visually lossless but reclaims the bulk
  // of the per-fragment ALU on the far ground that fills most of the screen.
  float macroPatch = terrainFbm(warped * 0.020 + vec2(6.0, 19.0));
  float midPatch = terrainFbm(terrainRotate(warped, 0.64) * 0.095 + vec2(-11.0, 27.0));
  float dust = terrainFbm(warped * 0.18);
  float gravel = terrainRockMask(wash, shoulder, slope);
  float crust = terrainRidgedFbm(warped * 0.58 + 12.0) * basin * (1.0 - wash);
  float rockFace = smoothstep(0.20, 0.78, slope) * (shoulder * 0.72 + rockCover * 0.62);
  float fracturedRock = smoothstep(0.36, 0.88, terrainRidgedFbm(terrainRotate(warped, 0.41) * 1.58 + 8.0)) * rockFace;
  float desertVarnish = smoothstep(0.62, 0.98, terrainFbm(warped * 0.31 + vec2(120.0, 7.0))) * rockFace;

  // Detail terms default to 0 so the mix sequence below is byte-for-byte the
  // same order as before; only the values differ when a distance gate skips
  // the computation.
  float fineGrain = 0.0;
  float stoneField = 0.0;
  float ripple = 0.0;
  float washStrand = 0.0;
  vec3 gravelColor = terrainDustColor;

  // Mid-range flow detail (sand ripples + wash veins), faded out by ~360m.
  if (midDetail > 0.003) {
    float ripplePhase = terrainRotate(warped, -0.34).x * 0.58 +
      terrainRotate(warped, 0.46).y * 1.33 +
      terrainFbm(warped * 0.065) * 7.5;
    ripple = (sin(ripplePhase) * 0.5 + 0.5) * basin * (1.0 - wash);
    ripple = smoothstep(0.50, 0.88, ripple) * 0.14 * (0.55 + midPatch * 0.62) * midDetail;
    float washStrandA = terrainSandVein(warped, -0.18, 0.74, 0.42);
    float washStrandB = terrainSandVein(warped + vec2(43.0, -19.0), 0.23, 1.18, 0.55);
    washStrand = max(washStrandA * 0.72, washStrandB * 0.46) * wash * midDetail;
  }

  // Near-range fine stones + grain, faded out by ~145m. This block owns the
  // second (redundant) domain warp and all four voronoi-stone lookups — the
  // single most expensive part of the whole terrain shader.
  if (nearDetail > 0.003) {
    vec2 detail = terrainDetailWarp(p);
    fineGrain = terrainHash(floor(detail * 34.0 + terrainFbm(warped * 0.33) * 7.0));
    float pebble = terrainVoronoiStone(detail, 7.6, 0.34);
    float peaGravel = terrainVoronoiStone(detail, 6.8, 0.48) +
      terrainVoronoiStone(terrainRotate(detail + 21.0, 0.72), 13.5, 0.30) * 0.68;
    float coarseGravel = terrainVoronoiStone(terrainRotate(detail + vec2(37.0, 9.0), -0.52), 3.5, 0.36);
    float stonePatch = smoothstep(0.34, 0.92, terrainFbm(warped * 0.18 + 31.0));
    stoneField = clamp(pebble * 0.62 + peaGravel * 0.54 + coarseGravel * 0.92, 0.0, 1.0) *
      (0.12 + gravel * 0.62 + rockCover * 0.22) * (0.58 + stonePatch * 0.52) * (0.08 + nearDetail * 0.72);
    gravelColor = mix(terrainPebbleColor, terrainDustColor, 0.34 + (1.0 - gravel) * 0.18);
  }

  vec3 c = terrainSoilBaseColor(baseColor, soilId, wash, basin, slope, rockCover);
  vec3 warmDust = mix(terrainDustColor, vec3(0.72, 0.58, 0.37), macroPatch * 0.38);
  vec3 coolSilt = vec3(0.48, 0.45, 0.38);
  c = mix(c, warmDust, (0.04 + macroPatch * 0.10) * (1.0 - rockFace));
  c = mix(c, coolSilt, runon * basin * 0.10);
  c *= 0.78 + fineGrain * (0.04 + nearDetail * 0.18) + dust * 0.13 + macroPatch * 0.12;
  c = mix(c, terrainDustColor, crust * 0.13 + ripple * 0.08);
  c = mix(c, terrainWashColor, wash * 0.15 + washStrand * 0.14);
  c = mix(c, gravelColor, stoneField * (0.22 + gravel * 0.18));
  c = mix(c, terrainRockColor, rockFace * 0.42 + fracturedRock * 0.28);
  c = mix(c, vec3(0.23, 0.18, 0.14), desertVarnish * 0.20);
  c = mix(c, terrainDustColor, (1.0 - gravel) * basin * 0.07);
  c += warmDust * ripple * 0.030;
  c *= 0.88 + stoneField * 0.10 - fracturedRock * (0.025 + midDetail * 0.050) + midPatch * 0.09;
  return c;
}

vec3 terrainLandformColor() {
  float id = floor(vTerrainLandform + 0.5);
  if (id < 0.5) return vec3(0.43, 0.29, 0.20); // rockySlope
  if (id < 1.5) return vec3(0.62, 0.48, 0.28); // upperBajada
  if (id < 2.5) return vec3(0.20, 0.43, 0.62); // wash
  if (id < 3.5) return vec3(0.34, 0.57, 0.53); // washMargin
  if (id < 4.5) return vec3(0.70, 0.62, 0.36); // lowerBajada
  if (id < 5.5) return vec3(0.78, 0.70, 0.50); // sandyAlluvialFlat
  if (id < 6.5) return vec3(0.80, 0.78, 0.62); // calicheFlat
  return vec3(0.46, 0.56, 0.34); // basinFlat
}

vec3 terrainSoilTextureColor() {
  float id = floor(vTerrainDebugData.x + 0.5);
  if (id < 0.5) return vec3(0.34, 0.30, 0.28); // rock
  if (id < 1.5) return vec3(0.52, 0.44, 0.35); // gravel
  if (id < 2.5) return vec3(0.62, 0.58, 0.44); // wash alluvium
  if (id < 3.5) return vec3(0.82, 0.70, 0.46); // sand
  if (id < 4.5) return vec3(0.56, 0.48, 0.34); // loam
  return vec3(0.42, 0.46, 0.50); // clay
}

vec3 terrainScalarDebugColor(float value, vec3 lowColor, vec3 highColor) {
  float v = clamp(value, 0.0, 1.0);
  vec3 midColor = vec3(0.78, 0.74, 0.54);
  return v < 0.5
    ? mix(lowColor, midColor, v * 2.0)
    : mix(midColor, highColor, (v - 0.5) * 2.0);
}

vec3 terrainDebugColor(vec3 naturalColor) {
  if (terrainDebugMode < 0.5) return naturalColor;
  if (terrainDebugMode < 1.5) return terrainLandformColor();
  if (terrainDebugMode < 2.5) return terrainSoilTextureColor();
  if (terrainDebugMode < 3.5) return terrainScalarDebugColor(vTerrainDebugData.y, vec3(0.20, 0.30, 0.40), vec3(0.18, 0.58, 0.76));
  if (terrainDebugMode < 4.5) return terrainScalarDebugColor(vTerrainDebugData.z, vec3(0.72, 0.44, 0.26), vec3(0.56, 0.74, 0.95));
  return terrainScalarDebugColor(vTerrainDebugData.w, vec3(0.72, 0.66, 0.45), vec3(0.28, 0.26, 0.24));
}

float terrainSurfaceRoughness() {
  vec2 p = vTerrainWorldPosition.xz;
  vec2 warped = terrainDomainWarp(p);
  vec2 detail = terrainDetailWarp(p);
  float nearDetail = terrainNearDetailFade();
  float midDetail = terrainMidDetailFade();
  float wash = clamp(vTerrainDetail.x, 0.0, 1.0);
  float shoulder = clamp(vTerrainDetail.y, 0.0, 1.0);
  float basin = clamp(vTerrainDetail.z, 0.0, 1.0);
  float slope = clamp(vTerrainDetail.w, 0.0, 1.0);
  float gravel = terrainRockMask(wash, shoulder, slope);
  float rockCover = clamp(vTerrainDebugData.w, 0.0, 1.0);
  float mica = smoothstep(0.88, 0.995, terrainHash(floor(detail * 19.0) + floor(terrainRotate(detail, 0.47) * 3.0))) * nearDetail;
  float polishedWash = smoothstep(0.46, 0.92, wash) * (0.50 + terrainFbm(warped * 0.42) * 0.50) * midDetail;
  float exposedStone = smoothstep(0.24, 0.82, slope) * shoulder * midDetail;
  float varnish = smoothstep(0.66, 0.98, terrainFbm(warped * 0.31 + vec2(120.0, 7.0))) * rockCover * midDetail;
  float fineDust = (1.0 - gravel) * basin;
  return clamp(0.985 - polishedWash * 0.12 - exposedStone * 0.10 - mica * 0.08 - varnish * 0.07 + fineDust * 0.035, 0.72, 1.0);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = terrainDebugColor(applyTerrainSurface(diffuseColor.rgb));`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * terrainSurfaceRoughness(), 0.72, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = applyTerrainNormalAndBump(normal);`,
      );
  };

  material.customProgramCacheKey = () => 'terrain-material-v9-distance-gated';
  return material;
}
