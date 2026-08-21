# Changelog

## v0.1.2 — 2026-08-21

一键舰队 / One-command fleet join.

### 功能 / Features

- **邀请码入队三连 / Invite-based onboarding**：`fleet8 invite`（主控生成 host:port/user/token 邀请码）→ `fleet8 join`（新设备一条命令：解析码 + 生成密钥 + 登记 + 打印公钥）→ `fleet8 allow`（主控写 authorized_keys 完成授权）
- 真实跨机闭环验证（HK ↔ Mac）/ verified end-to-end across real machines
- **版本自报改为动态读取 package.json**，mDNS 身份不再硬编码版本号 / mDNS identity version now read from package.json at build time
- package.json 补 `repository` 字段（dshmarket 1.15.0+ 下载量关联）/ repository field for dshmarket download-count linking

## v0.2.3 — 2026-08-18

首个公开版本 / First public release.

### 功能 / Features

- **mDNS 同网发现与配对** / mDNS LAN discovery & pairing
  - `fleet_discover`：扫描同网 fleet 设备 / scan LAN for fleet devices
  - `fleet_pair`：WiFi 式密钥配对 / WiFi-style key pairing
  - 零 npm 依赖：手写 DNS 报文（RFC 6762）/ zero npm deps, hand-rolled DNS wire format
- **SSH 跨网直连** / SSH cross-network direct execution
  - `fleet_ssh_exec`：在已配对设备执行命令 / run commands on paired devices
  - `fleet_workspace`：远程工作区管理 / remote workspace management
  - 系统 ssh 封装 + ControlMaster 连接复用 / system ssh wrapper + ControlMaster reuse
- **配对→SSH 联动** / pairing auto-links SSH registry（配对成功自动写 SSH 注册表）
- **模块开关** / module switch：`modules: mdns | ssh | both`，关掉的模块工具不注册
- **安全约定** / security：只连已配对设备；密钥 0600 强制；错误返回可读文本不炸会话

### CLI

- `fleet7`（mDNS：discover/serve/pair）
- `fleet8`（SSH：pair/list/ssh/workspace/pubkey/remove）

### 测试 / Tests

- 84 条测试（node --test）+ 端到端冒烟（双设备 serve → 发现 → 配对 → 联动真连）
