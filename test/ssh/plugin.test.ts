// 插件工具注册单测（ssh 模块）：registerSshTools 注册 2 个工具；execute 包装
// （未配对拒绝、缺参拒绝、fleet_workspace 查看未设置、fleetHome 覆盖）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FleetContext } from '../../src/types.ts';
import { registerSshTools } from '../../src/ssh/plugin.ts';
import { saveSshDevices } from '../../src/ssh/config.ts';
import type { SshDevice } from '../../src/ssh/types.ts';

/** 捕获注册的工具定义（最小结构）。 */
interface CapturedTool {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: Record<string, unknown>, exec: { signal: AbortSignal }) => Promise<unknown>;
}

/** 构造假 ctx：tools.register 捕获定义。 */
function capture(): { ctx: FleetContext; tools: CapturedTool[] } {
  const tools: CapturedTool[] = [];
  const ctx = {
    tools: {
      register(def: CapturedTool): () => void {
        tools.push(def);
        return () => {};
      },
    },
  };
  return { ctx: ctx as unknown as FleetContext, tools };
}

function sampleDevice(deviceId = 'my-laptop'): SshDevice {
  return {
    deviceId,
    name: 'hk',
    host: '127.0.0.1',
    port: 22,
    user: 'ubuntu',
    keyPath: '/tmp/key',
    workspace: '',
    addedAt: '2026-08-18T00:00:00.000Z',
    lastUsedAt: '2026-08-18T00:00:00.000Z',
  };
}

const defaultConfig = { fleetHome: '' };
const sig = new AbortController().signal;

test('registerSshTools 注册 4 个工具（exec/workspace/upload/download）', () => {
  const { ctx, tools } = capture();
  registerSshTools(ctx, defaultConfig);
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['fleet_download', 'fleet_ssh_exec', 'fleet_upload', 'fleet_workspace']);
});

test('fleet_ssh_exec：缺 host/command 返回可读错误（不抛异常）', async () => {
  const { ctx, tools } = capture();
  registerSshTools(ctx, defaultConfig);
  const tool = tools.find((t) => t.name === 'fleet_ssh_exec')!;
  assert.match(String(await tool.execute({ host: '', command: 'x' }, { signal: sig })), /需要 host/);
  assert.match(String(await tool.execute({ host: 'hk', command: '' }, { signal: sig })), /需要 command/);
});

test('fleet_ssh_exec：未配对 host 返回可读错误（隔离 FLEET_HOME 空注册表）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-plugin-'));
  const prev = process.env.FLEET_HOME;
  process.env.FLEET_HOME = dir;
  try {
    const { ctx, tools } = capture();
    registerSshTools(ctx, defaultConfig);
    const tool = tools.find((t) => t.name === 'fleet_ssh_exec')!;
    const out = await tool.execute({ host: 'my-laptop', command: 'echo hi' }, { signal: sig });
    assert.match(String(out), /未配对设备/);
  } finally {
    if (prev === undefined) delete process.env.FLEET_HOME;
    else process.env.FLEET_HOME = prev;
  }
});

test('fleet_workspace：查看未设置工作区 + 未配对拒绝', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-plugin-'));
  const prev = process.env.FLEET_HOME;
  process.env.FLEET_HOME = dir;
  try {
    const { ctx, tools } = capture();
    registerSshTools(ctx, defaultConfig);
    const tool = tools.find((t) => t.name === 'fleet_workspace')!;
    assert.match(String(await tool.execute({ host: 'my-laptop' }, { signal: sig })), /未配对设备/);
    assert.match(String(await tool.execute({ host: '' }, { signal: sig })), /需要 host/);
  } finally {
    if (prev === undefined) delete process.env.FLEET_HOME;
    else process.env.FLEET_HOME = prev;
  }
});

test('registerSshTools：fleetHome 覆盖注册表路径（查看已配对未设置工作区）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-plugin-'));
  saveSshDevices(join(dir, 'ssh-devices.json'), [sampleDevice()]);
  const { ctx, tools } = capture();
  registerSshTools(ctx, { fleetHome: dir });
  const tool = tools.find((t) => t.name === 'fleet_workspace')!;
  const out = await tool.execute({ host: 'my-laptop' }, { signal: sig });
  assert.match(String(out), /未设置工作区/);
});
