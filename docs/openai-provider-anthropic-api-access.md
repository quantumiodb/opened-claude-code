# CLAUDE_CODE_USE_OPENAI 环境变量下的 Anthropic API 访问分析

## 概述

当设置 `CLAUDE_CODE_USE_OPENAI=1` 时，Claude Code 应该使用 OpenAI 兼容的 API 提供商，而不是 Anthropic 的 API。然而，代码库中存在一些路径仍然会访问 Anthropic API。

## 仍然访问 Anthropic API 的代码路径

### 1. WebFetchTool 域名检查

**文件**: `src/tools/WebFetchTool/utils.ts:184`

```typescript
const response = await axios.get(
  `https://api.anthropic.com/api/web/domain_info?domain=${encodeURIComponent(domain)}`,
  { timeout: DOMAIN_CHECK_TIMEOUT_MS },
)
```

**问题**: 这个预检请求用于检查域名是否被阻止，但没有检查 `CLAUDE_CODE_USE_OPENAI` 环境变量。

**影响**: 当使用 OpenAI 提供商时，WebFetchTool 仍然会向 Anthropic API 发送域名检查请求。

**建议修复**:
```typescript
// 在 checkDomainBlocklist 函数中添加检查
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) {
  // 跳过域名检查或使用替代方案
  return { status: 'allowed' }
}
```

---

### 2. GrowthBook 功能标志服务

**文件**: `src/services/analytics/growthbook.ts:505-506`

```typescript
const baseUrl =
  process.env.USER_TYPE === 'ant'
    ? process.env.CLAUDE_CODE_GB_BASE_URL || 'https://api.anthropic.com/'
    : 'https://api.anthropic.com/'
```

**问题**: GrowthBook 客户端默认连接到 `https://api.anthropic.com/` 获取功能标志和动态配置，没有检查 `CLAUDE_CODE_USE_OPENAI`。

**影响**: 当使用 OpenAI 提供商时，GrowthBook 仍然会向 Anthropic API 请求功能标志。

**建议修复**:
```typescript
const baseUrl =
  isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)
    ? undefined // 禁用 GrowthBook
    : process.env.USER_TYPE === 'ant'
      ? process.env.CLAUDE_CODE_GB_BASE_URL || 'https://api.anthropic.com/'
      : 'https://api.anthropic.com/'
```

---

### 3. 1P Event Logging

**文件**: `src/services/analytics/firstPartyEventLoggingExporter.ts:116-120`

```typescript
const baseUrl =
  options.baseUrl ||
  (process.env.ANTHROPIC_BASE_URL === 'https://api-staging.anthropic.com'
    ? 'https://api-staging.anthropic.com'
    : 'https://api.anthropic.com')

this.endpoint = `${baseUrl}${options.path || '/api/event_logging/batch'}`
```

**问题**: 事件日志导出器默认发送到 `https://api.anthropic.com/api/event_logging/batch`，没有检查 `CLAUDE_CODE_USE_OPENAI`。

**影响**: 当使用 OpenAI 提供商时，事件日志仍然会发送到 Anthropic API。

**建议修复**:
```typescript
const baseUrl =
  options.baseUrl ||
  (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)
    ? undefined // 禁用 1P event logging
    : process.env.ANTHROPIC_BASE_URL === 'https://api-staging.anthropic.com'
      ? 'https://api-staging.anthropic.com'
      : 'https://api.anthropic.com')
```

---

## 已正确处理的代码路径

以下代码路径已经正确检查了 `CLAUDE_CODE_USE_OPENAI`：

| 文件 | 行号 | 功能 |
|------|------|------|
| `src/services/api/client.ts` | 153-160 | API 客户端使用 OpenAI shim |
| `src/utils/autoUpdater.ts` | 77-79 | 跳过版本检查 |
| `src/utils/auth.ts` | 119 | 判断是否使用第三方服务 |
| `src/services/analytics/datadog.ts` | 169-171 | 跳过 Datadog 日志 |
| `src/services/analytics/config.ts` | 8 | 确定 API provider |

---

## 相关环境变量

- `CLAUDE_CODE_USE_OPENAI` - 启用 OpenAI 兼容提供商
- `CLAUDE_CODE_USE_BEDROCK` - 启用 AWS Bedrock
- `CLAUDE_CODE_USE_VERTEX` - 启用 Google Vertex AI
- `CLAUDE_CODE_USE_FOUNDRY` - 启用 Azure Foundry
- `CLAUDE_CODE_GB_BASE_URL` - GrowthBook API 基础 URL（ant 用户）
- `ANTHROPIC_BASE_URL` - Anthropic API 基础 URL

---

## 修复优先级

1. **高优先级**: WebFetchTool 域名检查 - 直接影响 WebFetch 工具功能
2. **中优先级**: GrowthBook 功能标志服务 - 影响功能标志和动态配置
3. **中优先级**: 1P Event Logging - 影响事件日志收集

---

## 测试建议

修复后，应进行以下测试：

1. 设置 `CLAUDE_CODE_USE_OPENAI=1` 并运行 Claude Code
2. 使用 WebFetch 工具，确认没有向 `api.anthropic.com` 发送请求
3. 检查网络日志，确认没有其他 Anthropic API 调用
4. 验证功能标志和事件日志是否正确禁用或使用替代方案
