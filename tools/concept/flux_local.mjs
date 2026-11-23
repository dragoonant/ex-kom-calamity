// Render a concept prompts file through the local Flux Studio (http://127.0.0.1:7880, the owner's GPU).
//
//   node tools/concept/flux_local.mjs docs/concept/samples/r10/prompts-r10.json [--only id,id] [--force]
//
// Each item x seed becomes one job (FLUX.2 klein by default, Apache-2.0). Text items are sent as
// style_<kind> + prompt; kind "edit" items send their refs (repo paths) and the prompt as the instruction.
// Images land beside the prompts file as <id>-s<seed>.png (convert to .jpg before committing); an existing .png or
// .jpg of the same name is skipped (idempotent).
// One job at a time: the studio queues and waits while a Hunyuan3D stage holds the GPU.
import fs from 'node:fs';
import path from 'node:path';

const STUDIO = process.env.FLUX_STUDIO || 'http://127.0.0.1:7880';
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: flux_local.mjs <prompts.json> [--only id,id] [--force]'); process.exit(2); }
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(args[onlyArg + 1].split(',')) : null;
const force = args.includes('--force');

const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
const outDir = path.dirname(file);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mime = (p) => ({ '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' })[path.extname(p).toLowerCase()];

async function post(body) {
  const r = await fetch(`${STUDIO}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function wait(id) {
  for (;;) {
    const j = await (await fetch(`${STUDIO}/api/jobs/${id}`)).json();
    if (j.status === 'done') return j;
    if (['failed', 'cancelled'].includes(j.status)) throw new Error(j.error || j.status);
    await sleep(1500);
  }
}

const started = Date.now();
let made = 0, skipped = 0, failed = 0;
for (const it of spec.items) {
  if (only && !only.has(it.id)) continue;
  for (const seed of it.seeds) {
    const out = path.join(outDir, `${it.id}-s${seed}.png`);
    if (!force && (fs.existsSync(out) || fs.existsSync(out.replace(/\.png$/, '.jpg')))) { skipped++; continue; }
    const body = { model: it.model || spec.model || 'klein', seed, batch: 1, aspect: it.aspect || '1:1', megapixels: it.megapixels || 1 };
    if (it.kind === 'edit') {
      body.mode = 'edit';
      body.prompt = it.prompt;
      body.images = it.refs.map((p) => `data:image/${mime(p)};base64,${fs.readFileSync(p).toString('base64')}`);
    } else {
      const style = spec[`style_${it.kind}`];
      if (!style) throw new Error(`no style_${it.kind} for ${it.id}`);
      body.prompt = `${style} ${it.prompt}`;
    }
    const t = Date.now();
    try {
      const job = await wait((await post(body)).id);
      const png = Buffer.from(await (await fetch(`${STUDIO}/files/${job.id}/${job.images[0]}`)).arrayBuffer());
      fs.writeFileSync(out, png);
      made++;
      console.log(`${path.basename(out)}  ${((Date.now() - t) / 1000).toFixed(1)} s  (job ${job.id})`);
    } catch (e) {
      failed++;
      console.log(`${path.basename(out)}  FAILED: ${e.message}`);
    }
  }
}
console.log(`made ${made}, skipped ${skipped}, failed ${failed}, ${((Date.now() - started) / 60000).toFixed(1)} min`);
process.exit(failed ? 1 : 0);
