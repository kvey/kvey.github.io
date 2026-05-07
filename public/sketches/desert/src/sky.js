import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

function createSunsetDome() {
  const uniforms = {
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    sunElevation: { value: 35 },
    cloudTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 sunDirection;
      uniform float sunElevation;
      uniform float cloudTime;
      varying vec3 vWorldDirection;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += noise(p) * a;
          p = p * vec2(2.08, 1.72) + vec2(19.4, 7.1);
          a *= 0.52;
        }
        return v;
      }

      vec2 safeNormalize(vec2 v) {
        return v / max(length(v), 0.0001);
      }

      void main() {
        vec3 dir = normalize(vWorldDirection);
        vec3 sunDir = normalize(sunDirection);

        float elev01 = smoothstep(0.0, 52.0, sunElevation);
        float sunset = 1.0 - smoothstep(12.0, 42.0, sunElevation);
        float horizon = exp(-abs(dir.y) * 5.3);
        float upper = smoothstep(-0.05, 0.82, dir.y);

        vec3 dayZenith = vec3(0.24, 0.48, 0.82);
        vec3 dayHorizon = vec3(0.80, 0.76, 0.66);
        vec3 duskZenith = vec3(0.08, 0.12, 0.30);
        vec3 duskUpper = vec3(0.34, 0.34, 0.62);
        vec3 duskHorizon = vec3(1.00, 0.54, 0.25);
        vec3 redBand = vec3(0.88, 0.17, 0.22);
        vec3 violetBelt = vec3(0.30, 0.18, 0.43);

        vec3 dayColor = mix(dayHorizon, dayZenith, upper);
        vec3 duskColor = mix(duskHorizon, mix(duskUpper, duskZenith, upper), upper);
        vec3 color = mix(duskColor, dayColor, elev01);

        float sunDot = max(dot(dir, sunDir), 0.0);
        float sunAzDot = dot(safeNormalize(dir.xz), safeNormalize(sunDir.xz));
        float sunSide = smoothstep(0.05, 0.92, sunAzDot);
        float antiSun = smoothstep(0.10, 0.88, -sunAzDot);
        float lowSun = (1.0 - elev01) * smoothstep(-6.0, 16.0, sunElevation);

        float goldGlow = pow(sunDot, mix(22.0, 90.0, elev01)) * (0.55 + lowSun * 1.9);
        float hotHorizon = horizon * sunSide * lowSun;
        float redHorizon = exp(-abs(dir.y - 0.02) * 18.0) * sunSide * sunset;
        float purpleBand = exp(-abs(dir.y - 0.09) * 12.0) * antiSun * sunset;

        color = mix(color, vec3(1.0, 0.78, 0.36), clamp(hotHorizon * 0.68 + goldGlow * 0.55, 0.0, 1.0));
        color = mix(color, redBand, clamp(redHorizon * 0.45, 0.0, 1.0));
        color = mix(color, violetBelt, clamp(purpleBand * 0.42, 0.0, 1.0));

        vec2 horizonDir = safeNormalize(dir.xz);
        vec2 cloudDrift = cloudTime * vec2(0.006, 0.0018);
        vec2 cloudUv = horizonDir * 3.3 + vec2(dir.y * 0.7, dir.y * 18.0);
        float cloudField = fbm(cloudUv + vec2(4.0, 1.7) + cloudDrift);
        float stretched = fbm(horizonDir * 9.0 + vec2(dir.y * 0.28, dir.y * 42.0) + cloudField * 1.4 + cloudDrift * vec2(1.7, 0.55));
        float cloudMask = smoothstep(0.56, 0.78, stretched);
        cloudMask *= smoothstep(-0.02, 0.12, dir.y) * (1.0 - smoothstep(0.55, 0.85, dir.y));
        cloudMask *= 0.24 + sunset * 0.58;

        vec3 cloudLit = mix(vec3(0.48, 0.50, 0.62), vec3(1.0, 0.47, 0.23), sunSide * sunset);
        vec3 cloudShade = mix(vec3(0.22, 0.22, 0.34), vec3(0.46, 0.22, 0.39), sunset);
        color = mix(color, mix(cloudShade, cloudLit, 0.36 + sunSide * 0.58), cloudMask);

        float alpha = clamp(0.36 + horizon * 0.38 + sunset * 0.18 + goldGlow * 0.18, 0.0, 0.82);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1200, 64, 32), material);
  mesh.renderOrder = -50;
  return { mesh, uniforms };
}

function createDistantMountains() {
  const uniforms = {
    sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    sunElevation: { value: 35 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 sunDirection;
      uniform float sunElevation;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 6; i++) {
          v += noise(p) * a;
          p = p * mat2(1.76, -1.02, 1.02, 1.76) + vec2(7.1, 13.7);
          a *= 0.53;
        }
        return v;
      }

      vec2 safeNormalize(vec2 v) {
        return v / max(length(v), 0.0001);
      }

      vec2 rotate2(vec2 v, float a) {
        float s = sin(a);
        float c = cos(a);
        return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
      }

      float lobe(vec2 dir, vec2 center, float width) {
        return pow(clamp(dot(dir, safeNormalize(center)) * 0.5 + 0.5, 0.0, 1.0), width);
      }

      float profile(vec2 dir, float layer) {
        // Basin-and-range silhouettes inspired by Tucson: high north/east
        // ranges, lower west hills, and a more distant southern ridge line.
        vec2 p = dir * (2.2 + layer * 0.35) + vec2(layer * 11.3, layer * 5.7);
        float catalinas = lobe(dir, vec2(-0.42, 1.0), 7.5);
        float rincons = lobe(dir, vec2(0.92, 0.38), 8.5);
        float tucsons = lobe(dir, vec2(-1.0, -0.16), 12.0);
        float santaRitas = lobe(dir, vec2(0.24, -1.0), 10.0);
        float rangeMass = clamp(
          catalinas * 1.08 +
          rincons * 0.76 +
          tucsons * 0.46 +
          santaRitas * 0.58,
          0.0,
          1.35
        );
        float shoulders = fbm(p * 1.25) * 0.13;
        float foldedRock = 1.0 - abs(fbm(p * 4.8 + vec2(17.4, 3.2)) * 2.0 - 1.0);
        float peakBreaks = pow(fbm(p * 3.2 + vec2(4.0, 21.0)), 2.6);
        float skyline = 0.31 + rangeMass * 0.28 + shoulders + foldedRock * 0.05 + peakBreaks * rangeMass * 0.13;
        return clamp(skyline, 0.25, 0.80);
      }

      void main() {
        float y = vUv.y;
        vec2 dir = safeNormalize(vWorldPosition.xz);
        float rearRidge = profile(rotate2(dir, 0.028), 1.0) - 0.07;
        float frontRidge = profile(dir, 0.0);
        float rearEdge = 1.0 - smoothstep(rearRidge - 0.014, rearRidge + 0.022, y);
        float frontEdge = 1.0 - smoothstep(frontRidge - 0.010, frontRidge + 0.017, y);
        float baseFade = smoothstep(0.08, 0.24, y);
        float alpha = max(rearEdge * 0.42, frontEdge * 0.92) * baseFade;
        if (alpha < 0.01) discard;

        float ridgeAhead = profile(rotate2(dir, 0.006), 0.0);
        float slopeLight = clamp((frontRidge - ridgeAhead) * 16.0 + 0.48, 0.0, 1.0);

        float angle = atan(dir.y, dir.x);
        vec2 sunXZ = safeNormalize(sunDirection.xz);
        float sunAngle = atan(sunXZ.y, sunXZ.x);
        float sunFacing = cos(angle - sunAngle) * 0.5 + 0.5;
        float elev01 = smoothstep(0.0, 42.0, sunElevation);
        float sunset = 1.0 - smoothstep(14.0, 46.0, sunElevation);

        vec3 farPurple = vec3(0.22, 0.20, 0.32);
        vec3 catalinaBlue = vec3(0.30, 0.36, 0.45);
        vec3 sunsetRim = vec3(0.78, 0.43, 0.28);
        vec3 haze = mix(vec3(0.74, 0.62, 0.55), vec3(0.64, 0.70, 0.78), elev01);

        vec3 rearColor = mix(vec3(0.36, 0.32, 0.43), vec3(0.48, 0.55, 0.62), elev01);
        vec3 frontColor = mix(farPurple, catalinaBlue, elev01);
        float frontAmount = frontEdge * smoothstep(frontRidge - 0.22, frontRidge + 0.02, y);
        vec3 color = mix(rearColor, frontColor, frontAmount);
        color = mix(color, sunsetRim, sunset * sunFacing * slopeLight * 0.34);
        color = mix(color, haze, 0.30 + y * 0.34 - frontAmount * 0.10);

        float detail = fbm(dir * 28.0 + vec2(y * 2.3, y * 8.1));
        float gullies = pow(1.0 - abs(fbm(dir * 54.0 + vec2(y * 5.0, 9.0)) * 2.0 - 1.0), 1.8);
        color *= 0.82 + detail * 0.12 + gullies * slopeLight * 0.08;
        alpha *= 1.0 - smoothstep(0.82, 1.0, y) * 0.35;

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(820, 820, 220, 512, 1, true), material);
  mesh.position.y = -55;
  mesh.renderOrder = -30;
  return { mesh, uniforms };
}

// Tucson sky: bright, hazy, with a sun whose azimuth/elevation drives
// both the atmospheric scatter and the directional light direction.
export function buildSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  scene.add(sky);

  const u = sky.material.uniforms;
  u.turbidity.value = 6.5;     // dusty atmosphere
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.85;

  const sun = new THREE.Vector3();
  const sunsetDome = createSunsetDome();
  const mountains = createDistantMountains();
  scene.add(sunsetDome.mesh);
  scene.add(mountains.mesh);

  function update({ azimuth = 145, elevation = 35 }) {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(sun);
    const sunsetAmount = 1 - THREE.MathUtils.smoothstep(elevation, 12, 44);
    u.turbidity.value = THREE.MathUtils.lerp(6.0, 11.5, sunsetAmount);
    u.rayleigh.value = THREE.MathUtils.lerp(1.15, 2.25, sunsetAmount);
    u.mieCoefficient.value = THREE.MathUtils.lerp(0.0045, 0.013, sunsetAmount);
    u.mieDirectionalG.value = THREE.MathUtils.lerp(0.78, 0.91, sunsetAmount);
    sunsetDome.uniforms.sunDirection.value.copy(sun);
    sunsetDome.uniforms.sunElevation.value = elevation;
    mountains.uniforms.sunDirection.value.copy(sun);
    mountains.uniforms.sunElevation.value = elevation;
    return sun;
  }

  function updateTime(elapsedSeconds) {
    sunsetDome.uniforms.cloudTime.value = elapsedSeconds;
  }

  return { sky, sunsetDome: sunsetDome.mesh, mountains: mountains.mesh, sun, update, updateTime };
}
