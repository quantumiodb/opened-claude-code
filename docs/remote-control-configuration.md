# Remote Control 完整配置指南

## 1. 配置文件设置 (~/.claude.json)

```json
{
  "remoteControlAtStartup": true,
  "cachedGrowthBookFeatures": {
    "tengu_ccr_bridge": true,
    "tengu_bridge_repl_v2": true,
    "tengu_cobalt_harbor": true,
    "tengu_ccr_mirror": false
  }
}
```

## 2. 环境变量设置

### 基本Remote Control环境变量
```bash
# 功能开关覆盖（推荐方式）
export CLAUDE_INTERNAL_FC_OVERRIDES='{"tengu_ccr_bridge": true, "tengu_bridge_repl_v2": true, "tengu_cobalt_harbor": true}'

# 第三方API支持（如果使用OpenAI等）
export CLAUDE_CODE_ALLOW_REMOTE_CONTROL_WITH_3P=1

# 自建后端支持
export CLAUDE_CODE_API_BASE_URL=https://your-backend-url
export CLAUDE_CODE_USE_OPENAI=1

# 启用bridge模式构建特性（开发环境）
export FEATURES=BRIDGE_MODE,CCR_AUTO_CONNECT,CCR_MIRROR
```

### 完整配置脚本
```bash
#!/bin/bash
# remote-control-setup.sh

# 开启Remote Control核心功能
export CLAUDE_INTERNAL_FC_OVERRIDES='{
  "tengu_ccr_bridge": true,
  "tengu_bridge_repl_v2": true,
  "tengu_cobalt_harbor": true,
  "tengu_ccr_mirror": false,
  "tengu_ultraplan": true,
  "tengu_session_memory": true
}'

# 第三方API兼容
export CLAUDE_CODE_ALLOW_REMOTE_CONTROL_WITH_3P=1

# 启动Claude Code
echo "Remote Control配置已启用"
claude
```

## 3. 功能验证

### 检查配置
```bash
# 1. 检查认证状态
claude auth status

# 2. 启动并查看Remote Control状态
claude

# 3. 手动管理Remote Control连接
claude /remote-control
```

### 预期行为
- 启动时如果 `remoteControlAtStartup: true`，会自动尝试连接Remote Control
- 可以通过 `/remote-control` 命令查看连接状态和管理连接
- 支持双向通信：本地CLI ↔ Claude.ai Web界面

## 4. 故障排除

### 常见问题
1. **需要claude.ai订阅**: Remote Control需要有效的claude.ai OAuth令牌
2. **组织权限**: 需要组织UUID来确定特性门控资格
3. **版本要求**: CLI版本需要满足最低要求

### 调试命令
```bash
# 查看详细调试信息
CLAUDE_DEBUG=1 claude

# 检查特性开关状态
CLAUDE_INTERNAL_FC_OVERRIDES='{"tengu_ccr_bridge": true}' claude --version
```

## 5. 相关文档
- `docs/remote-control-selfhosted-design.md` - 自建后端设计文档
- `src/bridge/bridgeEnabled.ts` - 权限检查逻辑
- `src/utils/config.ts` - 配置文件处理