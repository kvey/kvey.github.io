const UNCHARTED2_TONEMAPPING_GLSL = `
vec3 Tonemap_Uncharted2(vec3 x)
{
  x *= 16.0;
  const float A = 0.15;
  const float B = 0.50;
  const float C = 0.10;
  const float D = 0.20;
  const float E = 0.02;
  const float F = 0.30;

  return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}

vec3 CustomToneMapping(vec3 color)
{
  return Tonemap_Uncharted2(color * toneMappingExposure);
}
`;

export function installUncharted2Tonemapping(THREE) {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
    /vec3\s+CustomToneMapping\s*\(\s*vec3\s+color\s*\)\s*\{\s*return\s+color\s*;\s*\}/,
    UNCHARTED2_TONEMAPPING_GLSL.trim(),
  );
}
