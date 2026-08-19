// fleet7 局域网 CLI（dph-fleet mDNS 模块）：keygen / serve / discover / pair / paired。
// 纯 Node 标准库 + type stripping 直跑源码，零构建。核心逻辑在 mdns/pair/server/identity。
// pair 命令默认做合一联动（配对成功写 SSH 注册表），--no-link 可关。

import { userInfo } from 'node:os';

import { ensureIdentity, identityFile, pairedFile, identityPermWarning, fleetHome, saveIdentity } from './identity.ts';
import { loadPaired, savePaired, upsertPaired, pairWithDevice } from './pair.ts';
import { discoverWithPaired, resolveTarget, formatDiscoveredDevice, parseHostPort } from './discover.ts';
import { MdnsResponder, localIpv4 } from './mdns.ts';
import { createPairServer } from './server.ts';
import { masterSshKey, linkPairedToSsh } from '../link.ts';
import type { LinkContext } from '../link.ts';

/** 参数解析结果。 */
interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const eq = key.indexOf('=');
      if (eq >= 0) {
        flags.set(key.slice(0, eq), key.slice(eq + 1));
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(key, next);
          i += 1;
        } else {
          flags.set(key, '');
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function fail(message: string): never {
  console.error(`fleet7 失败：${message}`);
  process.exit(1);
}

/** keygen：生成/读取设备身份，打印 deviceId 与设备密钥。 */
function cmdKeygen(flags: Map<string, string>): void {
  const file = identityFile();
  const id = ensureIdentity({ file, name: flags.get('name'), hub: flags.get('hub') ?? '' });
  const warn = identityPermWarning(file);
  if (warn.length > 0) console.error(warn);
  console.log(`设备名: ${id.name}`);
  console.log(`deviceId: ${id.deviceId}`);
  console.log(`设备密钥: ${id.key}`);
  console.log(`配置文件: ${file}`);
}

/** serve：起 mDNS 广播 + 配对 TCP 服务，常驻直到信号。 */
async function cmdServe(flags: Map<string, string>): Promise<void> {
  const file = identityFile();
  const id = ensureIdentity({ file, name: flags.get('name'), hub: flags.get('hub') ?? '' });
  const portFlag = flags.get('port');
  if (portFlag) {
    const p = Number(portFlag);
    if (!Number.isInteger(p) || p < 1 || p > 65535) fail(`端口非法：${portFlag}`);
    id.port = p;
  }
  const pairServer = await createPairServer(id, id.port);
  id.port = pairServer.port;
  saveIdentity(file, id);
  const responder = new MdnsResponder({
    deviceId: id.deviceId,
    name: id.name,
    port: id.port,
    address: localIpv4(),
    hub: id.hub,
    capabilities: id.capabilities,
  });
  await responder.start();
  console.log(`设备已上线（mDNS 广播 + 配对服务）`);
  console.log(`设备名: ${id.name}`);
  console.log(`deviceId: ${id.deviceId}`);
  console.log(`地址: ${localIpv4()}:${id.port}`);
  console.log(`密钥: ${id.key}`);
  const shutdown = async (): Promise<void> => {
    responder.close();
    await pairServer.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  // 常驻。
  await new Promise(() => {});
}

/** discover：同网发现，标记已配对。 */
async function cmdDiscover(flags: Map<string, string>): Promise<void> {
  const paired = loadPaired(pairedFile());
  const timeoutMs = flags.has('timeout') ? Number(flags.get('timeout')) : undefined;
  const { devices, paired: next } = await discoverWithPaired({
    paired,
    timeoutMs: timeoutMs && Number.isFinite(timeoutMs) ? timeoutMs : undefined,
  });
  if (devices.length === 0) {
    console.log('未发现同网 fleet 设备');
    return;
  }
  for (const d of devices) console.log(formatDiscoveredDevice(d));
  savePaired(pairedFile(), next);
}

/** 由环境变量构造联动上下文（CLI 无 cordis config，走 env 覆盖）。 */
function linkContextFromEnv(): LinkContext {
  const port = Number(process.env.FLEET_SSH_PORT ?? '22');
  return {
    fleetHome: process.env.FLEET_HOME ?? '',
    user: (process.env.FLEET_SSH_USER ?? process.env.USER ?? userInfo().username).trim() || 'root',
    sshPort: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 22,
    probeSsh: process.env.FLEET_SSH_PROBE !== '0',
  };
}

/** pair：配对目标设备并入表；默认联动写 SSH 注册表（--no-link 关）。 */
async function cmdPair(positionals: string[], flags: Map<string, string>): Promise<void> {
  const target = positionals[0];
  const key = positionals[1];
  if (!target || !key) {
    console.error('用法：fleet7 pair <目标 host:port|deviceId|设备名> <设备密钥> [--no-link]');
    process.exit(2);
  }
  const identity = ensureIdentity({ file: identityFile() });
  const paired = loadPaired(pairedFile());
  // 目标是 host:port 时可直接连，无需先发现；否则要先发现解析。
  const hp = parseHostPort(target);
  let address: string;
  let port: number;
  if (hp) {
    address = hp.address;
    port = hp.port;
  } else {
    const { devices } = await discoverWithPaired({ paired, timeoutMs: 1500 });
    const resolved = resolveTarget(target, devices);
    if ('error' in resolved) fail(resolved.error);
    address = resolved.address;
    port = resolved.port;
  }
  const linkCtx = linkContextFromEnv();
  const noLink = flags.has('no-link');
  const master = noLink ? undefined : masterSshKey(linkCtx);
  const result = await pairWithDevice(
    { address, port, key, masterPubKey: master?.publicKey },
    { deviceId: identity.deviceId, name: identity.name },
  );
  if (!result.ok) fail(result.error);
  savePaired(pairedFile(), upsertPaired(paired, result.device));
  console.log(`配对成功：${result.device.name} (${result.device.deviceId}) ${result.device.address}:${result.device.port}`);
  console.log(`已配对设备表：${pairedFile()}`);
  if (master) {
    const link = await linkPairedToSsh(result.device, { keyPath: master.keyPath }, linkCtx);
    console.log(
      link.linked
        ? `已联动 SSH 注册表：${link.device!.user}@${link.device!.host}:${link.device!.port}`
        : `未联动 SSH（${link.reason}），仅记录 mDNS 身份`,
    );
  }
}

/** paired：列出已配对设备。 */
function cmdPaired(): void {
  const file = pairedFile();
  const paired = loadPaired(file);
  if (paired.length === 0) {
    console.log('尚无已配对设备');
    return;
  }
  for (const p of paired) {
    console.log(
      `✅ ${p.name} (${p.deviceId})  ${p.address}:${p.port}  配对于 ${p.pairedAt}  最近在线 ${p.lastSeen}`,
    );
  }
  console.log(`已配对设备表：${file}`);
}

function usage(): void {
  console.error(`fleet7 — dph-fleet 局域网 CLI（mDNS 发现 + 密钥配对）

用法：
  fleet7 keygen [--name 设备名] [--hub <url>]
  fleet7 serve [--name 设备名] [--hub <url>] [--port N]
  fleet7 discover [--timeout MS]
  fleet7 pair <host:port|deviceId|设备名> <设备密钥>
  fleet7 paired

数据目录：身份 ${identityFile()} · 已配对设备表 ${fleetHome()}/${'paired-devices.json'}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const { positionals, flags } = parseArgs(argv.slice(1));
  switch (cmd) {
    case 'keygen':
      cmdKeygen(flags);
      return;
    case 'serve':
      await cmdServe(flags);
      return;
    case 'discover':
      await cmdDiscover(flags);
      return;
    case 'pair':
      await cmdPair(positionals, flags);
      return;
    case 'paired':
      cmdPaired();
      return;
    default:
      usage();
      process.exit(2);
  }
}

void main().catch((err: unknown) => {
  console.error(`fleet7 失败：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
