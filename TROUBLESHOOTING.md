# 排障指南 · Troubleshooting

[dsh-devices](https://github.com/polaris-smart/dsh-devices) 常见问题与排障。安装问题优先看 [官方安装文档](https://github.com/deepseek-ai/deepseek-harness)。

## Q1：装完插件后 dsh 起不来，报 `Cannot read properties of undefined (reading 'validate')`

**原因**：插件的 Config 必须实现 Standard Schema 接口（cordis 4.x 契约）。v0.2.10 早期构建的 tgz 缺这个接口，已修复。

**判断**：如果你手里的 tgz sha256 以 `4e2639ef` 开头，则已是修复版。正式 npm 版本（`dsh plugin add dsh-devices`）全部包含修复。

**止血**（dsh 起不来也能跑——plugin 命令不经过启动流程）：

```sh
npx @deepseek-ai/dsh plugin --profile web remove dsh-devices
npx @deepseek-ai/dsh web
```

移除后 dsh 即可启动。然后用修复版重新安装。

## Q2：装完重启后，会话里 agent 说没有 fleet 工具

**依次检查**：

1. 插件是否真的进了当前 profile：`npx @deepseek-ai/dsh --profile <你的profile> --dump-config | grep dsh-devices`（有输出 = 已挂载）
2. 是否装错了 profile：`dsh plugin add` 装进的是 `--profile` 指定的那个；你启动时用的 profile 必须一致
3. 直接敲 `/fleet`——命令能显示状态说明插件活着，工具面单独排查

## Q3：`/fleet discover` 或 `fleet_discover` 说"未发现同网 fleet 设备"

- 对方设备也装了 dsh-devices 且 dsh 在运行？（单边装了没有对象）
- 同一局域网？mDNS 组播（UDP 5353）被路由器/AP 隔离时不通（访客网络、AP 隔离模式常见）
- 跨网设备（公网服务器）不走 mDNS：用 `fleet8 pair <ip>` 走 SSH 路线

## Q4：`/fleet ssh` 或 `fleet_ssh_exec` 报"设备未配对"

SSH 直连只认**已配对设备**（安全模型）。两类配对方式：

- mDNS 设备：`/fleet pair <host:port> <设备密钥>`（密钥在对方 `fleet7 serve` 启动时打印，`fleet-d-` 开头）
- 公网 SSH 设备：`fleet8 pair <host> --user <用户>`，然后把打印出的公钥贴到对端 `~/.ssh/authorized_keys`

## Q5：SSH 执行失败 / 超时

- 对端 SSH 端口（默认 22）可达？`nc -vz <host> 22`
- 密钥授权生效？对端 `~/.ssh/authorized_keys` 里有 fleet 公钥、权限 `700 ~/.ssh` + `600 authorized_keys`
- Windows 被控端：确认 OpenSSH Server 已装且在运行（`Get-Service sshd`）

## Q6：npm 装到的不是最新版

pnpm 11 默认开启发布年龄门禁（`minimumReleaseAge`，24 小时）：刚发布的版本会被静默隔离，写 `@latest` 也一样。两个办法：

```sh
# 办法一：装精确版本号
dsh plugin --profile web add dsh-devices@0.2.10

# 办法二：profile 的 pnpm-workspace.yaml 设 minimumReleaseAge: 0 后 update
```

## Q7：Windows 作为主控端时，fleet_ssh_exec 只返回第一条命令的输出（&& 链被截断）

**已知限制**（OpenSSH for Windows 无控制台模式下的会话 bug，非插件缺陷）：Windows 上从 dsh/CLI 发起远程命令时，远端 shell 的多条输出（如 `hostname && echo b`）可能只回传第一条。裸 cmd 里跑 ssh 正常，node spawn（无控制台）会截断。

**Workaround**：
- 单条命令执行（每条一个 `fleet_ssh_exec`），或用 `;` 连接的单行
- 需要复合逻辑时，把命令写成远端脚本文件再执行
- Windows 作为**被控端**（被 Mac/Linux/HK 指挥）不受此限制

> 追踪：OpenSSH for Windows console 会话 issue。

## 数据落点（排查时看哪里）

| 数据 | 位置 |
|---|---|
| 本机 mDNS 身份 | `$DSH_HOME/fleet-lan.json`（默认 `~/.dsh/`） |
| mDNS 配对表 | `$FLEET_HOME/paired-devices.json`（默认 `~/.fleet/`） |
| SSH 设备注册表 | `$FLEET_HOME/ssh-devices.json` |
| SSH 密钥 | `$FLEET_HOME/ssh-keys/`（0600） |

---

更多问题开 [GitHub Issue](https://github.com/polaris-smart/dsh-devices/issues)。
