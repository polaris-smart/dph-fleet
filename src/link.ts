// 合一联动（灵魂功能）：mDNS 配对成功的设备自动写入 SSH 设备注册表（host/port/user/keyPath）。
// 单向联动 mDNS → SSH；SSH 模块手动配的设备与 mDNS 无关，两模块各自独立可用。
// 联动失败不阻断配对（降级为纯 mDNS 身份记录）。零 npm：TCP 探测 + 复用 ssh 模块函数。

import net from 'node:net';
import { join } from 'node:path';

import { generateSshKey, readPublicKey, keyFileExists } from './ssh/keys.ts';
import { loadSshDevices, saveSshDevices, sshDevicesFile, sshKeysDir } from './ssh/config.ts';
import { upsertSshDevice, nowIso } from './ssh/pool.ts';
import type { SshDevice } from './ssh/types.ts';
import type { PairedDevice } from './mdns/types.ts';

/** 主控 SSH 密钥在 ssh-keys/ 下的固定 id：一把主控密钥授权所有 mDNS 配对设备。 */
export const MASTER_KEY_ID = 'master';

/** 联动上下文（根插件由合并 config 构造）。 */
export interface LinkContext {
  fleetHome: string;
  user: string;
  sshPort: number;
  probeSsh: boolean;
}

/** 路径解析环境：config.fleetHome 覆盖优先，否则走 env/默认。 */
function envFor(fleetHome: string): NodeJS.ProcessEnv {
  if (fleetHome.length > 0) return { ...process.env, FLEET_HOME: fleetHome };
  return process.env;
}

/** 取（必要时生成）主控 SSH 密钥，返回私钥路径与公钥文本。 */
export function masterSshKey(ctx: LinkContext): { keyPath: string; publicKey: string } {
  const keyPath = join(sshKeysDir(envFor(ctx.fleetHome)), MASTER_KEY_ID);
  if (!keyFileExists(keyPath)) generateSshKey(keyPath, 'dsh-devices');
  return { keyPath, publicKey: readPublicKey(keyPath) };
}

/** TCP 探测 host:port 是否可达（短超时，尽力而为，不抛异常）。 */
export function probeTcp(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      finish(false);
    });
  });
}

/** 联动结果。 */
export interface LinkResult {
  linked: boolean;
  device?: SshDevice;
  reason?: string;
}

/**
 * 把 mDNS 配对成功的设备写入 SSH 注册表（可选先探测端口可达）。
 * @param device - mDNS 配对成功返回的设备。
 * @param master - 主控 SSH 私钥路径（keyPath 写入注册表，不写密钥内容）。
 * @param ctx - 联动上下文。
 */
export async function linkPairedToSsh(
  device: PairedDevice,
  master: { keyPath: string },
  ctx: LinkContext,
): Promise<LinkResult> {
  if (ctx.probeSsh) {
    const reachable = await probeTcp(device.address, ctx.sshPort);
    if (!reachable) return { linked: false, reason: `SSH 端口 ${ctx.sshPort} 未探测到（设备不可达）` };
  }
  const entry: SshDevice = {
    deviceId: device.deviceId,
    name: device.name,
    host: device.address,
    port: ctx.sshPort,
    user: ctx.user,
    keyPath: master.keyPath,
    workspace: '',
    addedAt: nowIso(),
    lastUsedAt: nowIso(),
  };
  const file = sshDevicesFile(envFor(ctx.fleetHome));
  saveSshDevices(file, upsertSshDevice(loadSshDevices(file), entry));
  return { linked: true, device: entry };
}
