// dph-fleet /fleet 斜杠命令：装完即用的"门"。
// 用户在 dsh UI 敲 /fleet 即显示本机状态 + 已配对设备 + 使用帮助（不依赖模型工具调用）。
// 这是解决"装完不知道下一步做什么"的关键入口。
// 子命令真执行（handler 支持 Promise<CommandResult>，官方契约 index.ts:68）：
//   /fleet discover            → 真扫描 mDNS 并展示结果
//   /fleet pair <addr> <key>   → 真配对（密钥校验 + 写配对表 + SSH 联动）
//   /fleet ssh <target> <cmd>  → 真直连执行（仅已配对设备）

import type { FleetContext } from './types.ts'
import { identityFile, pairedFile, loadIdentity, fleetHome, ensureIdentity } from './mdns/identity.ts'
import { loadPaired, savePaired, upsertPaired, pairWithDevice, nowIso } from './mdns/pair.ts'
import { discoverWithPaired, resolveTarget, formatDiscoveredDevice } from './mdns/discover.ts'
import { sshDevicesFile, loadSshDevices } from './ssh/config.ts'
import { findSshDevice } from './ssh/pool.ts'
import { sshExec } from './ssh/ssh.ts'

/** 发现窗口（毫秒），与 fleet_discover 工具一致。 */
const DISCOVER_TIMEOUT_MS = 1500

/** 配对命令超时（毫秒）。 */
const PAIR_TIMEOUT_MS = 3000

/** SSH 命令默认超时（毫秒），与 fleet_ssh_exec 工具一致。 */
const SSH_TIMEOUT_MS = 120000

/** 状态/帮助视图（含本机身份 + 两类设备表 + 下一步引导）。 */
function statusView(): { kind: 'success'; text: string } {
  const home = fleetHome();
  const identity = loadIdentity(identityFile());
  const idLine = identity
    ? `🖥️ 本机身份：${identity.name}（${identity.deviceId}）`
    : '🖥️ 本机身份：未初始化（跑 /fleet discover 自动生成，或 fleet7 keygen）';

  const paired = loadPaired(pairedFile());
  const pairedLine = paired.length === 0
    ? '  （暂无 mDNS 配对设备）'
    : paired.map((d) => `  · ${d.name}（${d.deviceId} @ ${d.address}:${d.port}）`).join('\n');

  const sshDevices = loadSshDevices(sshDevicesFile());
  const sshLine = sshDevices.length === 0
    ? '  （暂无 SSH 直连设备）'
    : sshDevices.map((d) => `  · ${d.name}（${d.deviceId} @ ${d.user}@${d.host}:${d.port}）`).join('\n');

  return {
    kind: 'success' as const,
    text: [
      `📡 dph-fleet（数据目录 ${home}）`,
      idLine,
      '',
      '🔗 mDNS 已配对设备：',
      pairedLine,
      '',
      '🔑 SSH 直连设备：',
      sshLine,
      '',
      '💡 可用命令：',
      '  /fleet discover              → 扫描同网 fleet 设备',
      '  /fleet pair <addr> <key>     → 与设备配对',
      '  /fleet ssh <target> <命令>   → 在已配对设备上执行',
      '  或直接对 AI 说"调用 fleet_discover / fleet_ssh_exec 等工具"',
    ].join('\n'),
  };
}

/** 帮助视图。 */
function helpView(): { kind: 'success'; text: string } {
  return {
    kind: 'success' as const,
    text: [
      '📡 dph-fleet 可用命令：',
      '  /fleet                        → 状态（本机身份 + 已配对设备）',
      '  /fleet discover               → 扫描同网 fleet 设备（mDNS）',
      '  /fleet pair <host:port> <key> → 密钥配对（key 在对方 fleet7 serve 启动时打印）',
      '  /fleet ssh <target> <命令>    → 在已配对设备上执行命令（SSH 直连）',
      '',
      '文件传输（fleet_upload / fleet_download）与工作区（fleet_workspace）请让 AI 调工具。',
    ].join('\n'),
  };
}

/** /fleet discover：真扫描。 */
async function discoverCmd(): Promise<{ kind: 'success'; text: string }> {
  ensureIdentity({ file: identityFile() });
  const paired = loadPaired(pairedFile());
  const { devices } = await discoverWithPaired({ paired, timeoutMs: DISCOVER_TIMEOUT_MS });
  if (devices.length === 0) {
    return {
      kind: 'success' as const,
      text: '未发现同网 fleet 设备。确认对方也装了 dph-fleet 且在运行；跨网设备请走 /fleet ssh 路线（见 /fleet help）。',
    };
  }
  return { kind: 'success' as const, text: devices.map(formatDiscoveredDevice).join('\n') };
}

/** /fleet pair <addr> <key>：真配对。 */
async function pairCmd(rest: string): Promise<{ kind: 'success' | 'error'; text: string }> {
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) {
    return {
      kind: 'error' as const,
      text: '用法：/fleet pair <host:port> <设备密钥>（密钥在对方 fleet7 serve 启动时打印，fleet-d- 开头）',
    };
  }
  const target = parseHostPortStrict(parts[0]);
  if (target === null) {
    return { kind: 'error' as const, text: `目标「${parts[0]}」不是合法的 host:port（例：192.168.1.42:42971）` };
  }
  const identity = ensureIdentity({ file: identityFile() });
  const result = await pairWithDevice(
    { address: target.address, port: target.port, key: parts[1] },
    { deviceId: identity.deviceId, name: identity.name },
    PAIR_TIMEOUT_MS,
  );
  if (!result.ok) {
    return { kind: 'error' as const, text: `配对失败：${result.error}` };
  }
  const paired = upsertPaired(loadPaired(pairedFile()), result.device);
  savePaired(pairedFile(), paired);
  return {
    kind: 'success' as const,
    text: [
      `✅ 配对成功：${result.device.name}（${result.device.deviceId} @ ${result.device.address}:${result.device.port}）`,
      `后续：/fleet ssh ${result.device.name} <命令>，或对 AI 说"在 ${result.device.name} 上执行 …"。`,
    ].join('\n'),
  };
}

/** /fleet ssh <target> <cmd...>：真直连执行。 */
async function sshCmd(rest: string): Promise<{ kind: 'success' | 'error'; text: string }> {
  const parts = rest.trim().split(/\s+/);
  if (parts.length < 2 || parts[0] === undefined || rest.trim().length === 0) {
    return {
      kind: 'error' as const,
      text: '用法：/fleet ssh <设备（deviceId/IP/友好名）> <命令>（仅限已配对设备；先配对见 /fleet help）',
    };
  }
  const target = parts[0];
  const command = rest.trim().slice(target.length).trim();
  const device = findSshDevice(loadSshDevices(sshDevicesFile()), target);
  if (device === undefined) {
    return { kind: 'error' as const, text: `设备「${target}」未配对。先用 /fleet pair 配对（mDNS 设备）或 fleet8 pair（SSH 跨网设备）。` };
  }
  const r = await sshExec(device, command, { timeoutMs: SSH_TIMEOUT_MS });
  const out = r.stdout;
  const err = r.stderr;
  if (r.ok) {
    const body = [out, err.length > 0 ? `[stderr]\n${err}` : ''].filter((s) => s.length > 0).join('\n');
    return { kind: 'success' as const, text: body.length > 0 ? body : '(命令成功，无输出)' };
  }
  const head = r.error ?? 'ssh 执行失败';
  return {
    kind: 'error' as const,
    text: [head, out.length > 0 ? `[stdout]\n${out}` : '', err.length > 0 ? `[stderr]\n${err}` : '']
      .filter((s) => s.length > 0).join('\n'),
  };
}

/** 严格解析 host:port（不通过发现列表）。 */
function parseHostPortStrict(input: string): { address: string; port: number } | null {
  const m = /^(.+):(\d{1,5})$/.exec(input.trim());
  if (!m) return null;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { address: m[1]!, port };
}

/** 注册 /fleet 命令（commands 服务存在时）。 */
export function registerFleetCommand(ctx: FleetContext): void {
  ctx.inject(['commands'], (commandCtx) => {
    (commandCtx as unknown as { commands?: { register(cmd: unknown): void } }).commands?.register({
      name: 'fleet',
      description: 'dph-fleet：查看组网状态 / 发现设备 / 配对 / 远程执行',
      input: { hint: '[status | discover | pair <addr> <key> | ssh <target> <cmd>]' },
      handler: ({ rawInput }: { rawInput: string }): Promise<{ kind: 'success' | 'error'; text: string }> => {
        const args = rawInput.trim();

        if (args === '' || args === 'status') return Promise.resolve(statusView());
        if (args === 'help' || args === '-h' || args === '--help') return Promise.resolve(helpView());

        if (args === 'discover') return discoverCmd();
        if (args.startsWith('discover ')) {
          return Promise.resolve({
            kind: 'error' as const,
            text: '/fleet discover 不带参数（自动扫描同网设备）',
          });
        }

        if (args.startsWith('pair')) return pairCmd(args.slice('pair'.length));
        if (args.startsWith('ssh')) return sshCmd(args.slice('ssh'.length));

        return Promise.resolve({
          kind: 'error' as const,
          text: `未知子命令「${args.split(/\s+/)[0]}」。可用：status / discover / pair / ssh（见 /fleet help）`,
        });
      },
    });
  });
}
