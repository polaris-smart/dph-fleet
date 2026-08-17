// 设备密钥单测：格式、生成唯一性、常数时间校验、id 生成、sha256。

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateDeviceKey,
  isDeviceKey,
  verifyDeviceKey,
  constantTimeEqualHex,
  sha256Hex,
  generateDeviceId,
  DEVICE_KEY_PREFIX,
  DEVICE_KEY_LENGTH,
} from '../../src/mdns/key.ts';

test('生成密钥以 fleet-d- 开头且为 64 hex', () => {
  const key = generateDeviceKey();
  assert.ok(key.startsWith(DEVICE_KEY_PREFIX));
  assert.equal(key.length, DEVICE_KEY_LENGTH);
  assert.match(key.slice(DEVICE_KEY_PREFIX.length), /^[0-9a-f]{64}$/);
});

test('每次生成密钥都不同（随机唯一性）', () => {
  const a = generateDeviceKey();
  const b = generateDeviceKey();
  assert.notEqual(a, b);
});

test('isDeviceKey 形状校验', () => {
  assert.ok(isDeviceKey(generateDeviceKey()));
  assert.equal(isDeviceKey('fleet-d-short'), false);
  assert.equal(isDeviceKey('fleet-u-' + 'a'.repeat(64)), false);
  assert.equal(isDeviceKey('fleet-d-' + 'G'.repeat(64)), false);
  assert.equal(isDeviceKey(''), false);
});

test('verifyDeviceKey 命中 / 不命中 / 形状非法', () => {
  const stored = generateDeviceKey();
  assert.equal(verifyDeviceKey(stored, stored), true);
  assert.equal(verifyDeviceKey(generateDeviceKey(), stored), false);
  assert.equal(verifyDeviceKey('bad', stored), false);
  assert.equal(verifyDeviceKey(stored, 'bad'), false);
});

test('constantTimeEqualHex 长度不等直接 false', () => {
  assert.equal(constantTimeEqualHex('abc', 'abc'), true);
  assert.equal(constantTimeEqualHex('abc', 'abd'), false);
  assert.equal(constantTimeEqualHex('abc', 'abcd'), false);
});

test('sha256Hex 稳定输出 64 hex', () => {
  const h = sha256Hex('fleet-d-x');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, sha256Hex('fleet-d-x'));
});

test('generateDeviceId 以 dev- 开头且唯一', () => {
  const a = generateDeviceId();
  const b = generateDeviceId();
  assert.match(a, /^dev-[0-9a-f]{16}$/);
  assert.notEqual(a, b);
});
