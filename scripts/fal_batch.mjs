// Batch generate animations for all fighters/actions via fal.ai

import { execSync } from "node:child_process";
const FIGHTERS = ["jacare", "aguia"];
const ACTIONS = ["attack_quick", "attack_heavy", "hit", "ko", "victory", "walk"];

for (const f of FIGHTERS) {
  for (const a of ACTIONS) {
    const dir = `public/assets/characters/${f}/${a}_frames`;
    try {
      execSync(`ls "${dir}/frame_001.png"`, { stdio: "ignore" });
      console.log(`[skip] ${f}/${a} already has frames`);
      continue;
    } catch {}
    console.log(`\n=== ${f}/${a} ===`);
    try {
      execSync(`node scripts/fal_animate.mjs ${f} ${a}`, { stdio: "inherit" });
    } catch (e) {
      console.log(`!! ${f}/${a} failed: ${e.message.slice(0,200)}`);
    }
  }
}
console.log("\n✅ Batch done");
