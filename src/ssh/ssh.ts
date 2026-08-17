// 系统 ssh 封装：buildSshArgs 纯函数 + sshExec 子进程执行 + ControlMaster 连接复用。
// 零 npm：封装系统 ssh 命令（任务书 §四 边界「优先系统 ssh，减少依赖」）。
// 安全：BatchMode（禁交互口令）、IdentitiesOnly（只试配对私钥）、密钥走 -i 路径不落日志。

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { SshDevice, SshExecResult } from './types.ts';

/** ssh 连接超时（秒）。 */
export const SSH_CONNECT_TIMEOUT = 10;
/** 命令执行超时（毫秒，防远端挂死）。 */
export const SSH_EXEC_TIMEOUT_MS = 120_000;
/** ControlMaster 空闲保活（秒）：连接池复用窗口。 */
export const CONTROL_PERSIST = 30;

/**
 * 把 host/user/port 净化为 ControlPath socket 文件名安全段。
 * 过滤非 [A-Za-z0-9.@_-] 字符，避免路径注入与非法文件名字符。
 */
export function controlPathSegment(host: string, user: string, port: number): string {
  // port 恒为数字，段串至少含端口位，过滤后必非空。
  return `${user}@${host}:${port}`.replace(/[^A-Za-z0-9.@_-]/g, '_');
}

/**
 * 构造 ssh 参数数组（纯函数，可单测）。opts.socketDir 非空则开 ControlMaster 复用。
 * 不把 command 拆开：作为单一参数交给远端 shell 解释（与系统 ssh 语义一致）。
 * @param device - 已配对设备。
 * @param command - 远端 shell 命令串。
 * @param opts.socketDir - ControlPath 目录；空串 = 关闭连接复用。
 */
export function buildSshArgs(
  device: SshDevice,
  command: string,
  opts: { socketDir?: string } = {},
): string[] {
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `ConnectTimeout=${SSH_CONNECT_TIMEOUT}`,
    '-o', `IdentityFile=${device.keyPath}`,
    '-o', 'IdentitiesOnly=yes',
    '-p', String(device.port),
  ];
  if (opts.socketDir && opts.socketDir.length > 0) {
    args.push(
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${join(opts.socketDir, controlPathSegment(device.host, device.user, device.port))}`,
      '-o', `ControlPersist=${CONTROL_PERSIST}`,
    );
  }
  args.push(`${device.user}@${device.host}`, command);
  return args;
}

/**
 * 把退出码/信号/stderr 映射成可读中文错误文本（不抛异常）。
 * 255 = ssh 连接级失败（认证/不可达/host key 等）；其余非零 = 远端命令退出码。
 */
export function sshExitErrorText(code: number | null, signal: string | null, stderr: string): string {
  const tail = stderr.trim();
  if (code === 255) {
    const detail = tail.length > 0 ? `（${tail.slice(0, 200)}）` : '';
    return `ssh 连接失败${detail}`;
  }
  if (code !== null) {
    return `远端命令退出码 ${code}${tail.length > 0 ? `：${tail.slice(0, 200)}` : ''}`;
  }
  if (signal) return `远端命令被信号 ${signal} 终止`;
  return tail.length > 0 ? tail : 'ssh 执行失败';
}

/**
 * 执行远端命令，捕获 stdout/stderr/退出码，绝不 throw。
 * 超时/取消会 SIGKILL 子进程；连接复用靠 ControlMaster（见 buildSshArgs）。
 * @param device - 已配对设备。
 * @param command - 远端 shell 命令串。
 * @param opts.socketDir - ControlPath 目录；空串关闭复用。
 * @param opts.signal - 外部取消信号。
 * @param opts.timeoutMs - 执行超时（默认 120s）。
 */
export function sshExec(
  device: SshDevice,
  command: string,
  opts: { socketDir?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<SshExecResult> {
  const socketDir = opts.socketDir ?? '';
  const args = buildSshArgs(device, command, { socketDir });
  if (socketDir.length > 0) mkdirSync(socketDir, { recursive: true });
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child: ChildProcess;
    try {
      child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        error: `ssh 启动失败: ${(err as Error).message}`,
      });
      return;
    }
    const timeoutMs = opts.timeoutMs ?? SSH_EXEC_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: `命令执行超时（${Math.round(timeoutMs / 1000)} 秒）`,
      });
    }, timeoutMs);
    const finish = (r: SshExecResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    child.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      finish({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: sshExitErrorText(255, null, `无法启动 ssh: ${err.message}`),
      });
    });
    child.on('close', (code, signal) => {
      if (code === 0) finish({ ok: true, exitCode: 0, stdout, stderr });
      else finish({ ok: false, exitCode: code, stdout, stderr, error: sshExitErrorText(code, signal, stderr) });
    });
    opts.signal?.addEventListener(
      'abort',
      () => {
        child.kill('SIGKILL');
        finish({ ok: false, exitCode: null, stdout, stderr, error: '执行已取消' });
      },
      { once: true },
    );
  });
}

/**
 * shell 单引号转义（把任意串变成安全单参数）。
 * 用于把用户提供的目录名安全嵌入远端 `mkdir -p` 命令。
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
