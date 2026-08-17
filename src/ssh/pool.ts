// 主控已配对 SSH 设备表操作：find/assert/upsert/remove/touch/workspace/格式化。
// 纯函数（不落盘），落盘编排在 cli.ts / plugin.ts / workspace.ts。

import type { SshDevice } from './types.ts';

/** ISO 当前时间。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 由 host 派生稳定 deviceId（去掉 SSH 用户部分，仅 host[:port]）。 */
export function deviceIdFromHost(host: string, port: number): string {
  const h = host.trim().replace(/[^A-Za-z0-9.-]/g, '-');
  return `ssh-${h || 'host'}-${port}`;
}

/**
 * 由 target 匹配设备：deviceId 优先，其次 host，再次友好名。
 * @param devices - 已配对设备表。
 * @param target - deviceId / host / name。
 */
export function findSshDevice(devices: readonly SshDevice[], target: string): SshDevice | undefined {
  const t = target.trim();
  if (t.length === 0) return undefined;
  return devices.find((d) => d.deviceId === t)
    ?? devices.find((d) => d.host === t)
    ?? devices.find((d) => d.name === t);
}

/**
 * 断言 target 已配对（「只连已配对设备」安全门槛）。返回设备或可读错误。
 */
export function assertPaired(
  devices: readonly SshDevice[],
  target: string,
): { device: SshDevice } | { error: string } {
  const device = findSshDevice(devices, target);
  if (!device) return { error: `未配对设备「${target}」：请先 fleet8 pair 配对（只连已配对设备）` };
  return { device };
}

/** upsert 一条设备（同 deviceId 覆盖，保留 latest），返回新表。 */
export function upsertSshDevice(devices: readonly SshDevice[], device: SshDevice): SshDevice[] {
  const rest = devices.filter((d) => d.deviceId !== device.deviceId);
  return [...rest, device];
}

/** 按 deviceId 移除一条设备，返回新表。 */
export function removeSshDevice(devices: readonly SshDevice[], deviceId: string): SshDevice[] {
  return devices.filter((d) => d.deviceId !== deviceId);
}

/** 刷新最近使用时间，返回新表。 */
export function touchLastUsed(
  devices: readonly SshDevice[],
  deviceId: string,
  when: string = nowIso(),
): SshDevice[] {
  return devices.map((d) => (d.deviceId === deviceId ? { ...d, lastUsedAt: when } : d));
}

/** 更新一条设备的工作区字段（不落盘），返回新表。 */
export function withWorkspace(
  devices: readonly SshDevice[],
  deviceId: string,
  workspace: string,
): SshDevice[] {
  return devices.map((d) => (d.deviceId === deviceId ? { ...d, workspace } : d));
}

/** 渲染一台设备为一行文本。 */
export function formatSshDevice(d: SshDevice): string {
  const ws = d.workspace.length > 0 ? `工作区=${d.workspace}` : '工作区=未设置';
  return [
    `${d.name} (${d.deviceId})`,
    `${d.user}@${d.host}:${d.port}`,
    ws,
    `配对=${d.addedAt}`,
    `最近=${d.lastUsedAt}`,
  ].join('  ');
}
