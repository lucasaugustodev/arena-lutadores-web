// Image-to-Video pipeline via fal.ai → frame extraction with ffmpeg.
//
// Usage:  node scripts/fal_animate.mjs <fighter_id> <action>
//   ex:   node scripts/fal_animate.mjs jacare attack_quick
//
// Pipeline:
//  1. Upload character idle.png → fal storage URL
//  2. Submit img2video job (model: fal-ai/ltx-video/image-to-video by default)
//  3. Poll until complete
//  4. Download MP4
//  5. Extract N frames with ffmpeg → PNG sprite sequence
//  6. Save under public/assets/characters/<id>/<action>_frames/

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(`${__dirname}/../.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) throw new Error("FAL_KEY missing in .env");

// Pick model — kling-2.5-turbo is fast & cheap (~$0.05) and good quality
const MODEL = process.env.FAL_I2V_MODEL || "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";
const FRAMES_PER_ACTION = 8;   // how many frames to extract from the video

const PROMPTS = {
  attack_quick: "the character lunges forward fast in a quick punch attack, weapon thrust forward, fierce battle stance, side view, clean transparent background",
  attack_heavy: "the character winds up and performs a massive overhead weapon strike with full body power, side view, clean transparent background",
  walk:         "the character walks forward in place, alternating leg movement and arm swing, side view, clean transparent background",
  hit:          "the character recoils back from impact, head and torso jerking back, taking damage, side view, clean transparent background",
  ko:           "the character falls backward to the ground, collapsing in defeat, side view, clean transparent background",
  victory:      "the character celebrates victory, raising weapon overhead, triumphant pose, side view, clean transparent background",
  idle:         "the character breathes idly with subtle body sway, weapon held casually at side, side view, clean transparent background",
};

async function uploadImage(path) {
  // fal storage upload: POST to /upload, returns fileUrl
  const buf = readFileSync(path);
  const blob = new Blob([buf], { type: "image/png" });
  const fd = new FormData();
  fd.append("file", blob, path.split(/[\\/]/).pop());
  const r = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: path.split(/[\\/]/).pop(), content_type: "image/png" }),
  });
  const j = await r.json();
  if (j.upload_url) {
    // Two-step upload: PUT to presigned URL
    await fetch(j.upload_url, { method: "PUT", body: buf });
    return j.file_url;
  }
  // Some endpoints accept direct multipart
  throw new Error("upload init failed: " + JSON.stringify(j).slice(0, 200));
}

async function submitJob(imageUrl, prompt) {
  const r = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, prompt, duration: "5" }),
  });
  const j = await r.json();
  if (!j.request_id) throw new Error("submit failed: " + JSON.stringify(j).slice(0, 400));
  return j.request_id;
}

async function pollJob(requestId) {
  // The MODEL path includes a sub-route after the slash; for status we drop subpath
  const baseSlug = MODEL.split("/").slice(0, 2).join("/");
  const deadline = Date.now() + 10 * 60_000;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const r = await fetch(`https://queue.fal.run/${baseSlug}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch {
      console.error("\n      bad JSON status:", text.slice(0, 200));
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }
    if (j.status !== lastStatus) {
      process.stdout.write(`\n      status=${j.status}`);
      lastStatus = j.status;
    } else {
      process.stdout.write(".");
    }
    if (j.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/${baseSlug}/requests/${requestId}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      return await rr.json();
    }
    if (j.status === "FAILED" || j.status === "ERROR") {
      throw new Error("job failed: " + JSON.stringify(j).slice(0, 400));
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("poll timeout");
}

async function downloadMp4(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
}

function extractFrames(mp4Path, outDir, n) {
  mkdirSync(outDir, { recursive: true });
  // ffmpeg: extract n evenly-spaced frames
  // Use select filter: select=between(t,T,T+epsilon) or just use fps=n/duration
  const ffmpeg = "ffmpeg";
  // Simpler: probe duration, then use vframes
  // Use thumbnail filter for representative frames
  const cmd = `"${ffmpeg}" -y -i "${mp4Path}" -vf "select='not(mod(n,floor(\\${'`'}/${n})))'" -vsync vfr "${outDir}/frame_%03d.png"`;
  // Actually simpler: extract uniformly
  const probe = execSync(`"${ffmpeg}" -i "${mp4Path}" 2>&1 || true`).toString();
  const m = probe.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
  let duration = 4.0;
  if (m) duration = parseInt(m[1])*3600 + parseInt(m[2])*60 + parseFloat(m[3]);
  const fps = (n / duration).toFixed(3);
  console.log(`        extracting ${n} frames over ${duration.toFixed(1)}s (fps=${fps})`);
  execSync(`"${ffmpeg}" -y -loglevel error -i "${mp4Path}" -vf "fps=${fps}" -frames:v ${n} "${outDir}/frame_%03d.png"`);
}

async function main() {
  const fighter = process.argv[2] || "jacare";
  const action = process.argv[3] || "attack_quick";
  const prompt = PROMPTS[action] || PROMPTS.attack_quick;
  const idlePath = `${__dirname}/../public/assets/characters/${fighter}/idle.png`;
  const tmpMp4   = `${__dirname}/../tmp/${fighter}_${action}.mp4`;
  const outDir   = `${__dirname}/../public/assets/characters/${fighter}/${action}_frames`;

  console.log(`[1/4] Upload ${idlePath}`);
  const imageUrl = await uploadImage(idlePath);
  console.log(`      ${imageUrl.slice(0, 80)}...`);

  console.log(`\n[2/4] Submit job to ${MODEL}`);
  console.log(`      prompt: "${prompt.slice(0, 80)}..."`);
  const reqId = await submitJob(imageUrl, prompt);
  console.log(`      request_id=${reqId}`);

  console.log(`\n[3/4] Polling (this can take 1-3 min)`);
  const result = await pollJob(reqId);
  const videoUrl = result.video?.url || result.video_url || result.videos?.[0]?.url;
  if (!videoUrl) {
    console.log("\n      result keys:", Object.keys(result));
    console.log(JSON.stringify(result, null, 2).slice(0, 1500));
    throw new Error("no video URL in result");
  }
  console.log(`\n      videoUrl=${videoUrl.slice(0, 100)}...`);
  await downloadMp4(videoUrl, tmpMp4);
  console.log(`      mp4 saved to ${tmpMp4}`);

  console.log(`\n[4/4] Extract frames`);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  extractFrames(tmpMp4, outDir, FRAMES_PER_ACTION);
  console.log(`      frames in ${outDir}`);

  console.log(`\n🎉 Done!`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
