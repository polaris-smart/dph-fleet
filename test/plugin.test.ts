// 合一插件根层单测：modules 三态工具注册正确 + 合并 Config schema 默认/校验。

import test from 'node:test';
import assert from 'node:assert/strict';

import type { FleetContext } from '../src/types.ts';
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
function capture(): { ctx: FleetContext; tools: CapturedTool[] } {
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
  return { ctx: ctx as unknown as FleetContext, tools };
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

test('modules=both 注册 6 工具（mdns 2 + ssh 4）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'both' }), [
    'fleet_discover',
    'fleet_download',
    'fleet_pair',
    'fleet_ssh_exec',
    'fleet_upload',
    'fleet_workspace',
  ]);
});

test('modules=mdns 只注册 2 工具（无 ssh 工具）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'mdns' }), ['fleet_discover', 'fleet_pair']);
});

test('modules=ssh 只注册 4 工具（无 mdns 工具）', () => {
  assert.deepEqual(registeredNames({ ...base, modules: 'ssh' }), ['fleet_download', 'fleet_ssh_exec', 'fleet_upload', 'fleet_workspace']);
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

// --- Standard Schema 契约（cordis 4.x resolveConfig 消费；0.2.10 缺它 boot 实炸）---

test('Config 带 ~standard 契约：version 1 + 同步 validate', () => {
  const std = Config['~standard'];
  assert.ok(std, 'Config[~standard] 必须存在');
  assert.equal(std.version, 1);
  assert.equal(typeof std.validate, 'function');
  const result = std.validate({}) as object;
  assert.equal('then' in result, false, 'validate 必须同步返回（非 Promise）');
});

test('~standard.validate(undefined) → 全默认值', () => {
  const result = Config['~standard'].validate(undefined);
  assert.equal('issues' in result, false, '合法输入不应带 issues 键');
  if ('value' in result) {
    assert.deepEqual(result.value, {
      modules: 'both', deviceName: '', hub: '', fleetHome: '', sshUser: '', sshPort: 22, probeSsh: true,
    });
  } else {
    assert.fail('应有 value');
  }
});

test('~standard.validate 部分输入 → 与默认值合并', () => {
  const result = Config['~standard'].validate({ modules: 'ssh', sshPort: 2222 });
  if ('value' in result) {
    assert.equal(result.value.modules, 'ssh');
    assert.equal(result.value.sshPort, 2222);
    assert.equal(result.value.probeSsh, true, '未给的键落默认');
  } else {
    assert.fail('合法输入不应有 issues');
  }
});

test('~standard.validate 非法 modules → issues（cordis 借此拒绝配置）', () => {
  const result = Config['~standard'].validate({ modules: 'bogus' });
  assert.ok('issues' in result && result.issues !== undefined, '非法枚举应报 issues');
  if ('issues' in result && result.issues) {
    assert.ok(result.issues[0].message.includes('modules'));
  }
});

test('~standard.validate 非法类型（sshPort 字符串）→ issues', () => {
  const result = Config['~standard'].validate({ sshPort: '22' });
  assert.ok('issues' in result && result.issues !== undefined);
});
