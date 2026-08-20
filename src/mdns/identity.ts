// 设备身份配置：fleet-lan.json(600) 装载/生成。装插件首次跑自动生成设备密钥 + 稳定 id。
// 纯 Node 标准库；主控侧「已配对设备表」路径也在此单源导出。

import { homedir, hostname, platform, arch, totalmem } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';

import { generateDeviceId, generateDeviceKey, isDeviceKey } from './key.ts';
import type { DeviceCapabilities, DeviceIdentity } from './types.ts';

/** 插件自身版本（作为 dph 版本自报）。与 package.json version 对齐。 */
export const DPH_VERSION = 'dsh-devices@0.2.0';

/** 设备身份文件名（DSH_HOME 下，与 M2 fleet.json 并列）。 */
export const IDENTITY_FILENAME = 'fleet-lan.json';
/** 主控已配对设备表文件名（FLEET_HOME 下）。 */
export const PAIRED_FILENAME = 'paired-devices.json';

/** 取 dsh 家目录：DSH_HOME 优先，否则 ~/.dsh。 */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.DSH_HOME && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh');
}

/** 取 fleet 主控家目录：FLEET_HOME 优先，否则 ~/.fleet。 */
export function fleetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.FLEET_HOME && env.FLEET_HOME.length > 0 ? env.FLEET_HOME : join(homedir(), '.fleet');
}

/** 设备身份文件路径。 */
export function identityFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(dshHome(env), IDENTITY_FILENAME);
}

/** 主控已配对设备表路径。 */
export function pairedFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(fleetHome(env), PAIRED_FILENAME);
}

/** 采集本机能力自报。 */
export function collectCapabilities(): DeviceCapabilities {
  return {
    os: `${platform()} ${arch()}`,
    node: process.versions.node,
    memoryMb: Math.floor(totalmem() / (1024 * 1024)),
    dph: true,
    dphVersion: DPH_VERSION,
  };
}

/** 读设备身份文件；缺失返回 undefined；JSON 非法 fail loud。 */
export function loadIdentity(file: string): DeviceIdentity | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(`读取设备身份 ${file} 失败: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`设备身份 ${file} 不是合法 JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`设备身份 ${file} 必须是 JSON 对象`);
  }
  const obj = parsed as Record<string, unknown>;
  const key = typeof obj.key === 'string' ? obj.key : '';
  if (!isDeviceKey(key)) {
    throw new Error(`设备身份 ${file} 的 key 非法（需 fleet-d- 前缀 + 64 hex）`);
  }
  return {
    deviceId: typeof obj.deviceId === 'string' ? obj.deviceId : generateDeviceId(),
    name: typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name : hostname(),
    key,
    port: typeof obj.port === 'number' ? obj.port : 0,
    hub: typeof obj.hub === 'string' ? obj.hub : '',
    capabilities: {
      os: typeof (obj.capabilities as Record<string, unknown>)?.os === 'string'
        ? (obj.capabilities as Record<string, unknown>).os as string
        : collectCapabilities().os,
      node: typeof (obj.capabilities as Record<string, unknown>)?.node === 'string'
        ? (obj.capabilities as Record<string, unknown>).node as string
        : collectCapabilities().node,
      memoryMb: typeof (obj.capabilities as Record<string, unknown>)?.memoryMb === 'number'
        ? (obj.capabilities as Record<string, unknown>).memoryMb as number
        : collectCapabilities().memoryMb,
      dph: (obj.capabilities as Record<string, unknown>)?.dph !== false,
      dphVersion: typeof (obj.capabilities as Record<string, unknown>)?.dphVersion === 'string'
        ? (obj.capabilities as Record<string, unknown>).dphVersion as string
        : DPH_VERSION,
    },
  };
}

/** 写设备身份文件（目录递归创建、0600，key 是 secret）。 */
export function saveIdentity(file: string, id: DeviceIdentity): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(id, null, 2) + '\n', { mode: 0o600 });
}

/** 装载或生成设备身份（首次自动生成密钥与 id）。 */
export function ensureIdentity(opts: {
  file: string;
  name?: string;
  hub?: string;
}): DeviceIdentity {
  const existing = loadIdentity(opts.file);
  if (existing) {
    if (opts.name && opts.name !== existing.name) existing.name = opts.name;
    if (opts.hub !== undefined && opts.hub !== existing.hub) existing.hub = opts.hub;
    if (opts.name || opts.hub !== undefined) saveIdentity(opts.file, existing);
    return existing;
  }
  const fresh: DeviceIdentity = {
    deviceId: generateDeviceId(),
    name: opts.name?.trim() || hostname(),
    key: generateDeviceKey(),
    port: 0,
    hub: opts.hub ?? '',
    capabilities: collectCapabilities(),
  };
  saveIdentity(opts.file, fresh);
  return fresh;
}

/** 身份文件权限过宽告警（secret 不该组/其他可读）。 */
export function identityPermWarning(file: string): string {
  let mode: number;
  try {
    mode = statSync(file).mode;
  } catch {
    return '';
  }
  if ((mode & 0o077) !== 0) {
    return `警告：设备身份 ${file} 权限过宽（应为 0600），请执行 chmod 600 ${file}`;
  }
  return '';
}
