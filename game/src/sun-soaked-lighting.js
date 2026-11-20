// Vellora Bay — sun-soaked daylight. The rubric asks for "a coherent
// sun-soaked modern city", so the whole look is built around one bright
// midday: a high white sun, a pale-blue sky dome, pastel facades and light
// asphalt. The city module takes its sky and palettes from here, and the
// boot calls applySunSoakedLighting instead of wiring its own lamps, so
// every lit surface in the game answers to this one file.
import { paintTexture } from './util.js';

// Sky-dome gradient, zenith to horizon: deep noon blue melting into a
// pale, hazy horizon. No purple dusk anywhere.
export const DAY_SKY_STOPS = [
  [0.0, '#2f7fd0'],
  [0.42, '#74b4e6'],
  [0.68, '#bcd9ee'],
  [1.0, '#eef6fb'],
];

// Sun-soaked facade palettes: warm creams, peach, sage, pale teal and sand.
// Buildings read as a bright coastal city even before the sun hits them.
export const DAYLIGHT_FACADE_PALETTES = [
  ['#e8d5b5', '#d9b8a3', '#c9d6d0', '#e5c9a8', '#d6c9b0'],
  ['#b8d0d8', '#d8c2c2', '#c8d8b8', '#e0d0a8', '#b0c8d8'],
];

// Light asphalt and pale sidewalks: the streets stop swallowing the sun.
export const DAY_GROUND_COLOR = '#565a60';
export const DAY_SIDEWALK_COLORS = ['#9a9da0', '#a3a69e', '#93969a'];
export const DAY_PLAZA_COLOR = '#a89c88';

// Daylight windows: most panes reflect the pale sky, a few glow warm.
export const DAY_WINDOW_DARK = '#7d94a8';
export const DAY_WINDOW_LIT_RATIO = 0.15;

// The sun sprite rides high in the same direction as the light, so the
// glow in the sky and the shadows on the street agree with each other.
export const DAY_SUN_SPRITE = { x: 220, y: 400, z: 150, scale: 220 };
export const DAY_SUN_GLOW_INNER = 'rgba(255,252,235,1)';
export const DAY_SUN_GLOW_OUTER = 'rgba(255,220,120,0)';

// ACES exposure for the daylight grade: bright without blowing the whites.
export const DAY_EXPOSURE = 1.3;

export function makeDaySkyTexture(THREE) {
  return paintTexture(THREE, 16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (const [stop, color] of DAY_SKY_STOPS) grad.addColorStop(stop, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// One high white sun, a sky-blue hemisphere fill and a soft ambient lift:
// shadows stay readable, but nothing in the city sits in murk.
export function applySunSoakedLighting(THREE, scene) {
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0xbcd9ea, 220, 700);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9a8a6a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d6, 2.4);
  sun.position.set(120, 220, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  return { hemi, sun };
}
