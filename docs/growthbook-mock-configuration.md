# GrowthBook Mock Configuration

本文档描述如何 Mock GrowthBook 服务来启用 Claude Code 的各种功能。

## 背景

Claude Code 使用 GrowthBook 作为功能开关（Feature Flag）系统。在开发环境或源码版本中，可以通过以下方法 Mock GrowthBook 来启用各种高级功能。

## 配置方法

### 方法 1: 环境变量（推荐）

GrowthBook 支持 `CLAUDE_INTERNAL_FC_OVERRIDES` 环境变量进行功能覆盖：

```bash
# 设置功能开关覆盖（无需设置 USER_TYPE）
export CLAUDE_INTERNAL_FC_OVERRIDES='{
  "tengu_ccr_bridge": true,
  "tengu_ultraplan_model": "claude-3-5-sonnet-20240620",
  "tengu_auto_background_agents": true,
  "tengu_session_memory": true,
  "tengu_kairos_brief": true,
  "tengu_harbor": true,
  "tengu_harbor_permissions": true,
  "tengu_bridge_repl_v2": true,
  "enhanced_telemetry_beta": false
}'
```

**注意**: 本项目已移除 `USER_TYPE=ant` 限制，所有用户都可以使用环境变量覆盖功能。

### 方法 2: 配置文件

编辑 `~/.claude/config.json` 文件，添加缓存的功能开关：

```json
{
  "cachedGrowthBookFeatures": {
    "tengu_ultraplan_model": "claude-3-5-sonnet-20240620",
    "tengu_auto_background_agents": true,
    "tengu_session_memory": true,
    "tengu_kairos_brief": true,
    "tengu_harbor": true,
    "tengu_harbor_permissions": true,
    "tengu_bridge_repl_v2": true,
    "tengu_chrome_auto_enable": true,
    "tengu_ccr_bridge": true,
    "tengu_remote_backend": true,
    "tengu_terminal_panel": true,
    "tengu_terminal_sidebar": true,
    "enhanced_telemetry_beta": false
  }
}
```

### 方法 3: 代码级别 Mock

在测试或开发中，可以直接替换 GrowthBook 函数：

```typescript
// 在你的测试/入口文件中
import * as growthbook from './src/services/analytics/growthbook.js'

// Mock getFeatureValue_CACHED_MAY_BE_STALE
const mockFeatures: Record<string, unknown> = {
  'tengu_ultraplan_model': 'claude-3-5-sonnet-20240620',
  'tengu_auto_background_agents': true,
  'tengu_session_memory': true,
}

;(growthbook as any).getFeatureValue_CACHED_MAY_BE_STALE = <T>(
  feature: string,
  defaultValue: T
): T => {
  return (mockFeatures[feature] as T) ?? defaultValue
}
```

## 功能开关详解

### 🎯 核心功能

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `tengu_ultraplan_model` | Ultraplan 使用的模型 | `"claude-3-5-sonnet-20240620"` | 指定 Ultraplan 功能使用的 LLM 模型 |
| `tengu_auto_background_agents` | 自动后台智能体 | `true` | 120秒后自动将长时间运行的智能体转为后台模式 |
| `tengu_session_memory` | 会话记忆功能 | `true` | 启用跨对话的会话记忆系统 |
| `tengu_kairos_brief` | Brief 模式 | `true` | 启用简洁的助手响应模式 |

### 🌉 桥接功能

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `tengu_bridge_repl_v2` | 桥接 REPL v2 | `true` | IDE 集成的新版本桥接协议 |
| `tengu_bridge_system_init` | 桥接系统初始化 | `true` | 桥接系统的初始化功能 |
| `tengu_ccr_bridge` | CCR 桥接 | `true` | Claude Code Remote 桥接功能 |
| `tengu_ccr_mirror` | CCR 镜像 | `true` | CCR 镜像服务支持 |

### 🚢 通道系统 (Channels)

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `tengu_harbor` | 通道系统总开关 | `true` | 启用 MCP 通道系统 |
| `tengu_harbor_permissions` | 通道权限中继 | `true` | 通道权限传递功能 |
| `tengu_harbor_ledger` | 通道白名单配置 | `[]` | 允许的通道列表（空数组表示允许所有） |

### 🖥️ 终端功能

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `tengu_terminal_panel` | 终端面板 | `true` | 内置终端面板功能 |
| `tengu_terminal_sidebar` | 终端侧边栏 | `true` | 终端侧边栏显示 |
| `tengu_chrome_auto_enable` | Chrome 自动启用 | `true` | 自动启用 Chrome 集成 |

### 🔧 系统功能

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `tengu_destructive_command_warning` | 危险命令警告 | `true` | 执行危险命令前的警告提示 |
| `tengu_immediate_model_command` | 即时模型命令 | `true` | 立即执行模型相关命令 |
| `tengu_remote_backend` | 远程后端 | `true` | 启用远程执行后端 |

### 🔒 隐私与安全

| Feature Flag | 功能描述 | 推荐值 | 说明 |
|-------------|----------|--------|------|
| `enhanced_telemetry_beta` | 增强遥测 | `false` | 关闭增强的遥测数据收集 |

## 高级配置示例

### Cron 任务配置

```json
{
  "tengu_kairos_cron": true,
  "tengu_kairos_cron_durable": true,
  "tengu_kairos_cron_config": {
    "oneShotMinuteMod": 5,
    "oneShotMaxMs": 300000,
    "oneShotFloorMs": 30000
  }
}
```

### Brief 模式配置

```json
{
  "tengu_kairos_brief_config": {
    "enabled": true,
    "threshold": 100
  }
}
```

### Fast Mode 配置

```json
{
  "tengu_penguins_off": null,
  "tengu_marble_sandcastle": false
}
```

## 一键启用所有功能

```bash
# 无需设置 USER_TYPE，直接设置功能开关
export CLAUDE_INTERNAL_FC_OVERRIDES='{
  "tengu_ultraplan_model": "claude-3-5-sonnet-20240620",
  "tengu_auto_background_agents": true,
  "tengu_session_memory": true,
  "tengu_kairos_brief": true,
  "tengu_harbor": true,
  "tengu_harbor_permissions": true,
  "tengu_bridge_repl_v2": true,
  "tengu_bridge_system_init": true,
  "tengu_ccr_bridge": true,
  "tengu_ccr_mirror": true,
  "tengu_chrome_auto_enable": true,
  "tengu_terminal_panel": true,
  "tengu_terminal_sidebar": true,
  "tengu_destructive_command_warning": true,
  "tengu_immediate_model_command": true,
  "tengu_remote_backend": true,
  "enhanced_telemetry_beta": false
}'
```

## 验证配置

启动 Claude Code 后，可以通过以下方式验证功能开关是否生效：

1. 查看启动日志中的 GrowthBook 相关信息
2. 使用 `/config` 命令查看当前配置
3. 尝试使用相应功能（如 `ultraplan`、`/brief` 等）

## 注意事项

1. **环境变量优先级最高**: `CLAUDE_INTERNAL_FC_OVERRIDES` > 配置文件缓存 > 默认值
2. **无用户限制**: 本项目已移除 `USER_TYPE=ant` 限制，所有用户都可以使用环境变量覆盖
3. **重启生效**: 修改环境变量后需要重启 Claude Code
4. **配置文件**: 修改 `~/.claude/config.json` 后立即生效
5. **功能依赖**: 某些功能可能依赖其他功能开关，请参考代码中的条件判断

## 相关文件

- `src/services/analytics/growthbook.ts` - GrowthBook 服务主要实现
- `src/utils/betas.ts` - Beta 功能管理
- `src/utils/fastMode.ts` - Fast Mode 相关功能
- `src/utils/effort.ts` - Effort 级别配置

## 常见问题

**Q: 为什么设置了环境变量但功能没有启用？**
A: 确保环境变量格式正确（有效的JSON），并且重启了 Claude Code。本项目已移除用户类型限制。

**Q: 如何查看所有可用的功能开关？**
A: 查看 `src/services/analytics/growthbook.ts` 文件中的 `getFeatureValue_CACHED_MAY_BE_STALE` 调用。

**Q: 配置文件在哪里？**
A: 默认在 `~/.claude/config.json`，如果不存在可以手动创建。