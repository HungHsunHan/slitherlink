function parseIPv4(address) {
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255)) {
    return null;
  }

  return { width: 32, value: octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n) };
}

function parseIPv6(address) {
  if (!/^[a-f\d:.]+$/i.test(address)) return null;

  let normalized;
  try {
    // The URL parser validates IPv6 and normalizes any embedded IPv4 tail.
    normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }

  const [before, after] = normalized.split('::');
  const first = before ? before.split(':') : [];
  const last = after ? after.split(':') : [];
  const pieces = [...first, ...Array(8 - first.length - last.length).fill('0'), ...last];
  return { width: 128, value: pieces.reduce((value, piece) => (value << 16n) | BigInt(`0x${piece}`), 0n) };
}

function parseAddress(address) {
  if (typeof address !== 'string' || address.length === 0 || address.length > 45) return null;
  return address.includes(':') ? parseIPv6(address) : parseIPv4(address);
}

function parseNetwork(entry) {
  if (typeof entry !== 'string') return null;
  const pieces = entry.split('/');
  const address = parseAddress(pieces[0]);
  if (!address || pieces.length > 2) return null;

  const prefix = pieces[1];
  if (prefix === undefined) return { ...address, shift: 0n };
  if (!/^[1-9]\d{0,2}$/.test(prefix) || Number(prefix) > address.width) return null;
  return { ...address, shift: BigInt(address.width - Number(prefix)) };
}

function allowsAddress(configuration, connectingIP) {
  const remote = parseAddress(connectingIP);
  if (!remote || typeof configuration !== 'string') return false;

  let entries;
  try {
    entries = JSON.parse(configuration);
  } catch {
    return false;
  }
  if (!Array.isArray(entries)) return false;

  const networks = entries.map(parseNetwork);
  if (networks.includes(null)) return false;
  return networks.some(({ width, value, shift }) => (
    width === remote.width && (value >> shift) === (remote.value >> shift)
  ));
}

function secureHeaders(headers) {
  const result = new Headers(headers);
  result.set('Cache-Control', 'private, no-store');
  result.set('X-Content-Type-Options', 'nosniff');
  return result;
}

function errorResponse(request, status, message, headers) {
  const responseHeaders = secureHeaders(headers);
  responseHeaders.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response(request.method === 'HEAD' ? null : message, { status, headers: responseHeaders });
}

export default {
  async fetch(request, env) {
    // Same-zone Worker subrequests can change the source address reported by Cloudflare.
    if (request.headers.has('CF-Worker') || !allowsAddress(env.HOME_NETWORKS, request.headers.get('CF-Connecting-IP'))) {
      return errorResponse(request, 403, '此遊戲只開放家中網路。請連上家中 Wi-Fi 再試一次。');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(request, 405, '此網址只提供讀取。', { Allow: 'GET, HEAD' });
    }

    const asset = await env.ASSETS.fetch(request);
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers: secureHeaders(asset.headers),
    });
  },
};
