// 共享类型。跨边界 id（deviceId/…）沿用 M1/M2 约定用描述性字符串别名——
// 骨架单在 UDP/TCP/文件解析边界不引入品牌化转型摩擦（与 M1 REPORT §5 口径一致）。

/** mDNS 服务类型（RFC 6762 实例名后缀）。 */
export const SERVICE_TYPE = '_dsh-devices._tcp.local';

/** mDNS 组播地址与端口（RFC 6762）。 */
export const MDNS_ADDR = '224.0.0.251';
export const MDNS_PORT = 5353;

/** 设备能力自报（与 M2 DeviceCapabilities 对齐）。 */
export interface DeviceCapabilities {
  /** 平台 + 架构，如 "linux x64"。 */
  os: string;
  /** process.versions.node。 */
  node: string;
  /** os.totalmem() 向下取整的 MB 数。 */
  memoryMb: number;
  /** 是否运行在 dph 上。 */
  dph: boolean;
  /** 插件自身版本（作为 dph 版本自报）。 */
  dphVersion: string;
}

/** 发现到的设备（fleet_discover 返回单元）。 */
export interface DiscoveredDevice {
  /** 稳定设备 id，如 dev-<16hex>。 */
  deviceId: string;
  /** 设备友好名（mDNS 实例名）。 */
  name: string;
  /** IPv4 地址。 */
  address: string;
  /** 配对 TCP 端口。 */
  port: number;
  /** hub 地址（可空：纯局域网模式无 hub）。 */
  hub: string;
  /** 能力自报。 */
  capabilities: DeviceCapabilities;
  /** 是否已在本主控「已配对设备表」中。 */
  paired: boolean;
}

/** 已配对设备表单条（master 侧 600 文件）。 */
export interface PairedDevice {
  deviceId: string;
  name: string;
  address: string;
  port: number;
  hub: string;
  capabilities: DeviceCapabilities;
  /** 配对所用密钥的 SHA-256 hex（不存明文，与 M1 tokens.ts 口径一致）。 */
  keySha256: string;
  /** 配对时间（ISO）。 */
  pairedAt: string;
  /** 最近一次在线发现时间（ISO）。 */
  lastSeen: string;
}

/** 设备身份（设备侧 fleet-lan.json 600 文件内容）。 */
export interface DeviceIdentity {
  /** 稳定设备 id。 */
  deviceId: string;
  /** 设备友好名。 */
  name: string;
  /** 设备密钥 fleet-d-<64hex>（secret，仅本机持有）。 */
  key: string;
  /** 配对 TCP 端口（0 = serve 时自动分配）。 */
  port: number;
  /** hub 地址（可空）。 */
  hub: string;
  capabilities: DeviceCapabilities;
}
