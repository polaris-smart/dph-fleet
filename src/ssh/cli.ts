// fleet8 CLI：主控侧 SSH 池命令行。零 npm，纯 Node 标准库 + type stripping 直跑。
// 子命令：pair / list / ssh / workspace / remove / pubkey。
// 安全：密钥 0600、只连已配对设备；任何失败 stderr + 非零退出，不崩、不泄露密钥内容。

import { join } from 'node:path';

import { loadSshDevices, saveSshDevices, sshDevicesFile, sshKeysDir, sshSocketsDir } from './config.ts';
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
import { getWorkspace, setWorkspace } from './workspace.ts';
import type { SshDevice } from './types.ts';

/** 顶层帮助文本。 */
function usage(): string {
  return [
    'fleet8 — NoFox Fleet SSH 池轻量执行（主控直连被控，不经 hub）',
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
    case 'remove': cmdRemove(rest); return;
    case 'pubkey': cmdPubkey(rest); return;
    default:
      fail(`未知命令 ${cmd}（见 fleet8 --help）`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`fleet8: ${(err as Error).message}\n`);
  process.exit(1);
});
