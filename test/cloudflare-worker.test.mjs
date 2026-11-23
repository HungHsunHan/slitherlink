import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/worker.mjs';

const networks = JSON.stringify(['192.0.2.28', '198.51.100.224/27', '2001:db8:5:aabb::/64']);

function fixture(HOME_NETWORKS = networks) {
  const assetRequests = [];
  const ASSETS = {
    fetch(request) {
      assetRequests.push(request);
      return new Response('遊戲檔案', {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    },
  };

  function send(path = '/', { ip, method, headers = {} } = {}) {
    if (ip) headers = { ...headers, 'CF-Connecting-IP': ip };
    const request = new Request(`https://slitherlink.example.workers.dev${path}`, { method, headers });
    return worker.fetch(request, { HOME_NETWORKS, ASSETS });
  }

  return { assetRequests, send };
}

test('Cloudflare 轉交允許的 IPv4 與 IPv6，並禁止公開快取', async () => {
  const { assetRequests, send } = fixture();
  for (const ip of ['192.0.2.28', '198.51.100.239', '2001:DB8:0005:AABB:5:0:0:1']) {
    const response = await send('/game.mjs', { ip });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(response.headers.get('Content-Type'), /^text\/html/);
    assert.equal(await response.text(), '遊戲檔案');
  }
  assert.deepEqual(assetRequests.map((request) => new URL(request.url).pathname), Array(3).fill('/game.mjs'));
});

test('會正確判斷不是 16 的倍數的 IPv6 前綴及精確 IPv6 位址', async () => {
  const { send } = fixture(JSON.stringify(['2001:db8:5:aa80::/57', '::ffff:192.0.2.28']));
  assert.equal((await send('/', { ip: '2001:db8:5:aa81::f' })).status, 200);
  assert.equal((await send('/', { ip: '2001:db8:5:aa7f::1' })).status, 403);
  assert.equal((await send('/', { ip: '0:0:0:0:0:ffff:c000:21c' })).status, 200);
  assert.equal((await send('/', { ip: '::ffff:192.0.2.29' })).status, 403);
});

test('網段外或非正規的來源不能直接取得 HTML 或資源', async () => {
  const { assetRequests, send } = fixture();
  for (const ip of ['192.0.2.29', '198.51.100.223', '2001:db8:5:aabc::1', '192.0.002.28', '192.0.2.28, 192.0.2.28']) {
    for (const path of ['/', '/puzzles.mjs']) {
      const response = await send(path, { ip });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.match(await response.text(), /家中 Wi-Fi/);
    }
  }
  assert.equal(assetRequests.length, 0);
});

test('不採用來源可控制的轉送標頭，也不接受 Worker 子請求', async () => {
  const { assetRequests, send } = fixture();
  const forged = { 'X-Forwarded-For': '192.0.2.28', 'X-Real-IP': '192.0.2.28' };
  assert.equal((await send('/', { headers: forged })).status, 403);
  assert.equal((await send('/', { ip: '203.0.113.9', headers: forged })).status, 403);
  assert.equal((await send('/', { ip: '192.0.2.28', headers: { 'CF-Worker': 'other.example' } })).status, 403);
  assert.equal(assetRequests.length, 0);
});

test('缺少設定、混有無效項目或允許所有來源的網段都會封鎖', async () => {
  const badNetworks = [
    'not an IP', '192.0.2.0/33', '::/0', '0.0.0.0/0',
    '192.0.2.28\n', '192.0.2.0/24\n', '2001:db8:5::\n',
  ];
  const badConfigurations = [
    null, '', 'broken', '{}', '[]', '[1]',
    ...badNetworks.map((network) => JSON.stringify(['192.0.2.28', network])),
  ];
  for (const config of badConfigurations) {
    const { assetRequests, send } = fixture(config);
    assert.equal((await send('/', { ip: '192.0.2.28' })).status, 403);
    assert.equal(assetRequests.length, 0);
  }
});

test('HEAD 保留回應標頭與狀態且沒有內容，其他 HTTP 方法不讀取資源', async () => {
  const { assetRequests, send } = fixture();
  const head = await send('/style.css', { ip: '192.0.2.28', method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(assetRequests[0].method, 'HEAD');

  const blockedHead = await send('/style.css', { ip: '203.0.113.9', method: 'HEAD' });
  assert.equal(blockedHead.status, 403);
  assert.equal(await blockedHead.text(), '');

  const post = await send('/', { ip: '192.0.2.28', method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  assert.equal(assetRequests.length, 1);
});
