import test from 'node:test';
import assert from 'node:assert/strict';

// --- v0.1.2 一键舰队：invite/join/allow 命令级验证 ---

test('invite 生成合法邀请码（host:port/user/token）', () => {
  // 通过 CLI 主入口测试（隔离 FLEET_HOME）
  const { execFileSync } = process.getBuiltinModule('node:child_process');
  const out = execFileSync(process.execPath, ['dist/ssh/cli.js', 'invite', '1.2.3.4', '--user', 'test', '--port', '22'], {
    env: { ...process.env, FLEET_HOME: '/tmp/fleet-invite-unit' },
    encoding: 'utf-8',
  });
  const m = out.match(/(\d+\.\d+\.\d+\.\d+):(\d+)\/(\w+)\/([a-f0-9]{24})/);
  assert.ok(m, '邀请码格式应为 host:port/user/token');
  assert.equal(m![1], '1.2.3.4');
  assert.equal(m![3], 'test');
});
