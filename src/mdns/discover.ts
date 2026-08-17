// 发现编排：fleet_discover 语义（发现 + 标记已配对 + 刷新在线时间）+ 配对目标解析。

import { discoverDevices } from './mdns.ts';
import { findPaired } from './pair.ts';
import type { DiscoveredDevice, PairedDevice } from './types.ts';

/** 给发现结果打「已配对」标记。 */
export function markPaired(
  devices: readonly DiscoveredDevice[],
  paired: readonly PairedDevice[],
): DiscoveredDevice[] {
  return devices.map((d) => ({ ...d, paired: findPaired(paired, d.deviceId) !== undefined }));
}

/** 对在线设备刷新 lastSeen（返回新表）。 */
export function touchLastSeen(
  paired: readonly PairedDevice[],
  onlineIds: ReadonlySet<string>,
  when: string,
): PairedDevice[] {
  return paired.map((p) => (onlineIds.has(p.deviceId) ? { ...p, lastSeen: when } : p));
}

/** 发现同网设备并按已配对表标记 + 刷新 lastSeen。 */
export async function discoverWithPaired(opts: {
  paired: readonly PairedDevice[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ devices: DiscoveredDevice[]; paired: PairedDevice[] }> {
  const devices = await discoverDevices({ timeoutMs: opts.timeoutMs, signal: opts.signal });
  const marked = markPaired(devices, opts.paired);
  const online = new Set(devices.map((d) => d.deviceId));
  return { devices: marked, paired: touchLastSeen(opts.paired, online, new Date().toISOString()) };
}

/** 解析 `host:port` 目标；失败返回 null。 */
export function parseHostPort(target: string): { address: string; port: number } | null {
  const m = /^(.+):(\d{1,5})$/.exec(target.trim());
  if (!m) return null;
  const port = Number(m[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address: m[1]!.trim(), port };
}

/**
 * 解析配对目标为 address:port。支持 `host:port`；否则按 deviceId 或友好名在发现结果里查。
 * 解析失败返回可读错误。
 */
export function resolveTarget(
  target: string,
  discovered: readonly DiscoveredDevice[],
): { address: string; port: number; deviceId: string } | { error: string } {
  const hp = parseHostPort(target);
  if (hp) {
    const match = discovered.find((d) => d.address === hp.address && d.port === hp.port);
    return { ...hp, deviceId: match?.deviceId ?? '' };
  }
  const byId = discovered.filter((d) => d.deviceId === target);
  if (byId.length === 1) {
    return { address: byId[0]!.address, port: byId[0]!.port, deviceId: byId[0]!.deviceId };
  }
  const byName = discovered.filter((d) => d.name === target);
  if (byName.length === 1) {
    return { address: byName[0]!.address, port: byName[0]!.port, deviceId: byName[0]!.deviceId };
  }
  if (byName.length > 1) {
    return { error: `设备名「${target}」不唯一，请用 deviceId 或 host:port` };
  }
  return { error: `未发现目标设备「${target}」，请先 fleet7 discover 确认在线` };
}

/** 渲染一台发现设备为一行。 */
export function formatDiscoveredDevice(d: DiscoveredDevice): string {
  const parts = [
    `${d.paired ? '✅' : '⬜'} ${d.name} (${d.deviceId})`,
    `${d.address}:${d.port}`,
    `os=${d.capabilities.os} node=${d.capabilities.node}`,
    d.hub.length > 0 ? `hub=${d.hub}` : '无 hub',
  ];
  return parts.join('  ');
}
