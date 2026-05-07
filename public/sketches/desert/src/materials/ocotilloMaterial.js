import * as THREE from 'three';

// Ocotillo material. Geometry supplies ocotilloDetail:
//   x = part: 0 stem, 1 flower
//   y = part-local vertical coordinate
//   z = part-local around coordinate
//   w = hydration, where dry stems are gray-brown and watered stems are green
export function createOcotilloMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const seasonalUniforms = {
    ocotilloFlowerVisibility: { value: 1 },
  };
  material.userData.setSeasonalVisibility = ({
    ocotilloFlowering = true,
  } = {}) => {
    seasonalUniforms.ocotilloFlowerVisibility.value = ocotilloFlowering ? 1 : 0;
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.ocotilloFlowerVisibility = seasonalUniforms.ocotilloFlowerVisibility;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 ocotilloDetail;
varying vec4 vOcotilloDetail;

float ocotilloFlowerLobe(float around) {
  return 0.5 + 0.5 * sin(around * 31.415927);
}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vOcotilloDetail = ocotilloDetail;
if (ocotilloDetail.x > 0.5) {
  float flowerAlong = clamp(ocotilloDetail.y, 0.0, 1.0);
  float lip = smoothstep(0.54, 1.0, flowerAlong);
  float throat = 1.0 - smoothstep(0.0, 0.42, flowerAlong);
  float lobe = ocotilloFlowerLobe(fract(ocotilloDetail.z));
  transformed += normal * (lip * (0.010 + lobe * 0.014) - throat * 0.004);
}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vOcotilloDetail;
uniform float ocotilloFlowerVisibility;

float ocotilloFlowerLobe(float around) {
  return 0.5 + 0.5 * sin(around * 31.415927);
}

float ocotilloHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 ocotilloStemShader(vec3 baseColor) {
  float t = clamp(vOcotilloDetail.y, 0.0, 1.0);
  float around = fract(vOcotilloDetail.z);
  float hydration = clamp(vOcotilloDetail.w, 0.0, 1.0);

  float verticalFiber = 0.5 + 0.5 * sin((around * 34.0 + t * 2.5) * 6.2831853);
  float fineFiber = 0.5 + 0.5 * sin((around * 71.0 - t * 7.0) * 6.2831853);
  float nodeRow = abs(fract(t * 27.0 + around * 2.3) - 0.5);
  float node = 1.0 - smoothstep(0.035, 0.12, nodeRow);
  float fleck = ocotilloHash(floor(vec2(t * 42.0, around * 18.0)));
  float tipDrying = smoothstep(0.72, 1.0, t) * (1.0 - hydration);

  vec3 paleSpine = vec3(0.78, 0.72, 0.62);
  vec3 dryDust = vec3(0.58, 0.54, 0.47);
  vec3 greenSkin = vec3(0.34, 0.48, 0.28);

  vec3 shaded = baseColor;
  shaded = mix(shaded, dryDust, (1.0 - hydration) * (0.18 + tipDrying * 0.22));
  shaded = mix(shaded, greenSkin, hydration * (0.14 + fineFiber * 0.12));
  shaded *= 0.80 + verticalFiber * 0.15 + fleck * 0.08;
  shaded = mix(shaded, paleSpine, node * (0.10 + 0.16 * fleck));
  return shaded;
}

vec3 ocotilloFlowerShader(vec3 baseColor) {
  float along = clamp(vOcotilloDetail.y, 0.0, 1.0);
  float around = fract(vOcotilloDetail.z);
  float rib = 0.5 + 0.5 * sin(around * 31.415927);
  float fineRib = 0.5 + 0.5 * sin((around * 10.0 + along * 0.45) * 6.2831853);
  float throat = smoothstep(0.0, 0.34, along);
  float tube = smoothstep(0.18, 0.72, along) * (1.0 - smoothstep(0.92, 1.0, along));
  float lip = smoothstep(0.58, 1.0, along);
  float lobe = ocotilloFlowerLobe(around);
  float hotTip = smoothstep(0.62, 1.0, along) * (0.62 + lobe * 0.38);

  vec3 shaded = baseColor;
  shaded *= 0.66 + rib * 0.12 + fineRib * 0.10 + tube * 0.08 + hotTip * 0.22;
  shaded = mix(shaded, vec3(1.0, 0.34, 0.10), hotTip * 0.36);
  shaded = mix(shaded, vec3(0.72, 0.08, 0.05), (1.0 - throat) * 0.32);
  shaded = mix(shaded, vec3(0.98, 0.56, 0.18), lip * lobe * 0.20);
  return shaded;
}

vec3 ocotilloApplyDetail(vec3 baseColor) {
  if (vOcotilloDetail.x > 0.5) return ocotilloFlowerShader(baseColor);
  return ocotilloStemShader(baseColor);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vOcotilloDetail.x > 0.5 && ocotilloFlowerVisibility < 0.5) discard;
diffuseColor.rgb = ocotilloApplyDetail(diffuseColor.rgb);`,
      );
  };

  material.customProgramCacheKey = () => 'ocotillo-material-v3-tubular-flowers';
  return material;
}
