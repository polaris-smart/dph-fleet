// 设备身份单测：首次生成密钥+id、600 权限、装载往返、坏 key 拒绝、路径推导。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ensureIdentity,
  loadIdentity,
  saveIdentity,
  identityPermWarning,
  dshHome,
  fleetHome,
  identityFile,
  pairedFile,
  collectCapabilities,
  DPH_VERSION,
} from '../../src/mdns/identity.ts';
import { isDeviceKey } from '../../src/mdns/key.ts';

test('ensureIdentity 首次生成设备密钥 + 稳定 id + 600 权限', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-id-'));
  const file = join(dir, 'fleet-lan.json');
  const id = ensureIdentity({ file, name: 'laptop', hub: '' });
  assert.ok(isDeviceKey(id.key));
  assert.match(id.deviceId, /^dev-[0-9a-f]{16}$/);
  assert.equal(id.name, 'laptop');
  const mode = statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
  // 再次调用返回同一身份（不重生成密钥）。
  const again = ensureIdentity({ file });
  assert.equal(again.key, id.key);
  assert.equal(again.deviceId, id.deviceId);
});

test('saveIdentity/loadIdentity 往返一致', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-id-'));
  const file = join(dir, 'fleet-lan.json');
  const id = ensureIdentity({ file, name: 'pi', hub: 'http://10.5.0.8:8790' });
  saveIdentity(file, { ...id, port: 34567 });
  const loaded = loadIdentity(file);
  assert.ok(loaded);
  assert.equal(loaded!.key, id.key);
  assert.equal(loaded!.port, 34567);
  assert.equal(loaded!.hub, 'http://10.5.0.8:8790');
});

test('loadIdentity 缺失返回 undefined，坏 key 抛错', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-id-'));
  assert.equal(loadIdentity(join(dir, 'nope.json')), undefined);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ deviceId: 'dev-x', name: 'x', key: 'fleet-d-short' }), 'utf8');
  assert.throws(() => loadIdentity(bad), /key 非法/);
});

test('identityPermWarning 检测权限过宽', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-id-'));
  const file = join(dir, 'fleet-lan.json');
  ensureIdentity({ file });
  assert.equal(identityPermWarning(file), '');
  // 故意放宽权限。
  chmodSync(file, 0o644);
  assert.match(identityPermWarning(file), /权限过宽/);
  assert.equal(identityPermWarning(join(dir, 'nope.json')), '');
});

test('路径推导遵循 DSH_HOME / FLEET_HOME 环境变量', () => {
  const env = { DSH_HOME: '/tmp/dsh', FLEET_HOME: '/tmp/fleet' };
  assert.equal(dshHome(env), '/tmp/dsh');
  assert.equal(fleetHome(env), '/tmp/fleet');
  assert.equal(identityFile(env), '/tmp/dsh/fleet-lan.json');
  assert.equal(pairedFile(env), '/tmp/fleet/paired-devices.json');
});

test('collectCapabilities 含 os/node/内存/dph 版本', () => {
  const cap = collectCapabilities();
  assert.ok(cap.os.length > 0);
  assert.ok(cap.node.length > 0);
  assert.ok(cap.memoryMb > 0);
  assert.equal(cap.dph, true);
  assert.equal(cap.dphVersion, DPH_VERSION);
});
