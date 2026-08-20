// 主控侧 SSH 池文件布局：设备注册表 ssh-devices.json（0600）、私钥目录 ssh-keys/、
// ControlMaster socket 目录 ssh-sockets/。纯 Node 标准库，可独立单测。

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';

import type { SshDevice } from './types.ts';

/** 主控家目录（FLEET_HOME 下）各文件名。 */
export const SSH_DEVICES_FILENAME = 'ssh-devices.json';
export const SSH_KEYS_DIRNAME = 'ssh-keys';
export const SSH_SOCKETS_DIRNAME = 'ssh-sockets';

/** 取 fleet 主控家目录：FLEET_HOME 优先，否则 ~/.fleet。 */
export function fleetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLEET_HOME && env.FLEET_HOME.length > 0 ? env.FLEET_HOME : join(homedir(), '.fleet');
}

/** 设备注册表路径。 */
export function sshDevicesFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(fleetHome(env), SSH_DEVICES_FILENAME);
}

/** 私钥目录路径。 */
export function sshKeysDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(fleetHome(env), SSH_KEYS_DIRNAME);
}

/**
 * ControlMaster socket 目录路径。
 * Windows OpenSSH 不支持 ControlMaster（getsockname failed: Not a socket，实测
 * Windows Server 2025 + OpenSSH_for_Windows）：返回空串 = 全链路自动关闭连接复用。
 */
export function sshSocketsDir(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === 'win32') return '';
  return join(fleetHome(env), SSH_SOCKETS_DIRNAME);
}

/**
 * 读设备注册表。缺失/空文件视为空表；顶层非数组或 JSON 非法 fail loud（配置错误不该静默）。
 * @param file - 注册表绝对路径。
 */
export function loadSshDevices(file: string): SshDevice[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`读取设备注册表 ${file} 失败: ${(err as Error).message}`);
  }
  if (raw.trim().length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`设备注册表 ${file} 不是合法 JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`设备注册表 ${file} 顶层必须是数组`);
  return parsed as SshDevice[];
}

/**
 * 整表写回（原子：tmp + rename，0600）。
 * @param file - 注册表绝对路径。
 * @param devices - 待写入的设备表。
 */
export function saveSshDevices(file: string, devices: readonly SshDevice[]): void {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(devices, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * 注册表权限告警：存在且权限比 0600 宽时返回告警文本，否则空串。
 * @param file - 注册表绝对路径。
 */
export function sshDevicesPermWarning(file: string): string {
  let mode: number;
  try {
    mode = statSync(file).mode;
  } catch {
    return '';
  }
  if ((mode & 0o077) !== 0) {
    return `警告：设备注册表 ${file} 权限过宽（应为 0600），请执行 chmod 600 ${file}`;
  }
  return '';
}
