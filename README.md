# dph-fleet

**Turn your devices into a fleet.**
**把你的设备变成一个舰队。**

一个 [dph](https://github.com/deepseek-ai/dsh) 插件，让你的多台设备（笔记本 / 台式机 / 服务器）组网协作：同网自动发现、密钥配对、跨网直连执行。装完在 dph 会话内自动注册工具，**任何跑在 dph 里的智能体（agent）都能直接调用**。
A dph plugin that lets your devices (laptops / desktops / servers) form a network and collaborate: automatic LAN discovery, key pairing, cross-network direct execution. Tools auto-register in dph sessions — **any dph-hosted agent can call them directly**.

| | 中文 | English |
|---|---|---|
| 同网发现 | 局域网设备装完即互见，零配置 | LAN devices see each other instantly, zero config |
| 密钥配对 | 输一个 key 完成配对（WiFi 式），无头设备友好 | Pair with one key (WiFi-style), headless friendly |
| 跨网直连 | 配对后直接指挥远端干活，不手输 IP | Command paired devices directly, no manual IP |
| 智能体原生 | dph 会话内自动注册工具，agent 直接调 | Tools auto-register for dph agents |
| 模块开关 | `modules: mdns \| ssh \| both`，按需启用 | Enable what you need |
| 轻依赖 | 运行时零 npm 依赖，纯 Node 22 标准库 | Zero runtime deps, pure Node 22 stdlib |

---

## 安装 · Installation

**第 1 步 / Step 1**：确认环境 / Prerequisites

```sh
node --version   # 需要 Node 22+（dph 运行要求）
```

**第 2 步 / Step 2**：安装插件 / Install the plugin

```sh
# 一条命令（npm 源）/ One command from npm:
dsh plugin add dph-fleet

# 或从 GitHub Releases 下载 tgz / Or install a release tgz:
dsh plugin add ./dph-fleet-<version>.tgz
```

看到安装成功且无 warning 即可。装完 dph 会话内自动注册 4 个 `fleet_*` 工具。
You should see a clean install with no warnings. Four `fleet_*` tools are then auto-registered in dph sessions.

> 从源码打包 / Build from source:
> ```sh
> git clone https://github.com/polaris-smart/dph-fleet.git
> cd dph-fleet && npm pack   # 产出 dph-fleet-<version>.tgz
> ```

---

## 快速开始 · Quick Start

### 场景 A：同一局域网（推荐入门）
### Scenario A: Same LAN (recommended start)

两台设备（下称 A、B）在同一 WiFi/局域网，都完成上面的安装。
Two devices (A and B) on the same LAN, both installed as above.

**第 1 步 / Step 1**：在 B 上启动广播（让 A 能发现它）/ Start broadcasting on B

```sh
fleet7 serve
```

**第 2 步 / Step 2**：在 A 的 dph 会话里发现 B / Discover B from A's dph session

```text
你：调用 fleet_discover
AI：发现设备 B（192.168.x.x:端口，未配对）
```

**第 3 步 / Step 3**：配对 / Pair

B 首次运行 `fleet7 serve` 会生成设备密钥（`fleet-d-` 开头，打印在终端）。在 A 的 dph 会话里：
B generates a device key (`fleet-d-...`, printed in the terminal) on first `fleet7 serve`. Then on A:

```text
你：调用 fleet_pair，target 填 B 的地址，key 填 B 的设备密钥
AI：配对成功，已联动 SSH 注册表
```

**第 4 步 / Step 4**：指挥 B 干活 / Command B

```text
你：用 fleet_ssh_exec 在设备 B 上执行 hostname
AI：（B 真实返回它的主机名）
```

配对一次，永久可用——B 已把 A 的公钥写入 authorized_keys，A 已记住 B 的连接方式。
Pair once, use forever — B has authorized A's public key; A remembers how to reach B.

### 场景 B：跨网络（SSH 直连）
### Scenario B: Cross-network (SSH direct)

设备不在同一局域网时（如家里指挥云服务器），手动配对：
When devices are not on the same LAN (e.g., commanding a cloud server from home):

**第 1 步 / Step 1**：在你这台（主控）生成配对 / Pair from your side

```sh
fleet8 pair <对端IP或域名> --user <对端用户名> --id my-server
# 例：fleet8 pair 203.0.113.7 --user ubuntu --id my-server
# 输出：私钥路径（0600）+ 一行公钥
```

**第 2 步 / Step 2**：把打印的公钥追加到对端 / Add the printed public key to the remote

```sh
# 在对端机器上：
echo "ssh-ed25519 AAAA... my-server" >> ~/.ssh/authorized_keys
```

**第 3 步 / Step 3**：验证直连 / Verify

```sh
fleet8 ssh my-server "hostname"
```

之后在 dph 会话里即可用 `fleet_ssh_exec` / `fleet_workspace` 指挥该设备。
Then use `fleet_ssh_exec` / `fleet_workspace` in dph sessions.

---

## 工具一览 · Tools

| 模块 | 工具 | 说明 | Description |
|---|---|---|---|
| mdns | `fleet_discover` | 扫描同网 fleet 设备 | Scan LAN for fleet devices |
| mdns | `fleet_pair` | 输密钥配对 | Pair with device key |
| ssh | `fleet_ssh_exec` | 在已配对设备执行命令 | Run a command on a paired device |
| ssh | `fleet_workspace` | 设置/查看远程工作区 | Set/view remote workspace |

关掉的模块工具不注册：`modules=mdns` 只有前两个，`modules=ssh` 只有后两个，`both` 全开。
Disabled modules don't register their tools.

**智能体直接调用 / Call from any dph agent**：装完插件，在你的 dph 会话里对 AI 说一句"调用 `fleet_discover`"即可发现设备；配合同网另一台设备的密钥后即可用 `fleet_ssh_exec` 指挥它。无需额外配置——工具注册给 dph 会话内的所有 agent（hermes、zcode 等）。
After install, just say "call `fleet_discover`" in your dph session to see LAN devices; pair once, then command remote devices with `fleet_ssh_exec`. No extra config — tools are exposed to every agent in the dph session.

**安全约定 / Security**：只连已配对设备；密钥文件强制 0600；所有错误返回可读文本，不炸会话。
Only paired devices are reachable; key files must be 0600; all errors return readable text instead of throwing.

## CLI 参考 · CLI Reference

```text
fleet7 discover                  # 发现同网设备 / discover LAN devices
fleet7 serve                     # 广播本机（被控跑）/ broadcast this device
fleet7 pair <target> <key>       # 配对 / pair
fleet8 pair <host> [--user u] [--id 别名] [--port 22]
fleet8 list                      # 列出已配对设备 / list paired devices
fleet8 ssh <目标> <命令...>       # 直连执行 / direct exec
fleet8 workspace <目标> [目录]    # 远程工作区 / remote workspace
fleet8 pubkey <目标>             # 打印公钥 / print public key
fleet8 remove <目标>             # 移除配对 / unpair
```

## 配置 · Configuration

插件 config（cordis.patch.yml 的 config 段）：

| 字段 Field | 默认 Default | 说明 Description |
|---|---|---|
| `modules` | `both` | `mdns` / `ssh` / `both` |
| `deviceName` | 主机名 hostname | mDNS 广播的友好名 / broadcast name |
| `fleetHome` | `~/.fleet` | 数据目录（配对表/密钥）/ data dir |
| `sshUser` / `sshPort` | 当前用户 / 22 | 联动写 SSH 注册表用 |
| `probeSsh` | `true` | 配对后先探测 SSH 可达再写注册表 |

## 常见问题 · FAQ

**Q: `fleet_discover` 找不到设备？**
确认：两台在同一局域网（mDNS 组播不跨路由器）；被控端在跑 `fleet7 serve`；防火墙放行 UDP 5353。
A: Both devices must be on the same LAN (mDNS multicast doesn't cross routers); the target must run `fleet7 serve`; allow UDP 5353 through firewalls.

**Q: 跨网设备连不上？**
用场景 B 的 `fleet8 pair` 手动配对；确认对端 22 端口可达、公钥已进 authorized_keys。
A: Use Scenario B manual pairing; check port 22 reachability and that the public key is in authorized_keys.

**Q: 装插件时报 "declares no dsh.bundle"？**
你拿到的可能是旧包——请从 Release 页下载最新版 tgz。
A: You likely have an outdated package — download the latest tgz from the Releases page.

## 参与贡献 · Contributing

遇到问题或有想法：
Found a bug or have an idea?

- **提 Issue**：问题反馈直接在本仓库提 / Open an issue in this repo
- **提 PR**：欢迎，路线图里的活儿都可以认领 / PRs welcome — pick anything from the roadmap

## 路线图 · Roadmap

- [ ] 任务簿抢单：持簿设备发任务，组网设备来抢（去中心化调度）
      Task-board claiming: post tasks from any device, paired devices claim them
- [ ] SFTP 文件传输 / SFTP file transfer
- [ ] 交互式安装向导 / Interactive setup wizard
- mDNS 发现目前为 beta，大规模组网欢迎反馈 / mDNS discovery is beta — feedback welcome

## 更新日志 · Changelog

**v0.2.9**（2026-08-19）
- 📦 干净重发：v0.2.8 的构建产物曾混入无关模块残留，已彻底清理（dist 重建 + 全包复查），**本版为纯组网 Fleet**
- npm 上的 v0.2.8 / v0.3.0 / v0.3.1 已撤销（版本号被 npm 锁定不可重发），改用 v0.2.9 承载
- 功能与 v0.2.7 一致：mDNS 同网发现 + 密钥配对 + SSH 跨网直连 + `/fleet` 命令；模块开关 `modules: mdns | ssh | both`

**v0.2.8**（2026-08-19）
- 🔧 回归纯组网定位：**移除 agent 模块与 `agent_ask` 工具**，Fleet 专注多设备组网协作（mDNS 同网发现 + 密钥配对 + SSH 跨网直连 + `/fleet` 命令）
- 修复发布物中与本产品无关的内部表述与本机路径（清理干净）
- 功能与 v0.2.7 一致；模块开关 `modules: mdns | ssh | both`

**v0.2.7**（2026-08-19）
- ✨ 新增 `/fleet` 斜杠命令：装完在 dsh UI 敲 `/fleet` 即显示本机身份 + 已配对设备 + 使用引导——**解决"装完不知道下一步做什么"**
- 不再依赖模型工具调用配置，用户有直接的入口

**v0.2.6**（2026-08-19）
- 📝 门面更新：README 突出"智能体直接调用"亮点、修复"零依赖"表述为"运行时零依赖"、新增 Changelog；npm 描述同步
- 代码与 v0.2.5 相同，纯文档/元数据更新

**v0.2.5**（2026-08-19）
- 🐛 修复 CLI：`fleet7` / `fleet8` 在 Node 22 下 npm 安装后可用（预编译 `dist/`，根治 node_modules 内 .ts type stripping 限制）
- ✨ 发布携带编译产物，命令行无需构建即可运行
- 不影响 dph 会话工具（cordis 加载，原本正常）

**v0.2.4**（2026-08-17）
- 发布到 npm：一条命令 `dsh plugin add dph-fleet` 安装
- mDNS + SSH 两模块合一，`modules: mdns | ssh | both` 开关

**v0.2.0**（2026-08-18）
- 去中心化转向：mDNS 同网发现 + 密钥配对 + SSH 跨网直连，单插件交付

## 许可证 · License

MIT © polaris-smart
