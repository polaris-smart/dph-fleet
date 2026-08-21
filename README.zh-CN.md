# dsh-devices

[English](./README.md) · **简体中文**

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-devices"><img alt="npm" src="https://img.shields.io/npm/v/dsh-devices?style=flat-square&color=4b6fff"></a>
  <a href="https://github.com/polaris-smart/dsh-devices"><img alt="GitHub stars" src="https://img.shields.io/github/stars/polaris-smart/dsh-devices?style=flat-square&color=4b6fff"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-7da1de?style=flat-square">
</p>

<p align="center">
  <strong>把你的设备变成一个舰队。</strong><br>
  <strong>Turn your devices into a fleet.</strong>
</p>

**零核心改动，纯插件挂载。** 一个 [dsh](https://github.com/deepseek-ai/dsh) 插件，让你的多台设备（笔记本 / 台式机 / 服务器）组网协作。装完在 dsh 会话内自动注册工具，**任何跑在 dsh 里的智能体（agent）都能直接调用**。卸载后不留任何核心补丁。
**Zero core changes, pure plugin mounting.** A dsh plugin that lets your devices collaborate. Tools auto-register in dsh sessions — **any dsh-hosted agent can call them directly**. Uninstall leaves no core patches.

> **适用前提 / Requirements**：
> **① 至少 2 台设备都装 dsh-devices**（配对是双向的——只有一台装了没法配对，单设备装了没有配对对象）。
> **② 连接方式二选一**：同一局域网且放行 mDNS 广播（UDP 5353，组播不跨路由器/子网）；或公网可达设备（有公网 IP 或端口映射）且开通 SSH（22 端口）。**NAT 内网设备之间**（如两台都在家庭/办公路由器后面）当前版本**无法直连**——需要 V2（P2P/tailscale 路线）。
>
> **Requirements**: ① **At least 2 devices, each with dsh-devices installed** (pairing is two-sided; a single device has nothing to pair with). ② Connectivity: same LAN with mDNS multicast allowed (UDP 5353; doesn't cross routers/subnets), **or** publicly reachable devices with SSH (port 22) open. NAT-isolated devices cannot connect to each other in this version (V2 = P2P/tailscale planned).

| | 中文 | English |
|---|---|---|
| 同网发现 | 同一局域网 + 放行 mDNS 广播 → 设备互见 | Same LAN + mDNS allowed → devices see each other |
| 密钥配对 | 输一个 key 完成配对（WiFi 式），无头设备友好 | Pair with one key (WiFi-style), headless friendly |
| 跨网直连 | 公网可达设备（开通 SSH）→ 直接指挥 | Public devices with SSH → direct command |
| 智能体原生 | dsh 会话内自动注册工具，agent 直接调 | Tools auto-register for dsh agents |
| 模块开关 | `modules: mdns \| ssh \| both`，按需启用 | Enable what you need |
| 轻依赖 | 运行时零 npm 依赖，纯 Node 22 标准库 | Zero runtime deps, pure Node 22 stdlib |
| 随 dsh 起停 | 装进 profile 即随 dsh 运行，无需独立服务 | Lives with dsh, no separate service |

---

## 快速开始 · Quick Start

从零到用，5 步 / From zero to use in 5 steps:

```
┌──────────────┐          ┌──────────────┐
│  设备 A（你）  │          │  设备 B（对方） │
│  dsh + devices  │◄────────►│  dsh + devices  │
│  主控/指挥     │  配对连接  │  被控/执行    │
└──────────────┘          └──────────────┘
     ↑ 你说："在 B 上跑 hostname"
     └─ agent 调 fleet_ssh_exec → B 返回结果
```

**第 1 步：装 dsh**（还没有的话）/ Install dsh if you don't have it:
```sh
npm install -g @deepseek-ai/dsh
```

**第 2 步：两台设备都装 Fleet**（配对是双向的，单台没用）/ Install Fleet on **both** devices:
```sh
dsh plugin add dsh-devices
```

**第 3 步：重启 dsh 会话**（让插件加载）/ Restart the dsh session:
```sh
dsh web              # 或 dsh --profile headless "…"
```

**第 4 步：连接两台设备**（二选一）/ Connect the two devices (pick one):
- **同一局域网**：两台都开机，B 的 agent 开广播（"启动 fleet 广播"），你在 A 的会话说"发现设备并配对"
- **跨网络（B 有公网 SSH）**：对 A 的 agent 说"用 fleet8 配对服务器 <IP>，用户 <用户名>，名字 <别名>"，agent 把公钥给你 → 你贴到 B 的 `authorized_keys`

**第 5 步：像聊天一样用** / Use it like a chat:
```text
你：帮我连上我的服务器，看看它现在什么状态
agent：已连接 my-server（43.135.x.x），内存可用 1.2G、负载 0.01、磁盘 51%。

你：在服务器上跑一下 hostname
agent：返回：VM-0-11-ubuntu

你：把备份脚本在服务器上执行一遍
agent：备份完成，输出：…
```

**不需要记命令**——发现设备、配对、执行，都是 agent 在会话里调 `fleet_discover` / `fleet_pair` / `fleet_ssh_exec` 完成的。
No commands to memorize — discovery, pairing, and execution are all done by the agent calling `fleet_discover` / `fleet_pair` / `fleet_ssh_exec` in your session.

> 也可以下载 Release 的 tgz 本地安装：`dsh plugin add ./dsh-devices-<version>.tgz`。
> Or grab the tgz from Releases: `dsh plugin add ./dsh-devices-<version>.tgz`.

---

## 安装 · Installation

**第 1 步 / Step 1**：确认环境 / Prerequisites

```sh
node --version   # 需要 Node 22+（dsh 运行要求）
```

**第 2 步 / Step 2**：安装插件 / Install the plugin

```sh
# 一条命令（npm 源）/ One command from npm:
dsh plugin add dsh-devices

# 或从 GitHub Releases 下载 tgz / Or install a release tgz:
dsh plugin add ./dsh-devices-<version>.tgz
```

看到安装成功且无 warning 即可。装完 dsh 会话内自动注册 7 个 `fleet_*` 工具。
You should see a clean install with no warnings. Four `fleet_*` tools are then auto-registered in dsh sessions.

> 从源码打包 / Build from source:
> ```sh
> git clone https://github.com/polaris-smart/dsh-devices.git
> cd dsh-devices && npm pack   # 产出 dsh-devices-<version>.tgz
> ```

---

## 使用场景 · Usage Scenarios

### 场景 A：同一局域网（推荐入门）
### Scenario A: Same LAN (recommended start)

**双方都要装 dsh-devices**（配对是双向的——只有一边装了没法配对）。两台设备（下称 A、B）在同一 WiFi/局域网。
**Both devices need dsh-devices** (pairing is two-sided). Devices A and B on the same LAN.

**第 1 步 / Step 1**：在 B 上启动广播（让 A 能发现它）/ Start broadcasting on B

B 的用户在 B 的 dsh 会话里对 agent 说"启动 fleet 广播"（agent 会跑 `fleet7 serve`），或手动：
B's user asks B's dsh agent to "start fleet broadcast" (agent runs `fleet7 serve`), or manually:

```sh
fleet7 serve
```

**第 2 步 / Step 2**：在 A 的 dsh 会话里发现 B / Discover B from A's dsh session

```text
你：调用 fleet_discover
AI：发现设备 B（192.168.x.x:端口，未配对）
```

**第 3 步 / Step 3**：配对 / Pair

B 首次运行 `fleet7 serve` 会生成设备密钥（`fleet-d-` 开头，打印在终端）。在 A 的 dsh 会话里：
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

> **让 agent 帮你配对 / Let your agent do the pairing**：配对命令也可以直接让 dsh 会话里的 agent 执行——对 agent 说"用 fleet8 帮我配对服务器 203.0.113.7，用户 ubuntu，名字 my-server"，agent 会跑命令并把输出的公钥给你（你再贴到对端）。不需要自己记命令。

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

之后在 dsh 会话里即可用 `fleet_ssh_exec` / `fleet_workspace` 指挥该设备。
Then use `fleet_ssh_exec` / `fleet_workspace` in dsh sessions.

### 场景 C：一键舰队（v0.1.2 新增）
### Scenario C: One-command fleet join (new in v0.1.2)

把「拉一台新设备入伙」从手工配密钥压缩成三条命令——邀请码通过微信/电话发给对方即可：
Onboarding a new device in three commands — the invite code travels over WeChat/phone, nothing to hand-configure:

**主控 / Host**：生成邀请码 / Generate an invite code
```sh
fleet8 invite <本机IP或域名> --user <对端用户名> --port 22
# 输出：host:port/user/token 形式的邀请码，发给对方
```

**新设备 / New device**：一条命令入队 / Join with one command
```sh
fleet8 join <邀请码>
# 自动：解析邀请码 → 生成 SSH 密钥 → 登记设备 → 打印公钥
```

**主控 / Host**：授权入队 / Authorize
```sh
fleet8 allow <设备ID> "<上一步打印的公钥>"
# 完成。新设备即可 fleet8 ssh / 在 dsh 会话里被指挥
```

---

## 工具一览 · Tools

| 模块 | 工具 | 说明 | Description |
|---|---|---|---|
| mdns | `fleet_discover` | 扫描同网 fleet 设备 | Scan LAN for fleet devices |
| mdns | `fleet_pair` | 输密钥配对 | Pair with device key |
| ssh | `fleet_ssh_exec` | 在已配对设备执行命令 | Run a command on a paired device |
| ssh | `fleet_workspace` | 设置/查看远程工作区 | Set/view remote workspace |
| ssh | `fleet_upload` | 上传文件到已配对设备 | Upload a file to a paired device |
| ssh | `fleet_download` | 从已配对设备下载文件 | Download a file from a paired device |
| ssh | `fleet_status` | 全部设备存活探测（在线/延迟/最近使用） | Liveness probe for all paired devices |

关掉的模块工具不注册：`modules=mdns` 只有前两个，`modules=ssh` 只有后两个，`both` 全开。
Disabled modules don't register their tools.

**`/fleet` 斜杠命令（装完即用）/ The `/fleet` slash command**：重启 dsh 后在输入框敲 `/fleet`——不经过模型、不花 token，直接真执行：

| 命令 | 作用 | Effect |
|---|---|---|
| `/fleet` | 状态：本机身份 + 已配对设备 + 下一步 | Status: identity + paired devices |
| `/fleet discover` | 真扫描同网设备（mDNS） | Actually scan the LAN |
| `/fleet pair <host:port> <key>` | 真配对（密钥校验 + 写配对表） | Actually pair with the device key |
| `/fleet ssh <target> <命令>` | 真直连执行（仅已配对设备） | Actually exec over SSH |

错误有具体指引（如"设备未配对 → 先 /fleet pair"）；文件传输与工作区请让 AI 调 `fleet_upload` 等工具。
Errors carry next-step guidance; file transfer & workspace go through the agent tools.

**智能体直接调用 / Call from any dsh agent**：装完插件，在你的 dsh 会话里对 AI 说一句"调用 `fleet_discover`"即可发现设备；配合同网另一台设备的密钥后即可用 `fleet_ssh_exec` 指挥它。无需额外配置——工具注册给 dsh 会话内的所有 agent。
After install, just say "call `fleet_discover`" in your dsh session to see LAN devices; pair once, then command remote devices with `fleet_ssh_exec`. No extra config — tools are exposed to every agent in the dsh session.

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

## 各平台注意事项 · Platform Notes

> 以下均为**真实平台验证过的注意事项**（macOS / Ubuntu 20.04+ / Windows Server 2025 与 Windows 11 实测），不是纸面推测。

### macOS
- **mDNS 自动应答**：插件加载即自动广播，无需手动 `fleet7 serve`；若发现同网发现不到设备，检查系统防火墙是否放行 UDP 5353
- **SSH 服务**：macOS 默认**未开启远程登录**（SSH 服务端）。要让别的设备指挥本机，需先在 系统设置 → 通用 → 共享 → 打开「远程登录」
- **密钥权限**：`~/.fleet/ssh-keys/` 密钥自动 0600；如手动拷贝过，确保权限不被放宽（`chmod 600`）

### Linux（含 Ubuntu / 云服务器）
- **Node 版本**：dsh 官方要求 **Node ≥ 22.19**（22.14 及以下缺 zstd API，boot 会报 `createZstdDecompress`）；用 `nvm` 或发行版源装新版
- **被控端 SSH**：服务器一般自带 sshd；确认 `systemctl status sshd` 在跑、`~/.ssh/authorized_keys` 权限 600、`~/.ssh` 权限 700
- **云厂商安全组**：云服务器（腾讯云/阿里云等）记得在安全组放行 SSH 端口（默认 22），否则公网配对能建立但执行超时
- **小水管环境**：网络带宽小时，`npx` 拉 dsh 可能很慢——建议 `npm config set registry https://registry.npmmirror.com` 加速

### Windows（桌面版 10/11 与 Server 2016+）
- **Node 版本**：同样要 **≥ 22.19**（zip 绿色版最稳——MSI 静默安装在 2G 小内存机上可能假成功）
- **被控端（被别人指挥）**：需手动开启 OpenSSH Server：设置 → 系统 → 可选功能 → 添加「OpenSSH 服务器」，然后
  ```powershell
  Start-Service sshd; Set-Service sshd -StartupType Automatic
  ```
  并在防火墙放行 22（`New-NetFirewallRule ... -LocalPort 22`）
- **主控端（指挥别人）**：`fleet_ssh_exec` 的单条命令、`fleet8 ssh`、上传/下载全部正常；**`&&` 多命令链可能只回传首条输出**（OpenSSH for Windows 无控制台会话限制，见 TROUBLESHOOTING Q7）——需要复合命令时请分多条执行
- **CLI 退出**：`fleet7/fleet8` 命令在 Windows 上执行完会正常退出（我们显式处理了管道句柄问题），无需额外操作

---
## 已知限制 · Known Limitations

诚实披露，避免踩坑：

- **mDNS 发现目前为 beta**：大规模组网（>10 台）欢迎反馈；mDNS 组播不跨路由器/子网，跨网设备请用场景 B（SSH 直连）
- **mDNS 仅同网段**：`fleet_discover` 只能发现同一局域网设备；跨网指挥走 `fleet8 pair`（SSH）
- **`fleet7 serve` 的 mDNS 广播**：被控端需保持进程运行才可
- **Windows 作主控端的 ssh 执行**：`fleet_ssh_exec` 的 `&&` 多命令链可能只回传首条（OpenSSH for Windows 无控制台会话 bug，见 TROUBLESHOOTING Q7）；Windows 作被控端不受影响被发现（`fleet8` SSH 直连不受此限）
- **Node 22+ 要求**：dsh 运行环境需要 Node 22+；CLI 已预编译，npm 安装即用

## 架构 · Architecture

```
┌─────────────────────────────────────────────────────┐
│                     dsh (DeepSeek Harness)                        │
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

> 更完整的排障（安装失败/发现不到/SSH 不通/npm 装旧版）见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。
> For full troubleshooting see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

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
确认三件事：① `dsh plugin add dsh-devices` 装到了你正在用的 profile（`dsh plugin --profile <name> add dsh-devices`）② 会话已重启 ③ dsh 版本为 Node 22+（`node --version`）。都满足仍没有，把 `dsh plugin` 输出发 Issue。
A: Check: ① the plugin was added to the profile you're booting (`dsh plugin --profile <name> add dsh-devices`) ② the session was restarted ③ Node 22+ (`node --version`). Still missing? Open an issue with the `dsh plugin` output.

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

**v0.1.1**（2026-08-20）
- 🔒 发布包内部代号清零：mDNS 服务类型与 SSH 密钥注释统一为 `dsh-devices`（对外无内部痕迹）
- 📝 README 新增「各平台注意事项」（macOS / Linux / Windows 实测要点）

**v0.1.0**（2026-08-20）
- 🎉 正式发布（npm + GitHub Release）：`dsh plugin add dsh-devices` 一条命令安装
- ✨ mDNS 自动应答：插件加载即上线，被控端零手动 `serve`
- ✨ 新增 `fleet_status`：全部已配对设备存活探测（在线/延迟/最近使用），第 7 个工具
- ✨ `/fleet` 斜杠命令真执行化：discover 真扫描 / pair 真配对 / ssh 真直连；错误提示带下一步指引
- ✨ SFTP 文件传输：`fleet_upload` / `fleet_download`（沿 SSH 通道双向传文件）
- 🔧 SSH 瞬断轻量重试（连接类失败自动退避重试）；Windows 全链路适配（ControlMaster/IdentityAgent/CLI 退出）
- 🧪 验证：92 项测试 + 三平台实测（macOS / Ubuntu / Windows Server 2025）

**历史版本 · History**（v0.2.x 时代，dph-fleet 更名前）

- v0.2.10：`/fleet` 命令面与 SFTP 完善，零依赖化收尾
- v0.2.8~v0.2.9：回归纯组网定位，零依赖化重构，预编译产物安装即用
- v0.2.5~v0.2.7：CLI 预编译修复、`/fleet` 斜杠命令上线、门面与文档迭代
- v0.2.0~v0.2.4：去中心化转向（mDNS + SSH 合一），首个 npm 发布

## 贡献者 · Contributors

- **[polaris-smart](https://github.com/polaris-smart)** — 设计与实现 Design & implementation
- **[getaba](https://github.com/getaba)** — 首批试用与真实跨网场景共创（Windows/HK 服务器）Early adoption & real cross-network co-creation

> 🌟 用得顺手就点个 Star · Star it if it fits your fleet.

## 许可证 · License

MIT © polaris-smart
