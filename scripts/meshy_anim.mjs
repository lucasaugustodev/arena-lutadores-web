// Apply Meshy animation library actions to a rigged character.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(`${__dirname}/../.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.MESHY_API_KEY;
const HEADERS = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const BASE = "https://api.meshy.ai/openapi/v1";

// Map our game actions to Meshy animation IDs
export const ACTION_MAP = {
  idle:         { id: 0,   label: "Idle" },
  walk:         { id: 30,  label: "Casual_Walk" },
  attack_quick: { id: 96,  label: "Kung_Fu_Punch" },
  attack_heavy: { id: 4,   label: "Attack" },
  hit:          { id: 174, label: "Face_Punch_Reaction" },
  ko:           { id: 8,   label: "Dead" },
  victory:      { id: 59,  label: "Victory_Cheer" },
};

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function pollTask(endpoint, taskId, maxMin = 12) {
  const deadline = Date.now() + maxMin * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/${endpoint}/${taskId}`, { headers: HEADERS });
    const j = await r.json();
    const status = j.status || "?";
    const prog = j.progress ?? "?";
    if (status !== last) { process.stdout.write(`\n      status=${status} progress=${prog}%`); last = status; }
    else process.stdout.write(".");
    if (status === "SUCCEEDED") return j;
    if (status === "FAILED" || status === "CANCELED" || status === "EXPIRED") {
      throw new Error("task failed: " + JSON.stringify(j).slice(0, 400));
    }
    await new Promise(r => setTimeout(r, 6000));
  }
  throw new Error("poll timeout");
}

async function applyAnimation(rigTaskId, actionId, label) {
  const r = await fetch(`${BASE}/animations`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      rig_task_id: rigTaskId,
      action_id: actionId,
    }),
  });
  const j = await r.json();
  if (!j.result) throw new Error(`anim submit failed for ${label}: ${JSON.stringify(j).slice(0,300)}`);
  console.log(`      animTaskId=${j.result}`);
  return await pollTask("animations", j.result, 10);
}

async function main() {
  const rigTaskId = process.argv[2];
  const charId = process.argv[3] || "jacare";
  const onlyAction = process.argv[4]; // optional: just one action
  if (!rigTaskId) { console.error("usage: node meshy_anim.mjs <rig-task-id> [charId] [action]"); process.exit(1); }

  const actions = onlyAction
    ? { [onlyAction]: ACTION_MAP[onlyAction] }
    : ACTION_MAP;

  for (const [name, { id, label }] of Object.entries(actions)) {
    console.log(`\n=== ${name} (id=${id}, ${label}) ===`);
    try {
      const result = await applyAnimation(rigTaskId, id, label);
      const fbxUrl = result.result?.animation_fbx_url;
      const glbUrl = result.result?.animation_glb_url;
      if (fbxUrl) {
        const sz = await downloadUrl(fbxUrl, `${__dirname}/../tmp/${charId}_anim/${name}.fbx`);
        console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_anim/${name}.fbx`);
      }
      if (glbUrl) {
        const sz = await downloadUrl(glbUrl, `${__dirname}/../tmp/${charId}_anim/${name}.glb`);
        console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_anim/${name}.glb`);
      }
      if (!fbxUrl && !glbUrl) {
        console.log(`      result keys: ${Object.keys(result).join(', ')} | result.result keys: ${Object.keys(result.result || {}).join(', ')}`);
      }
    } catch (e) {
      console.log(`      ✗ ${e.message}`);
    }
  }

  console.log(`\n🎉 Done!`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
