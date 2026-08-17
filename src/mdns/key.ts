// 设备密钥生成与校验：fleet-d-<64hex>（32 字节随机），secret 仅本机持有；
// 配对校验用 SHA-256 + 常数时间比较，防时序侧信道（与 M1 tokens.ts 口径一致）。

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** 设备密钥前缀（与 M1 types.ts TOKEN_PREFIX.device 对齐）。 */
export const DEVICE_KEY_PREFIX = 'fleet-d-';

/** 随机部分字节数（32 字节 → 64 hex）。 */
const KEY_RANDOM_BYTES = 32;

/** 密钥明文总长度：前缀 "fleet-d-" 8 字符 + 64 hex。 */
export const DEVICE_KEY_LENGTH = DEVICE_KEY_PREFIX.length + 64;

/** 生成设备密钥明文（fleet-d-<64hex>）。 */
export function generateDeviceKey(): string {
  return DEVICE_KEY_PREFIX + randomBytes(KEY_RANDOM_BYTES).toString('hex');
}

/** 形状校验：前缀 + 64 位小写 hex。 */
export function isDeviceKey(text: string): boolean {
  return (
    typeof text === 'string'
    && text.startsWith(DEVICE_KEY_PREFIX)
    && text.length === DEVICE_KEY_LENGTH
    && /^[0-9a-f]{64}$/.test(text.slice(DEVICE_KEY_PREFIX.length))
  );
}

/** 计算 SHA-256 hex（密钥存储/比对用）。 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * 常数时间比较两个等长 hex 字符串。长度不等直接 false（不比较，避免长度侧信道）。
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return timingSafeEqual(ab, bb);
}

/**
 * 校验密钥：given 需通过形状校验，且与 stored 常数时间相等。
 * 形状校验先跑，伪造格式的输入快速失败；真正的安全性在常数时间相等。
 */
export function verifyDeviceKey(given: string, stored: string): boolean {
  if (!isDeviceKey(given) || !isDeviceKey(stored)) return false;
  return constantTimeEqualHex(given, stored);
}

/** 生成稳定设备 id：dev-<16hex>（公开，与密钥解耦）。 */
export function generateDeviceId(): string {
  return 'dev-' + randomBytes(8).toString('hex');
}
