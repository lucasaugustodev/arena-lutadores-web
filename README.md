# Arena dos Lutadores 🥊

Browser-based 3D fighting arena built with **Phaser** (2D fallback) and **Three.js** (3D), with characters, animations and arenas generated end-to-end by AI.

**Stack:** Vite · TypeScript · Phaser 3 · Three.js · GLTFLoader · Mixamo (via Meshy) · Playwright (debugging) · Blender (validation via MCP).

---

## Pages

| URL | What it is |
|---|---|
| `/` | Phaser 2D battle (Kenney sprites + Scenario AI sprites) |
| `/visualizer.html` | Sprite animation viewer (browse all generated sprites) |
| `/3d.html` | Single-character 3D viewer (Jacaré + animation switcher) |
| `/battle3d.html` | **Main 3D battle scene** — Jacaré vs Águia in a real 3D coliseum |

---

## Asset Pipeline (AI-generated, fully automated)

```
                     +--------------------+
   text prompt  ─►   |  Scenario.gg API   |  → 2D character PNG (T-pose)
                     | model: Arcade Hero |
                     +--------------------+
                                │
                                ▼
                     +--------------------+
                     |   Meshy.ai API     |  → 3D textured GLB (~7MB)
                     |   image-to-3D      |
                     +--------------------+
                                │
                                ▼
                     +--------------------+
                     |   Meshy.ai API     |  → Auto-rigged FBX (24-bone humanoid)
                     |   rigging          |
                     +--------------------+
                                │
                                ▼
                     +--------------------+
                     |   Meshy.ai API     |  → Animated GLB per action
                     |   animations       |     (Idle / Walk / Punch / Hit / Dead / Cheer)
                     +--------------------+
                                │
                                ▼
                     public/assets/3d/<char>/<action>.glb
```

For **arenas/environments**: Meshy `text-to-3d` (preview → refine workflow) generates a GLB scene from a prompt like *"Roman gladiator coliseum, sand floor, stone columns, sunset"*.

### Scripts

| Script | Purpose |
|---|---|
| `scripts/generate.mjs` | Generate full character pose set via Scenario (idle/walk/attack/hit/ko/victory PNGs) |
| `scripts/fal_animate.mjs` | Image → video via fal.ai (Kling), extract frames as sprite sheet |
| `scripts/fal_3d.mjs` | Image → 3D GLB via fal.ai Trellis (free tier, no rigging) |
| `scripts/meshy_3d.mjs` | Image → 3D GLB via Meshy (paid, much higher quality) |
| `scripts/meshy_rig.mjs` | Auto-rig a Meshy 3D model |
| `scripts/meshy_anim.mjs` | Apply Mixamo-style animations to rigged model |
| `scripts/meshy_text3d.mjs` | Text → 3D environment (arenas, props) |

Cost reference (Meshy Free tier = 100 credits/month, $20+ Pro plans = 1000+):
- 3D model: 30 credits
- Auto-rig: 5 credits
- Each animation: 5 credits
- Text-to-3D environment: 10-15 credits

---

## 🔧 Camera Calibration: Blender ↔ Three.js

**The problem:** rendering an arena in Three.js looked nothing like the same arena in Blender — even with identical coordinates. Spent hours chasing this. Documenting so future-me / others don't suffer.

### What was wrong

When loading a GLB into Three.js with the standard `GLTFLoader`:

1. **`gltf.scene` may be a `THREE.Scene` instance, not a `THREE.Group`.** Adding a Scene as a child of another Scene (`scene.add(arenaGlb.scene)`) does *something weird* with transforms — in our case the parent scene's `position` got mutated to non-zero values. `t.scene.position` ended up at `(5, 4, -3)` instead of `(0, 0, 0)`, which broke every subsequent calculation.
2. **Bbox math after applying transforms is fragile.** Computing bbox, scaling, recomputing bbox, then translating based on the new bbox — easy to chain wrong.
3. **FOV mismatch.** Blender camera lens (mm) is *horizontal* FOV calculated against a default 36mm sensor. Three.js `PerspectiveCamera` takes *vertical* FOV. For a 16:9 viewport, a Blender 50mm lens (40° horizontal) becomes ~23° vertical in Three.js. Naively passing 40 to Three.js gives a much wider view.

### The solution

```js
async function loadArena() {
  // Always reset the global scene transform — defensive, in case something mutated it
  scene.position.set(0, 0, 0);

  const arenaGlb = await loadGlb("assets/3d/arena.glb");

  // Re-parent imported children into a fresh Group (NEVER add gltf.scene directly!)
  const arenaInner = new THREE.Group();
  while (arenaGlb.scene.children.length > 0) {
    arenaInner.add(arenaGlb.scene.children[0]);
  }

  // Compute bbox at native scale BEFORE any transforms
  const box = new THREE.Box3().setFromObject(arenaInner);
  const sizeNative = box.getSize(new THREE.Vector3());
  const centerNative = box.getCenter(new THREE.Vector3());

  // Center the inner group: origin = floor center
  arenaInner.position.set(-centerNative.x, -box.min.y, -centerNative.z);

  // Outer group does the scale (separation of concerns)
  const arenaGroup = new THREE.Group();
  arenaGroup.scale.setScalar(targetWidth / Math.max(sizeNative.x, sizeNative.z));
  arenaGroup.add(arenaInner);
  scene.add(arenaGroup);
}

// FOV from Blender lens (horizontal) → Three.js (vertical), aspect-aware
function computeFovV(hFovDeg, aspect) {
  const h = hFovDeg * Math.PI / 180;
  return (2 * Math.atan(Math.tan(h / 2) / aspect)) * 180 / Math.PI;
}
const camera = new THREE.PerspectiveCamera(
  computeFovV(40, innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 200
);
```

### How we debugged

1. Couldn't visualize what the browser actually rendered (vs. what we expected).
2. Loaded `arena.glb` into Blender via MCP plugin and rendered the same camera coordinates we used in Three.js.
3. Used **Playwright CLI** (`playwright-cli eval`) to query the running Three.js scene's actual state:
   ```bash
   playwright-cli eval "() => JSON.stringify({
     scene_pos: window.__three.scene.position.toArray(),
     arena_box: new THREE.Box3().setFromObject(arenaGroup).min.toArray(),
   })"
   ```
4. Comparing the values side-by-side immediately revealed the bug.

### Camera convention conversion

```
Blender (Z-up) ↔ Three.js (Y-up)

Blender (X, Y, Z) → Three.js (X, Z, -Y)
Three.js (X, Y, Z) → Blender (X, -Z, Y)
```

Use this to copy a perfect viewport view from Blender:
1. Position your viewport in Blender (or move the active camera).
2. Read camera location: `bpy.context.scene.camera.location` → `(x, y, z)` in Blender Z-up.
3. Three.js position = `(x, z, -y)`.
4. Three.js FOV = `computeFovV(degrees(camera.data.angle), aspect)`.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
```

Environment variables (in `.env`, gitignored):

```
SCENARIO_API_KEY=...
SCENARIO_API_SECRET=...
MESHY_API_KEY=...
FAL_KEY=...
```

## File layout

```
arena-web/
├── public/
│   ├── battle3d.html       # main 3D scene
│   ├── 3d.html             # single-char viewer
│   ├── visualizer.html     # 2D sprite viewer
│   └── assets/
│       ├── 3d/
│       │   ├── arena.glb
│       │   ├── jacare/{idle,walk,attack_quick,attack_heavy,hit,ko,victory}.glb
│       │   └── aguia/{idle,walk,attack_quick,attack_heavy,hit,ko,victory}.glb
│       └── characters/     # 2D sprite sheets (legacy Phaser version)
├── src/
│   ├── main.ts
│   ├── battle.ts           # battle simulation (turn-based stats)
│   ├── fighters.ts         # roster
│   └── scenes/             # Phaser scenes
└── scripts/                # AI-asset generation pipeline (see table above)
```
