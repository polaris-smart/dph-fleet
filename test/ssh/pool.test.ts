// 设备表纯函数单测：find/assert/upsert/remove/touch/withWorkspace/deviceIdFromHost/格式化。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPaired,
  deviceIdFromHost,
  findSshDevice,
  formatSshDevice,
  removeSshDevice,
  touchLastUsed,
  upsertSshDevice,
  withWorkspace,
  nowIso,
} from '../../src/ssh/pool.ts';
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

test('deviceIdFromHost：由 host 派生稳定别名', () => {
  assert.equal(deviceIdFromHost('127.0.0.1', 22), 'ssh-127.0.0.1-22');
  assert.equal(deviceIdFromHost('bad host!', 22), 'ssh-bad-host--22');
});

test('findSshDevice：deviceId > host > name', () => {
  const d = device({ name: 'nice' });
  assert.equal(findSshDevice([d], 'my-laptop')!.deviceId, 'my-laptop');
  assert.equal(findSshDevice([d], '127.0.0.1')!.deviceId, 'my-laptop');
  assert.equal(findSshDevice([d], 'nice')!.deviceId, 'my-laptop');
  assert.equal(findSshDevice([d], 'nope'), undefined);
  assert.equal(findSshDevice([d], ''), undefined);
});

test('assertPaired：未配对返回可读错误，已配对返回设备', () => {
  const r = assertPaired([], 'my-laptop');
  assert.ok('error' in r);
  assert.match(r.error, /未配对设备/);
  const ok = assertPaired([device()], 'my-laptop');
  assert.ok('device' in ok);
  assert.equal(ok.device.deviceId, 'my-laptop');
});

test('upsertSshDevice：同 id 覆盖，不同 id 追加', () => {
  const a = device();
  const b = device({ deviceId: 'ssh-nj', host: '10.0.0.9' });
  const list = upsertSshDevice([a], b);
  assert.equal(list.length, 2);
  const replaced = upsertSshDevice(list, device({ workspace: '/ws' }));
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((d) => d.deviceId === 'my-laptop')!.workspace, '/ws');
});

test('removeSshDevice：按 id 移除', () => {
  const list = [device(), device({ deviceId: 'ssh-nj' })];
  assert.equal(removeSshDevice(list, 'my-laptop').length, 1);
  assert.equal(removeSshDevice(list, 'missing').length, 2);
});

test('touchLastUsed / withWorkspace：返回新表不突变', () => {
  const list = [device()];
  const touched = touchLastUsed(list, 'my-laptop', 'b');
  assert.equal(touched[0]!.lastUsedAt, 'b');
  assert.equal(list[0]!.lastUsedAt, 'a');
  const ws = withWorkspace(list, 'my-laptop', '/home/ws');
  assert.equal(ws[0]!.workspace, '/home/ws');
  assert.equal(list[0]!.workspace, '');
});

test('formatSshDevice：含用户@主机:端口与工作区', () => {
  const line = formatSshDevice(device({ workspace: '/ws' }));
  assert.match(line, /hk \(my-laptop\)/);
  assert.match(line, /ubuntu@127\.0\.0\.1:22/);
  assert.match(line, /工作区=\/ws/);
  const unset = formatSshDevice(device());
  assert.match(unset, /工作区=未设置/);
});

test('nowIso：ISO 时间串', () => {
  assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T/);
});
