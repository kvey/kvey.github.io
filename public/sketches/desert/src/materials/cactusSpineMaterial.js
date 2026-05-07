import * as THREE from 'three';

// One shared material for cactus bodies. Geometry supplies a cactusSpine vec4:
//   x/y = procedural spine coordinates
//   z   = local strength
//   w   = mode: 1 ribbed cactus, 2 pad cactus, 0 disabled
export function createCactusSpineMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.74,
    metalness: 0.0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.cactusSpineColor = { value: new THREE.Color(0xf1e4bd) };
    shader.uniforms.cactusAreoleColor = { value: new THREE.Color(0xd7bd72) };

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
varying vec4 vCactusSpine;

float cactusSpineHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 cactusApplySpines(vec3 baseColor) {
  float strength = clamp(vCactusSpine.z, 0.0, 1.0);
  if (strength <= 0.0001) return baseColor;

  float areole = 0.0;
  float spine = 0.0;

  if (vCactusSpine.w < 1.5) {
    float ribCoord = fract(vCactusSpine.x);
    float ribDist = min(ribCoord, 1.0 - ribCoord);
    float ribBand = 1.0 - smoothstep(0.02, 0.115, ribDist);

    float rowCoord = fract(vCactusSpine.y);
    float rowDist = abs(rowCoord - 0.5);
    float rowDot = 1.0 - smoothstep(0.035, 0.215, rowDist);
    float breakup = 0.76 + cactusSpineHash(floor(vCactusSpine.xy)) * 0.30;

    areole = ribBand * rowDot * breakup;
    spine = ribBand * (0.12 + rowDot * 0.88) * breakup;
  } else {
    vec2 cell = fract(vCactusSpine.xy) - 0.5;
    float dotMask = 1.0 - smoothstep(0.055, 0.20, length(cell));
    float breakup = 0.70 + cactusSpineHash(floor(vCactusSpine.xy)) * 0.35;
    float needleLine = 1.0 - smoothstep(0.04, 0.18, abs(cell.x + cell.y * 0.65));

    areole = dotMask * breakup;
    spine = dotMask * (0.78 + needleLine * 0.22) * breakup;
  }

  float areoleMix = clamp(areole * strength * 0.70, 0.0, 0.82);
  float spineMix = clamp(spine * strength * 0.58, 0.0, 0.88);
  vec3 c = mix(baseColor, cactusAreoleColor, areoleMix);
  c = mix(c, cactusSpineColor, spineMix);
  return c + cactusSpineColor * spineMix * 0.035;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = cactusApplySpines(diffuseColor.rgb);`,
      );
  };

  material.customProgramCacheKey = () => 'cactus-spine-material-v1';
  return material;
}
