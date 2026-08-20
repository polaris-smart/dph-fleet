// dph-fleet 零依赖类型声明：不依赖 @deepseek-ai/dsh-tools / schemastery，
// 自行声明 dsh 注入的服务（tools/commands）与工具注册的类型面。
// 运行时由 dsh 提供（cordis 动态注入），这里只为 tsc 提供类型。

import type { Context } from '@deepseek-ai/cordis'

/** 单个参数的 DSL 声明（对齐官方 defineTool 的 ParameterSchemaSpec 最小面）。 */
export interface ParameterSpec {
  type: string;
  required?: boolean;
  description?: string;
}

/**
 * 把参数 DSL 编译成 LLM 端要求的 JSON Schema（object 根）。
 * DeepSeek API 严格要求 parameters.type === 'object'（0.2.10 headless 实炸：
 * Invalid schema for function 'fleet_discover': schema must be a JSON Schema
 * of 'type: "object"', got 'type: null'）——裸 {}/属性表都不是合法根。
 * 对齐官方 parameterSchemaSpecToJsonSchema：{type:'object', properties, required}。
 */
export function compileParameters(spec: Record<string, ParameterSpec>): {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
} {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const [key, param] of Object.entries(spec)) {
    properties[key] = param.description !== undefined
      ? { type: param.type, description: param.description }
      : { type: param.type };
    if (param.required === true) required.push(key);
  }
  return required.length > 0
    ? { type: 'object', properties, required }
    : { type: 'object', properties };
}

/** 工具注册对象（dsh-tools defineTool 的等价最小面）。 */
export interface FleetToolDef {
  name: string;
  description: string;
  /** 编译后的 JSON Schema（用 compileParameters 生成；直接传属性表会在 LLM 端被拒）。 */
  parameters: ReturnType<typeof compileParameters>;
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
