// SPDX-License-Identifier: MIT
// Token Radar entry (Node 22, standard library only).
// Reads the sealed snapshot, scores every pre-token protocol, and writes /output:
// board.json, data.js, dashboard/, screenshots/ and dossier.json. Local runs use
// MAKEFUN_OUTPUT_DIR and --input <snapshot.json|dir> instead of /input and /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read PNG IHDR or JPEG SOF dimensions so a bad screenshot fails locally, not at the gate. */
function imageInfo(b: Buffer): { w: number; h: number } | null {
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    const sof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if (len < 2) return null;
      if (sof.indexOf(marker) >= 0) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}; pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR || '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the board the gate would refuse: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

const page = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// The judge reads the dashboard's whole source in the dossier; keep it under the text cap.
const sourceBytes = page.reduce((sum, name) => sum + statSync(join(out, 'dashboard', name)).size, 0);
if (sourceBytes > TEXT_MAX_BYTES) {
  process.stderr.write(`token radar: dashboard source is ${sourceBytes} bytes, above the ${TEXT_MAX_BYTES} dossier cap\n`);
  process.exit(1);
}
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`token radar: ${shots.length} screenshots; the gate wants 3 or 4\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: bad screenshot name ${name}\n`);
    process.exit(1);
  }
  const bytes = readFileSync(join(out, 'screenshots', name));
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: ${name} is ${bytes.length} bytes, above the ${SCREENSHOT_CAPS.max_bytes} screenshot cap\n`);
    process.exit(1);
  }
  const dim = imageInfo(bytes);
  if (dim === null || Math.max(dim.w, dim.h) > 1440 || Math.min(dim.w, dim.h) < 800) {
    process.stderr.write(`token radar: ${name} is not a PNG/JPEG within 1440x800; got ${dim ? dim.w + 'x' + dim.h : 'an unreadable image'}\n`);
    process.exit(1);
  }
}

const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
if (Buffer.byteLength(dossier, 'utf8') > 1_572_864) {
  process.stderr.write('token radar: the dossier is over 1.5 MiB; reduce the screenshot bytes\n');
  process.exit(1);
}
writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `token radar ${radar.model_version}: ${snapshot.protocols.length} protocols, ${radar.watchlist_size} watchlist, ${board.length} rows (${radar.early_size} early, ${radar.live_size} traded comps)\n` +
  `token radar: wrote ${page.length} dashboard files and ${shots.length} screenshots into ${out}, plus board.json, data.js and dossier.json\n`,
);
