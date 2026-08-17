// 设备注册表读写单测：路径推导（FLEET_HOME 覆盖）/ 读写往返 / 缺失空表 / 非法 fail loud / 权限告警。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fleetHome,
  sshDevicesFile,
  sshKeysDir,
  sshSocketsDir,
  loadSshDevices,
  saveSshDevices,
  sshDevicesPermWarning,
} from '../../src/ssh/config.ts';
import type { SshDevice } from '../../src/ssh/types.ts';

const emptyEnv: NodeJS.ProcessEnv = {};

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

test('路径推导：FLEET_HOME 覆盖默认 ~/.fleet', () => {
  const env = { FLEET_HOME: '/tmp/fleet-home' };
  assert.equal(fleetHome(env), '/tmp/fleet-home');
  assert.equal(sshDevicesFile(env), '/tmp/fleet-home/ssh-devices.json');
  assert.equal(sshKeysDir(env), '/tmp/fleet-home/ssh-keys');
  assert.equal(sshSocketsDir(env), '/tmp/fleet-home/ssh-sockets');
});

test('路径推导：无 FLEET_HOME 落到 ~/.fleet', () => {
  assert.equal(fleetHome(emptyEnv), join(process.env.HOME ?? '/root', '.fleet'));
});

test('loadSshDevices：文件缺失返回空表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  assert.deepEqual(loadSshDevices(join(dir, 'no-such.json')), []);
});

test('loadSshDevices：空文件返回空表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  const file = join(dir, 'ssh-devices.json');
  writeFileSync(file, '');
  assert.deepEqual(loadSshDevices(file), []);
});

test('loadSshDevices：非法 JSON fail loud', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  const file = join(dir, 'ssh-devices.json');
  writeFileSync(file, '{ not json');
  assert.throws(() => loadSshDevices(file), /不是合法 JSON/);
});

test('loadSshDevices：顶层非数组 fail loud', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  const file = join(dir, 'ssh-devices.json');
  writeFileSync(file, JSON.stringify({ a: 1 }));
  assert.throws(() => loadSshDevices(file), /顶层必须是数组/);
});

test('saveSshDevices：写 0600 + 读写往返', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  const file = join(dir, 'ssh-devices.json');
  saveSshDevices(file, [sampleDevice()]);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const loaded = loadSshDevices(file);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.deviceId, 'my-laptop');
  assert.equal(sshDevicesPermWarning(file), '');
});

test('sshDevicesPermWarning：权限过宽告警', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-cfg-'));
  const file = join(dir, 'ssh-devices.json');
  writeFileSync(file, '[]', { mode: 0o644 });
  assert.match(sshDevicesPermWarning(file), /权限过宽/);
});
