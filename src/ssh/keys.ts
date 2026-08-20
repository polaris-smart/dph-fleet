// SSH 密钥生成与校验：优先系统 ssh-keygen（与「封装系统 ssh」口径一致）。
// 私钥 0600、公钥 .pub 供被控侧加入 authorized_keys。纯 Node 标准库，可独立单测。

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, chmodSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { SshKeyPair } from './types.ts';

/** 密钥注释（落到公钥尾随字段，便于识别）。 */
export const DEFAULT_KEY_COMMENT = 'dsh-devices';

/**
 * 生成 ed25519 密钥对（无口令），私钥 chmod 0600、公钥 0644。
 * 失败 fail loud（ssh-keygen 不存在/非零退出都抛错，不静默产出半截密钥）。
 * @param keyPath - 私钥绝对路径（公钥 = keyPath + '.pub'）。
 * @param comment - 密钥注释。
 */
export function generateSshKey(keyPath: string, comment = DEFAULT_KEY_COMMENT): SshKeyPair {
  mkdirSync(join(keyPath, '..'), { recursive: true });
  const r = spawnSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyPath, '-C', comment], {
    encoding: 'utf8',
  });
  if (r.error) throw new Error(`ssh-keygen 启动失败: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`ssh-keygen 失败: ${((r.stderr || r.stdout) ?? '').trim()}`);
  }
  chmodSync(keyPath, 0o600);
  chmodSync(keyPath + '.pub', 0o644);
  return { privateKey: keyPath, publicKey: keyPath + '.pub' };
}

/** 私钥文件是否存在。 */
export function keyFileExists(keyPath: string): boolean {
  try {
    return existsSync(keyPath);
  } catch {
    return false;
  }
}

/**
 * 读公钥文本（.pub，去首尾空白）。文件不存在返回空串（调用侧据此提示配对状态）。
 * @param keyPath - 私钥绝对路径。
 */
export function readPublicKey(keyPath: string): string {
  try {
    return readFileSync(keyPath + '.pub', 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * 私钥权限告警：存在且权限比 0600 宽时返回告警文本，否则空串。
 * @param keyPath - 私钥绝对路径。
 */
export function sshKeyPermWarning(keyPath: string): string {
  let mode: number;
  try {
    mode = statSync(keyPath).mode;
  } catch {
    return '';
  }
  if ((mode & 0o077) !== 0) {
    return `警告：SSH 私钥 ${keyPath} 权限过宽（应为 0600），请执行 chmod 600 ${keyPath}`;
  }
  return '';
}
