// Vellora Bay — sun-soaked daylight. The polish pass swaps the sunset grade
// for a bright midday look: a high white sun, a blue sky dome, pastel
// facades, pale streets and a lifted exposure, so the city reads clearly in
// screenshots and the HUD panels stay legible against the sky.
import { paintTexture } from './util.js';

// Tone-mapping exposure for the whole renderer (was 1.05 at sunset).
export const DAY_EXPOSURE = 1.3;

// Unlit window glass in daylight: a cool blue-grey, not near-black.
export const DAY_WINDOW_DARK = '#54687a';
// Few windows glow at midday — most of the grid stays dark glass.
export const DAY_WINDOW_LIT_RATIO = 0.15;

// Street surfaces, lightened for the midday sun.
export const DAY_GROUND_COLOR = '#6f7478';
export const DAY_SIDEWALK_COLORS = ['#a8a49c', '#b0aca2', '#a09c94'];
export const DAY_PLAZA_COLOR = '#c9bfa8';

// Pastel facade palettes: sun-bleached stucco in warm and cool tones.
// Same shape as the old palettes (two rows of five) so city.js can swap
// them in without touching the layout code.
export const DAYLIGHT_FACADE_PALETTES = [
  ['#e8d5b5', '#d5e2e8', '#ecd9c0', '#d8e4d0', '#e8d0c8'],
  ['#d9e2ec', '#e6d9e2', '#f0e3c8', '#d0ddd2', '#e2d5c4'],
];

// Midday sky gradient for the dome: deep blue at the zenith, fading to a
// pale horizon haze. Drawn top-to-bottom like the old sunset texture.
export function makeDaySkyTexture(THREE) {
  return paintTexture(THREE, 16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#2f6fc4');
    grad.addColorStop(0.45, '#5da4e0');
    grad.addColorStop(0.7, '#8fc3ec');
    grad.addColorStop(0.85, '#c2e0f4');
    grad.addColorStop(1.0, '#dceefb');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// Midday rig: a high white sun (same direction as the sun sprite in
// city.js), a sky-blue hemisphere fill, a soft white ambient lift and a
// pale long-range fog. Replaces the old sunset buildLights().
export function applySunSoakedLighting(THREE, scene) {
  const hemi = new THREE.HemisphereLight(0x9fd0ff, 0xc8b89a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(220, 400, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 1000;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  scene.fog = new THREE.Fog(0xbcd6e8, 220, 700);
  scene.background = new THREE.Color(0x87bfe8);
}
