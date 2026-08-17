// 配对：主控侧客户端（连目标设备 TCP 输 key）+ 主控「已配对设备表」读写。
// key 只在配对请求里用一次，表里存 SHA-256 不存明文（与 M1 tokens.ts 口径一致）。

import net from 'node:net';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import { sha256Hex } from './key.ts';
import type { PairResponse } from './server.ts';
import type { PairedDevice } from './types.ts';

/** 配对目标。 */
export interface PairTarget {
  address: string;
  port: number;
  key: string;
  /** 主控 SSH 公钥（可选）：随配对请求发给被控，供其加入 authorized_keys（合一联动）。 */
  masterPubKey?: string;
}

/** 配对结果。 */
export type PairResult =
  | { ok: true; device: PairedDevice }
  | { ok: false; error: string };

/** ISO 时间戳。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 换行分隔 JSON 的一次请求/响应（配对用）。 */
export function pairWithDevice(
  target: PairTarget,
  master: { deviceId: string; name: string },
  timeoutMs = 3000,
): Promise<PairResult> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: target.address, port: target.port });
    let settled = false;
    let buf = '';
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ ok: false, error: '配对超时：目标设备未响应' });
      }
    }, timeoutMs);

    const finish = (r: PairResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(r);
    };

    socket.on('connect', () => {
      socket.write(
        JSON.stringify({
          v: 1,
          op: 'pair',
          key: target.key,
          masterId: master.deviceId,
          masterName: master.name,
          masterPubKey: target.masterPubKey,
        }) + '\n',
      );
    });
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\n');
      if (idx < 0) return;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.length === 0) return;
      let resp: PairResponse;
      try {
        resp = JSON.parse(line) as PairResponse;
      } catch {
        finish({ ok: false, error: '目标设备返回非法响应' });
        return;
      }
      if (resp.ok !== true) {
        finish({ ok: false, error: resp.error ?? '配对被拒绝' });
        return;
      }
      finish({
        ok: true,
        device: {
          deviceId: resp.deviceId,
          name: resp.name,
          address: target.address,
          port: target.port,
          hub: resp.hub,
          capabilities: resp.capabilities,
          keySha256: sha256Hex(target.key),
          pairedAt: nowIso(),
          lastSeen: nowIso(),
        },
      });
    });
    socket.on('error', (err) => {
      finish({ ok: false, error: `连接目标设备失败：${err.message}` });
    });
    socket.on('close', () => {
      finish({ ok: false, error: '目标设备在配对完成前断开' });
    });
  });
}

/** 读已配对设备表；缺失/空文件视为空表。 */
export function loadPaired(file: string): PairedDevice[] {
  try {
    const raw = readFileSync(file, 'utf8');
    if (raw.trim().length === 0) return [];
    const parsed = JSON.parse(raw) as PairedDevice[];
    if (!Array.isArray(parsed)) throw new Error('已配对设备表顶层必须是数组');
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error(`读取已配对设备表 ${file} 失败: ${(err as Error).message}`);
  }
}

/** 整表写回（原子：tmp + rename，0600）。 */
export function savePaired(file: string, devices: readonly PairedDevice[]): void {
  mkdirSync(join(file, '..'), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(devices, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, file);
}

/** upsert 一条已配对设备（同 deviceId 覆盖，保留 latest），返回新表。 */
export function upsertPaired(
  devices: readonly PairedDevice[],
  device: PairedDevice,
): PairedDevice[] {
  const rest = devices.filter((d) => d.deviceId !== device.deviceId);
  return [...rest, device];
}

/** 由 deviceId 查已配对设备。 */
export function findPaired(
  devices: readonly PairedDevice[],
  deviceId: string,
): PairedDevice | undefined {
  return devices.find((d) => d.deviceId === deviceId);
}
