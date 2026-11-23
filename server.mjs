import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isIPv4 } from 'node:net';
import { networkInterfaces, platform } from 'node:os';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const LOCAL_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const PUBLIC_DIRECTORY = fileURLToPath(new URL('./public/', import.meta.url));
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

export function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: { lan: { type: 'boolean' }, host: { type: 'string' }, port: { type: 'string' } },
  });
  if (values.port === undefined) return { ...values, port: DEFAULT_PORT };
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || port < 1 || port > 65535) {
    throw new Error('--port 必須是 1 到 65535 的整數。');
  }
  return { ...values, port };
}

function isPrivateIPv4(address) {
  if (typeof address !== 'string' || !isIPv4(address)) return false;
  const [first, second] = address.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

function findWiFiDevices(interfaces) {
  if (platform() !== 'darwin') {
    return Object.keys(interfaces).filter((name) => /^(wi-?fi|wireless|wlan|wlp|wlx)/i.test(name));
  }
  try {
    const output = execFileSync('/usr/sbin/networksetup', ['-listallhardwareports'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    const found = [...output.matchAll(/^Hardware Port: (?:Wi-Fi|AirPort)\r?\nDevice: (\S+)/gmi)];
    if (found.length) return found.map((match) => match[1]);
  } catch {
    // Use the usual macOS Wi-Fi device when networksetup is unavailable.
  }
  return ['en0'];
}

export function resolveBinding({ lan, host }, { interfaces = networkInterfaces(), wifiDevices } = {}) {
  if (host === undefined && !lan) return { host: LOCAL_HOST };

  const addresses = Object.entries(interfaces).flatMap(([device, entries]) =>
    (entries ?? [])
      .filter(({ internal, address, netmask }) => !internal && isPrivateIPv4(address) &&
        isIPv4(netmask) && netmask !== '0.0.0.0')
      .map(({ address, netmask }) => ({ device, address, netmask })),
  );
  if (host !== undefined) {
    const assigned = addresses.find((entry) => entry.address === host);
    if (!assigned) throw new Error('--host 必須填入這台電腦目前已指派的私有 IPv4 位址。');
    return { host: assigned.address, netmask: assigned.netmask };
  }

  const devices = wifiDevices ?? findWiFiDevices(interfaces);
  const wifiAddress = devices.flatMap((device) => addresses.filter((entry) => entry.device === device))[0];
  if (!wifiAddress) {
    throw new Error('找不到 Wi-Fi 的私有 IPv4 位址。請確認已連上家中 Wi-Fi，或用 --host 指定這台電腦的私有 IPv4 位址。');
  }
  return { host: wifiAddress.address, netmask: wifiAddress.netmask };
}

function ipv4Bits(address) {
  return address.split('.').reduce((bits, octet) => (bits << 8) | Number(octet), 0);
}

export function allowsPeer(address, { host, netmask }) {
  if (host === LOCAL_HOST) return address === LOCAL_HOST;
  if (!isPrivateIPv4(address) || !isIPv4(netmask) || netmask === '0.0.0.0') return false;
  const mask = ipv4Bits(netmask);
  return (ipv4Bits(address) & mask) === (ipv4Bits(host) & mask);
}

function isAllowedHost(hostHeader, { host }, port) {
  const names = host === LOCAL_HOST ? [host, 'localhost'] : [host];
  return names.some((name) => hostHeader === name || hostHeader === `${name}:${port}`);
}

function sendError(response, status, message, headers) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  response.end(message);
}

export function createGameServer(binding, { publicDirectory = PUBLIC_DIRECTORY } = {}) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!allowsPeer(request.socket.remoteAddress, binding) ||
      !isAllowedHost(request.headers.host, binding, server.address()?.port)) {
      sendError(response, 403, '請使用伺服器顯示的網址，並確認裝置已連到相同的家庭網路。');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendError(response, 405, '此網址只提供讀取。', { Allow: 'GET, HEAD' });
      return;
    }

    const path = request.url.split('?', 1)[0];
    const asset = path === '/' ? '/index.html' : path;
    const contentType = MIME_TYPES[extname(asset)];
    if (!contentType || !/^\/(?:[\w-]+\/)*[\w-]+\.[a-z0-9]+$/.test(asset)) {
      sendError(response, 404, '找不到這個頁面。');
      return;
    }

    try {
      const root = await realpath(publicDirectory);
      const source = await realpath(join(root, asset));
      const relativePath = relative(root, source);
      if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
        sendError(response, 404, '找不到這個頁面。');
        return;
      }
      const content = await readFile(source);
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) {
        sendError(response, 404, '找不到這個頁面。');
        return;
      }
      console.error('讀取遊戲檔案失敗。', error);
      sendError(response, 500, '無法讀取遊戲檔案。');
    }
  });
  return server;
}

function start() {
  try {
    const options = parseOptions(process.argv.slice(2));
    const binding = resolveBinding(options);
    const server = createGameServer(binding);
    const url = `http://${binding.host}:${options.port}/`;
    server.on('error', (error) => {
      const detail = error.code === 'EADDRINUSE' ? '這個位址的連接埠已使用，請用 --port 選擇其他連接埠。' : error.message;
      console.error(`無法啟動數迴伺服器（${url}）。${detail}`);
      process.exitCode = 1;
    });
    server.listen(options.port, binding.host, () => {
      console.log(`數迴已啟動：${url}`);
      console.log(binding.netmask ? '請在同一個家庭 Wi-Fi 的裝置開啟上述網址。' : '目前可從這台電腦開啟。');
      console.log('按 Ctrl+C 停止遊戲伺服器。');
    });
  } catch (error) {
    console.error(`無法啟動數迴伺服器。${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
