// 设备侧配对 TCP 服务：主控把密钥发来，设备常数时间校验，命中即回身份/能力。
// 无头设备兼容：密钥即信任，服务端无界面、无人工应答，Ubuntu/树莓派照样配。
// 线格式：换行分隔 JSON（一行一请求/一响应），零 npm。

import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { verifyDeviceKey } from './key.ts';
import type { DeviceCapabilities, DeviceIdentity } from './types.ts';

/** 配对请求（主控 → 设备）。 */
export interface PairRequest {
  v: 1;
  op: 'pair';
  /** 主控提交的目标设备密钥 fleet-d-<64hex>。 */
  key: string;
  masterId: string;
  masterName: string;
  /** 主控 SSH 公钥（可选）：合一联动，被控授权后回 sshAuthorized。 */
  masterPubKey?: string;
}

/** 配对响应（设备 → 主控）。 */
export interface PairResponse {
  v: 1;
  ok: boolean;
  deviceId: string;
  name: string;
  hub: string;
  capabilities: DeviceCapabilities;
  error?: string;
  /** 主控公钥是否已写入被控 authorized_keys（仅请求带 masterPubKey 时回填）。 */
  sshAuthorized?: boolean;
}

/** 解析一行请求；非法返回 null（服务端忽略，不炸连接）。 */
export function parsePairRequest(line: string): PairRequest | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (o.v !== 1 || o.op !== 'pair') return null;
  if (typeof o.key !== 'string') return null;
  return {
    v: 1,
    op: 'pair',
    key: o.key,
    masterId: typeof o.masterId === 'string' ? o.masterId : '',
    masterName: typeof o.masterName === 'string' ? o.masterName : '',
    masterPubKey: typeof o.masterPubKey === 'string' ? o.masterPubKey : undefined,
  };
}

/** 校验主控公钥是否像一行合法 SSH 公钥（防换行注入）。 */
export function isSafeSshPubKey(pubKey: string): boolean {
  return (
    pubKey.length > 0
    && !pubKey.includes('\n')
    && !pubKey.includes('\r')
    && /^\S+\s+\S+(\s+\S+)?$/.test(pubKey.trim())
    && pubKey === pubKey.trim()
  );
}

/**
 * 把主控 SSH 公钥追加到被控 `~/.ssh/authorized_keys`（600），已存在则幂等。
 * 任何失败（无 home、无权限等）返回 false，不阻断配对。
 * @param pubKey - 一行 SSH 公钥（已校验）。
 * @param homeDir - 覆盖家目录（测试用）；缺省取当前用户 home。
 */
export function authorizeSshPubKey(pubKey: string, homeDir = homedir()): boolean {
  if (!isSafeSshPubKey(pubKey)) return false;
  const sshDir = join(homeDir, '.ssh');
  const authFile = join(sshDir, 'authorized_keys');
  try {
    mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    let existing = '';
    try {
      existing = readFileSync(authFile, 'utf8');
    } catch {
      /* 缺失即空 */
    }
    const lines = existing.split('\n').filter((l) => l.trim().length > 0);
    if (lines.includes(pubKey)) return true;
    lines.push(pubKey);
    writeFileSync(authFile, lines.join('\n') + '\n', { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** 用设备身份校验请求并构造响应。 */
export function respondToPair(identity: DeviceIdentity, req: PairRequest): PairResponse {
  const base: PairResponse = {
    v: 1,
    ok: false,
    deviceId: identity.deviceId,
    name: identity.name,
    hub: identity.hub,
    capabilities: identity.capabilities,
  };
  if (!verifyDeviceKey(req.key, identity.key)) {
    return { ...base, error: '密钥错误：与目标设备密钥不符' };
  }
  return { ...base, ok: true };
}

/** 运行中的配对服务句柄。 */
export interface PairServerHandle {
  port: number;
  close: () => Promise<void>;
}

/**
 * 起配对 TCP 服务（监听回环 + 本机 IPv4），一行一请求，逐行回一行。
 * 客户端断开不抛错；读到非法行忽略。`port` 为 0 时自动分配空闲端口。
 */
export function createPairServer(identity: DeviceIdentity, port = 0): Promise<PairServerHandle> {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buf = '';
    socket.on('data', (chunk: string) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.length === 0) continue;
        const req = parsePairRequest(line);
        if (req === null) continue;
        const resp = respondToPair(identity, req);
        if (resp.ok && req.masterPubKey !== undefined) {
          resp.sshAuthorized = authorizeSshPubKey(req.masterPubKey);
        }
        socket.write(JSON.stringify(resp) + '\n');
      }
    });
    socket.on('error', () => {
      /* 对端异常断开，忽略 */
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', reject);
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve({
          port: addr.port,
          close: () =>
            new Promise<void>((res) => {
              server.close(() => res());
            }),
        });
      } else {
        reject(new Error('配对服务未取得端口'));
      }
    });
  });
}
