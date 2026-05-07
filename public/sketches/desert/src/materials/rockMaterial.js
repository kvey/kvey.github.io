import * as THREE from 'three';

export function createRockMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.0,
    flatShading: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockDustColor = { value: new THREE.Color(0xc8ad82) };
    shader.uniforms.rockDarkCrevice = { value: new THREE.Color(0x2f251c) };
    shader.uniforms.rockQuartzColor = { value: new THREE.Color(0xd8c7a1) };

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
uniform vec3 rockDarkCrevice;
uniform vec3 rockQuartzColor;
varying vec4 vRockDetail;
varying vec3 vRockObjectPosition;
varying vec3 vRockObjectNormal;

float rockHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.37, 0.73));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 applyRockSurface(vec3 baseColor) {
  float height01 = clamp(vRockDetail.x, 0.0, 1.0);
  float strata = clamp(vRockDetail.y, 0.0, 1.0);
  float crack = clamp(vRockDetail.z, 0.0, 1.0);
  float grain = clamp(vRockDetail.w, 0.0, 1.0);
  float top = smoothstep(0.12, 0.88, vRockObjectNormal.y) * smoothstep(0.34, 0.95, height01);

  float fineSpeckle = rockHash(floor(vRockObjectPosition * 92.0));
  float coarseSpeckle = rockHash(floor(vRockObjectPosition * 28.0 + grain * 13.0));
  float quartz = smoothstep(0.965, 1.0, fineSpeckle) * (0.45 + top * 0.55);

  vec3 c = baseColor;
  c *= 0.92 + fineSpeckle * 0.13 + coarseSpeckle * 0.05;
  c = mix(c, rockDustColor, top * 0.24);
  c = mix(c, rockDustColor, strata * 0.16);
  c = mix(c, rockDarkCrevice, crack * 0.58);
  c = mix(c, rockQuartzColor, quartz * 0.46);
  return c;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = applyRockSurface(diffuseColor.rgb);`,
      );
  };

  material.customProgramCacheKey = () => 'rock-material-v1';
  return material;
}
