// 远程工作区：设置（远端 mkdir -p 成功后持久化）与查看。纯 Node 标准库。
// 「任务书（AI 生成）在远程工作区执行」——工作区是目标 dph 的执行根。

import { loadSshDevices, saveSshDevices } from './config.ts';
import { assertPaired, withWorkspace } from './pool.ts';
import { sshExec, shellQuote } from './ssh.ts';
import type { SshDevice } from './types.ts';

/**
 * 校验工作区目录串：非空，且是绝对路径或 `~` 开头。
 * 拒绝相对路径（避免「执行根」落在不可预期的 CWD）。
 */
export function isValidWorkspace(dir: string): boolean {
  const d = dir.trim();
  if (d.length === 0) return false;
  return d.startsWith('/') || d.startsWith('~');
}

/**
 * 设置工作区：先远端 `mkdir -p`，成功后持久化到注册表。
 * mkdir 失败返回错误文本（不落盘、不改注册表）。
 */
export async function setWorkspace(opts: {
  devicesFile: string;
  target: string;
  dir: string;
  socketDir?: string;
  signal?: AbortSignal;
}): Promise<{ device: SshDevice } | { error: string }> {
  if (!isValidWorkspace(opts.dir)) {
    return { error: `工作区目录「${opts.dir}」非法：须为绝对路径或以 ~ 开头` };
  }
  const devices = loadSshDevices(opts.devicesFile);
  const paired = assertPaired(devices, opts.target);
  if ('error' in paired) return paired;
  const device = paired.device;
  const result = await sshExec(device, `mkdir -p ${shellQuote(opts.dir)}`, {
    socketDir: opts.socketDir,
    signal: opts.signal,
  });
  if (!result.ok) return { error: `设置工作区失败（mkdir -p）：${result.error ?? ''}` };
  const next = withWorkspace(devices, device.deviceId, opts.dir.trim());
  saveSshDevices(opts.devicesFile, next);
  return { device: next.find((d) => d.deviceId === device.deviceId)! };
}

/**
 * 查看工作区：返回注册表里存的工作区；未设置返回空串。
 * 不触发 SSH 往返（纯读本地注册表）。
 */
export function getWorkspace(opts: {
  devicesFile: string;
  target: string;
}): { deviceId: string; workspace: string } | { error: string } {
  const devices = loadSshDevices(opts.devicesFile);
  const paired = assertPaired(devices, opts.target);
  if ('error' in paired) return paired;
  return { deviceId: paired.device.deviceId, workspace: paired.device.workspace };
}
