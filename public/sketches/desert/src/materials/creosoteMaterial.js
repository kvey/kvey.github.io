import * as THREE from 'three';

// Creosote uses coarse foliage cards. The shader cuts each card into repeated
// pairs of tiny waxy leaves, keeping instance geometry cheap at landscape scale.
export function createCreosoteMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide,
    alphaTest: 0.34,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 creosoteDetail;
varying vec4 vCreosoteDetail;
varying vec3 vCreosoteLocalPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCreosoteDetail = creosoteDetail;
float creosoteLeafCard = step(0.5, creosoteDetail.x);
float cardU = creosoteDetail.y * 2.0 - 1.0;
float cardV = creosoteDetail.z * 2.0 - 1.0;
float cardCup = (1.0 - cardU * cardU) * (1.0 - abs(cardV) * 0.45);
transformed += normal * creosoteLeafCard * cardCup * 0.004;
vCreosoteLocalPosition = transformed;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vCreosoteDetail;
varying vec3 vCreosoteLocalPosition;

float creosoteHash(float p) {
  return fract(sin(p * 139.17) * 43758.5453123);
}

float creosoteEllipse(vec2 p, vec2 center, vec2 radius) {
  vec2 q = (p - center) / radius;
  return 1.0 - smoothstep(0.72, 1.0, dot(q, q));
}

vec4 creosoteLeafCard(vec3 baseColor) {
  vec2 uv = clamp(vCreosoteDetail.yz, 0.0, 1.0);
  float id = vCreosoteDetail.w;
  float rows = 5.0 + floor(creosoteHash(id + 1.7) * 4.0);
  float y = uv.y * rows + creosoteHash(id + 4.1) * 0.42;
  float row = floor(y);
  float cellY = fract(y);
  float rowHash = creosoteHash(row + id * 17.0);
  float stagger = (rowHash - 0.5) * 0.08;

  float left = creosoteEllipse(uv, vec2(0.32 + stagger, 0.50), vec2(0.105 + rowHash * 0.025, 0.31));
  float right = creosoteEllipse(uv, vec2(0.68 + stagger, 0.50), vec2(0.105 + (1.0 - rowHash) * 0.025, 0.31));
  float mask = max(left, right);

  float edgeFade = smoothstep(0.02, 0.12, uv.x) * (1.0 - smoothstep(0.88, 0.98, uv.x))
    * smoothstep(0.00, 0.06, uv.y) * (1.0 - smoothstep(0.90, 1.00, uv.y));
  float dropout = step(0.10, creosoteHash(row * 3.9 + id * 23.0));
  float alpha = mask * edgeFade * dropout;

  float leafSide = step(right, left);
  float centerX = mix(0.68 + stagger, 0.32 + stagger, leafSide);
  float lateral = abs((uv.x - centerX) / 0.13);
  float along = abs(cellY - 0.50);
  float midrib = 1.0 - smoothstep(0.035, 0.12, lateral);
  float rim = smoothstep(0.66, 1.0, lateral + along * 0.55);
  float resinFleck = creosoteHash(floor(uv.x * 38.0) + floor(y * 9.0) * 11.0 + id * 31.0);

  vec3 shaded = baseColor;
  shaded *= 0.80 + 0.16 * resinFleck;
  shaded = mix(shaded, baseColor * vec3(1.18, 1.12, 0.76), midrib * mask * 0.24);
  shaded = mix(shaded, baseColor * vec3(0.64, 0.74, 0.50), rim * mask * 0.22);
  shaded = mix(shaded, baseColor * vec3(1.28, 1.20, 0.66), step(0.86, resinFleck) * mask * 0.12);

  return vec4(shaded, alpha);
}

vec3 creosoteStemDetail(vec3 baseColor) {
  float id = vCreosoteDetail.w;
  float fleck = creosoteHash(floor(vCreosoteLocalPosition.x * 90.0) + floor(vCreosoteLocalPosition.y * 70.0) * 17.0 + floor(vCreosoteLocalPosition.z * 90.0) * 31.0 + id * 29.0);
  return baseColor * (0.86 + fleck * 0.18);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vCreosoteDetail.x > 0.5) {
  vec4 creosoteLeaf = creosoteLeafCard(diffuseColor.rgb);
  diffuseColor.rgb = creosoteLeaf.rgb;
  diffuseColor.a *= creosoteLeaf.a;
} else {
  diffuseColor.rgb = creosoteStemDetail(diffuseColor.rgb);
}`,
      );
  };

  material.customProgramCacheKey = () => 'creosote-material-v2';
  return material;
}
