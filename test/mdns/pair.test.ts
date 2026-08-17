// 配对协议 + 已配对设备表单测：请求解析、密钥校验、表读写 upsert、目标解析、发现标记。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePairRequest, respondToPair } from '../../src/mdns/server.ts';
import { loadPaired, savePaired, upsertPaired, findPaired, pairWithDevice, nowIso } from '../../src/mdns/pair.ts';
import { markPaired, touchLastSeen, resolveTarget, parseHostPort, formatDiscoveredDevice } from '../../src/mdns/discover.ts';
import { generateDeviceKey, sha256Hex } from '../../src/mdns/key.ts';
import type { DeviceIdentity, PairedDevice, DiscoveredDevice } from '../../src/mdns/types.ts';

function identity(key: string): DeviceIdentity {
  return {
    deviceId: 'dev-aabbccdd11223344',
    name: 'laptop',
    key,
    port: 34567,
    hub: '',
    capabilities: { os: 'linux x64', node: 'v22.23.2', memoryMb: 8192, dph: true, dphVersion: 'x' },
  };
}

function discovered(id: string, name: string): DiscoveredDevice {
  return {
    deviceId: id,
    name,
    address: '10.5.0.8',
    port: 34567,
    hub: '',
    capabilities: { os: 'linux x64', node: 'v22.23.2', memoryMb: 8192, dph: true, dphVersion: 'x' },
    paired: false,
  };
}

test('parsePairRequest 解析合法请求，非法返回 null', () => {
  const key = generateDeviceKey();
  const req = parsePairRequest(JSON.stringify({ v: 1, op: 'pair', key, masterId: 'm', masterName: 'n' }));
  assert.ok(req);
  assert.equal(req!.key, key);
  assert.equal(parsePairRequest('not json'), null);
  assert.equal(parsePairRequest(JSON.stringify({ v: 2, op: 'pair', key })), null);
  assert.equal(parsePairRequest(JSON.stringify({ v: 1, op: 'other', key })), null);
  assert.equal(parsePairRequest(JSON.stringify({ v: 1, op: 'pair' })), null);
});

test('respondToPair 密钥命中 ok，不命中带错误', () => {
  const key = generateDeviceKey();
  const id = identity(key);
  const ok = respondToPair(id, { v: 1, op: 'pair', key, masterId: 'm', masterName: 'n' });
  assert.equal(ok.ok, true);
  assert.equal(ok.deviceId, id.deviceId);
  const bad = respondToPair(id, { v: 1, op: 'pair', key: generateDeviceKey(), masterId: 'm', masterName: 'n' });
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? '', /密钥错误/);
});

test('已配对设备表读写 upsert 往返（600 文件）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-pair-'));
  const file = join(dir, 'paired-devices.json');
  const key = generateDeviceKey();
  const device: PairedDevice = {
    deviceId: 'dev-1',
    name: 'laptop',
    address: '10.5.0.8',
    port: 34567,
    hub: '',
    capabilities: { os: 'linux x64', node: 'v22.23.2', memoryMb: 8192, dph: true, dphVersion: 'x' },
    keySha256: sha256Hex(key),
    pairedAt: nowIso(),
    lastSeen: nowIso(),
  };
  savePaired(file, [device]);
  assert.equal(readFileSync(file, 'utf8').includes('dev-1'), true);
  const loaded = loadPaired(file);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.keySha256, sha256Hex(key));
  const updated = upsertPaired(loaded, { ...device, port: 44444 });
  assert.equal(updated.length, 1);
  assert.equal(updated[0]!.port, 44444);
  assert.equal(findPaired(updated, 'dev-1')!.port, 44444);
  assert.equal(findPaired(updated, 'dev-2'), undefined);
});

test('loadPaired 缺失文件返回空表', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet7-pair-'));
  assert.deepEqual(loadPaired(join(dir, 'nope.json')), []);
});

test('markPaired 给已配对设备打标', () => {
  const key = generateDeviceKey();
  const paired: PairedDevice[] = [{
    deviceId: 'dev-1',
    name: 'laptop',
    address: '10.5.0.8',
    port: 34567,
    hub: '',
    capabilities: { os: 'linux x64', node: 'v22.23.2', memoryMb: 8192, dph: true, dphVersion: 'x' },
    keySha256: sha256Hex(key),
    pairedAt: nowIso(),
    lastSeen: nowIso(),
  }];
  const marked = markPaired([discovered('dev-1', 'laptop'), discovered('dev-2', 'pi')], paired);
  assert.equal(marked[0]!.paired, true);
  assert.equal(marked[1]!.paired, false);
});

test('touchLastSeen 只刷新在线设备', () => {
  const key = generateDeviceKey();
  const base = nowIso();
  const paired: PairedDevice[] = [{
    deviceId: 'dev-1', name: 'laptop', address: '10.5.0.8', port: 1, hub: '',
    capabilities: { os: 'x', node: 'x', memoryMb: 1, dph: true, dphVersion: 'x' },
    keySha256: sha256Hex(key), pairedAt: base, lastSeen: base,
  }];
  const next = touchLastSeen(paired, new Set(['dev-1']), '2026-08-18T00:00:00.000Z');
  assert.equal(next[0]!.lastSeen, '2026-08-18T00:00:00.000Z');
  const untouched = touchLastSeen(paired, new Set(), '2026-08-18T00:00:00.000Z');
  assert.equal(untouched[0]!.lastSeen, base);
});

test('parseHostPort 解析 host:port，非法返回 null', () => {
  assert.deepEqual(parseHostPort('10.5.0.8:34567'), { address: '10.5.0.8', port: 34567 });
  assert.equal(parseHostPort('10.5.0.8'), null);
  assert.equal(parseHostPort('10.5.0.8:99999'), null);
  assert.equal(parseHostPort(''), null);
});

test('resolveTarget 支持 host:port / deviceId / 设备名', () => {
  const list = [discovered('dev-1', 'laptop')];
  assert.deepEqual(resolveTarget('10.5.0.8:34567', list), { address: '10.5.0.8', port: 34567, deviceId: 'dev-1' });
  assert.deepEqual(resolveTarget('dev-1', list), { address: '10.5.0.8', port: 34567, deviceId: 'dev-1' });
  assert.deepEqual(resolveTarget('laptop', list), { address: '10.5.0.8', port: 34567, deviceId: 'dev-1' });
  const err = resolveTarget('nope', list);
  assert.ok('error' in err);
});

test('formatDiscoveredDevice 含设备名/id/地址/能力', () => {
  const line = formatDiscoveredDevice(discovered('dev-1', 'laptop'));
  assert.match(line, /laptop \(dev-1\)/);
  assert.match(line, /10\.5\.0\.8:34567/);
  assert.match(line, /os=linux x64/);
});

test('pairWithDevice 用真实 TCP 服务配对（密钥命中 + 不命中）', async () => {
  const { createPairServer } = await import('../../src/mdns/server.ts');
  const key = generateDeviceKey();
  const id = identity(key);
  const srv = await createPairServer(id);
  try {
    const good = await pairWithDevice(
      { address: '127.0.0.1', port: srv.port, key },
      { deviceId: 'master', name: 'm' },
    );
    assert.equal(good.ok, true);
    if (good.ok) {
      assert.equal(good.device.deviceId, id.deviceId);
      assert.equal(good.device.keySha256, sha256Hex(key));
    }
    const bad = await pairWithDevice(
      { address: '127.0.0.1', port: srv.port, key: generateDeviceKey() },
      { deviceId: 'master', name: 'm' },
    );
    assert.equal(bad.ok, false);
  } finally {
    await srv.close();
  }
});
