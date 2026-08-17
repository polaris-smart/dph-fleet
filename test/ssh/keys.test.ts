// 密钥管理单测：真实 ssh-keygen 生成 ed25519 + 0600 权限 + 公钥读取 + 权限告警。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateSshKey, readPublicKey, sshKeyPermWarning, keyFileExists, DEFAULT_KEY_COMMENT } from '../../src/ssh/keys.ts';

test('generateSshKey：生成 ed25519 私钥(0600)与公钥(0644)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-key-'));
  const keyPath = join(dir, 'id_ed25519');
  const pair = generateSshKey(keyPath, 'test-device');
  assert.equal(pair.privateKey, keyPath);
  assert.equal(pair.publicKey, keyPath + '.pub');
  assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  assert.equal(statSync(keyPath + '.pub').mode & 0o777, 0o644);
  assert.equal(keyFileExists(keyPath), true);
  assert.equal(sshKeyPermWarning(keyPath), '');
});

test('readPublicKey：读回公钥含注释', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-key-'));
  const keyPath = join(dir, 'id_ed25519');
  generateSshKey(keyPath, 'test-device');
  const pub = readPublicKey(keyPath);
  assert.match(pub, /^ssh-ed25519 /);
  assert.match(pub, /test-device$/);
});

test('readPublicKey：文件不存在返回空串', () => {
  assert.equal(readPublicKey('/no/such/key'), '');
  assert.equal(keyFileExists('/no/such/key'), false);
});

test('sshKeyPermWarning：权限过宽告警', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-ssh-key-'));
  const keyPath = join(dir, 'id_ed25519');
  generateSshKey(keyPath, DEFAULT_KEY_COMMENT);
  chmodSync(keyPath, 0o644);
  assert.match(sshKeyPermWarning(keyPath), /权限过宽/);
});

test('默认注释常量', () => {
  assert.equal(DEFAULT_KEY_COMMENT, 'nofox-fleet');
});
