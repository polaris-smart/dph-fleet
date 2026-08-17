// 远程工作区单测：目录校验 + 查看（纯读）+ 设置错误路径（未配对/非法目录，不触发 SSH）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { saveSshDevices } from '../../src/ssh/config.ts';
import { getWorkspace, setWorkspace, isValidWorkspace } from '../../src/ssh/workspace.ts';
import type { SshDevice } from '../../src/ssh/types.ts';

function device(over: Partial<SshDevice> = {}): SshDevice {
  return {
    deviceId: 'my-laptop',
    name: 'hk',
    host: '127.0.0.1',
    port: 22,
    user: 'ubuntu',
    keyPath: '/k',
    workspace: '',
    addedAt: 'a',
    lastUsedAt: 'a',
    ...over,
  };
}

test('isValidWorkspace：绝对路径/~ 合法，相对/空非法', () => {
  assert.equal(isValidWorkspace('/home/alice/ws'), true);
  assert.equal(isValidWorkspace('~/ws'), true);
  assert.equal(isValidWorkspace('ws'), false);
  assert.equal(isValidWorkspace(''), false);
  assert.equal(isValidWorkspace('  '), false);
});

test('getWorkspace：未设置返回空串', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-ws-'));
  const file = join(dir, 'ssh-devices.json');
  saveSshDevices(file, [device()]);
  const r = getWorkspace({ devicesFile: file, target: 'my-laptop' });
  assert.ok('workspace' in r);
  assert.equal(r.workspace, '');
});

test('getWorkspace：未配对返回可读错误', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-ws-'));
  const file = join(dir, 'ssh-devices.json');
  saveSshDevices(file, [device()]);
  const r = getWorkspace({ devicesFile: file, target: 'ssh-nj' });
  assert.ok('error' in r);
  assert.match(r.error, /未配对设备/);
});

test('setWorkspace：非法目录返回错误（不触发 SSH）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-ws-'));
  const file = join(dir, 'ssh-devices.json');
  saveSshDevices(file, [device()]);
  const r = await setWorkspace({ devicesFile: file, target: 'my-laptop', dir: 'relative' });
  assert.ok('error' in r);
  assert.match(r.error, /非法/);
});

test('setWorkspace：未配对返回错误（不触发 SSH）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-ws-'));
  const file = join(dir, 'ssh-devices.json');
  saveSshDevices(file, [device()]);
  const r = await setWorkspace({ devicesFile: file, target: 'ssh-nj', dir: '/tmp/ws' });
  assert.ok('error' in r);
  assert.match(r.error, /未配对设备/);
});
