import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBinding } from '../server.mjs';

const LABEL = 'local.slitherlink.game';
const action = process.argv[2];

function launchctl(args, quiet = false) {
  const result = spawnSync('/bin/launchctl', args, { stdio: quiet ? 'ignore' : 'inherit' });
  if (result.error) throw result.error;
  if (!quiet && result.status !== 0) throw new Error('macOS 無法更新數迴的登入服務。');
  return result.status === 0;
}

function xml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function run() {
  if (process.platform !== 'darwin') throw new Error('此指令適用於 macOS。');
  if (!['install', 'uninstall'].includes(action)) throw new Error('請指定 install 或 uninstall。');

  const directory = join(homedir(), 'Library', 'LaunchAgents');
  const plistPath = join(directory, `${LABEL}.plist`);
  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${LABEL}`;
  if (!launchctl(['print', domain], true)) throw new Error('請登入 Mac 桌面後執行此指令。');

  const installed = launchctl(['print', service], true);

  if (action === 'uninstall') {
    if (installed) launchctl(['bootout', service]);
    rmSync(plistPath, { force: true });
    console.log('已停止數迴登入服務。');
    return;
  }

  const { host } = resolveBinding({ lan: true });
  const logDirectory = join(homedir(), 'Library', 'Logs');
  const logPath = join(logDirectory, 'slitherlink.log');
  const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(serverPath)}</string>
    <string>--host</string>
    <string>${xml(host)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;
  mkdirSync(directory, { recursive: true });
  mkdirSync(logDirectory, { recursive: true });
  const temporaryPath = `${plistPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, plist, { flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, plistPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  if (installed) launchctl(['bootout', service]);
  launchctl(['enable', service]);
  launchctl(['bootstrap', domain, plistPath]);
  console.log(`已設定數迴在登入後啟動，網址為 http://${host}:8787/。服務記錄位於 ${logPath}。`);
}

try {
  run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
