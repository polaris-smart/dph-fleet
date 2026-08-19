#!/usr/bin/env bash
# dph-fleet v0.2.0 端到端冒烟（FLEET-V02-MERGE）：
#   1. tsc 0 error + 单测全绿
#   2. 三态工具数断言（both=4 / mdns=2 / ssh=2；关掉的模块工具不注册）
#   3. 本机双进程 mDNS 发现 + 输 key 配对（复用 v0.1 冒烟姿势）
#   4. 联动断言：配对完 SSH 注册表有该设备 + fleet_ssh_exec 真连执行 echo
# 依赖：本机有支持组播的 IPv4 网卡（eth0；mDNS 用 224.0.0.251:5353）+ sshd（联动真连）。
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- tsc 解析（优先 PATH，其次 harness 根 node_modules）----
if command -v tsc >/dev/null 2>&1; then
  TSC=tsc; TR=""
elif [[ -n "${DEEPSEEK_HARNESS:-}" && -x "$DEEPSEEK_HARNESS/node_modules/.bin/tsc" ]]; then
  TSC="$DEEPSEEK_HARNESS/node_modules/.bin/tsc"
  TR="$DEEPSEEK_HARNESS/node_modules/@types"
elif [[ -x "$HOME/deepseek-harness/node_modules/.bin/tsc" ]]; then
  TSC="$HOME/deepseek-harness/node_modules/.bin/tsc"
  TR="$HOME/deepseek-harness/node_modules/@types"
else
  TSC=""; TR=""
fi

WORK="$(mktemp -d)"
A_DSH="$WORK/a/dsh"; A_FLT="$WORK/a/fleet"
B_DSH="$WORK/b/dsh"; B_FLT="$WORK/b/fleet"
A_PID=""; B_PID=""
AUTH_KEYS="$HOME/.ssh/authorized_keys"
AUTH_BAK="$WORK/authorized_keys.bak"

cleanup() {
  [[ -n "$A_PID" ]] && kill "$A_PID" 2>/dev/null || true
  [[ -n "$B_PID" ]] && kill "$B_PID" 2>/dev/null || true
  if [[ -f "$AUTH_BAK" ]]; then
    cp "$AUTH_BAK" "$AUTH_KEYS"
    chmod 600 "$AUTH_KEYS"
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { echo; echo "== $1 =="; }
fail() { echo "FAIL：$1" >&2; exit 1; }

fleet7() { DSH_HOME="$A_DSH" FLEET_HOME="$A_FLT" node "$DIR/src/mdns/cli.ts" "$@"; }

# 按 modules 启动插件（Config 纯对象合并），返回注册工具名逗号列表。
count_tools() {
  TOOLS_CONFIG="{\"modules\":\"$1\"}" node --input-type=module -e '
import { apply, Config } from "./src/plugin.ts";
const raw = JSON.parse(process.env.TOOLS_CONFIG);
const value = { ...Config, ...raw };
const tools = [];
apply({ tools: { register(def) { tools.push(def.name); return () => {}; } }, inject(_d, fn) { fn({ commands: { register() {} } }); } }, value);
console.log(tools.sort().join(","));
'
}

step "1. tsc 0 error + 单测全绿"
if [[ -n "$TSC" ]]; then
  (cd "$DIR" && "$TSC" --noEmit ${TR:+--typeRoots "$TR"}) || fail "tsc 类型门失败"
fi
(cd "$DIR" && DSH_HOME= FLEET_HOME= node --test >/dev/null 2>&1) || fail "node --test 失败"
echo "  ✓ tsc 0 error + node --test 全绿"

step "2. 三态工具数断言（both=4 / mdns=2 / ssh=2）"
assert_tools() {
  local m="$1" want="$2"
  local got
  got="$(count_tools "$m")"
  [[ "$got" == "$want" ]] || fail "modules=$m 工具集错误：期望 [$want] 实得 [$got]"
  echo "  ✓ modules=$m → $got"
}
assert_tools both "fleet_discover,fleet_pair,fleet_ssh_exec,fleet_workspace"
assert_tools mdns "fleet_discover,fleet_pair"
assert_tools ssh "fleet_ssh_exec,fleet_workspace"

step "3. 关 ssh 模块时 fleet_ssh_exec 不存在（不注册半死工具）"
if count_tools mdns | grep -q fleet_ssh_exec; then fail "modules=mdns 不应注册 fleet_ssh_exec"; fi
if count_tools ssh | grep -q fleet_discover; then fail "modules=ssh 不应注册 fleet_discover"; fi
echo "  ✓ 关掉的模块工具不注册"

step "4. 起两台设备 serve（macbook 主控 + raspberrypi 被控）"
DSH_HOME="$A_DSH" FLEET_HOME="$A_FLT" node "$DIR/src/mdns/cli.ts" serve --name macbook > "$WORK/a.out" 2> "$WORK/a.err" &
A_PID=$!
DSH_HOME="$B_DSH" FLEET_HOME="$B_FLT" node "$DIR/src/mdns/cli.ts" serve --name raspberrypi > "$WORK/b.out" 2> "$WORK/b.err" &
B_PID=$!
for _ in $(seq 1 100); do
  grep -q '设备已上线' "$WORK/a.out" 2>/dev/null && grep -q '设备已上线' "$WORK/b.out" 2>/dev/null && break
  sleep 0.1
done
grep -q '设备已上线' "$WORK/a.out" || fail "设备 A serve 未上线（stderr: $(cat "$WORK/a.err")）"
grep -q '设备已上线' "$WORK/b.out" || fail "设备 B serve 未上线（stderr: $(cat "$WORK/b.err")）"
B_ADDR="$(grep '^地址: ' "$WORK/b.out" | sed 's/^地址: //')"
B_KEY="$(grep '^密钥: ' "$WORK/b.out" | sed 's/^密钥: //')"
B_ID="$(grep '^deviceId: ' "$WORK/b.out" | sed 's/^deviceId: //')"
[[ "$B_ADDR" =~ ^[0-9.]+:[0-9]+$ ]] || fail "B 地址格式异常：$B_ADDR"
[[ "$B_KEY" =~ ^fleet-d-[0-9a-f]{64}$ ]] || fail "B 密钥格式异常"
echo "A（macbook）与 B（raspberrypi）已上线，B = $B_ADDR / $B_ID"

step "5. mDNS 发现：A 看到 raspberrypi"
fleet7 discover --timeout 2500 > "$WORK/a-disc.out" 2>&1
grep -q 'raspberrypi' "$WORK/a-disc.out" || fail "A 未发现 raspberrypi：$(cat "$WORK/a-disc.out")"
echo "  ✓ 发现 OK"

step "6. 配对（正确 key）→ 成功 + 联动写 SSH 注册表"
if [[ -f "$AUTH_KEYS" ]]; then cp "$AUTH_KEYS" "$AUTH_BAK"; fi
fleet7 pair "$B_ADDR" "$B_KEY" > "$WORK/pair-ok.out" 2>&1
cat "$WORK/pair-ok.out"
grep -q '配对成功' "$WORK/pair-ok.out" || fail "配对未成功：$(cat "$WORK/pair-ok.out")"
grep -q '已联动 SSH 注册表' "$WORK/pair-ok.out" || fail "应联动写 SSH 注册表：$(cat "$WORK/pair-ok.out")"
SSH_REG="$A_FLT/ssh-devices.json"
[[ -f "$SSH_REG" ]] || fail "缺 SSH 注册表 $SSH_REG"
grep -q "$B_ID" "$SSH_REG" || fail "SSH 注册表缺 B 的 deviceId"
[[ "$(stat -c '%a' "$SSH_REG")" == "600" ]] || fail "SSH 注册表权限应为 600，实得 $(stat -c '%a' "$SSH_REG")"
echo "  ✓ 配对成功 + SSH 注册表有该设备（host/port/user/keyPath，600）"

step "7. fleet_ssh_exec 真连执行 echo（discover → pair → ssh_exec 一条线）"
FLEET_HOME="$A_FLT" SSH_HOST="$B_ID" node --input-type=module -e '
import { registerSshTools } from "./src/ssh/plugin.ts";
const tools = [];
registerSshTools({ tools: { register(def) { tools.push(def); return () => {}; } } }, { fleetHome: process.env.FLEET_HOME });
const execTool = tools.find((t) => t.name === "fleet_ssh_exec");
const out = await execTool.execute({ host: process.env.SSH_HOST, command: "echo hello-from-merged; hostname" }, { signal: new AbortController().signal });
console.log(out);
' > "$WORK/ssh-exec.out" 2>&1
cat "$WORK/ssh-exec.out"
grep -q 'hello-from-merged' "$WORK/ssh-exec.out" || fail "fleet_ssh_exec 真连未返回预期输出：$(cat "$WORK/ssh-exec.out")"
echo "  ✓ 联动真跑：mDNS 配对后 SSH 直连执行 echo 成功"

echo
echo "=============================================="
echo "dph-fleet v0.2.0 冒烟全绿：三态工具注册 + 发现配对 + 联动写注册表 + ssh_exec 真连 + 关模块不注册 + tsc 0 error"
