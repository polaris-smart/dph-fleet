// dph-fleet v0.2.0 合并配置：modules 开关 + mDNS 模块配置 + SSH 模块配置。
// 一个插件装下 mDNS（同网发现+密钥配对）与 SSH（跨网直连）两模块，按 modules 开关启用。
//
// 零依赖约定：不依赖 @deepseek-ai/schemastery（dsh 运行环境不保证提供该包）。
// 但 cordis 4.x resolveConfig 只认 Standard Schema：插件导出 Config 就必须带
// ['~standard'].validate（同步），纯默认值对象会在 boot 时炸：
//   Cannot read properties of undefined (reading 'validate')
// （0.2.10 Windows 真机 `dsh plugin add` + 重启实炸）。
// 因此这里手写 mini Standard Schema：validate 负责默认值合并 + 轻校验，
// 顶层键仍保留纯默认值（测试与文档直读）。

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

/** Standard Schema v1 最小契约（cordis 4.x resolveConfig 消费的全部）。 */
export interface StandardSchemaV1<T> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | { readonly value: T; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<{ readonly message: string; readonly path?: ReadonlyArray<string | number | symbol> }> };
  };
}

/** 字符串字段：非字符串（含缺省）落默认值。 */
function str(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value : fallback;
}

/** validate 实现：合并默认值 + 轻校验（modules 枚举 / sshPort 数字 / probeSsh 布尔）。 */
function validate(input: unknown):
  | { value: Config; issues?: undefined }
  | { issues: Array<{ message: string; path: string[] }> } {
  const raw = (input !== null && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const issues: Array<{ message: string; path: string[] }> = [];

  let modules: Modules = 'both';
  if (raw.modules === undefined || raw.modules === null) {
    modules = 'both';
  } else if (raw.modules === 'mdns' || raw.modules === 'ssh' || raw.modules === 'both') {
    modules = raw.modules;
  } else {
    issues.push({ message: `modules 必须是 mdns | ssh | both，收到 ${JSON.stringify(raw.modules)}`, path: ['modules'] });
  }

  if (raw.sshPort !== undefined && typeof raw.sshPort !== 'number') {
    issues.push({ message: `sshPort 必须是数字，收到 ${typeof raw.sshPort}`, path: ['sshPort'] });
  }
  if (raw.probeSsh !== undefined && typeof raw.probeSsh !== 'boolean') {
    issues.push({ message: `probeSsh 必须是布尔，收到 ${typeof raw.probeSsh}`, path: ['probeSsh'] });
  }
  if (issues.length > 0) return { issues };

  const value: Config = {
    modules,
    deviceName: str(raw, 'deviceName', ''),
    hub: str(raw, 'hub', ''),
    fleetHome: str(raw, 'fleetHome', ''),
    sshUser: str(raw, 'sshUser', ''),
    sshPort: typeof raw.sshPort === 'number' ? raw.sshPort : 22,
    probeSsh: typeof raw.probeSsh === 'boolean' ? raw.probeSsh : true,
  };
  return { value };
}

/** 插件 Config 导出：默认值（直读）+ Standard Schema（cordis resolveConfig 用）。 */
export const Config: Config & StandardSchemaV1<Config> = {
  modules: 'both',
  deviceName: '',
  hub: '',
  fleetHome: '',
  sshUser: '',
  sshPort: 22,
  probeSsh: true,
  '~standard': {
    version: 1,
    vendor: 'dph-fleet',
    validate,
  },
}
