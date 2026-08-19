// dph-fleet 零依赖类型声明：不依赖 @deepseek-ai/dsh-tools / schemastery，
// 自行声明 dsh 注入的服务（tools/commands）与工具注册的类型面。
// 运行时由 dsh 提供（cordis 动态注入），这里只为 tsc 提供类型。

import type { Context } from '@deepseek-ai/cordis'

/** 工具注册对象（dsh-tools defineTool 的等价最小面）。 */
export interface FleetToolDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required?: boolean; description?: string }>;
  output: {
    schema: { type: string };
    render: (args: Record<string, unknown>, value: string) => Array<{ type: 'text'; text: string }>;
  };
  execute: (
    args: Record<string, unknown>,
    exec: { signal: AbortSignal },
  ) => Promise<string> | string;
}

/** 扩展 Context：dsh 注入的 tools 服务（类型面；inject/commands 保持 cordis 原签名）。 */
export interface FleetContext extends Context {
  tools: {
    register(def: FleetToolDef): () => void;
  };
}
