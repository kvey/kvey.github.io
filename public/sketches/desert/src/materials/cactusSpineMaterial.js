import * as THREE from 'three';

// One shared material for cactus bodies. Geometry supplies a cactusSpine vec4:
//   x/y = procedural spine coordinates
//   z   = local strength
//   w   = mode: 1 ribbed cactus, 2 pad cactus, 5 dense cholla, 8+age cholla sheath, 0 disabled
export function createCactusSpineMaterial() {
  const seasonalUniforms = {
    saguaroFlowerVisibility: { value: 1 },
    saguaroFruitVisibility: { value: 1 },
  };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
    alphaTest: 0.06,
    alphaToCoverage: true,
  });
  material.defaultAttributeValues = {
    ...(material.defaultAttributeValues ?? {}),
    cactusBillboard: [0, 0, 0, 0],
  };
  material.extensions = { ...(material.extensions ?? {}), derivatives: true };
  material.userData.setSeasonalVisibility = ({
    seasonalState = null,
    saguaroFlowering = seasonalUniforms.saguaroFlowerVisibility.value > 0.5,
    saguaroFruiting = seasonalUniforms.saguaroFruitVisibility.value > 0.5,
  } = {}) => {
    seasonalUniforms.saguaroFlowerVisibility.value = (seasonalState?.saguaroFlowering ?? saguaroFlowering) ? 1 : 0;
    seasonalUniforms.saguaroFruitVisibility.value = (seasonalState?.saguaroFruiting ?? saguaroFruiting) ? 1 : 0;
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
attribute vec4 cactusBillboard;
varying vec4 vCactusSpine;
varying vec4 vCactusBillboard;
varying vec3 vCactusWorldNormal;
varying vec3 vCactusViewDir;
// Mode 11 (cholla fur) screen-space alpha compensation. When a blade is wider
// than its true geometric width (because of the screen-space minimum), we
// dial alpha down so the integrated contribution matches a slim hair instead
// of a fat ribbon. 1.0 = full geometric width visible up close.
varying float vCactusAlphaScale;
// World-space surface position — fragment shader needs it for the cholla
// tubercle bump map (Mikkelsen surface-gradient procedural normal).
varying vec3 vCactusWorldPos;

// Per-blade straight quill used by mode 10 spines.
//   bladeDir (= attribute "normal") is the unit direction the spine points,
//     normally the cactus surface normal at its anchor (perpendicular).
//   bladeBinormal (= attribute "cactusBillboard.xyz") is a pre-computed unit
//     vector perpendicular to bladeDir — orients the strip width axis.
// The vertex shader builds a straight line from the anchor along bladeDir of
// length bladeLen, offsets sideways by width(t) along bladeBinormal, and
// emits a curved face normal so the flat strip lights as a rounded quill.
void cactusSpineBlade(vec3 base, vec3 bladeDir, vec3 bladeBinormal,
    float bladeLen, float bladeT, float bladeSide, float bladeWidth,
    out vec3 outPos, out vec3 outNormal) {
  vec3 D = normalize(bladeDir);
  vec3 B = bladeBinormal - D * dot(bladeBinormal, D);
  float bLen = length(B);
  if (bLen > 0.001) {
    B /= bLen;
  } else {
    // Degenerate hint: pick any axis not parallel to D.
    vec3 fallback = abs(D.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    B = normalize(cross(D, fallback));
  }
  // Width tapers cubically toward the tip — fat at the areole, needle at the
  // tip — and the strip is laid out perpendicular to bladeDir.
  float widthAt = bladeWidth * pow(1.0 - bladeT, 1.7) * 0.5;
  outPos = base + D * (bladeLen * bladeT) + B * (bladeSide * widthAt);
  // Curved normal: rotate D toward B by side so the flat strip self-shades
  // like a rounded cross-section.
  outNormal = normalize(D + B * bladeSide * 0.42 - D * abs(bladeSide) * 0.10);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
// Mode 10 — saguaro/barrel straight quill (cactusSpineBlades.js).
if (cactusSpine.w > 9.5 && cactusSpine.w < 10.5) {
  vec3 _bladePos;
  vec3 _bladeNormal;
  cactusSpineBlade(position, normal, cactusBillboard.xyz, cactusBillboard.w,
    cactusSpine.x, cactusSpine.y, cactusSpine.z, _bladePos, _bladeNormal);
  objectNormal = _bladeNormal;
}
// Mode 11 — cholla fur. Each blade is a view-aligned billboard strip whose
// width offset happens in <project_vertex>, not here, so the normal we set
// is just the anchor surface normal — same lighting as the cactus body.
if (cactusSpine.w > 10.5 && cactusSpine.w < 11.5) {
  objectNormal = normalize(normal);
}`,
      )
      .replace(
        '#include <begin_vertex>',
`#include <begin_vertex>
vCactusSpine = cactusSpine;
vCactusBillboard = cactusBillboard;
vCactusAlphaScale = 1.0;
if (cactusSpine.w > 9.5 && cactusSpine.w < 10.5) {
  vec3 _bladePos;
  vec3 _bladeNormal;
  cactusSpineBlade(position, normal, cactusBillboard.xyz, cactusBillboard.w,
    cactusSpine.x, cactusSpine.y, cactusSpine.z, _bladePos, _bladeNormal);
  transformed = _bladePos;
}
if (cactusSpine.w > 10.5 && cactusSpine.w < 11.5) {
  // Centerline only — view-space width offset happens in project_vertex so
  // each blade can be billboarded toward the camera.
  transformed = position + normalize(normal) * (cactusBillboard.w * cactusSpine.x);
}
vec4 cactusWorldPosition = modelMatrix * vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cactusWorldPosition = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#endif
vCactusWorldPos = cactusWorldPosition.xyz;
vCactusWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
vCactusViewDir = normalize(cameraPosition - cactusWorldPosition.xyz);`,
      );
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
// Cholla billboard cards live in mode (8, 9]; modes 10 and 11 (spine blades)
// skip this branch — mode 10's width is baked in, mode 11 is handled below.
if (vCactusSpine.w > 7.5 && vCactusSpine.w < 9.5 && cactusBillboard.z > 0.0001) {
  vec3 cactusViewNormal = normalize(mat3(viewMatrix) * vCactusWorldNormal);
  vec2 spineOut = cactusViewNormal.xy;
  float spineOutLen = length(spineOut);
  spineOut = spineOutLen > 0.0001 ? spineOut / spineOutLen : vec2(1.0, 0.0);
  vec2 spineSide = vec2(-spineOut.y, spineOut.x);
  mvPosition.xy += spineOut * cactusBillboard.x * cactusBillboard.z
    + spineSide * cactusBillboard.y * cactusBillboard.w;
  mvPosition.z += max(cactusBillboard.z, cactusBillboard.w) * 0.16;
}
// Mode 11 (cholla fur): apply the strip width in view space, perpendicular
// to the blade direction projected onto the screen. This view-aligns every
// blade so it always presents max area to the camera (no edge-on flicker)
// and lets us enforce a screen-space minimum width — sub-pixel blades thicken
// up just enough to stop aliasing into noise, with alpha dialed back to keep
// the perceived halo density stable.
if (vCactusSpine.w > 10.5 && vCactusSpine.w < 11.5) {
  // Transform the bladeDir (the original "normal" attribute) into view space.
  // For instanced meshes the full chain is viewMatrix * modelMatrix * instanceMatrix.
  mat3 cactusViewBasis;
  #ifdef USE_INSTANCING
    cactusViewBasis = mat3(viewMatrix * modelMatrix * instanceMatrix);
  #else
    cactusViewBasis = mat3(viewMatrix * modelMatrix);
  #endif
  vec3 viewBladeDir = normalize(cactusViewBasis * normal);
  // Screen-plane perpendicular to the blade direction. Robust against blades
  // pointing nearly along the view axis (degenerate projection).
  vec2 viewBladeDir2D = viewBladeDir.xy;
  float blade2DLen = length(viewBladeDir2D);
  vec2 viewBinormal2D = blade2DLen > 0.01
    ? vec2(-viewBladeDir2D.y, viewBladeDir2D.x) / blade2DLen
    : vec2(0.0, 1.0);

  float bladeT = vCactusSpine.x;
  float bladeSide = vCactusSpine.y;
  // True world-space width — spines visually shrink as the camera backs up,
  // the way real geometry does. No screen-space minimum-width clamp here; if
  // distant blades go sub-pixel that's just what spines do at distance.
  float trueWidth = vCactusSpine.z * pow(1.0 - bladeT, 1.7) * 0.5;
  vCactusAlphaScale = 1.0;
  mvPosition.xy += viewBinormal2D * (bladeSide * trueWidth);
}
gl_Position = projectionMatrix * mvPosition;`,
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
varying vec4 vCactusBillboard;
varying vec3 vCactusWorldNormal;
varying vec3 vCactusViewDir;
varying float vCactusAlphaScale;
varying vec3 vCactusWorldPos;

// Mikkelsen surface-gradient procedural bump: derives a tangent-space normal
// perturbation from a scalar height field using only screen-space derivatives
// of world position + normal. No tangent attributes needed. Used by the cholla
// joint shader (mode 5/6) to lift tubercle peaks off the cylinder.
vec3 cactusPerturbNormal(vec3 surfNormal, vec3 surfPos, float height, float scale) {
  vec3 dpdx = dFdx(surfPos);
  vec3 dpdy = dFdy(surfPos);
  float dhdx = dFdx(height);
  float dhdy = dFdy(height);
  vec3 r1 = cross(dpdy, surfNormal);
  vec3 r2 = cross(surfNormal, dpdx);
  float det = dot(dpdx, r1);
  if (abs(det) < 1e-6) return surfNormal;
  vec3 surfGrad = (r1 * dhdx + r2 * dhdy) / det;
  return normalize(surfNormal - scale * surfGrad);
}

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

float cactusChollaNeedleCluster(vec2 p, vec2 seedCell) {
  float needles = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float h0 = cactusSpineHash(seedCell + vec2(fi * 17.9, 5.7));
    float h1 = cactusSpineHash(seedCell + vec2(fi * 11.3, 23.1));
    float h2 = cactusSpineHash(seedCell + vec2(fi * 4.7, 53.2));
    float angle = (fi / 12.0) * 6.2831853 + (h0 - 0.5) * 0.72;
    vec2 dir = vec2(cos(angle), sin(angle));
    float len = mix(0.30, 0.62, h1);
    float width = mix(0.0065, 0.014, h2);
    needles = max(needles, cactusNeedleParticle(p, dir, len, width));
  }
  return needles;
}

float cactusCardLine(vec2 uv, vec2 a, vec2 b, float width) {
  float d = cactusSegmentDistance(uv, a, b) - width;
  float aa = clamp((fwidth(uv.x) + fwidth(uv.y)) * 2.0, 0.003, 0.050);
  float line = 1.0 - smoothstep(0.0, aa, d);
  float along = clamp(dot(uv - a, b - a) / max(dot(b - a, b - a), 0.0001), 0.0, 1.0);
  return line * smoothstep(0.02, 0.12, along) * (1.0 - smoothstep(0.92, 1.0, along));
}

float cactusCardSpineMask(vec2 uv, vec2 seed) {
  float mask = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float h0 = cactusSpineHash(seed + vec2(fi * 19.1, 2.7));
    float h1 = cactusSpineHash(seed + vec2(fi * 11.6, 8.3));
    float h2 = cactusSpineHash(seed + vec2(fi * 5.4, 17.8));
    float rootY = mix(0.22, 0.78, h0);
    float tipY = clamp(rootY + mix(-0.20, 0.20, h1), 0.04, 0.96);
    float tipX = mix(0.82, 1.00, h2);
    float width = mix(0.0045, 0.0105, h2);
    mask = max(mask, cactusCardLine(uv, vec2(0.045, rootY), vec2(tipX, tipY), width));
  }
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float h0 = cactusSpineHash(seed + vec2(fi * 7.2, 31.4));
    float rootY = mix(0.28, 0.72, h0);
    float tipY = clamp(rootY + mix(-0.14, 0.14, cactusSpineHash(seed + vec2(fi, 44.0))), 0.06, 0.94);
    mask = max(mask, cactusCardLine(uv, vec2(0.02, rootY), vec2(0.58, tipY), 0.0075) * 0.72);
  }
  return clamp(mask, 0.0, 1.0);
}

vec4 cactusApplyChollaCard(vec3 baseColor) {
  float age = clamp(vCactusSpine.w - 8.0, 0.0, 1.0);
  vec2 uv = vec2(
    clamp(vCactusSpine.x, 0.0, 1.0),
    clamp(fract(vCactusSpine.y), 0.0, 1.0)
  );
  vec2 seed = vec2(floor(vCactusSpine.y), floor(vCactusSpine.y * 0.173));
  float strength = clamp(vCactusSpine.z, 0.0, 2.5);
  vec3 N = normalize(vCactusWorldNormal);
  vec3 V = normalize(vCactusViewDir);
  float facing = abs(dot(N, V));
  float rim = 1.0 - smoothstep(0.26, 0.92, facing);

  float root = exp(-(uv.x * uv.x * 28.0 + (uv.y - 0.5) * (uv.y - 0.5) * 42.0));
  float spine = cactusCardSpineMask(uv, seed);
  float centerMass = 1.0 - smoothstep(0.18, 0.46, abs(uv.y - 0.5));
  float innerFade = smoothstep(0.03, 0.22, uv.x) * (1.0 - smoothstep(0.76, 1.0, uv.x));
  float furField = centerMass * innerFade;
  float edgeFade = smoothstep(0.015, 0.080, uv.x)
    * (1.0 - smoothstep(0.96, 1.0, uv.x))
    * smoothstep(0.02, 0.10, uv.y)
    * (1.0 - smoothstep(0.90, 0.98, uv.y));
  float alpha = clamp((spine * 1.18 + furField * 0.030 + root * 0.030) * strength * edgeFade, 0.0, 1.0);

  vec3 youngSheath = vec3(1.0, 0.82, 0.28);
  vec3 oldSheath = vec3(0.78, 0.55, 0.20);
  vec3 sheathColor = mix(youngSheath, oldSheath, age * 0.76);
  sheathColor *= mix(0.86, 1.16, smoothstep(0.12, 0.92, uv.x));
  sheathColor += youngSheath * rim * 0.24;

  vec3 rootColor = mix(vec3(0.76, 0.58, 0.26), vec3(0.54, 0.38, 0.16), age * 0.62);
  vec3 c = mix(rootColor, sheathColor, smoothstep(0.04, 0.22, uv.x));
  c = mix(c, youngSheath, spine * 0.68);
  c += youngSheath * (spine + furField * 0.18) * rim * 0.30;
  return vec4(c, alpha);
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
  } else if (vCactusSpine.w > 4.5) {
    vec2 cellId = floor(vCactusSpine.xy);
    vec2 local = fract(vCactusSpine.xy) - 0.5;
    float faceFade = 1.0 - smoothstep(0.42, 0.72, length(local));
    float breakup = 0.72 + cactusSpineHash(cellId) * 0.36;
    float density = mix(8.0, 12.0, cactusSpineHash(cellId + 4.19));
    float sheath = cactusParticleDisk(local, 0.255) * 0.42
      + cactusMicroParticles(local, cellId, density) * 0.56;

    areole = sheath * faceFade * breakup;
    spine = cactusChollaNeedleCluster(local, cellId) * faceFade * breakup;
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
  float chollaMode = step(4.5, vCactusSpine.w);
  float areoleMix = clamp(areole * strength * mix(0.58, 0.88, chollaMode), 0.0, mix(0.70, 0.86, chollaMode));
  float spineMix = clamp(spine * strength * mix(0.72, 1.05, chollaMode), 0.0, mix(0.82, 0.94, chollaMode));
  vec3 c = mix(baseColor, cactusAreoleColor, areoleMix);
  c = mix(c, cactusSpineColor, spineMix);
  return c + cactusSpineColor * spineMix * mix(0.035, 0.075, chollaMode);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
// Cholla joint tubercle bump (modes 5/6). Each cell of the cactusSpine grid
// is one tubercle; a gaussian dome at the cell center perturbs the lighting
// normal so the joint reads as bumpy/knobby like the real plant. Mode 5
// covers the joint cylinders and dropped joints; the trunk uses mode 5 with
// large cell coords (~10 along y) so the bump is broad and subtle there.
if (vCactusSpine.w > 4.5 && vCactusSpine.w < 7.5) {
  vec2 cell = fract(vCactusSpine.xy) - 0.5;
  // Squash so X (azimuth) and Y (length) cells read with similar aspect.
  cell.x *= 1.05;
  cell.y *= 0.95;
  float heightField = exp(-(cell.x * cell.x * 2.6 + cell.y * cell.y * 2.9));
  normal = cactusPerturbNormal(normalize(normal), vCactusWorldPos, heightField, 0.42);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
// Cheap backface cull for the closed body surface (modes < 7.5) — the mesh is
// DoubleSide only so the thin spine blades/cards (modes 7.5..11.5) show from
// both sides, but the tube/pad bodies are solid, so their back faces are
// wasted PBR + fog fragments. Discarding here (before lighting) reclaims that
// on the fill-bound GPU. Blades and billboard cards keep both faces.
if (!gl_FrontFacing && vCactusSpine.w < 7.5) discard;
if (vCactusSpine.w > 2.5 && vCactusSpine.w < 3.5 && saguaroFlowerVisibility < 0.5) discard;
if (vCactusSpine.w > 3.5 && vCactusSpine.w < 4.5 && saguaroFruitVisibility < 0.5) discard;
if (vCactusSpine.w > 9.5 && vCactusSpine.w < 10.5) {
  // Mode 10: saguaro/barrel geometric spine blade. Vertex color carries the
  // per-blade tone; tip and edge taper come from the geometry/normal.
  float tipFade = 1.0 - smoothstep(0.78, 1.0, vCactusSpine.x);
  diffuseColor.rgb *= mix(0.86, 1.10, tipFade);
  diffuseColor.rgb = mix(diffuseColor.rgb, cactusSpineColor, 0.32 + tipFade * 0.18);
  diffuseColor.a = 1.0;
} else if (vCactusSpine.w > 10.5 && vCactusSpine.w < 11.5) {
  // Mode 11: cholla fur quill. View-aligned strip faked into a round golden
  // needle via:
  //   - lateral alpha fade   (strip edges soft, center opaque)
  //   - lateral shading      (edges darker — fake cylindrical cross-section)
  //   - sharp tip taper      (final ~12% of length fades to a point)
  //   - small woolly base    (first ~4% sits in the dark areole tuft)
  //   - bright sheath tint   (cactusSpineColor catches light along the shaft)
  float bladeT = vCactusSpine.x;
  // bladeSide is +/-1 at strip edges, interpolates to 0 at the centerline.
  float radial = abs(vCactusSpine.y);
  // Soft round cross-section: full coverage near the center, alpha tail at the
  // edges. With alphaToCoverage on, neighbouring spines dither together into
  // a continuous golden halo instead of looking like cut-out ribbons.
  float coverage = 1.0 - smoothstep(0.32, 1.0, radial);
  // Edge darkening — sells the round-needle illusion under any light direction.
  float roundShade = 1.0 - radial * radial * 0.45;
  // Sharp needle tip: hold full width for most of the length, taper fast near 1.
  float tipFade = 1.0 - smoothstep(0.86, 1.0, bladeT);
  // Dark base where the spine emerges from the areole's woolly tuft.
  float baseShade = mix(0.55, 1.0, smoothstep(0.0, 0.05, bladeT));
  vec3 sheathTone = cactusSpineColor;
  // Sun-bright sheath along the shaft, tip eases toward the same cream color.
  vec3 c = diffuseColor.rgb * roundShade * baseShade;
  c = mix(c, sheathTone, 0.22 + (1.0 - bladeT) * 0.12);
  // A whisper of additive light along the shaft — papery sheaths glow when lit.
  c += sheathTone * 0.08 * (1.0 - radial) * smoothstep(0.05, 0.55, bladeT);
  diffuseColor.rgb = c;
  diffuseColor.a = vCactusAlphaScale * coverage * tipFade;
} else if (vCactusSpine.w > 7.5) {
  vec4 chollaCard = cactusApplyChollaCard(diffuseColor.rgb);
  diffuseColor.rgb = chollaCard.rgb;
  diffuseColor.a = chollaCard.a;
} else {
  diffuseColor.rgb = cactusApplySpines(diffuseColor.rgb);
  diffuseColor.a = 1.0;
}`,
      );
  };

  material.customProgramCacheKey = () => 'cactus-spine-material-v24-cholla-worldspace-width';
  return material;
}
