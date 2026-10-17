// Exercise the production bundle with local fixtures and no production credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory = mkdtempSync(join(tmpdir(), 'concierge-bundle-smoke-'));
let child;
let providerCalls = 0;
let output = '';
const provider = createServer((_req, res) => {
  providerCalls++;
  if (providerCalls > 1) { res.writeHead(402); res.end('DO_NOT_EXPOSE_PROVIDER_BODY'); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end('data: {"choices":[{"delta":{"content":"Fixture reply"}}]}\n\ndata: [DONE]\n\n');
});
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
const reservePort = createServer();
await new Promise(resolve => reservePort.listen(0, '127.0.0.1', resolve));
const port = reservePort.address().port;
await new Promise(resolve => reservePort.close(resolve));
const url = `http://127.0.0.1:${port}`;
writeFileSync(join(directory, 'brief.json'), JSON.stringify({ brandName: 'Fixture', audience: 'Visitors', objective: 'Explain Fixture', tone: 'Plain', cta: 'Learn more', docs: 'Fixture is a landing page.' }));
writeFileSync(join(directory, 'mock-alert.mjs'), `const original = globalThis.fetch; globalThis.fetch = async (url, options) => { if (String(url).startsWith('https://api.telegram.org/')) { console.log('fixture_alert_ack'); return Response.json({ok:true}); } return original(url, options); };`);
async function start() {
  child = spawn('/usr/bin/node', ['--import', pathToFileURL(join(directory, 'mock-alert.mjs')).href, resolve('dist-deploy/server.bundle.mjs')], {
    env: { PATH: process.env.PATH, PORT: String(port), CONCIERGE_HOST: '127.0.0.1', CONCIERGE_BRIEF: join(directory, 'brief.json'),
      VENICE_API_KEY: 'fixture-only', VENICE_BASE_URL: `http://127.0.0.1:${provider.address().port}`, VENICE_MODEL: 'fixture',
      TELEGRAM_BOT_TOKEN: 'fixture-only', TELEGRAM_CHAT_ID: 'fixture', TELEGRAM_THREAD_ID: '1',
      CONCIERGE_BUDGET_PATH: join(directory, 'usage.sqlite'), ALLOWED_ORIGINS: 'https://concierge.repo.box' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Bundle exited before readiness');
    try { if ((await fetch(url + '/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Bundle did not start');
}
async function stop() { if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); } }
const chat = () => fetch(url + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://concierge.repo.box' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'What is Fixture?' }] }) });
try {
  await start();
  assert.match(await (await chat()).text(), /Fixture reply/);
  assert.match(await (await chat()).text(), /provider_exhausted/);
  assert.equal((await chat()).status, 503);
  assert.equal((await fetch(url + '/ready')).status, 503);
  await stop(); await start();
  assert.equal((await chat()).status, 503);
  assert.equal(providerCalls, 2);
  // One conversation log and one exhaustion alert use the mock Telegram transport.
  assert.equal(output.split('fixture_alert_ack').length - 1, 2);
  assert.ok(!output.includes('DO_NOT_EXPOSE_PROVIDER_BODY'));
  assert.ok(!output.includes('fixture-only'));
  console.log(JSON.stringify({ bundle: 'passed', providerCalls, durablePause: true, secretLeakCheck: 'passed', realProviderCalls: 0 }));
} finally { await stop(); provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); rmSync(directory, { recursive: true, force: true }); }
