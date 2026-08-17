// dph-fleet v0.2.0 合并配置：modules 开关 + mDNS 模块配置 + SSH 模块配置。
// 一个插件装下 mDNS（同网发现+密钥配对）与 SSH（跨网直连）两模块，按 modules 开关启用。

import z from '@deepseek-ai/schemastery'

/** 模块开关取值。 */
export type Modules = 'mdns' | 'ssh' | 'both'

/** 插件 Config（cordis.yml / cordis.patch.yml config 字段）。 */
export interface Config {
  /** 启用哪几个模块：mdns（仅局域网）/ ssh（仅 SSH 直连）/ both（默认，两模块全开）。 */
  modules: Modules;
  /** mDNS 模块：本机设备友好名（空 = 主机名）。 */
  deviceName: string;
  /** mDNS 模块：hub 地址（v0.2 弃用 hub，字段保留兼容，空 = 纯局域网）。 */
  hub: string;
  /** SSH 模块：主控家目录覆盖（空 = 走 FLEET_HOME 或 ~/.fleet）。 */
  fleetHome: string;
  /** 联动：mDNS 配对成功后写入 SSH 注册表所用的登录用户（空 = 当前用户）。 */
  sshUser: string;
  /** 联动：SSH 端口（默认 22）。 */
  sshPort: number;
  /** 联动：配对后是否先探测 SSH 端口可达再写注册表（默认 true）。 */
  probeSsh: boolean;
}

/** Schemastery 配置 schema：默认 modules=both，其余按各自默认值。 */
export const Config: z<Config> = z.object({
  modules: z.union([z.const('mdns'), z.const('ssh'), z.const('both')]).default('both'),
  deviceName: z.string().default(''),
  hub: z.string().default(''),
  fleetHome: z.string().default(''),
  sshUser: z.string().default(''),
  sshPort: z.number().default(22),
  probeSsh: z.boolean().default(true),
})
