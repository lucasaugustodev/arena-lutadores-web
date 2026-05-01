// Generate fighter sprites + arena background via Scenario.gg API.
// Usage: node scripts/generate.mjs

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env
import { readFileSync } from "node:fs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(`${__dirname}/../.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const KEY = process.env.SCENARIO_API_KEY;
const SECRET = process.env.SCENARIO_API_SECRET;
const ARCADE_HERO = process.env.SCENARIO_MODEL_ARCADE_HERO;
const BATTLE_ARENAS = process.env.SCENARIO_MODEL_BATTLE_ARENAS;
const AUTH = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");
const BASE = "https://api.cloud.scenario.com/v1";

const STYLE_TAG = "anthropomorphic warrior, full body, transparent background, side view facing right, no text, dynamic pose, detailed character art";

const FIGHTERS = [
  {
    id: "jacare", name: "Jacaré",
    base: "anthropomorphic crocodile warrior with green scales, sharp teeth, tribal leather armor with crossed straps, wielding heavy stone club, muscular reptile body, long tail",
    poses: {
      idle:         "standing relaxed in fighting stance, weapon held to side",
      walk:         "walking forward, stride mid-step, weapon swinging at side",
      attack_quick: "lunging forward with quick jab, weapon thrust forward, fierce expression",
      attack_heavy: "swinging weapon overhead in massive strike, two-handed power swing",
      hit:          "recoiling backwards from impact, head turned, off-balance, taking damage",
      ko:           "lying defeated on the ground, weapon dropped, eyes closed",
      victory:      "celebrating victory with weapon raised triumphantly overhead, big smile",
    },
  },
  {
    id: "aguia", name: "Águia",
    base: "anthropomorphic eagle warrior with brown and golden feathers, sharp beak, feathered cloak, wielding curved scimitar, muscular human body with bird head and feathered arms",
    poses: {
      idle:         "standing relaxed in fighting stance, scimitar held to side",
      walk:         "walking forward, stride mid-step, cloak flowing",
      attack_quick: "lunging forward with quick scimitar slash, fierce battle cry",
      attack_heavy: "performing massive overhead scimitar strike, wings spread for power",
      hit:          "recoiling backwards from impact, feathers ruffled, taking damage",
      ko:           "lying defeated on the ground, scimitar dropped, wings collapsed",
      victory:      "celebrating victory with scimitar raised triumphantly, wings spread wide",
    },
  },
];

async function startInference(modelId, prompt, opts = {}) {
  const body = {
    parameters: {
      type: "txt2img",
      prompt,
      negativePrompt: "blurry, low quality, watermark, text, logo, signature, cropped, bad anatomy, extra limbs, distorted",
      negativePromptStrength: 1.0,
      numSamples: 1,
      width: opts.width  ?? 512,
      height: opts.height ?? 768,
      numInferenceSteps: 30,
      guidance: 4.0,
    },
  };
  const r = await fetch(`${BASE}/models/${modelId}/inferences`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.inference) throw new Error(JSON.stringify(j));
  return j.inference.id;
}

async function pollInference(modelId, inferenceId) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${BASE}/models/${modelId}/inferences/${inferenceId}`, {
      headers: { Authorization: AUTH },
    });
    const j = await r.json();
    const inf = j.inference;
    if (inf.status === "succeeded" && inf.images?.length) return inf.images[0].url;
    if (inf.status === "failed") throw new Error("inference failed: " + JSON.stringify(inf));
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("poll timeout");
}

async function downloadImage(url, path) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

async function generateOne(modelId, prompt, outPath, opts) {
  if (existsSync(outPath)) {
    console.log(`  [skip] ${outPath} exists`);
    return;
  }
  console.log(`  [gen] ${outPath.split("/").slice(-2).join("/")}`);
  console.log(`        prompt: ${prompt.slice(0, 80)}...`);
  const id = await startInference(modelId, prompt, opts);
  const url = await pollInference(modelId, id);
  await downloadImage(url, outPath);
  console.log(`        ✅`);
}

async function main() {
  const outRoot = `${__dirname}/../public/assets/characters`;

  // Fighters: 7 poses each
  for (const f of FIGHTERS) {
    console.log(`\n=== ${f.name} (${f.id}) ===`);
    for (const [pose, posePrompt] of Object.entries(f.poses)) {
      const fullPrompt = `${f.base}, ${posePrompt}, ${STYLE_TAG}`;
      const out = `${outRoot}/${f.id}/${pose}.png`;
      await generateOne(ARCADE_HERO, fullPrompt, out);
    }
  }

  // Arena background
  console.log(`\n=== Arena ===`);
  const arenaPrompt = "epic gladiator arena interior, stone ring with sand floor, dramatic ancient architecture with columns and torches, sunset golden lighting, side view perspective, no characters, atmospheric fighting game arena background";
  await generateOne(BATTLE_ARENAS, arenaPrompt, `${__dirname}/../public/assets/arena.png`,
    { width: 1280, height: 720 });

  console.log(`\n🎉 Done!`);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
