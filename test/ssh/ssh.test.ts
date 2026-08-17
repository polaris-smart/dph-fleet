// ssh 命令封装单测：buildSshArgs 参数拼装 + ControlPath 段净化 + 错误映射 + shell 转义。

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { buildSshArgs, controlPathSegment, sshExitErrorText, shellQuote, SSH_CONNECT_TIMEOUT, CONTROL_PERSIST } from '../../src/ssh/ssh.ts';
import type { SshDevice } from '../../src/ssh/types.ts';

function device(over: Partial<SshDevice> = {}): SshDevice {
  return {
    deviceId: 'my-laptop',
    name: 'hk',
    host: '10.0.0.5',
    port: 2222,
    user: 'ubuntu',
    keyPath: '/home/alice/.fleet/ssh-keys/my-laptop',
    workspace: '',
    addedAt: '2026-08-18T00:00:00.000Z',
    lastUsedAt: '2026-08-18T00:00:00.000Z',
    ...over,
  };
}

test('buildSshArgs：安全参数齐全（BatchMode/StrictHostKeyChecking/IdentityFile/IdentitiesOnly）', () => {
  const args = buildSshArgs(device(), 'echo ok', { socketDir: '' });
  assert.ok(args.includes('BatchMode=yes'));
  assert.ok(args.includes('StrictHostKeyChecking=accept-new'));
  assert.ok(args.includes(`ConnectTimeout=${SSH_CONNECT_TIMEOUT}`));
  assert.ok(args.includes('IdentityFile=/home/alice/.fleet/ssh-keys/my-laptop'));
  assert.ok(args.includes('IdentitiesOnly=yes'));
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('2222'));
  assert.equal(args[args.length - 2], 'ubuntu@10.0.0.5');
  assert.equal(args[args.length - 1], 'echo ok');
});

test('buildSshArgs：socketDir 非空开 ControlMaster 复用', () => {
  const socketDir = '/tmp/socks';
  const args = buildSshArgs(device(), 'true', { socketDir });
  assert.ok(args.includes('ControlMaster=auto'));
  const cpIdx = args.indexOf(`ControlPath=${join(socketDir, controlPathSegment('10.0.0.5', 'ubuntu', 2222))}`);
  assert.ok(cpIdx >= 0);
  assert.ok(args.includes(`ControlPersist=${CONTROL_PERSIST}`));
});

test('buildSshArgs：socketDir 空则无 ControlMaster 参数', () => {
  const args = buildSshArgs(device(), 'true', { socketDir: '' });
  assert.ok(!args.includes('ControlMaster=auto'));
  assert.ok(!args.some((a) => a.startsWith('ControlPath=')));
});

test('controlPathSegment：过滤非法文件名字符', () => {
  assert.equal(controlPathSegment('10.0.0.5', 'ubuntu', 2222), 'ubuntu@10.0.0.5_2222');
  assert.equal(controlPathSegment('bad/host with space', 'u', 22), 'u@bad_host_with_space_22');
});

test('sshExitErrorText：255 连接失败带 stderr 详情', () => {
  const txt = sshExitErrorText(255, null, 'Permission denied (publickey).\n');
  assert.match(txt, /ssh 连接失败/);
  assert.match(txt, /Permission denied/);
});

test('sshExitErrorText：远端非零退出码', () => {
  assert.equal(sshExitErrorText(3, null, ''), '远端命令退出码 3');
  assert.match(sshExitErrorText(1, null, 'boom'), /退出码 1：boom/);
});

test('sshExitErrorText：被信号终止', () => {
  assert.equal(sshExitErrorText(null, 'SIGKILL', ''), '远端命令被信号 SIGKILL 终止');
});

test('shellQuote：单引号包裹并转义内嵌单引号', () => {
  assert.equal(shellQuote('/tmp/ws'), `'/tmp/ws'`);
  assert.equal(shellQuote(`a'b`), `'a'\\''b'`);
});
