// Image-to-3D via fal.ai. Generates a textured GLB from a PNG.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(`${__dirname}/../.env`, "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const FAL_KEY = process.env.FAL_KEY;

// Try a few candidate models. We submit to the first that accepts our payload.
const CANDIDATES = [
  // Hunyuan3D v2.1 — good quality, textured
  { slug: "fal-ai/hunyuan3d-v21", body: (url) => ({ input_image_url: url, num_inference_steps: 30, guidance_scale: 5.5, octree_resolution: 256, textured_mesh: true }) },
  // Trellis — also strong, texture support
  { slug: "fal-ai/trellis", body: (url) => ({ image_url: url, ss_guidance_strength: 7.5, slat_guidance_strength: 3 }) },
  // TripoSR — fast, untextured
  { slug: "fal-ai/triposr", body: (url) => ({ image_url: url }) },
];

async function uploadFile(path) {
  const buf = readFileSync(path);
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/png" }), path.split(/[\\/]/).pop());
  const r = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: path.split(/[\\/]/).pop(), content_type: "image/png" }),
  });
  const init = await r.json();
  if (!init.upload_url || !init.file_url) throw new Error("init upload failed: " + JSON.stringify(init));
  const put = await fetch(init.upload_url, { method: "PUT", body: buf, headers: { "Content-Type": "image/png" } });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return init.file_url;
}

async function trySubmit(modelSlug, payload) {
  const r = await fetch(`https://queue.fal.run/${modelSlug}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 200) }; }
  if (!j.request_id) return { ok: false, error: JSON.stringify(j).slice(0, 200) };
  return { ok: true, requestId: j.request_id };
}

async function pollJob(modelSlug, requestId) {
  const baseSlug = modelSlug.split("/").slice(0, 2).join("/");
  const deadline = Date.now() + 12 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await fetch(`https://queue.fal.run/${baseSlug}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { await sleep(5000); continue; }
    if (j.status !== last) { process.stdout.write(`\n      status=${j.status}`); last = j.status; }
    else process.stdout.write(".");
    if (j.status === "COMPLETED") {
      const rr = await fetch(`https://queue.fal.run/${baseSlug}/requests/${requestId}`, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      });
      return await rr.json();
    }
    if (j.status === "FAILED" || j.status === "ERROR") throw new Error("job failed: " + JSON.stringify(j).slice(0, 400));
    await sleep(5000);
  }
  throw new Error("poll timeout");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadUrl(url, dest) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const inputPath = process.argv[2] || `${__dirname}/../public/assets/characters/jacare/idle.png`;
  const charId = process.argv[3] || "jacare";

  console.log(`[1/3] Upload ${inputPath}`);
  const fileUrl = await uploadFile(inputPath);
  console.log(`      ${fileUrl}`);

  console.log(`\n[2/3] Try image-to-3D models`);
  let result, modelUsed;
  for (const cand of CANDIDATES) {
    console.log(`\n      trying ${cand.slug}...`);
    const sub = await trySubmit(cand.slug, cand.body(fileUrl));
    if (!sub.ok) { console.log(`      ✗ ${sub.error}`); continue; }
    console.log(`      submitted: ${sub.requestId}`);
    try {
      const r = await pollJob(cand.slug, sub.requestId);
      // Some models report COMPLETED but fail validation — detail field carries error
      if (r.detail) { console.log(`      ✗ rejected: ${JSON.stringify(r.detail).slice(0,200)}`); continue; }
      result = r;
      modelUsed = cand.slug;
      break;
    } catch (e) {
      console.log(`\n      job failed: ${e.message}`);
    }
  }
  if (!result) throw new Error("all 3D models failed");

  console.log(`\n      ✅ used ${modelUsed}`);
  console.log(`      keys: ${Object.keys(result).join(', ')}`);
  const r = result;
  // Try to find the GLB url in various output shapes
  const glbUrl = r.model_mesh?.url || r.mesh?.url || r.glb?.url || r.output?.glb?.url || r.model_glb?.url ||
                 (Array.isArray(r.images) && r.images[0]?.url) || r.url;
  if (!glbUrl) {
    console.log("Full result:", JSON.stringify(r, null, 2).slice(0, 2000));
    throw new Error("no GLB url in response");
  }
  console.log(`      glb: ${glbUrl.slice(0, 100)}`);

  const outPath = `${__dirname}/../tmp/${charId}.glb`;
  console.log(`\n[3/3] Download GLB → ${outPath}`);
  const size = await downloadUrl(glbUrl, outPath);
  console.log(`      ${(size / 1024).toFixed(1)} KB saved`);
  console.log(`\n🎉 Done! GLB at: ${outPath}`);
}

main().catch(e => { console.error("ERR:", e.message); process.exit(1); });
