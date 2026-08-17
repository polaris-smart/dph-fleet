# Security Policy / 安全策略

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅        |

## Reporting a Vulnerability / 漏洞报告

请开 issue 并以 `[security]` 开头，最小化披露细节；不要在公开 issue 里贴出可利用的完整载荷。
Open an issue titled `[security] ...` with minimal exploitable detail.

设计基线 / Design baseline：只连已配对设备；密钥文件强制 0600；插件不经手任何模型 key。
Only paired devices are reachable; key files must be 0600; this plugin never touches model API keys.
