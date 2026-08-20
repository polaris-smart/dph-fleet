// dsh-devices v0.2.0 单插件（mDNS + SSH 合一，FLEET-V02-MERGE）。
// 一个插件装两模块，按 config.modules 开关注册工具：
//   - mdns 开 → fleet_discover / fleet_pair
//   - ssh  开 → fleet_ssh_exec / fleet_workspace
//   - 关掉的模块工具不注册（不出现半死工具）。
// 合一联动（灵魂功能）：mdns 开 + ssh 开时，mDNS 配对成功自动写入 SSH 设备注册表。

import type { FleetContext } from './types.ts'
import { userInfo } from 'node:os'

import { Config } from './config.ts'
import type { Config as PluginConfig } from './config.ts'
import { registerMdnsTools } from './mdns/plugin.ts'
import type { MdnsLink } from './mdns/plugin.ts'
import { registerSshTools } from './ssh/plugin.ts'
import { masterSshKey, linkPairedToSsh } from './link.ts'
import { registerFleetCommand } from './command.ts'
import type { LinkContext } from './link.ts'
import type { PairedDevice } from './mdns/types.ts'

/** 稳定的 Cordis 插件名。 */
export const name = 'dsh-devices'

/** 需要的服务：工具注册表。 */
export const inject = ['tools']

/** 合并配置 schema（modules 开关 + 两模块配置合并）。 */
export { Config }

/**
 * 按 modules 开关分发注册两模块工具。
 * @param ctx - 携带 ctx.tools 的插件上下文。
 * @param config - Schemastery 校验并填默认后的插件配置。
 */
export function apply(ctx: FleetContext, config: PluginConfig): void {
  const sshEnabled = config.modules === 'ssh' || config.modules === 'both';
  const mdnsEnabled = config.modules === 'mdns' || config.modules === 'both';

  const linkCtx: LinkContext = {
    fleetHome: config.fleetHome,
    user: config.sshUser.trim().length > 0 ? config.sshUser.trim() : (process.env.USER || userInfo().username),
    sshPort: config.sshPort,
    probeSsh: config.probeSsh,
  };

  if (mdnsEnabled) {
    const link: MdnsLink | undefined = sshEnabled
      ? {
          masterPublicKey: () => masterSshKey(linkCtx).publicKey,
          onPaired: async (device: PairedDevice) => {
            const result = await linkPairedToSsh(
              device,
              { keyPath: masterSshKey(linkCtx).keyPath },
              linkCtx,
            );
            return result.linked
              ? `已联动 SSH 注册表：${result.device!.user}@${result.device!.host}:${result.device!.port}`
              : `未联动 SSH（${result.reason}），仅记录 mDNS 身份`;
          },
        }
      : undefined;
    registerMdnsTools(ctx, { deviceName: config.deviceName, hub: config.hub, link });
  }

  if (sshEnabled) {
    registerSshTools(ctx, { fleetHome: config.fleetHome });
  }

  // /fleet 斜杠命令：装完即用的"门"（dsh UI 敲 /fleet 看状态 + 帮助）
  registerFleetCommand(ctx);

  // 装完即见的就绪提示：用户重启 dsh 后能在输出里确认插件活了 + 知道下一步。
  const enabled = [mdnsEnabled && 'mdns', sshEnabled && 'ssh'].filter(Boolean).join('+') || 'none';
  console.log(`[dsh-devices] 已就绪（模块：${enabled}）。敲 /fleet 查看设备，或对 AI 说"调用 fleet_discover" · ready, type /fleet`);
}
