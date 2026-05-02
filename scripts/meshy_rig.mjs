// Auto-rig a Meshy 3D model via the rigging API.

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

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function pollTask(endpoint, taskId, maxMin = 15) {
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

async function main() {
  const inputTaskId = process.argv[2];
  const charId = process.argv[3] || "jacare";
  if (!inputTaskId) { console.error("usage: node meshy_rig.mjs <image-to-3d-task-id> [charId]"); process.exit(1); }

  console.log(`[1/2] Submit auto-rig for ${inputTaskId}`);
  const r = await fetch(`${BASE}/rigging`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      input_task_id: inputTaskId,
      height_meters: 1.7,
    }),
  });
  const j = await r.json();
  if (!j.result) throw new Error("rigging submit failed: " + JSON.stringify(j));
  const rigId = j.result;
  console.log(`      rigTaskId=${rigId}`);

  console.log(`\n      Polling`);
  const result = await pollTask("rigging", rigId, 15);

  console.log(`\n      ✅ rigged`);
  console.log(`      keys: ${Object.keys(result).join(", ")}`);
  const fbxUrl = result.model_urls?.fbx || result.fbx_url;
  const glbUrl = result.model_urls?.glb || result.glb_url;
  console.log(`      fbx: ${fbxUrl?.slice(0,80)}`);
  console.log(`      glb: ${glbUrl?.slice(0,80)}`);

  if (fbxUrl) {
    const sz = await downloadUrl(fbxUrl, `${__dirname}/../tmp/${charId}_rigged.fbx`);
    console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_rigged.fbx`);
  }
  if (glbUrl) {
    const sz = await downloadUrl(glbUrl, `${__dirname}/../tmp/${charId}_rigged.glb`);
    console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_rigged.glb`);
  }

  console.log(`\n💾 Rig task ID for animations: ${rigId}`);
  console.log(`Available animations: idle, walk, run, jump, punch, hurt, death, victory, etc.`);
  console.log(`Run: node scripts/meshy_anim.mjs ${rigId} <animation_name> [charId]`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
