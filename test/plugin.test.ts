// 合一插件根层单测：modules 三态工具注册正确 + 合并 Config schema 默认/校验。

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Context } from '@deepseek-ai/cordis';
import { apply, Config } from '../src/plugin.ts';
import type { Config as PluginConfig } from '../src/config.ts';

/** 捕获注册的工具定义（最小结构）。 */
interface CapturedTool {
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: Record<string, unknown>, exec: { signal: AbortSignal }) => Promise<unknown>;
}

/** 构造假 ctx：tools.register 捕获定义 + inject 桩（/fleet 命令需要）。 */
function capture(): { ctx: Context; tools: CapturedTool[] } {
  const tools: CapturedTool[] = [];
  const ctx = {
    tools: {
      register(def: CapturedTool): () => void {
        tools.push(def);
        return () => {};
      },
    },
    inject(_dep: string[], fn: (sub: { commands?: { register(): void } }) => void): void {
      fn({ commands: { register(): void {} } });
    },
  };
  return { ctx: ctx as unknown as Context, tools };
}

const base: PluginConfig = {
  modules: 'both',
  deviceName: '',
  hub: '',
  fleetHome: '',
  sshUser: '',
  sshPort: 22,
  probeSsh: true,
};

function registeredNames(config: PluginConfig): string[] {
  const { ctx, tools } = capture();
  apply(ctx, config);
  return tools.map((t) => t.name).sort();
}

test('modules=both 注册 4 工具（mdns 2 + ssh 2）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'both' }), [
    'fleet_discover',
    'fleet_pair',
    'fleet_ssh_exec',
    'fleet_workspace',
  ]);
});

test('modules=mdns 只注册 2 工具（无 ssh 工具）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'mdns' }), ['fleet_discover', 'fleet_pair']);
});

test('modules=ssh 只注册 2 工具（无 mdns 工具）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'ssh' }), ['fleet_ssh_exec', 'fleet_workspace']);
});

test('Config 默认值：modules=both + 其余默认', () => {
  assert.equal(Config.modules, 'both');
  assert.equal(Config.deviceName, '');
  assert.equal(Config.hub, '');
  assert.equal(Config.fleetHome, '');
  assert.equal(Config.sshUser, '');
  assert.equal(Config.sshPort, 22);
  assert.equal(Config.probeSsh, true);
});
