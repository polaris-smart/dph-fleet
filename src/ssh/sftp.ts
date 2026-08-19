// dph-fleet SFTP 文件传输：沿已配对设备的 SSH 通道传文件（上传/下载）。
// 用系统 scp（SSH 自带的文件传输，走同一配对密钥 + ControlMaster 复用），
// 不引入新依赖。安全：BatchMode 禁交互、IdentitiesOnly 只试配对私钥、密钥走 -i 不落日志。
//
// 参考：SSH/SFTP 标准（RFC 4253）——所有 SSH 工具共用的文件传输协议，独立实现。

import { spawn } from 'node:child_process';
import { join } from 'node:path';

import {
  SSH_CONNECT_TIMEOUT,
  CONTROL_PERSIST,
  controlPathSegment,
  sshExitErrorText,
} from './ssh.ts';
import type { SshDevice, SshExecResult } from './types.ts';

/** scp 基础参数（与 buildSshArgs 同口径的 SSH 选项，但不带 command）。 */
function buildScpArgs(
  device: SshDevice,
  opts: { socketDir?: string } = {},
): string[] {
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT}`,
    '-o', `IdentityFile=${device.keyPath}`,
    '-o', 'IdentitiesOnly=yes',
    '-P', String(device.port),
  ];
  if (opts.socketDir && opts.socketDir.length > 0) {
    args.push(
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${join(opts.socketDir, controlPathSegment(device.host, device.user, device.port))}`,
      '-o', `ControlPersist=${CONTROL_PERSIST}`,
    );
  }
  return args;
}

/**
 * 上传：本机文件 → 目标设备远端路径。
 * @returns 结果（ok/错误文本，不抛异常）。
 */
export async function scpUpload(
  device: SshDevice,
  localPath: string,
  remotePath: string,
  opts: { socketDir?: string; signal?: AbortSignal } = {},
): Promise<SshExecResult> {
  return runScp(device, [localPath, `${device.user}@${device.host}:${remotePath}`], opts);
}

/**
 * 下载：目标设备远端文件 → 本机路径（"把数据拿回来"）。
 */
export async function scpDownload(
  device: SshDevice,
  remotePath: string,
  localPath: string,
  opts: { socketDir?: string; signal?: AbortSignal } = {},
): Promise<SshExecResult> {
  return runScp(device, [`${device.user}@${device.host}:${remotePath}`, localPath], opts);
}

/** 执行一次 scp，捕获 stdout/stderr/退出码，绝不 throw。 */
function runScp(
  device: SshDevice,
  targets: string[],
  opts: { socketDir?: string; signal?: AbortSignal },
): Promise<SshExecResult> {
  return new Promise((resolve) => {
    const args = [...buildScpArgs(device, { socketDir: opts.socketDir }), ...targets];
    const child = spawn('scp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (r: SshExecResult): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      finish({ ok: false, exitCode: 255, stdout, stderr, error: `scp 启动失败: ${err.message}` });
    });
    child.on('close', (code, signal) => {
      if (code === 0) finish({ ok: true, exitCode: 0, stdout, stderr });
      else finish({ ok: false, exitCode: code, stdout, stderr, error: sshExitErrorText(code, signal, stderr) });
    });
    opts.signal?.addEventListener('abort', () => {
      child.kill('SIGKILL');
      finish({ ok: false, exitCode: null, stdout, stderr, error: '传输已取消' });
    });
  });
}
