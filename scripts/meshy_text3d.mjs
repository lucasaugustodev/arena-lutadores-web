// Generate a 3D model from text prompt via Meshy text-to-3D.
// Two-step: preview (cheap) → refine (textured).

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
const BASE = "https://api.meshy.ai/openapi/v2";

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

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function submit(body) {
  const r = await fetch(`${BASE}/text-to-3d`, {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.result) throw new Error("submit failed: " + JSON.stringify(j));
  return j.result;
}

async function main() {
  const prompt = process.argv.slice(2).join(" ") ||
    "ancient Roman gladiator coliseum interior, circular sand fighting pit floor, massive carved stone columns surrounding the arena, ornate Roman architecture, torches with flickering flames mounted on columns, distant mountains visible through arches, dramatic golden sunset lighting, atmospheric and epic, no characters, environment scene";
  const charId = "arena";

  console.log(`Prompt: ${prompt.slice(0, 100)}...`);

  console.log("\n[1/2] Submit preview");
  const previewTask = await submit({
    mode: "preview",
    prompt,
    art_style: "realistic",
    ai_model: "meshy-5",
    topology: "triangle",
    target_polycount: 50000,
    should_remesh: true,
  });
  console.log(`      preview task: ${previewTask}`);
  const preview = await pollTask("text-to-3d", previewTask, 12);
  console.log(`\n      preview done. consumed=${preview.consumed_credits || '?'}`);

  console.log("\n[2/2] Submit refine (texture)");
  const refineTask = await submit({
    mode: "refine",
    preview_task_id: previewTask,
    enable_pbr: true,
    texture_prompt: "weathered ancient stone, sand, golden warm sunset light, realistic textures",
  });
  console.log(`      refine task: ${refineTask}`);
  const refined = await pollTask("text-to-3d", refineTask, 15);
  console.log(`\n      refine done. consumed=${refined.consumed_credits || '?'}`);

  const glb = refined.model_urls?.glb;
  const fbx = refined.model_urls?.fbx;
  console.log(`\nDownload`);
  if (glb) console.log(`  ${(await downloadUrl(glb, `${__dirname}/../tmp/${charId}.glb`)/1024).toFixed(1)} KB → tmp/${charId}.glb`);
  if (fbx) console.log(`  ${(await downloadUrl(fbx, `${__dirname}/../tmp/${charId}.fbx`)/1024).toFixed(1)} KB → tmp/${charId}.fbx`);
  if (refined.thumbnail_url) await downloadUrl(refined.thumbnail_url, `${__dirname}/../tmp/${charId}_thumb.png`);

  console.log("\n🎉 Done!");
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
