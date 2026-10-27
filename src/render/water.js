import { CHUNK, CHUNKS, WATER_LEVEL } from '../config.js';
import { HV, SUB, castleNorm } from '../world/world.js';
import { freeGeometry } from './dispose.js';

/**
 * The water: rivers, lakes and the moats, drawn as a flat sheet over every
 * tile the ground dips below the water level in. The ground hides the sheet
 * where it is above it, so the shore falls where the ground meets the level.
 * Deep water is darker, and the ripples drift. The rivers and lakes run black
 * and brackish; the moats run with blood, and where a river meets a moat the
 * one stains into the other.
 */

const SHALLOW = [0.05, 0.1, 0.08], MID = [0.025, 0.06, 0.07], DEEP = [0.01, 0.025, 0.04];
const CLOT = [0.32, 0.015, 0.02], GORE = [0.2, 0.006, 0.012], BLACKRED = [0.08, 0.002, 0.008];

const mixTo = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function createWater(GFX, world, materials, scene) {
  const group = new GFX.Group();
  group.name = 'water';
  scene.add(group);
  const ripple = new GFX.CanvasTexture(materials.tex.ripples.bump.image);
  ripple.wrapS = ripple.wrapT = GFX.RepeatWrapping;
  ripple.anisotropy = 4;
  const material = new GFX.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.12, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.08, transparent: true, opacity: 0.94,
    bumpMap: ripple, bumpScale: 0.22, envMapIntensity: 1.5, depthWrite: false,
  });
  const meshes = new Array(CHUNKS * CHUNKS).fill(null);

  const build = (cx, cy) => {
    const pos = [], nor = [], col = [], uv = [];
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const at = (vx, vy) => world.h[Math.max(0, Math.min(HV - 1, vy)) * HV + Math.max(0, Math.min(HV - 1, vx))];
    // How much of a moat a corner is: all of it within the trench, fading out over a tile or two where a river runs in.
    const bloodAt = (vx, vy) => {
      const cx = Math.max(0, Math.min(HV - 1, vx)), cy = Math.max(0, Math.min(HV - 1, vy));
      const ring = Math.abs(castleNorm(cx / SUB, cy / SUB) - 4.05);
      return Math.max(1 - smooth((world.moatD[cy * HV + cx] - 2.2) / 1.6), 1 - smooth((ring - 1.2) / 1.2));
    };
    const step = 1 / SUB;
    for (let ty = y0; ty < y0 + CHUNK; ty++) {
      for (let tx = x0; tx < x0 + CHUNK; tx++) {
        // Is there any water in the tile?
        let wet = false;
        for (let j = 0; j <= SUB && !wet; j++) for (let i = 0; i <= SUB; i++) if (at(tx * SUB + i, ty * SUB + j) < WATER_LEVEL + 0.04) { wet = true; break; }
        if (!wet) continue;
        for (let j = 0; j < SUB; j++) {
          for (let i = 0; i < SUB; i++) {
            const vx = tx * SUB + i, vy = ty * SUB + j;
            const hs = [at(vx, vy), at(vx + 1, vy), at(vx + 1, vy + 1), at(vx, vy + 1)];
            if (Math.min(...hs) > WATER_LEVEL + 0.12) continue;
            const ps = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b], k) => ({ x: (vx + a) * step, z: (vy + b) * step, d: Math.max(0, WATER_LEVEL - hs[k]), blood: bloodAt(vx + a, vy + b) }));
            for (const k of [0, 2, 1, 0, 3, 2]) {
              const p = ps[k];
              pos.push(p.x, WATER_LEVEL, p.z);
              nor.push(0, 1, 0);
              const water = p.d < 0.45 ? mixTo(SHALLOW, MID, smooth(p.d / 0.45)) : mixTo(MID, DEEP, smooth((p.d - 0.45) / 0.8));
              const blood = p.d < 0.45 ? mixTo(CLOT, GORE, smooth(p.d / 0.45)) : mixTo(GORE, BLACKRED, smooth((p.d - 0.45) / 0.8));
              const c = mixTo(water, blood, p.blood);
              col.push(c[0], c[1], c[2]);
              uv.push(p.x / 7, p.z / 7);
            }
          }
        }
      }
    }
    if (!pos.length) return null;
    const g = new GFX.BufferGeometry();
    g.setAttribute('position', new GFX.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('normal', new GFX.BufferAttribute(new Float32Array(nor), 3));
    g.setAttribute('color', new GFX.BufferAttribute(new Float32Array(col), 3));
    g.setAttribute('uv', new GFX.BufferAttribute(new Float32Array(uv), 2));
    g.computeBoundingSphere();
    return g;
  };

  const make = (i) => {
    const cx = i % CHUNKS, cy = Math.floor(i / CHUNKS);
    if (meshes[i]) { group.remove(meshes[i]); freeGeometry(meshes[i].geometry); meshes[i] = null; }
    const g = build(cx, cy);
    if (!g) return;
    const mesh = new GFX.Mesh(g, material);
    mesh.renderOrder = 2;
    mesh.name = `water ${cx},${cy}`;
    group.add(mesh);
    meshes[i] = mesh;
  };

  const water = {
    group, material,
    build() { for (let i = 0; i < meshes.length; i++) make(i); world.dirty.water.clear(); },
    sync() { for (const i of [...world.dirty.water]) { world.dirty.water.delete(i); make(i); } },
    /** Drifts the ripples, and brightens the sheet with the sky. */
    update(dt, { shine = 1 } = {}) {
      // Blood is thick: the ripples crawl.
      ripple.offset.x += dt * 0.006;
      ripple.offset.y += dt * 0.0035;
      material.envMapIntensity = 0.5 + shine;
    },
  };
  return water;
}
