import * as THREE from 'three';

// Shared material for palo verde and mesquite. Geometry supplies treeDetail:
//   x = part: 0 bark, 1 leaf/flower leaflet, 2 mesquite pod, 3 thorn
//   y/z = part-local coordinates
//   w = stable random id for procedural breakup
export function createTreeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 treeDetail;
varying vec4 vTreeDetail;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTreeDetail = treeDetail;
float treeLeafMask = step(0.5, treeDetail.x) * step(treeDetail.x, 1.5);
float treePodMask = step(1.5, treeDetail.x) * step(treeDetail.x, 2.5);
float leafletCurl = sin((treeDetail.y + treeDetail.w) * 6.2831853) * (1.0 - min(abs(treeDetail.z), 1.0));
transformed += normal * treeLeafMask * leafletCurl * 0.0045;
float podSeeds = 0.5 + 0.5 * cos(treeDetail.y * 31.415927 + treeDetail.w * 8.0);
float podRound = 0.65 + 0.35 * cos((treeDetail.z - 0.5) * 6.2831853);
transformed += normal * treePodMask * podSeeds * podRound * 0.010;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vTreeDetail;

float treeHash(float p) {
  return fract(sin(p * 127.13) * 43758.5453123);
}

vec3 treeApplyLeafShader(vec3 baseColor) {
  float along = clamp(vTreeDetail.y, 0.0, 1.0);
  float lateral = clamp(abs(vTreeDetail.z), 0.0, 1.0);
  float id = vTreeDetail.w;
  float midrib = 1.0 - smoothstep(0.045, 0.18, lateral);
  float edge = smoothstep(0.72, 1.0, lateral);
  float tip = smoothstep(0.82, 1.0, along) + smoothstep(0.18, 0.0, along);
  float fineVeins = smoothstep(0.78, 1.0, sin((along * 9.0 + id * 5.0) * 6.2831853) * 0.5 + 0.5);
  float leafletBands = smoothstep(0.22, 0.50, abs(fract(along * 18.0 + id * 0.37) - 0.5));
  float freckle = treeHash(floor((along + id) * 17.0) + floor((lateral + id) * 11.0));

  vec3 shaded = baseColor;
  shaded *= 0.78 + 0.18 * (1.0 - edge) + 0.08 * freckle;
  shaded *= 0.82 + 0.18 * leafletBands;
  shaded = mix(shaded, baseColor * vec3(1.18, 1.12, 0.82), midrib * 0.34);
  shaded = mix(shaded, baseColor * vec3(0.62, 0.76, 0.58), edge * 0.28);
  shaded = mix(shaded, baseColor * vec3(0.82, 0.90, 0.68), fineVeins * (1.0 - edge) * 0.11);
  shaded = mix(shaded, baseColor * vec3(0.88, 0.82, 0.58), clamp(tip, 0.0, 1.0) * 0.10);
  return shaded;
}

vec3 treeApplyPodShader(vec3 baseColor) {
  float t = clamp(vTreeDetail.y, 0.0, 1.0);
  float around = fract(vTreeDetail.z);
  float id = vTreeDetail.w;
  float node = 1.0 - smoothstep(0.035, 0.12, abs(fract(t * 5.0 + id * 0.13) - 0.5));
  float seedBulge = pow(0.5 + 0.5 * cos(t * 31.415927 + id * 8.0), 2.2);
  float seam = 1.0 - smoothstep(0.035, 0.18, abs(around - 0.5));
  float speckle = treeHash(floor(t * 28.0) + floor(around * 9.0) + id * 19.0);

  vec3 golden = baseColor * vec3(1.18, 1.00, 0.74);
  vec3 constricted = baseColor * vec3(0.56, 0.46, 0.34);
  vec3 shaded = mix(baseColor * 0.86, golden, seedBulge * 0.28);
  shaded = mix(shaded, constricted, node * 0.36);
  shaded = mix(shaded, baseColor * vec3(0.50, 0.42, 0.30), seam * 0.22);
  shaded *= 0.92 + speckle * 0.15;
  return shaded;
}

vec3 treeApplyDetail(vec3 baseColor) {
  if (vTreeDetail.x > 0.5 && vTreeDetail.x < 1.5) return treeApplyLeafShader(baseColor);
  if (vTreeDetail.x > 1.5 && vTreeDetail.x < 2.5) return treeApplyPodShader(baseColor);
  return baseColor;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = treeApplyDetail(diffuseColor.rgb);`,
      );
  };

  material.customProgramCacheKey = () => 'tree-material-v2';
  return material;
}
