// Image-to-Video pipeline using Scenario:
// 1. Upload character PNG → asset
// 2. Generate video with Wan 2.6 I2V (animation prompt)
// 3. Extract frames via Scenario Video-to-Image-Sequence
// 4. Save frames as sprite sheet PNGs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(`${__dirname}/../.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const AUTH = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");
const BASE = "https://api.cloud.scenario.com/v1";
const I2V_MODEL = "model_wan-2-6-i2v";
const V2SEQ_MODEL = "model_scenario-video-to-image-seq";

async function uploadImage(path) {
  const buf = readFileSync(path);
  const b64 = buf.toString("base64");
  const r = await fetch(`${BASE}/assets`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({ image: `data:image/png;base64,${b64}`, name: path.split(/[\\/]/).pop() }),
  });
  const j = await r.json();
  console.log("    upload response keys:", Object.keys(j));
  console.log("    upload preview:", JSON.stringify(j).slice(0, 400));
  const id = j.asset?.id || j.id || j.assetId;
  if (!id) throw new Error("upload failed: " + JSON.stringify(j).slice(0, 300));
  return id;
}

async function startInference(modelId, params) {
  const body = { parameters: { ...params } };
  const r = await fetch(`${BASE}/generate/custom/${modelId}`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.job?.jobId) return j.job.jobId;
  if (j.inference) return j.inference.id;
  throw new Error("inference failed: " + JSON.stringify(j).slice(0, 500));
}

async function pollInference(modelId, jobId, maxMin = 12) {
  const deadline = Date.now() + maxMin * 60_000;
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/jobs/${jobId}`, {
      headers: { Authorization: AUTH },
    });
    const j = await r.json();
    const job = j.job || j;
    process.stdout.write(`    status=${job.status} progress=${job.progress ?? '?'}        \r`);
    if (job.status === "success" || job.status === "succeeded") return job;
    if (job.status === "failed" || job.status === "error") throw new Error("job failed: " + JSON.stringify(job).slice(0, 500));
    await new Promise(r => setTimeout(r, 6000));
  }
  throw new Error("poll timeout");
}

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}

async function main() {
  const charId = process.argv[2] || "jacare";
  const action = process.argv[3] || "attack_quick";
  const promptMap = {
    attack_quick: "the character lunges forward fast with a quick punch attack, weapon swung forward, fierce battle motion",
    attack_heavy: "the character performs a massive overhead weapon strike with full body wind-up and follow-through",
    walk:         "the character walks forward in place, alternating leg movement, arms swinging",
    hit:          "the character recoils backward from impact, head and torso jerking back, taking damage",
    ko:           "the character falls backward to the ground in defeat, collapsing slowly",
    victory:      "the character celebrates victory, raising weapon overhead and posing triumphantly",
    idle:         "the character breathes idly with subtle body sway, weapon held casually at side",
  };
  const prompt = promptMap[action] || "the character performs a dynamic fighting motion";

  const inputPath  = `${__dirname}/../public/assets/characters/${charId}/idle.png`;
  console.log(`\n[1/3] Upload ${inputPath}`);
  const assetId = await uploadImage(inputPath);
  console.log(`      assetId=${assetId}`);

  console.log(`\n[2/3] Generate video — "${prompt.slice(0,80)}..."`);
  const i2vId = await startInference(I2V_MODEL, {
    type: "img2video",
    image: assetId,
    prompt,
    resolution: "720p",
    multiShots: false,
    duration: 4.8,
    enablePromptExpansion: true,
  });
  console.log(`      inferenceId=${i2vId}`);
  const i2vResult = await pollInference(I2V_MODEL, i2vId, 12);
  console.log("\n  job result keys:", Object.keys(i2vResult));
  console.log(JSON.stringify(i2vResult, null, 2).slice(0, 3000));
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
