#!/usr/bin/env node
// fleet8 CLI：主控侧 SSH 池命令行。零 npm，纯 Node 标准库 + type stripping 直跑。
// 子命令：pair / list / ssh / workspace / remove / pubkey。
// 安全：密钥 0600、只连已配对设备；任何失败 stderr + 非零退出，不崩、不泄露密钥内容。

import { join, dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { homedir } from 'node:os';
import { chmodSync } from 'node:fs';

/** 一次性邀请码登记文件（主控侧，~/.fleet/invites.json）。 */
const INVITES_FILENAME = 'invites.json';

import { loadSshDevices, saveSshDevices, sshDevicesFile, sshKeysDir, sshSocketsDir, fleetHome } from './config.ts';
import { generateSshKey, readPublicKey } from './keys.ts';
import {
  assertPaired,
  deviceIdFromHost,
  formatSshDevice,
  nowIso,
  removeSshDevice,
  upsertSshDevice,
} from './pool.ts';
import { sshExec } from './ssh.ts';
import { scpUpload, scpDownload } from './sftp.ts';
import { getWorkspace, setWorkspace } from './workspace.ts';
import type { SshDevice } from './types.ts';

/** 顶层帮助文本。 */
function usage(): string {
  return [
    'fleet8 — dsh-devices SSH 池轻量执行（主控直连被控，不经 hub）',
    '',
    '用法:',
    '  fleet8 pair <host> [--port 22] [--user 用户] [--id 别名] [--name 友好名] [--key 私钥路径]',
    '      生成/复用 SSH 密钥 + 登记已配对设备 + 打印公钥（把公钥加到被控 ~/.ssh/authorized_keys）',
    '  fleet8 list',
    '      列出已配对设备',
    '  fleet8 ssh <目标> <命令...>',
    '      SSH 直连执行命令（目标 = deviceId / host / name）',
    '  fleet8 workspace <目标> [目录]',
    '      设置（给目录）/查看（不给目录）远程工作区',
    '  fleet8 upload <目标> <本地文件> <远端路径>',
    '      上传文件到已配对设备（沿 SSH 通道）',
    '  fleet8 download <目标> <远端文件> <本地路径>',
    '      从已配对设备下载文件（沿 SSH 通道）',
    '  fleet8 remove <目标>',
    '      移除已配对设备',
    '  fleet8 pubkey <目标>',
    '      打印设备公钥（重新配对被控 authorized_keys 用）',
    '  fleet8 --help',
    '      本帮助',
  ].join('\n');
}

/** 解析 --flag value 选项；返回剩余位置参数与选项表。 */
function parseArgs(argv: string[]): { positionals: string[]; opts: Record<string, string> } {
  const positionals: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=', 2);
        opts[k!] = v ?? '';
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        opts[key] = argv[i + 1]!;
        i += 1;
      } else {
        opts[key] = '';
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, opts };
}

/** 打印错误到 stderr 并退出非零。 */
function fail(msg: string): never {
  process.stderr.write(`fleet8: ${msg}\n`);
  process.exit(1);
}

/** 登记一台已配对设备并回显。 */
function cmdPair(argv: string[]): void {
  const { positionals, opts } = parseArgs(argv);
  const host = positionals[0];
  if (!host) fail('pair 需要 host 参数');
  const port = Number(opts.port ?? '22');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`非法端口 ${opts.port}`);
  const user = (opts.user ?? process.env.USER ?? 'root').trim() || 'root';
  const deviceId = (opts.id ?? '').trim() || deviceIdFromHost(host, port);
  const name = (opts.name ?? '').trim() || host;
  const file = sshDevicesFile();

  let keyPath = (opts.key ?? '').trim();
  if (keyPath.length === 0) {
    keyPath = join(sshKeysDir(), deviceId);
    generateSshKey(keyPath, deviceId);
  }
  const device: SshDevice = {
    deviceId,
    name,
    host,
    port,
    user,
    keyPath,
    workspace: '',
    addedAt: nowIso(),
    lastUsedAt: nowIso(),
  };
  const next = upsertSshDevice(loadSshDevices(file), device);
  saveSshDevices(file, next);
  process.stdout.write([
    `已配对设备 ${name} (${deviceId}) → ${user}@${host}:${port}`,
    `私钥: ${keyPath}（0600）`,
    `公钥: ${readPublicKey(keyPath)}`,
    '',
    '下一步：把上面这行公钥追加到被控设备的 ~/.ssh/authorized_keys，然后:',
    `  fleet8 ssh ${deviceId} 'echo ok'`,
  ].join('\n') + '\n');
}

/** 生成一次性邀请码（主控侧）：host:port/user/token，登记到 invites.json。 */
function cmdInvite(argv: string[]): void {
  const { positionals, opts } = parseArgs(argv);
  const host = positionals[0] ?? '';
  if (!host) fail('invite 需要 host 参数（本机对外可达地址）');
  const port = Number(opts.port ?? '22');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`非法端口 ${opts.port}`);
  const user = (opts.user ?? process.env.USER ?? 'root').trim() || 'root';
  const token = crypto.randomBytes(12).toString('hex');
  const invitesFile = join(fleetHome(), INVITES_FILENAME);
  mkdirSync(dirname(invitesFile), { recursive: true });
  let invites: Record<string, string> = {};
  try { invites = JSON.parse(readFileSync(invitesFile, 'utf-8')); } catch {}
  invites[token] = nowIso();
  writeFileSync(invitesFile, JSON.stringify(invites, null, 2));
  process.stdout.write([
    `邀请码已生成（有效期至本机重启/手动清除）：`,
    ``,
    `  ${host}:${port}/${user}/${token}`,
    ``,
    `把上面这行发给要加入的设备，对方执行：`,
    `  fleet8 join <这行邀请码>`,
  ].join('\n') + '\n');
}

/** 被控侧一条命令入队：解析邀请码 → 配对登记 → 授权引导。 */
function cmdJoin(argv: string[]): void {
  const { positionals } = parseArgs(argv);
  const code = positionals[0] ?? '';
  if (!code) fail('join 需要邀请码（主控 fleet8 invite 生成）');
  const m = /^([^:/]+):(\d{1,5})\/([^/]+)\/([a-f0-9]{24})$/.exec(code.trim());
  if (!m) fail(`邀请码格式不对：${code}（应为 host:port/user/token）`);
  const host = m[1]!;
  const port = Number(m[2]);
  const user = m[3]!;
  const deviceId = deviceIdFromHost(host, port);
  const keyPath = join(sshKeysDir(), deviceId);
  generateSshKey(keyPath, deviceId);
  const device: SshDevice = {
    deviceId, name: host, host, port, user, keyPath,
    workspace: '', addedAt: nowIso(), lastUsedAt: nowIso(),
  };
  const next = upsertSshDevice(loadSshDevices(sshDevicesFile()), device);
  saveSshDevices(sshDevicesFile(), next);
  process.stdout.write([
    `✅ 已加入舰队：${host}:${port}（设备 ${deviceId}）`,
    `私钥: ${keyPath}（0600）`,
    `公钥: ${readPublicKey(keyPath)}`,
    ``,
    `下一步（把公钥发给主控，主控执行）：`,
    `  fleet8 allow ${deviceId} "<上面这行公钥>"`,
    `然后即可：fleet8 ssh ${deviceId} 'echo ok'`,
  ].join('\n') + '\n');
}

/** 主控授权（allow）：把被控公钥加入本机 authorized_keys，完成入队闭环。 */
function cmdAllow(argv: string[]): void {
  const { positionals } = parseArgs(argv);
  const deviceId = positionals[0] ?? '';
  const pubkey = positionals[1] ?? '';
  if (!deviceId || !pubkey) fail('allow 需要 设备ID 和 公钥（fleet8 join 的输出）');
  if (!pubkey.startsWith('ssh-')) fail('公钥格式不对（应以 ssh- 开头）');
  const sshDir = join(homedir(), '.ssh');
  mkdirSync(sshDir, { recursive: true });
  const authFile = join(sshDir, 'authorized_keys');
  let existing = '';
  try { existing = readFileSync(authFile, 'utf-8'); } catch {}
  if (existing.includes(pubkey)) {
    process.stdout.write(`✅ ${deviceId} 的公钥已在 authorized_keys 中（无需重复授权）\n`);
    return;
  }
  writeFileSync(authFile, existing.endsWith('\n') || existing === '' ? existing + pubkey + '\n' : existing + '\n' + pubkey + '\n');
  chmodSync(authFile, 0o600);
  process.stdout.write([
    `✅ 已授权 ${deviceId} → ~/.ssh/authorized_keys`,
    `对方现在可以：fleet8 ssh ${deviceId} 'echo ok'`,
  ].join('\n') + '\n');
}

/** 列出已配对设备。 */
function cmdList(): void {
  const devices = loadSshDevices(sshDevicesFile());
  if (devices.length === 0) {
    process.stdout.write('（暂无已配对设备）\n');
    return;
  }
  process.stdout.write(devices.map((d) => formatSshDevice(d)).join('\n') + '\n');
}

/** SSH 直连执行命令。 */
async function cmdSsh(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  if (!target) fail('ssh 需要目标参数');
  const command = positionals.slice(1).join(' ');
  if (command.length === 0) fail('ssh 需要命令参数');
  const devices = loadSshDevices(sshDevicesFile());
  const paired = assertPaired(devices, target);
  if ('error' in paired) fail(paired.error);
  const r = await sshExec(paired.device, command, { socketDir: sshSocketsDir() });
  if (r.stdout.length > 0) process.stdout.write(r.stdout + (r.stdout.endsWith('\n') ? '' : '\n'));
  if (r.stderr.length > 0) process.stderr.write(r.stderr + (r.stderr.endsWith('\n') ? '' : '\n'));
  if (!r.ok) {
    process.stderr.write(`fleet8: ${r.error ?? '执行失败'}\n`);
    process.exit(1);
  }
}

/** 设置/查看远程工作区。 */
async function cmdWorkspace(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  if (!target) fail('workspace 需要目标参数');
  const devicesFile = sshDevicesFile();
  const dir = positionals[1]?.trim();
  if (dir && dir.length > 0) {
    const set = await setWorkspace({ devicesFile, target, dir, socketDir: sshSocketsDir() });
    if ('error' in set) fail(set.error);
    process.stdout.write(`已设置设备 ${set.device.deviceId} 的工作区：${set.device.workspace}\n`);
  } else {
    const view = getWorkspace({ devicesFile, target });
    if ('error' in view) fail(view.error);
    process.stdout.write(
      view.workspace.length > 0
        ? `设备 ${view.deviceId} 的工作区：${view.workspace}\n`
        : `设备 ${view.deviceId} 未设置工作区（执行落在远端 home 目录）\n`,
    );
  }
}

/** 上传文件到已配对设备：fleet8 upload <目标> <本地文件> <远端路径>。 */
async function cmdUpload(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  const local = positionals[1];
  const remote = positionals[2];
  if (!target) fail('upload 需要目标参数');
  if (!local) fail('upload 需要本地文件路径');
  if (!remote) fail('upload 需要远端目标路径');
  const devices = loadSshDevices(sshDevicesFile());
  const paired = assertPaired(devices, target);
  if ('error' in paired) fail(paired.error);
  const r = await scpUpload(paired.device, local, remote, { socketDir: sshSocketsDir() });
  if (!r.ok) {
    process.stderr.write(`fleet8: ${r.error ?? '上传失败'}\n`);
    process.exit(1);
  }
  process.stdout.write(`已上传 ${local} → ${remote}（设备 ${paired.device.deviceId}）\n`);
}

/** 下载文件到本机：fleet8 download <目标> <远端文件> <本地路径>。 */
async function cmdDownload(argv: string[]): Promise<void> {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  const remote = positionals[1];
  const local = positionals[2];
  if (!target) fail('download 需要目标参数');
  if (!remote) fail('download 需要远端文件路径');
  if (!local) fail('download 需要本地保存路径');
  const devices = loadSshDevices(sshDevicesFile());
  const paired = assertPaired(devices, target);
  if ('error' in paired) fail(paired.error);
  const r = await scpDownload(paired.device, remote, local, { socketDir: sshSocketsDir() });
  if (!r.ok) {
    process.stderr.write(`fleet8: ${r.error ?? '下载失败'}\n`);
    process.exit(1);
  }
  process.stdout.write(`已下载 ${remote} → ${local}（设备 ${paired.device.deviceId}）\n`);
}

/** 移除已配对设备。 */
function cmdRemove(argv: string[]): void {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  if (!target) fail('remove 需要目标参数');
  const file = sshDevicesFile();
  const devices = loadSshDevices(file);
  const paired = assertPaired(devices, target);
  if ('error' in paired) fail(paired.error);
  saveSshDevices(file, removeSshDevice(devices, paired.device.deviceId));
  process.stdout.write(`已移除设备 ${paired.device.name} (${paired.device.deviceId})\n`);
}

/** 打印设备公钥。 */
function cmdPubkey(argv: string[]): void {
  const { positionals } = parseArgs(argv);
  const target = positionals[0];
  if (!target) fail('pubkey 需要目标参数');
  const devices = loadSshDevices(sshDevicesFile());
  const paired = assertPaired(devices, target);
  if ('error' in paired) fail(paired.error);
  const pub = readPublicKey(paired.device.keyPath);
  if (pub.length === 0) fail(`设备 ${paired.device.deviceId} 无公钥文件（${paired.device.keyPath}.pub）`);
  process.stdout.write(pub + '\n');
}

/** 入口。 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(usage() + '\n');
    return;
  }
  const rest = argv.slice(1);
  switch (cmd) {
    case 'pair': cmdPair(rest); return;
    case 'list': cmdList(); return;
    case 'ssh': await cmdSsh(rest); return;
    case 'workspace': await cmdWorkspace(rest); return;
    case 'upload': await cmdUpload(rest); return;
    case 'download': await cmdDownload(rest); return;
    case 'remove': cmdRemove(rest); return;
    case 'pubkey': cmdPubkey(rest); return;
    case 'invite': cmdInvite(rest); return;
    case 'allow': cmdAllow(rest); return;
    case 'join': cmdJoin(rest); return;
    default:
      fail(`未知命令 ${cmd}（见 fleet8 --help）`);
  }
}

main()
  .then(() => {
    // Windows 实证：CLI 跑完后 Node 不退出（spawn 的 ssh 子进程虽死，stdio 管道
    // 句柄未被释放，事件循环挂着 → SSH 会话/脚本永远等不到 EOF）。CLI 无长驻
    // 服务，跑完即显式退出；先等 stdout/stderr 管道 flush 完，否则输出被截断。
    const done = (): void => process.exit(0);
    const pending: number[] = [];
    if (!process.stdout.write('')) pending.push(process.stdout.writableLength);
    void new Promise<void>((resolve) => {
      if (process.stdout.writableLength === 0 && process.stderr.writableLength === 0) return resolve();
      process.stdout.once('drain', resolve);
      process.stderr.once('drain', resolve);
      setTimeout(resolve, 100);
    }).then(done);
  })
  .catch((err: unknown) => {
    process.stderr.write(`fleet8: ${(err as Error).message}\n`);
    process.exit(1);
  });
