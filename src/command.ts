// dph-fleet /fleet 斜杠命令：装完即用的"门"。
// 用户在 dsh UI 敲 /fleet 即显示本机状态 + 已配对设备 + 使用帮助（不依赖模型工具调用）。
// 这是解决"装完不知道下一步做什么"的关键入口。

import type { FleetContext } from './types.ts'
import { identityFile, pairedFile, loadIdentity, fleetHome } from './mdns/identity.ts'
import { loadPaired } from './mdns/pair.ts'
import { sshDevicesFile, loadSshDevices } from './ssh/config.ts'

/** 注册 /fleet 命令（commands 服务存在时）。 */
export function registerFleetCommand(ctx: FleetContext): void {
  ctx.inject(['commands'], (commandCtx) => {
    (commandCtx as unknown as { commands?: { register(cmd: unknown): void } }).commands?.register({
      name: 'fleet',
      description: 'dph-fleet：查看组网状态 / 配对设备 / 使用帮助',
      input: { hint: '[status | discover | pair <addr> <key> | ssh <target> <cmd>]' },
      handler: ({ rawInput }: { rawInput: string }) => {
        const args = rawInput.trim();
        const home = fleetHome();

        // 本机身份
        const identity = loadIdentity(identityFile());
        const idLine = identity
          ? `🖥️ 本机身份：${identity.name}（${identity.deviceId}）`
          : '🖥️ 本机身份：未初始化（先跑 fleet7 keygen，或直接 /fleet discover 自动生成）';

        // mDNS 已配对设备
        const paired = loadPaired(pairedFile());
        const pairedLine = paired.length === 0
          ? '  （暂无 mDNS 配对设备）'
          : paired.map((d) => `  · ${d.name}（${d.deviceId} @ ${d.address}:${d.port}）`).join('\n');

        // SSH 已配对设备
        const sshDevices = loadSshDevices(sshDevicesFile());
        const sshLine = sshDevices.length === 0
          ? '  （暂无 SSH 直连设备）'
          : sshDevices.map((d) => `  · ${d.name}（${d.deviceId} @ ${d.user}@${d.host}:${d.port}）`).join('\n');

        if (args.startsWith('status') || args === '') {
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
              '💡 下一步：',
              '  /fleet discover   → 扫描同网 fleet 设备',
              '  /fleet pair …     → 与设备配对',
              '  或直接对 AI 说"调用 fleet_discover"',
            ].join('\n'),
          };
        }

        if (args.startsWith('discover')) {
          return {
            kind: 'success' as const,
            text: '同网扫描需要几秒…（或直接对 AI 说"调用 fleet_discover 工具"）',
          };
        }

        if (args.startsWith('pair')) {
          return {
            kind: 'success' as const,
            text: '配对：对 AI 说"调用 fleet_pair 工具，target 填设备地址，key 填设备密钥"。设备密钥在对方 `fleet7 serve` 首次运行时打印。',
          };
        }

        if (args.startsWith('ssh')) {
          return {
            kind: 'success' as const,
            text: '跨网执行：对 AI 说"用 fleet_ssh_exec 在 <设备> 上执行 <命令>"。',
          };
        }

        return {
          kind: 'success' as const,
          text: [
            `📡 dph-fleet`,
            idLine,
            '',
            '可用命令：/fleet status（默认）· /fleet discover · /fleet pair · /fleet ssh',
            '或直接对 AI 说"调用 fleet_discover / fleet_pair / fleet_ssh_exec / fleet_workspace"',
          ].join('\n'),
        };
      },
    });
  });
}
