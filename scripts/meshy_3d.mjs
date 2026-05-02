// Meshy.ai pipeline: image → 3D → auto-rig → animation
// https://docs.meshy.ai/api-reference

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

async function imageToBase64DataUri(path) {
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function startImageTo3D(imageUri, opts = {}) {
  const r = await fetch(`${BASE}/image-to-3d`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      image_url: imageUri,
      enable_pbr: true,
      should_remesh: true,
      should_texture: true,
      ai_model: "meshy-5",
      topology: "triangle",
      target_polycount: 30000,
      symmetry_mode: "auto",
      ...opts,
    }),
  });
  const j = await r.json();
  if (j.result) return j.result;
  throw new Error("submit failed: " + JSON.stringify(j).slice(0, 400));
}

async function pollTask(endpoint, taskId, maxMin = 15) {
  const deadline = Date.now() + maxMin * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/${endpoint}/${taskId}`, { headers: HEADERS });
    const j = await r.json();
    const status = j.status || j.state || "?";
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

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function balance() {
  const r = await fetch(`${BASE}/balance`, { headers: HEADERS });
  return await r.json();
}

async function main() {
  const inputPath = process.argv[2] || `${__dirname}/../public/assets/characters/jacare/idle.png`;
  const charId = process.argv[3] || "jacare";

  console.log("Balance:", JSON.stringify(await balance()));

  console.log(`\n[1/2] Image-to-3D: ${inputPath}`);
  const imageUri = await imageToBase64DataUri(inputPath);
  const taskId = await startImageTo3D(imageUri);
  console.log(`      taskId=${taskId}`);

  console.log(`\n      Polling (1-3 min)`);
  const result = await pollTask("image-to-3d", taskId, 15);

  console.log(`\n      ✅ done`);
  console.log(`      result keys: ${Object.keys(result).join(", ")}`);
  const glbUrl = result.model_urls?.glb;
  const fbxUrl = result.model_urls?.fbx;
  const thumbUrl = result.thumbnail_url;
  console.log(`      glb: ${glbUrl?.slice(0,80)}`);
  console.log(`      fbx: ${fbxUrl?.slice(0,80)}`);

  console.log(`\n[2/2] Download`);
  if (glbUrl) {
    const sz = await downloadUrl(glbUrl, `${__dirname}/../tmp/${charId}_meshy.glb`);
    console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_meshy.glb`);
  }
  if (fbxUrl) {
    const sz = await downloadUrl(fbxUrl, `${__dirname}/../tmp/${charId}_meshy.fbx`);
    console.log(`      ${(sz/1024).toFixed(1)} KB → tmp/${charId}_meshy.fbx`);
  }
  if (thumbUrl) {
    await downloadUrl(thumbUrl, `${__dirname}/../tmp/${charId}_meshy_thumb.png`);
  }

  console.log(`\n💾 Task ID for rigging: ${taskId}`);
  console.log(`Run: node scripts/meshy_rig.mjs ${taskId} ${charId}`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
