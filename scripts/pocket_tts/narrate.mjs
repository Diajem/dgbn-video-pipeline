// Shared file-based entry point for Claude Code, other local agents and editors.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {DEFAULT_NARRATOR, requireNarrator, requireNarrationStyle, pocketStatus, narratePocket} from '../../studio/lib/pocket-voice.mjs';

export async function renderFile({script, output, voice = DEFAULT_NARRATOR, style = 'natural'}, synth = narratePocket) {
  requireNarrator(voice);
  requireNarrationStyle(style);
  if (!script || !output || path.extname(output).toLowerCase() !== '.wav') throw new Error('Supply --script <text-file> and --output <new-file.wav>');
  output = path.resolve(output);
  const metadata = output + '.json';
  for (const filename of [output, metadata]) {
    try { await fs.access(filename); throw new Error('Output exists. Choose a new filename: ' + filename); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const text = await fs.readFile(path.resolve(script), 'utf8');
  if (!text.trim() || text.length > 20000) throw new Error('Use a script of between 1 and 20,000 characters; split longer episodes into chapters');
  await fs.mkdir(path.dirname(output), {recursive: true});
  const pending = output + '.' + crypto.randomBytes(6).toString('hex') + '.wav';
  let published = false;
  try {
    const info = await synth(text, voice, pending, style);
    const result = {...info, voiceId: voice, styleId: style, file: output, script: text,
      scriptSha256: crypto.createHash('sha256').update(text).digest('hex'), provider: 'pocket-tts', status: 'DRAFT'};
    await fs.copyFile(pending, output, constants.COPYFILE_EXCL);
    published = true;
    await fs.writeFile(metadata, JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
    return result;
  } catch (error) {
    if (published) await fs.unlink(output).catch(() => {});
    throw error;
  } finally { await fs.unlink(pending).catch(() => {}); }
}

async function main() {
  const {values} = parseArgs({options: {
    script: {type: 'string'}, output: {type: 'string'}, voice: {type: 'string'}, style: {type: 'string'},
    status: {type: 'boolean'}, help: {type: 'boolean'}
  }});
  if (values.help) return console.log('npm run voice -- --script <text-file> --output <new.wav> [--voice carabau|charles|jane] [--style natural|news]\nnpm run voice -- --status');
  if (values.status) return console.log(JSON.stringify(await pocketStatus(), null, 2));
  console.log(JSON.stringify(await renderFile(values), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
