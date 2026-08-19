# dph-fleet

<p align="center">
  <a href="https://www.npmjs.com/package/dph-fleet"><img alt="npm" src="https://img.shields.io/npm/v/dph-fleet?style=flat-square&color=4b6fff"></a>
  <a href="https://github.com/polaris-smart/dph-fleet"><img alt="GitHub stars" src="https://img.shields.io/github/stars/polaris-smart/dph-fleet?style=flat-square&color=4b6fff"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-7da1de?style=flat-square">
</p>

<p align="center">
  <strong>把你的设备变成一个舰队。</strong><br>
  <strong>Turn your devices into a fleet.</strong>
</p>

**零核心改动，纯插件挂载。** 一个 [dph](https://github.com/deepseek-ai/dsh) 插件，让你的多台设备（笔记本 / 台式机 / 服务器）组网协作。装完在 dph 会话内自动注册工具，**任何跑在 dph 里的智能体（agent）都能直接调用**。卸载后不留任何核心补丁。
**Zero core changes, pure plugin mounting.** A dph plugin that lets your devices collaborate. Tools auto-register in dph sessions — **any dph-hosted agent can call them directly**. Uninstall leaves no core patches.

> **适用前提 / Requirements**：Fleet 连接两种场景——① **同一局域网**且**放行 mDNS 广播**（UDP 5353，组播不跨路由器/子网）；② **公网可达设备**（有公网 IP 或端口映射）且**开通 SSH（22 端口）**。**NAT 内网设备之间**（如两台都在家庭/办公路由器后面）当前版本**无法直连**——需要 V2（P2P/tailscale 路线）。
> Two supported scenarios: ① **same LAN** with **mDNS multicast allowed** (UDP 5353; doesn't cross routers/subnets); ② **publicly reachable devices** with **SSH (port 22) open**. NAT-isolated devices cannot connect to each other in this version (V2 = P2P/tailscale planned).

| | 中文 | English |
|---|---|---|
| 同网发现 | 同一局域网 + 放行 mDNS 广播 → 设备互见 | Same LAN + mDNS allowed → devices see each other |
| 密钥配对 | 输一个 key 完成配对（WiFi 式），无头设备友好 | Pair with one key (WiFi-style), headless friendly |
| 跨网直连 | 公网可达设备（开通 SSH）→ 直接指挥 | Public devices with SSH → direct command |
| 智能体原生 | dph 会话内自动注册工具，agent 直接调 | Tools auto-register for dph agents |
| 模块开关 | `modules: mdns \| ssh \| both`，按需启用 | Enable what you need |
| 轻依赖 | 运行时零 npm 依赖，纯 Node 22 标准库 | Zero runtime deps, pure Node 22 stdlib |
| 随 dsh 起停 | 装进 profile 即随 dsh 运行，无需独立服务 | Lives with dsh, no separate service |

---

## 快速开始 · Quick Start

**一条命令，装完即用 / One command, done:**

```sh
dsh plugin add dph-fleet
```

装进 dsh profile 后，插件随 dsh 一起运行（`dsh web` / `dsh --profile headless`）——**dsh 在跑，Fleet 就在**；重启 dsh 会话后，会话内自动注册 `fleet_*` 工具，任何 dph 里的 agent 都能直接调用。无需配置系统服务、无需自启脚本。
Installed into your dsh profile, the plugin lives and dies with dsh (`dsh web` / `dsh --profile headless`) — **dsh running means Fleet running**. After restarting the dsh session, `fleet_*` tools auto-register and any dph-hosted agent can call them. No system services, no cron, no manual setup.

> 没有 dsh？先装 [DeepSeek Harness](https://github.com/deepseek-ai/dsh)（官方 Coding Agent），再 `dsh plugin add dph-fleet`。
> No dsh yet? Install [DeepSeek Harness](https://github.com/deepseek-ai/dsh) first, then `dsh plugin add dph-fleet`.

> 也可以下载 Release 的 tgz 本地安装：`dsh plugin add ./dph-fleet-<version>.tgz`。
> Or grab the tgz from Releases: `dsh plugin add ./dph-fleet-<version>.tgz`.

**怎么用？就像聊天一样 / How to use? Just chat:**

装完后，**在 dph 对话框里用自然语言提需求**——背后由 agent 自动调 Fleet 工具完成，你看不到中间环节：
After install, just talk to your dph agent in plain language — the agent calls Fleet tools behind the scenes:

```text
你：帮我连上我的服务器，看看它现在什么状态
agent：已连接 my-server（43.135.x.x），当前内存可用 1.2G、负载 0.01、磁盘 51%。

你：在服务器上跑一下 hostname
agent：返回：VM-0-11-ubuntu

你：把备份脚本在服务器上执行一遍
agent：备份完成，输出：…
```

**不需要记命令**——发现设备、配对、执行，都是 agent 在会话里调 `fleet_discover` / `fleet_pair` / `fleet_ssh_exec` 完成的。
No commands to memorize — discovery, pairing, and execution are all done by the agent calling `fleet_discover` / `fleet_pair` / `fleet_ssh_exec` in your session.

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

## 使用场景 · Usage Scenarios

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

> **让 agent 帮你配对 / Let your agent do the pairing**：配对命令也可以直接让 dph 会话里的 agent（或你的 ZCode / Hermes）执行——对 agent 说"用 fleet8 帮我配对服务器 203.0.113.7，用户 ubuntu，名字 my-server"，agent 会跑命令并把输出的公钥给你（你再贴到对端）。不需要自己记命令。

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

## 已知限制 · Known Limitations

诚实披露，避免踩坑：

- **mDNS 发现目前为 beta**：大规模组网（>10 台）欢迎反馈；mDNS 组播不跨路由器/子网，跨网设备请用场景 B（SSH 直连）
- **mDNS 仅同网段**：`fleet_discover` 只能发现同一局域网设备；跨网指挥走 `fleet8 pair`（SSH）
- **`fleet7 serve` 的 mDNS 广播**：被控端需保持进程运行才可被发现（`fleet8` SSH 直连不受此限）
- **Node 22+ 要求**：dph 运行环境需要 Node 22+；CLI 已预编译，npm 安装即用

## 架构 · Architecture

```
┌─────────────────────────────────────────────────────┐
│                     dph / dsh                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ fleet_discover│  │ fleet_ssh_exec│  │ agent_ask │  │  ← 会话内工具（agent 直接调）
│  │ fleet_pair    │  │ fleet_workspace│  │           │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┘  │
│         │ mDNS            │ SSH                     │
└─────────┼─────────────────┼─────────────────────────┘
          ▼                 ▼
   ┌────────────┐    ┌──────────────┐
   │ mDNS 模块   │    │ SSH 模块      │
   │ 同网发现/配对│    │ 跨网直连/执行  │
   │ 设备身份     │    │ 注册表/密钥池  │
   └────────────┘    └──────────────┘
          │                 │
          └───── 联动 ───────┘   ← mDNS 配对成功自动写入 SSH 注册表
```

- **纯插件挂载**：不修改 dsh 核心；卸载后不留补丁
- **数据落点**：设备身份 `~/.dsh/fleet-lan.json`、配对表 `~/.fleet/paired-devices.json`、SSH 注册表 `~/.fleet/ssh-devices.json`、密钥 `~/.fleet/ssh-keys/`（0600）
- **安全基线**：只连已配对设备；密钥强制 0600；错误返回可读文本不炸会话

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

**Q: 装完怎么确认 Fleet 可用？**
重启 dsh 会话后，在会话里敲 `/fleet`——能看到本机身份 + 已配对设备列表即成功；或直接让 agent 调 `fleet_discover`（同网会返回设备列表，跨网返回"未发现同网设备"也属正常）。
A: After restarting the dsh session, type `/fleet` — seeing your device identity and paired devices means it works. Or ask the agent to call `fleet_discover`.

**Q: 装了但会话里没有 `fleet_*` 工具？**
确认三件事：① `dsh plugin add dph-fleet` 装到了你正在用的 profile（`dsh plugin --profile <name> add dph-fleet`）② 会话已重启 ③ dsh 版本为 Node 22+（`node --version`）。都满足仍没有，把 `dsh plugin` 输出发 Issue。
A: Check: ① the plugin was added to the profile you're booting (`dsh plugin --profile <name> add dph-fleet`) ② the session was restarted ③ Node 22+ (`node --version`). Still missing? Open an issue with the `dsh plugin` output.

**Q: `fleet_ssh_exec` 连接超时？**
先确认对端 22 端口可达（`nc -vz <ip> 22` 或 `fleet8 ssh <name> hostname`）；确认对端公钥已进 `authorized_keys`；超时通常是网络/防火墙问题，不是插件问题。
A: Verify port 22 reachability (`nc -vz <ip> 22` or `fleet8 ssh <name> hostname`) and that the public key is in the target's `authorized_keys`. Timeouts are usually network/firewall issues, not plugin issues.

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
- 🔧 零依赖化重构：去除对 dsh-tools/schemastery 的运行时依赖，任何 dsh 环境（源码或 npm 安装）都能直接 `dsh plugin add` 安装
- ✨ 插件入口指向预编译产物，安装即用，无需构建
- 功能：mDNS 同网发现 + 密钥配对 + SSH 跨网直连 + `/fleet` 命令；模块开关 `modules: mdns | ssh | both`

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
