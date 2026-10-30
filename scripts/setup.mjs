#!/usr/bin/env node
// OVXA City interactive setup.
//   npm run setup                         full setup: bots, secrets, deploy
//   npm run setup -- webhook <botId> <url> <key>   attach a bot's decision webhook
//   npm run setup -- bots                 re-send BOTS secret from .ovxa-city.local.json
// Your bot tokens are kept in .ovxa-city.local.json (gitignored). Nothing is sent anywhere except to your own Cloudflare account through wrangler.
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LOCAL = '.ovxa-city.local.json';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, d = '') => ((await rl.question(d ? `${q} (${d}): ` : `${q}: `)).trim() || d);
const rand = (n = 24) => randomBytes(n).toString('hex');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bot';
const wr = (args, input) => {
  const r = spawnSync('npx', ['wrangler', ...args], { input, stdio: [input == null ? 'inherit' : 'pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n✗ wrangler ${args.join(' ')} failed`); process.exit(1); }
};
const load = () => (existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : { bots: {} });
const save = (s) => writeFileSync(LOCAL, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
const putBots = (s) => wr(['secret', 'put', 'BOTS'], JSON.stringify(s.bots));

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'webhook') {
  const [id, url, key] = rest;
  const s = load();
  if (!id || !url || !s.bots[id]) { console.error(`Usage: npm run setup -- webhook <botId> <url> <key>\nKnown bots: ${Object.keys(s.bots).join(', ') || 'none'}`); process.exit(1); }
  Object.assign(s.bots[id], { webhook: url, ...(key ? { webhookKey: key } : {}) });
  save(s); putBots(s); console.log(`✓ ${s.bots[id].name} now receives your decisions.`); rl.close(); process.exit(0);
}
if (cmd === 'bots') { putBots(load()); rl.close(); process.exit(0); }

console.log('\n  OVXA City setup: your bots as a living city\n');
console.log('  Step 1/4 · Cloudflare login');
const who = spawnSync('npx', ['wrangler', 'whoami'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (!/associated with the email|You are logged in/i.test(who.stdout || '')) wr(['login']);

console.log('\n  Step 2/4 · Your bots (first = Chief of Staff tower, second = router dish, rest = offices)');
const s = load();
const names = (await ask('  Bot names, comma-separated', Object.values(s.bots).map((b) => b.name).join(', ') || 'Chief of Staff, Grok Bot')).split(',').map((x) => x.trim()).filter(Boolean);
const bots = {};
names.forEach((name, i) => {
  const id = slug(name); const old = s.bots[id] || {};
  bots[id] = { ...old, name, role: i === 0 ? 'chief' : i === 1 ? 'router' : 'worker', token: old.token || rand() };
});
s.bots = bots;

console.log('\n  Step 3/4 · Secrets');
const pw = await ask('  Town Hall password (Enter = generate one)', '');
s.password = pw || s.password || rand(9);
save(s);
// Deploy first so the Worker (and its KV namespace) exist, then attach secrets.
console.log('\n  Step 4/4 · Build & deploy (KV is created automatically)');
const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (b.status !== 0) process.exit(1);
wr(['deploy']);
wr(['secret', 'put', 'OWNER_PASSWORD'], s.password);
wr(['secret', 'put', 'SESSION_SECRET'], s.sessionSecret || (s.sessionSecret = rand(32)));
putBots(s); save(s);

const url = await ask('\n  Paste your city URL from the deploy output above', 'https://ovxa-city.<you>.workers.dev');
s.url = url.replace(/\/$/, ''); save(s);
console.log(`\n  ✓ Done. Open ${s.url} and sign in with: ${s.password}\n`);
console.log('  Now paste this to each bot (see README, "Paste this to your bot"):\n');
for (const [id, bot] of Object.entries(s.bots)) console.log(`   • ${bot.name}: CITY_URL=${s.url}  BOT_ID=${id}  BOT_TOKEN=${bot.token}`);
console.log(`\n  When a bot gives you its webhook URL + key:\n   npm run setup -- webhook <BOT_ID> <URL> <KEY>\n\n  Tokens are saved in ${LOCAL} (never commit it).\n`);
rl.close();
