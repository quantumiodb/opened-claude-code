# cch Request Signing Algorithm

## 背景

`cch` 是 Claude Code 在每次 API 请求中写入系统提示的完整性哈希，格式如下：

```
x-anthropic-billing-header: cc_version=2.1.92.a35; cc_entrypoint=cli; cch=9500b;
```

该字段由 Anthropic 私有 Bun fork（`bun-anthropic`）的 HTTP 层在发送前计算并替换。
官方 npm 包（Node.js 运行）无法完成替换，始终发送 `cch=00000`。

参考逆向分析：https://a10k.co/b/reverse-engineering-claude-code-cch.html

---

## 算法

```
cch = xxHash64(body_bytes, seed=0x6E52736AC806831E) & 0xFFFFF
      formatted as 5-char zero-padded lowercase hex
```

### 步骤

1. 构建完整请求体，系统提示中含 `cch=00000` 占位符
2. 将请求体序列化为**紧凑 JSON**（无空格，等价于 Python `separators=(",", ":")`）
3. 对 UTF-8 字节流计算 `xxHash64`，seed = `0x6E52736AC806831E`
4. 取低 20 位：`hash & 0xFFFFF`
5. 格式化为 5 位小写 hex（不足补零）
6. 将序列化体中的 `cch=00000` 替换为计算值

### 关键参数

| 参数 | 值 |
|---|---|
| Hash 函数 | xxHash64（非加密） |
| Seed | `0x6E52736AC806831E` |
| Mask | `0xFFFFF`（低 20 bits） |
| 输出长度 | 5 hex chars |
| 输入格式 | 紧凑 JSON，UTF-8 编码 |
| 占位符 | `cch=00000` |

---

## 与 fingerprint（cc_version 后缀）的区别

两者都出现在同一 header，但机制完全不同：

| | cch | fingerprint（`a35`） |
|---|---|---|
| 算法 | xxHash64(request_body) | SHA256(salt + msg_chars + version) |
| 变化频率 | 每次请求（body 不同） | 每个 session（首条消息固定） |
| 作用 | 请求体完整性 | session 来源标识 |
| 实现位置 | Bun HTTP 层（Zig） | JS 层 `computeFingerprint()` |

fingerprint 算法：取第一条用户消息的 index [4, 7, 20] 处字符（越界补 `'0'`），拼接后做 `SHA256(salt + chars + version)[:3]`，salt = `59cf53e54c78`。

---

## 真实请求验证

使用 Claude Code v2.1.92（macOS，Haiku 4.5 extended thinking）的两条真实 API 请求验证。

### 共同参数

- Model: `claude-haiku-4-5-20251001`
- Thinking: `{type: "enabled", budget_tokens: 31999}`
- fingerprint: `a35`（同一 session，首条消息 "hi"，index [4,7,20] 越界 → `"000"` → SHA256 前缀）

### Request 1

- 用户输入：`"hi"`
- 期望 cch：`9500b`
- 紧凑 JSON body 长度：115682 bytes

```python
# 验证
body_with_placeholder = body.replace("cch=9500b", "cch=00000")
compact = json.dumps(json.loads(body_with_placeholder), separators=(",", ":"))
hash_val = xxhash.xxh64(compact.encode(), seed=0x6E52736AC806831E).intdigest() & 0xFFFFF
assert f"{hash_val:05x}" == "9500b"  # ✓
```

```
computed: 9500b  ✓
```

### Request 2

- 用户输入：`"1"`（第二轮对话）
- 期望 cch：`be662`
- 紧凑 JSON body 长度：116539 bytes（含上一轮 assistant 消息，体积更大）

```python
body_with_placeholder = body.replace("cch=be662", "cch=00000")
compact = json.dumps(json.loads(body_with_placeholder), separators=(",", ":"))
hash_val = xxhash.xxh64(compact.encode(), seed=0x6E52736AC806831E).intdigest() & 0xFFFFF
assert f"{hash_val:05x}" == "be662"  # ✓
```

```
computed: be662  ✓
```

### 验证脚本（Bun）

```typescript
const SEED = BigInt('0x6E52736AC806831E')
const MASK = BigInt('0xFFFFF')

function computeCch(compactJson: string): string {
  const bytes = new TextEncoder().encode(compactJson)
  const hash = (Bun as any).hash.xxHash64(bytes, SEED) & MASK
  return hash.toString(16).padStart(5, '0')
}

// 反向验证：将已知 cch 值改回占位符，模拟正向计算的初始状态
// 正向流程：body 中已有 cch=00000 → 计算 hash → 替换为计算结果
const parsed = JSON.parse(rawBody)
for (const b of parsed.system ?? [])
  if (b.text) b.text = b.text.replace('cch=9500b', 'cch=00000')
console.log(computeCch(JSON.stringify(parsed)))  // → 9500b
```

---

## 本项目实现

### Feature Flag

`NATIVE_CLIENT_ATTESTATION` 已加入 `scripts/build.ts` 的 `ENABLED_FEATURES`，构建时编译为 `true`。

### 核心模块

**`src/services/cch.ts`**

```typescript
export const CCH_PLACEHOLDER = 'cch=00000'
const SEED = BigInt('0x6E52736AC806831E')
const MASK = BigInt('0xFFFFF')

export function hasCchPlaceholder(body: string): boolean
export function computeCch(bodyBytes: Uint8Array): string  // Bun only; Node → '00000'
export function replaceCchPlaceholder(body: string, cch: string): string
```

### 拦截点

**`src/services/api/client.ts`** `buildFetch()`：

- SDK 调用 `fetch(url, { body: JSON.stringify(payload), ... })`
- `buildFetch` 包装的 fetch 收到**已序列化的紧凑 JSON 字符串**
- 检测到 `/v1/messages` + body 含 `cch=00000` → 计算哈希 → 替换 → 发送

```typescript
if (feature('NATIVE_CLIENT_ATTESTATION') &&
    resolvedUrl &&
    typeof init?.body === 'string' &&
    hasCchPlaceholder(init.body)) {
  if (new URL(resolvedUrl).pathname.endsWith('/v1/messages')) {
    const bodyBytes = new TextEncoder().encode(init.body)
    const cch = computeCch(bodyBytes)
    init = { ...init, body: replaceCchPlaceholder(init.body, cch) }
  }
}
```

### 与官方实现的差异

| | 官方 `bun-anthropic` | 本项目 |
|---|---|---|
| 实现层 | Zig（HTTP 层字节流原地替换） | TypeScript（fetch wrapper 字符串替换） |
| 密钥保护 | 编译进二进制，难以逆向 | 明文在源码中（已公开） |
| 运行时 | 私有 Bun fork | 标准 Bun |
| Node.js | 不支持（无 Zig 层） | `Bun.hash.xxHash64` 不可用，`computeCch` 返回 `'00000'`，替换为 no-op，仍发送 `cch=00000` |
