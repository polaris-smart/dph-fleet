// dph-fleet mDNS 模块工具面：注册 fleet_discover / fleet_pair 两个工具。
// 只做工具门面，核心逻辑在 mdns/pair/server/discover；「按模块开关注册」由根插件
// dispatch 决定是否调用 registerMdnsTools（关掉 mdns 时这两个工具不注册）。
//
// 无头设备兼容：密钥即信任，配对不弹窗。合一联动：配对成功时若根插件提供了 link 句柄，
// 则把主控 SSH 公钥随配对请求发给被控（被控授权），成功后回调写 SSH 注册表。

import type { FleetContext } from '../types.ts'
import { compileParameters } from '../types.ts'

import { ensureIdentity, identityFile, pairedFile } from './identity.ts'
import { loadPaired, savePaired, upsertPaired, pairWithDevice } from './pair.ts'
import { discoverWithPaired, resolveTarget, formatDiscoveredDevice } from './discover.ts'
import type { PairedDevice } from './types.ts'

/** 发现超时（mDNS 收集窗口）。 */
const DISCOVER_TIMEOUT_MS = 1500

/** mDNS 模块配置（根插件传入）。 */
export interface MdnsModuleConfig {
  deviceName: string;
  hub: string;
  /** 合一联动句柄：存在则配对发公钥 + 成功后写 SSH 注册表；不存在则纯 mDNS。 */
  link?: MdnsLink;
}

/** 合一联动句柄（由根插件构造；mDNS 模块不 import ssh 模块，保持独立可用）。 */
export interface MdnsLink {
  /** 取主控 SSH 公钥（懒生成，随配对请求发给被控）。 */
  masterPublicKey: () => string;
  /** 配对成功后回调：写入 SSH 注册表，返回追加到配对结果的说明文本。 */
  onPaired: (device: PairedDevice) => Promise<string>;
}

/**
 * 注册 fleet_discover / fleet_pair 两个工具。
 * @param ctx - 携带 ctx.tools 的插件上下文。
 * @param opts - mDNS 模块配置。
 */
export function registerMdnsTools(ctx: FleetContext, opts: MdnsModuleConfig): void {
  ctx.tools.register({
    name: 'fleet_discover',
    description: '局域网 mDNS 发现同网段所有 fleet 设备（设备名/地址/能力/是否已配对）。返回发现列表；未发现返回「未发现同网 fleet 设备」。',
    parameters: compileParameters({}),
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const identity = ensureIdentity({ file: identityFile(), name: opts.deviceName || undefined, hub: opts.hub });
      void identity;
      const paired = loadPaired(pairedFile());
      const { devices } = await discoverWithPaired({
        paired,
        timeoutMs: DISCOVER_TIMEOUT_MS,
        signal: exec.signal,
      });
      if (devices.length === 0) return '未发现同网 fleet 设备';
      return devices.map(formatDiscoveredDevice).join('\n');
    },
  })

  ctx.tools.register({
    name: 'fleet_pair',
    description: '与同网目标设备密钥配对。target 为目标设备地址（host:port）或 deviceId/设备名；key 为目标设备的设备密钥（fleet-d- 开头）。校验通过即配对成功并存入主控已配对设备表（无需对方应答，无头设备兼容）。',
    parameters: compileParameters({
      target: { type: 'string', required: true, description: '目标设备：host:port，或 deviceId（dev-…），或设备名。' },
      key: { type: 'string', required: true, description: '目标设备的设备密钥（fleet-d- 开头）。' },
    }),
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const identity = ensureIdentity({ file: identityFile(), name: opts.deviceName || undefined, hub: opts.hub });
      const paired = loadPaired(pairedFile());
      const { devices } = await discoverWithPaired({
        paired,
        timeoutMs: DISCOVER_TIMEOUT_MS,
        signal: exec.signal,
      });
      const target = resolveTarget(typeof args.target === 'string' ? args.target : '', devices);
      if ('error' in target) return target.error;
      const masterPubKey = opts.link?.masterPublicKey();
      const result = await pairWithDevice(
        { address: target.address, port: target.port, key: typeof args.key === 'string' ? args.key : '', masterPubKey },
        { deviceId: identity.deviceId, name: identity.name },
      );
      if (!result.ok) return result.error;
      savePaired(pairedFile(), upsertPaired(paired, result.device));
      const lines = [
        '配对成功',
        `设备: ${result.device.name} (${result.device.deviceId})`,
        `地址: ${result.device.address}:${result.device.port}`,
        `能力: os=${result.device.capabilities.os} node=${result.device.capabilities.node}`,
      ];
      if (opts.link) lines.push(await opts.link.onPaired(result.device));
      return lines.join('\n');
    },
  })
}
