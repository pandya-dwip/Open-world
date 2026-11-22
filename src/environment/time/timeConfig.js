// Day-night cycle settings: clock speeds, the sun's path and the look of the
// sky and light through the day. Keyframes are interpolated smoothly.

export const TIME = {
  startHour: 8.5,
  defaultSpeed: '10x',
  // game minutes that pass per real second
  speeds: {
    real: { label: 'Real', gameMinutesPerSecond: 1 / 60 }, // game clock = wall clock
    '1x': { label: '1×', gameMinutesPerSecond: 1 }, // one day lasts 24 minutes
    '5x': { label: '5×', gameMinutesPerSecond: 5 },
    '10x': { label: '10×', gameMinutesPerSecond: 10 }, // one day lasts 2.4 minutes
    '30x': { label: '30×', gameMinutesPerSecond: 30 },
  },
  sunrise: 6.0, // sun on the horizon (centre of the 05:00-07:00 sunrise window)
  sunset: 18.6, // sun on the horizon (inside the 17:30-19:30 sunset window)
  sunTilt: 0.42, // how far south the sun's arc leans (radians)
}

/**
 * Atmosphere keyframes by hour. Colours are sRGB hex; intensities are scene
 * light units. `light` is the key light (sun by day, moon by night).
 */
export const KEYFRAMES = [
  { h: 0.0, skyTop: '#060b1d', horizon: '#14203c', fog: '#111b33', light: '#9db4ee', lightI: 0.85, hemiSky: '#41598a', hemiGround: '#1a2232', hemiI: 0.8, stars: 1, cloud: '#2b3550', water: 0.4, exposure: 1.1 },
  { h: 4.5, skyTop: '#0f1838', horizon: '#2a3558', fog: '#232d4a', light: '#9db4ee', lightI: 0.6, hemiSky: '#45598a', hemiGround: '#1c2333', hemiI: 0.75, stars: 0.7, cloud: '#3a4260', water: 0.4, exposure: 1.05 },
  { h: 5.4, skyTop: '#2c467e', horizon: '#d98a6a', fog: '#8f7a86', light: '#ffae80', lightI: 0.25, hemiSky: '#7d8fba', hemiGround: '#3a3434', hemiI: 0.6, stars: 0.2, cloud: '#c79a96', water: 0.55, exposure: 1.0 },
  { h: 6.3, skyTop: '#4d82c4', horizon: '#ffc493', fog: '#e3c4ab', light: '#ffbe82', lightI: 1.6, hemiSky: '#b4cae8', hemiGround: '#6a6252', hemiI: 1.0, stars: 0, cloud: '#ffd9c2', water: 0.75, exposure: 1.0 },
  { h: 8.0, skyTop: '#3a86d8', horizon: '#cfe6f5', fog: '#cfe6f5', light: '#fff0d8', lightI: 2.4, hemiSky: '#d4e9ff', hemiGround: '#5f7a52', hemiI: 1.0, stars: 0, cloud: '#ffffff', water: 0.95, exposure: 1.0 },
  { h: 12.0, skyTop: '#2c7cd6', horizon: '#d3ecfb', fog: '#d3ecfb', light: '#fff7ea', lightI: 3.0, hemiSky: '#dceeff', hemiGround: '#68805a', hemiI: 1.1, stars: 0, cloud: '#ffffff', water: 1.0, exposure: 1.0 },
  { h: 15.0, skyTop: '#2f7fd4', horizon: '#d6eaf6', fog: '#d6eaf6', light: '#fff2dc', lightI: 2.8, hemiSky: '#d8eaff', hemiGround: '#66805a', hemiI: 1.05, stars: 0, cloud: '#ffffff', water: 1.0, exposure: 1.0 },
  { h: 17.2, skyTop: '#3b78c2', horizon: '#f3d9b4', fog: '#ead5bb', light: '#ffd29a', lightI: 2.3, hemiSky: '#d4dcec', hemiGround: '#6c6c4e', hemiI: 0.95, stars: 0, cloud: '#fff0dc', water: 0.92, exposure: 1.0 },
  { h: 18.4, skyTop: '#36508a', horizon: '#ff9459', fog: '#d8957a', light: '#ff9a5c', lightI: 2.0, hemiSky: '#d0aaa0', hemiGround: '#62503f', hemiI: 1.05, stars: 0, cloud: '#ffb48a', water: 0.7, exposure: 1.0 },
  { h: 19.3, skyTop: '#1b2754', horizon: '#6b4566', fog: '#47405a', light: '#9fb2e6', lightI: 0.35, hemiSky: '#5e5f8c', hemiGround: '#27222f', hemiI: 0.75, stars: 0.45, cloud: '#5b4a66', water: 0.48, exposure: 1.04 },
  { h: 20.5, skyTop: '#0a1128', horizon: '#1a2543', fog: '#151f39', light: '#9db4ee', lightI: 0.8, hemiSky: '#41598a', hemiGround: '#1a2232', hemiI: 0.78, stars: 0.95, cloud: '#2e3753', water: 0.4, exposure: 1.1 },
  { h: 24.0, skyTop: '#060b1d', horizon: '#14203c', fog: '#111b33', light: '#9db4ee', lightI: 0.85, hemiSky: '#41598a', hemiGround: '#1a2232', hemiI: 0.8, stars: 1, cloud: '#2b3550', water: 0.4, exposure: 1.1 },
]
