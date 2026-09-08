import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = ['manifest.json','background.js','content-aipass.js','content-chatgpt.js','popup.html','popup.css','popup.js','README.md'];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const hosts = [...(manifest.host_permissions || []), ...(manifest.content_scripts || []).flatMap(x => x.matches || [])].join(' ');
if (manifest.manifest_version !== 3) throw new Error('Manifest must be MV3');
if (!/aipass\.go\.th/.test(hosts)) throw new Error('AI Passport landing host missing');
if (!/aipass\.net/.test(hosts)) throw new Error('AI Passport chat host missing');
if (!/chatgpt\.com/.test(hosts)) throw new Error('ChatGPT host missing');
if (/127\.0\.0\.1:8910/.test(hosts)) throw new Error('Launcher permission must not exist in Pair Bridge mode');
if (manifest.version !== '0.3.1') throw new Error('Manifest version must be 0.3.1');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
for (const forbidden of ['activate-local', '/api/launcher-config', 'CEO_LAUNCHER']) {
  if (background.includes(forbidden)) throw new Error(`Runtime-switch code still present: ${forbidden}`);
}
for (const requiredToken of ['pairId','projectId','aipassTabId','chatgptTabId','PAIR_NOT_MATCHED','SEND_TO_CHATGPT','SEND_TO_AIPASS']) {
  if (!background.includes(requiredToken)) throw new Error(`Pair bridge token missing: ${requiredToken}`);
}
if (!background.includes('aipass') || !background.includes('.net')) throw new Error('Background AI Passport matcher missing aipass.net');
for (const file of ['background.js','content-aipass.js','content-chatgpt.js','popup.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
}
console.log('CEO SWAP Pair Bridge validation passed.');
