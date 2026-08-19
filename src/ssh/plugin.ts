// dph-fleet SSH 模块工具面：注册 fleet_ssh_exec / fleet_workspace 两个工具（纯 SSH，不经 hub）。
// 「按模块开关注册」由根插件 dispatch 决定是否调用 registerSshTools（关掉 ssh 时这两个工具不注册）。
//
// 机制（与 fleet-m8-ssh 同口径）：
// - 只连已配对设备（assertPaired）；密钥 0600；BatchMode+IdentitiesOnly；任何失败返回错误文本不抛异常。
// - 注册表路径由 config.fleetHome 覆盖，空则走 FLEET_HOME / ~/.fleet。

import type { FleetContext } from '../types.ts'

import { loadSshDevices, saveSshDevices, sshDevicesFile, sshSocketsDir } from './config.ts'
import { assertPaired, touchLastUsed } from './pool.ts'
import { sshExec } from './ssh.ts'
import { scpUpload, scpDownload } from './sftp.ts'
import { setWorkspace, getWorkspace } from './workspace.ts'
import type { SshExecResult } from './types.ts'

/** SSH 模块配置。 */
export interface SshModuleConfig {
  /** 主控家目录覆盖（空 = 走 FLEET_HOME 或 ~/.fleet）。 */
  fleetHome: string;
}

/** 把 ssh 结果渲染成模型可读文本（stdout 优先，stderr/退出码并列，不抛异常）。 */
function formatExecResult(r: SshExecResult): string {
  const out = r.stdout;
  const err = r.stderr;
  if (r.ok) {
    const parts = [out, err.length > 0 ? `[stderr]\n${err}` : ''].filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join('\n') : '(命令成功，无输出)';
  }
  const head = r.error ?? 'ssh 执行失败';
  return [
    head,
    out.length > 0 ? `[stdout]\n${out}` : '',
    err.length > 0 ? `[stderr]\n${err}` : '',
  ].filter((s) => s.length > 0).join('\n');
}

/**
 * 注册 fleet_ssh_exec / fleet_workspace 两个工具。
 * @param ctx - 携带 ctx.tools 的插件上下文。
 * @param config - SSH 模块配置（fleetHome 覆盖注册表/密钥/socket 目录）。
 */
export function registerSshTools(ctx: FleetContext, config: SshModuleConfig): void {
  const env: NodeJS.ProcessEnv = config.fleetHome.length > 0
    ? { ...process.env, FLEET_HOME: config.fleetHome }
    : process.env;

  ctx.tools.register({
    name: 'fleet_ssh_exec',
    description: 'SSH 直连已配对被控设备执行命令（轻量模式，不经 hub）：host 传 deviceId/主机/友好名，command 传远端 shell 命令。只连已配对设备；返回 stdout/stderr/退出码。用于「主控说一句→直连被控干活」。',
    parameters: {
      host: { type: 'string', required: true, description: '目标设备：deviceId / 主机 IP / 友好名（须已配对）' },
      command: { type: 'string', required: true, description: '远端 shell 命令串' },
      timeoutMs: { type: 'number', description: '执行超时毫秒（默认 120000）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const host = typeof args.host === 'string' ? args.host.trim() : '';
      const command = typeof args.command === 'string' ? args.command : '';
      if (host.length === 0) return 'fleet_ssh_exec 需要 host 参数（已配对设备）';
      if (command.length === 0) return 'fleet_ssh_exec 需要 command 参数（远端命令）';
      const devicesFile = sshDevicesFile(env);
      const devices = loadSshDevices(devicesFile);
      const paired = assertPaired(devices, host);
      if ('error' in paired) return paired.error;
      const result = await sshExec(paired.device, command, {
        socketDir: sshSocketsDir(env),
        signal: exec.signal,
        timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
      });
      saveSshDevices(devicesFile, touchLastUsed(devices, paired.device.deviceId));
      return formatExecResult(result);
    },
  })

  ctx.tools.register({
    name: 'fleet_workspace',
    description: '设置/查看已配对被控设备的远程工作区（执行根）。传 dir 则远端 mkdir -p 并记住该目录；不传 dir 则返回当前工作区。任务书（AI 生成）在该工作区执行。',
    parameters: {
      host: { type: 'string', required: true, description: '目标设备：deviceId / 主机 IP / 友好名（须已配对）' },
      dir: { type: 'string', description: '远程工作区绝对路径（缺省 = 查看当前工作区）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const host = typeof args.host === 'string' ? args.host.trim() : '';
      if (host.length === 0) return 'fleet_workspace 需要 host 参数（已配对设备）';
      const devicesFile = sshDevicesFile(env);
      const dir = typeof args.dir === 'string' && args.dir.trim().length > 0 ? args.dir.trim() : undefined;
      if (dir === undefined) {
        const view = getWorkspace({ devicesFile, target: host });
        if ('error' in view) return view.error;
        return view.workspace.length > 0
          ? `设备 ${view.deviceId} 的工作区：${view.workspace}`
          : `设备 ${view.deviceId} 未设置工作区（执行落在远端 home 目录）`;
      }
      const set = await setWorkspace({
        devicesFile,
        target: host,
        dir,
        socketDir: sshSocketsDir(env),
        signal: exec.signal,
      });
      if ('error' in set) return set.error;
      return `已设置设备 ${set.device.deviceId} 的工作区：${set.device.workspace}`;
    },
  })

  ctx.tools.register({
    name: 'fleet_upload',
    description: '沿已配对设备的 SSH 通道上传文件：把本机文件传到目标设备的远端路径。host 传 deviceId/主机/友好名，local 传本机文件路径，remote 传远端目标路径。用于「把文件送到远端设备」。',
    parameters: {
      host: { type: 'string', required: true, description: '目标设备：deviceId / 主机 IP / 友好名（须已配对）' },
      local: { type: 'string', required: true, description: '本机文件路径（要上传的文件）' },
      remote: { type: 'string', required: true, description: '远端目标路径（如 /home/user/xx.txt）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const host = typeof args.host === 'string' ? args.host.trim() : '';
      const local = typeof args.local === 'string' ? args.local.trim() : '';
      const remote = typeof args.remote === 'string' ? args.remote.trim() : '';
      if (host.length === 0) return 'fleet_upload 需要 host 参数（已配对设备）';
      if (local.length === 0) return 'fleet_upload 需要 local 参数（本机文件路径）';
      if (remote.length === 0) return 'fleet_upload 需要 remote 参数（远端目标路径）';
      const devicesFile = sshDevicesFile(env);
      const devices = loadSshDevices(devicesFile);
      const paired = assertPaired(devices, host);
      if ('error' in paired) return paired.error;
      const result = await scpUpload(paired.device, local, remote, {
        socketDir: sshSocketsDir(env),
        signal: exec.signal,
      });
      saveSshDevices(devicesFile, touchLastUsed(devices, paired.device.deviceId));
      if (!result.ok) return result.error ?? '上传失败';
      return `已上传 ${local} → ${remote}（设备 ${paired.device.deviceId}）`;
    },
  })

  ctx.tools.register({
    name: 'fleet_download',
    description: '沿已配对设备的 SSH 通道下载文件：把目标设备远端文件取回本机。host 传 deviceId/主机/友好名，remote 传远端文件路径，local 传本机保存路径。用于「把数据/文件拿回来」。',
    parameters: {
      host: { type: 'string', required: true, description: '目标设备：deviceId / 主机 IP / 友好名（须已配对）' },
      remote: { type: 'string', required: true, description: '远端文件路径（要取回的文件）' },
      local: { type: 'string', required: true, description: '本机保存路径（如 ./下载/xx.txt）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args: Record<string, unknown>, exec: { signal: AbortSignal }) {
      const host = typeof args.host === 'string' ? args.host.trim() : '';
      const remote = typeof args.remote === 'string' ? args.remote.trim() : '';
      const local = typeof args.local === 'string' ? args.local.trim() : '';
      if (host.length === 0) return 'fleet_download 需要 host 参数（已配对设备）';
      if (remote.length === 0) return 'fleet_download 需要 remote 参数（远端文件路径）';
      if (local.length === 0) return 'fleet_download 需要 local 参数（本机保存路径）';
      const devicesFile = sshDevicesFile(env);
      const devices = loadSshDevices(devicesFile);
      const paired = assertPaired(devices, host);
      if ('error' in paired) return paired.error;
      const result = await scpDownload(paired.device, remote, local, {
        socketDir: sshSocketsDir(env),
        signal: exec.signal,
      });
      saveSshDevices(devicesFile, touchLastUsed(devices, paired.device.deviceId));
      if (!result.ok) return result.error ?? '下载失败';
      return `已下载 ${remote} → ${local}（设备 ${paired.device.deviceId}）`;
    },
  })
}
