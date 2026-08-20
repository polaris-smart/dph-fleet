// mDNS（RFC 6762）编解码 + 广播/发现，纯 node:dgram 零 npm。
//
// - 编解码层：DNS 报文（header/question/answer/additional）的编码与解码，含名称压缩指针解析。
// - 广播层：MdnsResponder 启动即广播（unsolicited response）+ 响应查询 + 周期续播 + TTL=0 goodbye。
// - 发现层：discoverDevices 发 PTR 查询收集响应，把 PTR/SRV/TXT/A 拼成 DiscoveredDevice[]。
//
// 服务类型 `_dsh-devices._tcp.local`；实例名用设备 id（唯一），友好名/能力放 TXT。

import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

import { MDNS_ADDR, MDNS_PORT, SERVICE_TYPE } from './types.ts';
import type { DeviceCapabilities, DiscoveredDevice } from './types.ts';

/** DNS 记录类型（RFC 1035/2782）。 */
export const TYPE_A = 1;
export const TYPE_PTR = 12;
export const TYPE_TXT = 16;
export const TYPE_SRV = 33;
export const TYPE_ANY = 255;
/** DNS 类 IN。 */
export const CLASS_IN = 1;

/** 响应标志：QR(1) + AA(1) → 0x8400；查询 0x0000。 */
const FLAG_RESPONSE = 0x8400;

const LABEL_SAFE = /[^A-Za-z0-9-]/g;

/** 把友好名净化为单标签（非 [A-Za-z0-9-] 折叠为 '-'）。 */
export function sanitizeLabel(name: string): string {
  const clean = name.trim().replace(LABEL_SAFE, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean.length > 0 ? clean : 'device';
}

/** 由设备 id 推导实例名与主机名。 */
export function instanceNameOf(deviceId: string): string {
  return `${sanitizeLabel(deviceId)}.${SERVICE_TYPE}`;
}
export function hostNameOf(deviceId: string): string {
  return `${sanitizeLabel(deviceId)}.local`;
}

/** 写大端 16 位。 */
function writeU16(buf: Buffer, off: number, v: number): void {
  buf.writeUInt16BE(v & 0xffff, off);
}
/** 写大端 32 位。 */
function writeU32(buf: Buffer, off: number, v: number): void {
  buf.writeUInt32BE(v >>> 0, off);
}
/** 读大端 16 位。 */
function readU16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}
/** 读大端 32 位。 */
function readU32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

/** 编码点分名称（无压缩；合法标签即可）。 */
export function encodeName(name: string): Buffer {
  const parts = name.split('.').filter((p) => p.length > 0);
  const bufs = parts.map((p) => {
    const b = Buffer.from(p, 'utf8');
    if (b.length > 63) throw new Error(`DNS 标签过长：${p}`);
    return Buffer.concat([Buffer.from([b.length]), b]);
  });
  return Buffer.concat([...bufs, Buffer.from([0])]);
}

/** 解码名称，支持压缩指针；返回名称与「本名称在原始流中的结束偏移」。 */
export function decodeName(buf: Buffer, off: number): { name: string; next: number } {
  const labels: string[] = [];
  let pos = off;
  let next = off;
  let jumped = false;
  // 防环：指针跳转次数上限（名称深度）。
  for (let hops = 0; hops < 128; hops += 1) {
    if (pos >= buf.length) throw new Error('DNS 名称越界');
    const len = buf[pos]!;
    if (len === 0) {
      pos += 1;
      if (!jumped) next = pos;
      return { name: labels.join('.'), next };
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) throw new Error('DNS 压缩指针越界');
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1]!;
      if (!jumped) next = pos + 2;
      jumped = true;
      pos = ptr;
      continue;
    }
    if ((len & 0xc0) !== 0) throw new Error('DNS 标签类型不支持');
    pos += 1;
    if (pos + len > buf.length) throw new Error('DNS 标签越界');
    labels.push(buf.toString('utf8', pos, pos + len));
    pos += len;
  }
  throw new Error('DNS 名称压缩指针成环');
}

/** 编码 TXT RDATA：若干 `<len><bytes>` 串。 */
export function encodeTxtData(kv: Readonly<Record<string, string>>): Buffer {
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(kv)) {
    const s = Buffer.from(`${k}=${v}`, 'utf8');
    if (s.length > 255) throw new Error(`TXT 条目过长：${k}`);
    parts.push(Buffer.from([s.length]), s);
  }
  return Buffer.concat(parts);
}

/** 解码 TXT RDATA 为 kv 映射。 */
export function decodeTxtData(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let off = 0;
  while (off < data.length) {
    const len = data[off]!;
    off += 1;
    if (off + len > data.length) break;
    const s = data.toString('utf8', off, off + len);
    off += len;
    const eq = s.indexOf('=');
    if (eq >= 0) out[s.slice(0, eq)] = s.slice(eq + 1);
  }
  return out;
}

/** IPv4 字符串 → 4 字节。 */
export function encodeIpv4(ip: string): Buffer {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`非法 IPv4：${ip}`);
  }
  return Buffer.from(parts as number[]);
}

/** 4 字节 → IPv4 字符串。 */
export function decodeIpv4(data: Buffer): string {
  return `${data[0]}.${data[1]}.${data[2]}.${data[3]}`;
}

/** SRV RDATA：priority(0) weight(0) port + target 名称。 */
export function encodeSrvData(port: number, target: string): Buffer {
  const head = Buffer.alloc(6);
  writeU16(head, 0, 0);
  writeU16(head, 2, 0);
  writeU16(head, 4, port);
  return Buffer.concat([head, encodeName(target)]);
}

/** PTR RDATA：目标名称。 */
export function encodePtrData(target: string): Buffer {
  return encodeName(target);
}

/** A RDATA：4 字节 IPv4。 */
export function encodeAData(ip: string): Buffer {
  return encodeIpv4(ip);
}

/** 一条资源记录（RDATA 原始字节）。 */
export interface DnsRecord {
  name: string;
  type: number;
  classCode: number;
  ttl: number;
  data: Buffer;
}

/** 一条问题。 */
export interface DnsQuestion {
  name: string;
  type: number;
  classCode: number;
}

/** 编码一条资源记录。 */
export function encodeRR(rec: DnsRecord): Buffer {
  const name = encodeName(rec.name);
  const head = Buffer.alloc(10);
  writeU16(head, 0, rec.type);
  writeU16(head, 2, rec.classCode);
  writeU32(head, 4, rec.ttl);
  writeU16(head, 8, rec.data.length);
  return Buffer.concat([name, head, rec.data]);
}

/** 构建 DNS 报文（mDNS ID 恒 0）。 */
export function buildMessage(opts: {
  isResponse: boolean;
  questions?: DnsQuestion[];
  answers?: DnsRecord[];
  additionals?: DnsRecord[];
}): Buffer {
  const questions = opts.questions ?? [];
  const answers = opts.answers ?? [];
  const additionals = opts.additionals ?? [];
  const header = Buffer.alloc(12);
  writeU16(header, 0, 0); // ID = 0
  writeU16(header, 2, opts.isResponse ? FLAG_RESPONSE : 0);
  writeU16(header, 4, questions.length);
  writeU16(header, 6, answers.length);
  writeU16(header, 8, 0); // NSCOUNT
  writeU16(header, 10, additionals.length);
  const parts: Buffer[] = [header];
  for (const q of questions) {
    parts.push(encodeName(q.name), u16buf(q.type), u16buf(q.classCode));
  }
  for (const r of answers) parts.push(encodeRR(r));
  for (const r of additionals) parts.push(encodeRR(r));
  return Buffer.concat(parts);
}

/** 小工具：2 字节大端缓冲。 */
function u16buf(v: number): Buffer {
  const b = Buffer.alloc(2);
  writeU16(b, 0, v);
  return b;
}

/** 解析后的报文。 */
export interface ParsedMessage {
  id: number;
  isResponse: boolean;
  questions: DnsQuestion[];
  answers: DnsRecord[];
  additionals: DnsRecord[];
}

/** 解析一条资源记录的 RDATA（name 已解出）。 */
function parseRR(buf: Buffer, off: number): { rec: DnsRecord; next: number } {
  const nameResult = decodeName(buf, off);
  let pos = nameResult.next;
  const type = readU16(buf, pos);
  const classCode = readU16(buf, pos + 2);
  const ttl = readU32(buf, pos + 4);
  const rdlen = readU16(buf, pos + 8);
  pos += 10;
  if (pos + rdlen > buf.length) throw new Error('DNS RDATA 越界');
  const data = buf.subarray(pos, pos + rdlen);
  pos += rdlen;
  return { rec: { name: nameResult.name, type, classCode, ttl, data: Buffer.from(data) }, next: pos };
}

/** 解析 DNS 报文。非法报文抛错（发现侧捕获跳过）。 */
export function parseMessage(buf: Buffer): ParsedMessage {
  if (buf.length < 12) throw new Error('DNS 报文过短');
  const id = readU16(buf, 0);
  const flags = readU16(buf, 2);
  const qd = readU16(buf, 4);
  const an = readU16(buf, 6);
  const ns = readU16(buf, 8);
  const ar = readU16(buf, 10);
  const isResponse = (flags & 0x8000) !== 0;
  let pos = 12;
  const questions: DnsQuestion[] = [];
  for (let i = 0; i < qd; i += 1) {
    const nameResult = decodeName(buf, pos);
    pos = nameResult.next;
    const type = readU16(buf, pos);
    const classCode = readU16(buf, pos + 2);
    pos += 4;
    questions.push({ name: nameResult.name, type, classCode });
  }
  const answers: DnsRecord[] = [];
  for (let i = 0; i < an; i += 1) {
    const r = parseRR(buf, pos);
    answers.push(r.rec);
    pos = r.next;
  }
  for (let i = 0; i < ns; i += 1) {
    const r = parseRR(buf, pos);
    pos = r.next;
  }
  const additionals: DnsRecord[] = [];
  for (let i = 0; i < ar; i += 1) {
    const r = parseRR(buf, pos);
    additionals.push(r.rec);
    pos = r.next;
  }
  return { id, isResponse, questions, answers, additionals };
}

/** 广播服务信息（一条广播报文的素材）。 */
export interface ServiceInfo {
  deviceId: string;
  name: string;
  port: number;
  address: string;
  hub: string;
  capabilities: DeviceCapabilities;
  ttl?: number;
}

/** 能力 → TXT kv。 */
export function capabilitiesToTxt(cap: DeviceCapabilities): Record<string, string> {
  return {
    os: cap.os,
    node: cap.node,
    mem: String(cap.memoryMb),
    dph: cap.dph ? cap.dphVersion : '0',
  };
}

/** TXT kv → 能力（缺省兜底）。 */
export function txtToCapabilities(txt: Record<string, string>): DeviceCapabilities {
  return {
    os: txt.os ?? 'unknown',
    node: txt.node ?? 'unknown',
    memoryMb: txt.mem ? Number(txt.mem) || 0 : 0,
    dph: (txt.dph ?? '0') !== '0',
    dphVersion: txt.dph ?? 'unknown',
  };
}

/** 构造服务 TXT kv 全量（含 id/name/hub）。 */
export function serviceTxt(info: ServiceInfo): Record<string, string> {
  const txt: Record<string, string> = {
    id: info.deviceId,
    name: info.name,
    ...capabilitiesToTxt(info.capabilities),
  };
  if (info.hub.trim().length > 0) txt.hub = info.hub.trim();
  return txt;
}

/** 构建一条广播（响应）报文：answer=PTR，additional=SRV+TXT+A。 */
export function buildAnnounceMessage(info: ServiceInfo): Buffer {
  const ttl = info.ttl ?? 120;
  const instance = instanceNameOf(info.deviceId);
  const host = hostNameOf(info.deviceId);
  return buildMessage({
    isResponse: true,
    answers: [
      { name: SERVICE_TYPE, type: TYPE_PTR, classCode: CLASS_IN, ttl, data: encodePtrData(instance) },
    ],
    additionals: [
      { name: instance, type: TYPE_SRV, classCode: CLASS_IN, ttl, data: encodeSrvData(info.port, host) },
      { name: instance, type: TYPE_TXT, classCode: CLASS_IN, ttl, data: encodeTxtData(serviceTxt(info)) },
      { name: host, type: TYPE_A, classCode: CLASS_IN, ttl, data: encodeAData(info.address) },
    ],
  });
}

/** 构建 PTR 查询报文。 */
export function buildBrowseQuery(): Buffer {
  return buildMessage({
    isResponse: false,
    questions: [{ name: SERVICE_TYPE, type: TYPE_PTR, classCode: CLASS_IN }],
  });
}

/** 本机所有非 internal IPv4 地址。 */
export function localIpv4Addrs(): string[] {
  const out: string[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

/** 本机广播用 IPv4（首个非 internal；无则回环）。 */
export function localIpv4(): string {
  return localIpv4Addrs()[0] ?? '127.0.0.1';
}

/** 创建并绑定 mDNS socket（reuseAddr 允许多进程同端口收组播），加入组播组。 */
export function createMdnsSocket(): Promise<dgram.Socket> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.once('error', reject);
    socket.bind(MDNS_PORT, () => {
      socket.removeListener('error', reject);
      socket.on('error', () => {
        /* 组播收发错误不炸进程：mDNS 尽力而为 */
      });
      try {
        socket.setMulticastLoopback(true);
        socket.setMulticastTTL(255);
      } catch {
        /* 平台不支持时忽略 */
      }
      const addrs = localIpv4Addrs();
      if (addrs.length > 0) {
        for (const a of addrs) {
          try {
            socket.addMembership(MDNS_ADDR, a);
          } catch {
            /* 某网卡加入失败不影响其它 */
          }
        }
      } else {
        try {
          socket.addMembership(MDNS_ADDR);
        } catch {
          /* 无网卡场景忽略 */
        }
      }
      resolve(socket);
    });
  });
}

/** mDNS 响应方：启动广播 + 响应查询 + 周期续播。 */
export class MdnsResponder {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private readonly info: ServiceInfo;
  private readonly announceIntervalMs: number;

  constructor(info: ServiceInfo, announceIntervalMs = 10_000) {
    this.info = info;
    this.announceIntervalMs = announceIntervalMs;
  }

  async start(): Promise<void> {
    this.socket = await createMdnsSocket();
    this.socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));
    this.announce();
    this.timer = setInterval(() => this.announce(), this.announceIntervalMs);
    this.timer.unref?.();
  }

  /** 发送广播（响应）报文到组播组。 */
  announce(): void {
    if (!this.socket || this.closed) return;
    const msg = buildAnnounceMessage(this.info);
    this.socket.send(msg, MDNS_PORT, MDNS_ADDR);
  }

  /** 响应匹配本服务的查询。 */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (!this.socket || this.closed) return;
    let parsed: ParsedMessage;
    try {
      parsed = parseMessage(msg);
    } catch {
      return; // 非法报文忽略
    }
    if (parsed.isResponse) return; // 只响应查询
    const instance = instanceNameOf(this.info.deviceId);
    const host = hostNameOf(this.info.deviceId);
    const wants = parsed.questions.some((q) => {
      const n = q.name.toLowerCase();
      return n === SERVICE_TYPE || n === instance.toLowerCase() || n === host.toLowerCase();
    });
    if (!wants) return;
    // 单播 + 组播都发一遍，兼容不支持组播回环的环境；重复报文幂等无害。
    this.socket.send(buildAnnounceMessage(this.info), rinfo.port, rinfo.address);
    this.socket.send(buildAnnounceMessage(this.info), MDNS_PORT, MDNS_ADDR);
  }

  /** TTL=0 goodbye（优雅下线）。 */
  goodbye(): void {
    if (!this.socket || this.closed) return;
    const info: ServiceInfo = { ...this.info, ttl: 0 };
    this.socket.send(buildAnnounceMessage(info), MDNS_PORT, MDNS_ADDR);
  }

  close(): void {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.socket) {
      try {
        this.goodbye();
      } catch {
        /* ignore */
      }
      this.socket.close();
      this.socket = null;
    }
  }
}

/** 从一条响应报文里提取服务记录（按实例名归并）。 */
interface ServiceRecordSet {
  instance: string;
  port: number;
  target: string;
  txt: Record<string, string>;
  ip: string;
}

function extractServiceRecords(msg: ParsedMessage, sourceAddr: string): ServiceRecordSet[] {
  const byInstance = new Map<string, ServiceRecordSet>();
  const ptrTargets: string[] = [];
  for (const rec of [...msg.answers, ...msg.additionals]) {
    if (rec.type === TYPE_PTR) {
      try {
        ptrTargets.push(decodeName(rec.data, 0).name.toLowerCase());
      } catch {
        /* skip */
      }
    }
  }
  // 先占位 PTR 指向的实例（保证返回包含仅广播 PTR 的应答方）。
  for (const inst of ptrTargets) {
    if (!byInstance.has(inst)) {
      byInstance.set(inst, { instance: inst, port: 0, target: '', txt: {}, ip: sourceAddr });
    }
  }
  for (const rec of [...msg.answers, ...msg.additionals]) {
    const name = rec.name.toLowerCase();
    if (rec.type === TYPE_SRV) {
      const data = rec.data;
      const port = readU16(data, 4);
      let target = '';
      try {
        target = decodeName(data, 6).name.toLowerCase();
      } catch {
        /* skip */
      }
      const existing = byInstance.get(name);
      if (existing) {
        existing.port = port;
        existing.target = target;
      } else {
        byInstance.set(name, { instance: name, port, target, txt: {}, ip: sourceAddr });
      }
    } else if (rec.type === TYPE_TXT) {
      let txt: Record<string, string> = {};
      try {
        txt = decodeTxtData(rec.data);
      } catch {
        /* skip */
      }
      const existing = byInstance.get(name);
      if (existing) existing.txt = { ...existing.txt, ...txt };
      else byInstance.set(name, { instance: name, port: 0, target: '', txt, ip: sourceAddr });
    }
  }
  // A 记录按主机名归并到对应实例。
  const aByHost = new Map<string, string>();
  for (const rec of [...msg.answers, ...msg.additionals]) {
    if (rec.type === TYPE_A) {
      try {
        aByHost.set(rec.name.toLowerCase(), decodeIpv4(rec.data));
      } catch {
        /* skip */
      }
    }
  }
  for (const set of byInstance.values()) {
    if (set.target && aByHost.has(set.target)) set.ip = aByHost.get(set.target)!;
  }
  return [...byInstance.values()];
}

/** 发现同网设备：发查询收集 `timeoutMs`，按实例去重返回。 */
export async function discoverDevices(opts: {
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}): Promise<DiscoveredDevice[]> {
  const timeoutMs = opts.timeoutMs ?? 1500;
  const socket = await createMdnsSocket();
  const found = new Map<string, ServiceRecordSet>();
  const onMessage = (msg: Buffer, rinfo: dgram.RemoteInfo): void => {
    let parsed: ParsedMessage;
    try {
      parsed = parseMessage(msg);
    } catch {
      return;
    }
    if (!parsed.isResponse) return;
    for (const set of extractServiceRecords(parsed, rinfo.address)) {
      const existing = found.get(set.instance);
      if (!existing || existing.port === 0) found.set(set.instance, set);
    }
  };
  socket.on('message', onMessage);
  const cleanup = (): void => {
    socket.close();
  };
  return await new Promise<DiscoveredDevice[]>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(recordsToDevices([...found.values()]));
    }, timeoutMs);
    opts.signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        cleanup();
        resolve(recordsToDevices([...found.values()]));
      },
      { once: true },
    );
    socket.send(buildBrowseQuery(), MDNS_PORT, MDNS_ADDR, () => {
      /* 发送完成 */
    });
  });
}

/** 把服务记录集转成 DiscoveredDevice[]（过滤无端口/无 id 的残缺记录）。 */
function recordsToDevices(records: ServiceRecordSet[]): DiscoveredDevice[] {
  const out: DiscoveredDevice[] = [];
  for (const r of records) {
    const id = r.txt.id ?? '';
    const name = r.txt.name ?? '';
    if (id.length === 0 || r.port === 0 || r.ip.length === 0) continue;
    out.push({
      deviceId: id,
      name,
      address: r.ip,
      port: r.port,
      hub: r.txt.hub ?? '',
      capabilities: txtToCapabilities(r.txt),
      paired: false,
    });
  }
  out.sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  return out;
}
