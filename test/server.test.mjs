import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { allowsPeer, createGameServer, parseOptions, resolveBinding } from '../server.mjs';

const network = {
  wifiDevices: ['en1'],
  interfaces: {
    en0: [{ family: 'IPv4', address: '10.0.0.12', netmask: '255.255.255.0', internal: false }],
    en1: [{ family: 'IPv4', address: '192.168.4.7', netmask: '255.255.254.0', internal: false }],
    en2: [{ family: 'IPv4', address: '8.8.8.8', netmask: '255.255.255.0', internal: false }],
  },
};

test('the default binds only to the local computer', () => {
  assert.equal(resolveBinding(parseOptions([]), network).host, '127.0.0.1');
});

test('LAN mode uses the Wi-Fi adapter address and netmask', () => {
  assert.deepEqual(resolveBinding(parseOptions(['--lan']), network), {
    host: '192.168.4.7', netmask: '255.255.254.0',
  });
});

test('LAN mode fails with guidance when Wi-Fi has no private IPv4', () => {
  const disconnected = { ...network, wifiDevices: ['missing'] };
  assert.throws(() => resolveBinding(parseOptions(['--lan']), disconnected), /Wi-Fi/);
});

test('an explicit private assigned address can select a different adapter', () => {
  assert.equal(resolveBinding(parseOptions(['--host', '10.0.0.12']), network).host, '10.0.0.12');
});

for (const address of ['0.0.0.0', '8.8.8.8', '192.168.4.9']) {
  test(`an explicit address cannot bind ${address}`, () => {
    assert.throws(() => resolveBinding(parseOptions(['--host', address]), network), /私有 IPv4/);
  });
}

test('the port is explicit and constrained to an integer in range', () => {
  assert.equal(parseOptions(['--port', '8123']).port, 8123);
  assert.throws(() => parseOptions(['--port', '65536']), /port/);
});

test('a private route is allowed only when the peer falls within the selected subnet', () => {
  const binding = resolveBinding(parseOptions(['--lan']), network);
  assert.equal(allowsPeer('192.168.5.20', binding), true);
  assert.equal(allowsPeer('192.168.6.20', binding), false);
  assert.equal(allowsPeer('8.8.8.8', binding), false);
});

function get(port, path, { host = `127.0.0.1:${port}`, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, headers: { host }, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
      response.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('HTTP serves the game and JS, with HEAD support and no external Host access', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'slitherlink-http-'));
  const publicDirectory = join(temp, 'public');
  const server = createGameServer(resolveBinding(parseOptions([]), network), { publicDirectory });
  t.after(async () => {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await rm(temp, { recursive: true, force: true });
  });
  await mkdir(publicDirectory);
  await writeFile(join(publicDirectory, 'index.html'), '<h1>數迴</h1>');
  await writeFile(join(publicDirectory, 'game.mjs'), 'export default 1;');
  await writeFile(join(temp, 'outside.mjs'), 'Private fixture outside the public directory.');
  await symlink(join(temp, 'outside.mjs'), join(publicDirectory, 'outside.mjs'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  const page = await get(port, '/');
  assert.equal(page.body, '<h1>數迴</h1>');
  assert.match(page.headers['content-type'], /^text\/html/);
  const script = await get(port, '/game.mjs?version=1', { method: 'HEAD' });
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /javascript/);
  assert.equal(script.body, '');
  assert.equal((await get(port, '/', { host: 'another.example' })).status, 403);
  assert.equal((await get(port, '/', { method: 'POST' })).status, 405);
  assert.equal((await get(port, '/missing.mjs')).status, 404);
  assert.equal((await get(port, '/%2e%2e/server.mjs')).status, 404);
  assert.equal((await get(port, '/outside.mjs')).status, 404);
});
