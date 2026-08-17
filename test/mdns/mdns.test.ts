// mDNS 编解码单测：名称编解码（含压缩指针）、TXT/SRV/A、报文构建/解析往返、广播报文内容。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeName,
  decodeName,
  encodeTxtData,
  decodeTxtData,
  encodeIpv4,
  decodeIpv4,
  encodeSrvData,
  buildMessage,
  parseMessage,
  buildAnnounceMessage,
  buildBrowseQuery,
  capabilitiesToTxt,
  txtToCapabilities,
  serviceTxt,
  instanceNameOf,
  hostNameOf,
  sanitizeLabel,
  TYPE_A,
  TYPE_PTR,
  TYPE_TXT,
  TYPE_SRV,
  CLASS_IN,
} from '../../src/mdns/mdns.ts';
import type { ServiceInfo } from '../../src/mdns/mdns.ts';
import { SERVICE_TYPE } from '../../src/mdns/types.ts';
import type { DeviceCapabilities } from '../../src/mdns/types.ts';

const cap: DeviceCapabilities = {
  os: 'linux x64',
  node: 'v22.23.2',
  memoryMb: 8192,
  dph: true,
  dphVersion: 'dsh-fleet-lan@0.1.0',
};

function info(overrides: Partial<ServiceInfo> = {}): ServiceInfo {
  return {
    deviceId: 'dev-abcd1234ef5678',
    name: 'MacBook Pro',
    port: 34567,
    address: '10.5.0.8',
    hub: '',
    capabilities: cap,
    ...overrides,
  };
}

test('encodeName/decodeName 往返一致', () => {
  const name = '_nofox-fleet._tcp.local';
  const buf = encodeName(name);
  const r = decodeName(buf, 0);
  assert.equal(r.name, name);
  assert.equal(r.next, buf.length);
});

test('decodeName 解析压缩指针', () => {
  // offset 0: label "a" + 指针 → offset 12；offset 12: label "b" + 结束。
  const buf = Buffer.from([1, 97, 0xc0, 12, 0, 0, 0, 0, 0, 0, 0, 0, 1, 98, 0]);
  const r = decodeName(buf, 0);
  assert.equal(r.name, 'a.b');
  assert.equal(r.next, 4);
});

test('sanitizeLabel 把非法字符折叠为 -', () => {
  assert.equal(sanitizeLabel('MacBook Pro'), 'MacBook-Pro');
  assert.equal(sanitizeLabel('  树莓派 4 '), '4');
  assert.equal(sanitizeLabel('a..b'), 'a-b');
  assert.equal(sanitizeLabel('!!!'), 'device');
});

test('instanceNameOf/hostNameOf 由设备 id 推导', () => {
  assert.equal(instanceNameOf('dev-abcd1234ef5678'), 'dev-abcd1234ef5678._nofox-fleet._tcp.local');
  assert.equal(hostNameOf('dev-abcd1234ef5678'), 'dev-abcd1234ef5678.local');
});

test('TXT 编解码往返一致', () => {
  const kv = { id: 'dev-1', name: 'MacBook Pro', os: 'linux x64', mem: '8192' };
  const decoded = decodeTxtData(encodeTxtData(kv));
  assert.deepEqual(decoded, kv);
});

test('IPv4 编解码往返一致', () => {
  assert.equal(decodeIpv4(encodeIpv4('10.5.0.8')), '10.5.0.8');
  assert.equal(decodeIpv4(encodeIpv4('192.168.1.1')), '192.168.1.1');
});

test('SRV 数据编解码含端口与目标', () => {
  const data = encodeSrvData(34567, 'dev-1.local');
  assert.equal(data.readUInt16BE(4), 34567);
  const target = decodeName(data, 6);
  assert.equal(target.name, 'dev-1.local');
});

test('buildMessage/parseMessage 往返（查询）', () => {
  const msg = buildBrowseQuery();
  const parsed = parseMessage(msg);
  assert.equal(parsed.isResponse, false);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0]!.name, SERVICE_TYPE);
  assert.equal(parsed.questions[0]!.type, TYPE_PTR);
});

test('广播报文含 PTR + SRV + TXT + A', () => {
  const msg = buildAnnounceMessage(info({ hub: 'http://10.5.0.8:8790' }));
  const parsed = parseMessage(msg);
  assert.equal(parsed.isResponse, true);
  const ptr = parsed.answers.find((r) => r.type === TYPE_PTR);
  assert.ok(ptr);
  assert.equal(ptr!.name, SERVICE_TYPE);
  assert.equal(decodeName(ptr!.data, 0).name, instanceNameOf('dev-abcd1234ef5678'));
  const srv = parsed.additionals.find((r) => r.type === TYPE_SRV);
  assert.ok(srv);
  assert.equal(srv!.data.readUInt16BE(4), 34567);
  const txt = parsed.additionals.find((r) => r.type === TYPE_TXT);
  assert.ok(txt);
  const kv = decodeTxtData(txt!.data);
  assert.equal(kv.id, 'dev-abcd1234ef5678');
  assert.equal(kv.name, 'MacBook Pro');
  assert.equal(kv.hub, 'http://10.5.0.8:8790');
  const a = parsed.additionals.find((r) => r.type === TYPE_A && r.classCode === CLASS_IN);
  assert.ok(a);
  assert.equal(decodeIpv4(a!.data), '10.5.0.8');
});

test('serviceTxt 含 id/name/能力，hub 空时不写', () => {
  const kv = serviceTxt(info());
  assert.equal(kv.id, 'dev-abcd1234ef5678');
  assert.equal(kv.name, 'MacBook Pro');
  assert.equal(kv.hub, undefined);
  assert.equal(kv.os, 'linux x64');
});

test('capabilitiesToTxt / txtToCapabilities 往返', () => {
  const kv = capabilitiesToTxt(cap);
  assert.deepEqual(txtToCapabilities(kv), cap);
});
