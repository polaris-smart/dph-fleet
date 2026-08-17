// 共享类型。跨边界 id/主机名沿用 M1/M2 约定用描述性字符串别名——骨架单在
// 文件/子进程/JSON 解析边界不引入品牌化转型摩擦（与 M1 REPORT §5 口径一致）。

/** 已配对 SSH 设备表单条（master 侧 600 文件）。 */
export interface SshDevice {
  /** 稳定设备 id/别名（配对时给定，默认由 host 派生）。 */
  deviceId: string;
  /** 友好名。 */
  name: string;
  /** SSH 主机（IP 或域名）。 */
  host: string;
  /** SSH 端口。 */
  port: number;
  /** 登录用户。 */
  user: string;
  /** SSH 私钥绝对路径（0600，key 内容不进本表，避免泄密）。 */
  keyPath: string;
  /** 远程执行工作区（空 = 未设置，执行落在远端 home）。 */
  workspace: string;
  /** 配对时间 ISO。 */
  addedAt: string;
  /** 最近一次执行时间 ISO。 */
  lastUsedAt: string;
}

/** ssh 执行结果。 */
export interface SshExecResult {
  /** 远端命令是否 exit 0。 */
  ok: boolean;
  /** 远端命令退出码（连接级失败为 255；被信号杀为 null）。 */
  exitCode: number | null;
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
  /** 失败时的可读错误文本（ok=true 时为空）。 */
  error?: string;
}

/** 密钥生成结果（两条路径）。 */
export interface SshKeyPair {
  /** 私钥绝对路径（0600）。 */
  privateKey: string;
  /** 公钥绝对路径（.pub）。 */
  publicKey: string;
}
