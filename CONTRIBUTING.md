# 贡献指南 · Contributing Guide

欢迎提 issue 和 PR。/ Issues and PRs are welcome.

## 开发环境 · Dev Setup

- Node 22+
- 依赖：无 npm 生产依赖；开发需要 TypeScript（本地 `npm i -D typescript` 或复用 dph harness 的 node_modules）
- No production npm deps; TypeScript needed for typecheck only.

```sh
npm test            # 84 条测试 / run tests
npx tsc --noEmit    # 类型检查 / typecheck
bash smoke.sh       # 端到端冒烟 / e2e smoke
```

## 代码约定 · Conventions

- 零 npm 依赖是硬约束：新代码只用 Node 22 标准库 / Zero npm deps is a hard constraint — Node 22 stdlib only
- 错误返回可读文本，不 throw（不炸 dph 会话）/ Return readable error text, never throw
- 密钥文件 0600 强制校验 / Key files must be 0600, fail loud otherwise
- 提交信息格式：`<类型>: <一句话>`（docs/fix/feat/chore）

## PR 流程 · PR Flow

1. fork + 分支 / fork and branch
2. 改动 + 测试（新功能带测试）/ changes with tests for new features
3. `npm test` + `npx tsc --noEmit` 全绿 / all green
4. 提 PR，说明动机与验证方式 / open PR with motivation and how you verified

## 路线图认领 · Roadmap Claims

路线图里的方向（任务簿抢单 / SFTP / 交互向导）欢迎认领——先在 issue 里说一声避免撞车。
Roadmap items are claimable — comment on an issue first to avoid duplication.

## 安全 · Security

发现安全问题请不要公开 issue，直接在 issue 里标注 `[security]` 并最小化描述。
For security issues, open an issue titled `[security] ...` with minimal detail.
