// 合一联动单测：主控密钥生成 + 公钥授权（authorized_keys）+ TCP 探测 + 写 SSH 注册表。

import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { masterSshKey, probeTcp, linkPairedToSsh, MASTER_KEY_ID } from '../src/link.ts';
import type { LinkContext } from '../src/link.ts';
import { authorizeSshPubKey, isSafeSshPubKey } from '../src/mdns/server.ts';
import type { PairedDevice } from '../src/mdns/types.ts';

function pairedDevice(over: Partial<PairedDevice> = {}): PairedDevice {
  return {
    deviceId: 'dev-1234567890abcdef',
    name: 'raspberrypi',
    address: '127.0.0.1',
    port: 34567,
    hub: '',
    capabilities: { os: 'linux x64', node: 'v22.23.2', memoryMb: 8192, dph: true, dphVersion: 'dph-fleet@0.2.0' },
    keySha256: 'x'.repeat(64),
    pairedAt: '2026-08-18T00:00:00.000Z',
    lastSeen: '2026-08-18T00:00:00.000Z',
    ...over,
  };
}

function ctx(over: Partial<LinkContext> = {}): LinkContext {
  return { fleetHome: '', user: 'ubuntu', sshPort: 22, probeSsh: false, ...over };
}

/** 起一个 127.0.0.1 临时监听，返回端口，然后关闭并返回端口（已释放）。 */
async function closedPort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const addr = srv.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
}

test('masterSshKey 生成 ed25519 私钥(0600) + 返回公钥，幂等复用', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-link-'));
  const m = masterSshKey(ctx({ fleetHome: dir }));
  assert.match(m.publicKey, /^ssh-ed25519 /);
  assert.equal(m.keyPath, join(dir, 'ssh-keys', MASTER_KEY_ID));
  assert.equal(statSync(m.keyPath).mode & 0o777, 0o600);
  const again = masterSshKey(ctx({ fleetHome: dir }));
  assert.equal(again.keyPath, m.keyPath);
  assert.equal(again.publicKey, m.publicKey);
});

test('isSafeSshPubKey 接受合法单行公钥、拒绝换行注入', () => {
  assert.equal(isSafeSshPubKey('ssh-ed25519 AAAA test'), true);
  assert.equal(isSafeSshPubKey('bad\ninjected'), false);
  assert.equal(isSafeSshPubKey('ssh-ed25519 AAAA test\n'), false);
  assert.equal(isSafeSshPubKey(''), false);
});

test('authorizeSshPubKey 写 600 authorized_keys 且幂等去重', () => {
  const home = mkdtempSync(join(tmpdir(), 'fleet-auth-'));
  const pub = 'ssh-ed25519 AAAAzzzz test-comment';
  assert.equal(authorizeSshPubKey(pub, home), true);
  const auth = join(home, '.ssh', 'authorized_keys');
  assert.equal(readFileSync(auth, 'utf8').trim(), pub);
  assert.equal(statSync(auth).mode & 0o777, 0o600);
  assert.equal(authorizeSshPubKey(pub, home), true);
  assert.equal(readFileSync(auth, 'utf8').split('\n').filter(Boolean).length, 1);
  assert.equal(authorizeSshPubKey('ssh-ed25519 EVIL\nssh-ed25519 X', home), false);
});

test('probeTcp 可达返回 true / 不可达返回 false', async () => {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const addr = srv.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  try {
    assert.equal(await probeTcp('127.0.0.1', port), true);
  } finally {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  }
  const closed = await closedPort();
  assert.equal(await probeTcp('127.0.0.1', closed, 300), false);
});

test('linkPairedToSsh 写 SSH 注册表（host/port/user/keyPath，0600）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-link-'));
  const r = await linkPairedToSsh(pairedDevice(), { keyPath: '/k' }, ctx({ fleetHome: dir }));
  assert.equal(r.linked, true);
  const file = join(dir, 'ssh-devices.json');
  assert.equal(existsSync(file), true);
  const reg = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
  assert.equal(reg.length, 1);
  assert.equal(reg[0]!.deviceId, 'dev-1234567890abcdef');
  assert.equal(reg[0]!.host, '127.0.0.1');
  assert.equal(reg[0]!.port, 22);
  assert.equal(reg[0]!.user, 'ubuntu');
  assert.equal(reg[0]!.keyPath, '/k');
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('linkPairedToSsh probe 不可达时不写注册表（降级为纯 mDNS 身份）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-link-'));
  const closed = await closedPort();
  const r = await linkPairedToSsh(
    pairedDevice(),
    { keyPath: '/k' },
    ctx({ fleetHome: dir, sshPort: closed, probeSsh: true }),
  );
  assert.equal(r.linked, false);
  assert.match(r.reason ?? '', /未探测到/);
  assert.equal(existsSync(join(dir, 'ssh-devices.json')), false);
});
