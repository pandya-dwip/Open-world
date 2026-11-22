/** Cheap 2D value noise shared by the terrain and ocean shaders. */
export const NOISE_GLSL = /* glsl */ `
  float vnHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(vnHash(i), vnHash(i + vec2(1.0, 0.0)), u.x),
               mix(vnHash(i + vec2(0.0, 1.0)), vnHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`
