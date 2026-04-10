# Remote Control 自建后端支持设计

## 1. 背景与目标

目标是在 `CLAUDE_CODE_USE_OPENAI=1` 场景下，让 CLI 的 Remote Control 不依赖 Anthropic 托管后端，而是可对接自建服务（优先 Cloudflare Workers + Durable Objects）。

本设计聚焦三件事：

1. CLI 侧所有 Remote Control 相关流量可切换到自定义 `baseUrl`。
2. 定义最小可运行的服务端协议契约（HTTP + WebSocket）。
3. 提供 Cloudflare 上的实现建议与分阶段落地计划。

## 2. 当前状态（截至 2026-04-06）

### 2.1 已完成

- 已引入全局 API 基址覆盖：`CLAUDE_CODE_API_BASE_URL`。
- `getOauthConfig().BASE_API_URL` 可被该变量覆盖，覆盖后会影响大部分 bridge/sessions/oauth profile/telemetry 请求。
- 已补齐多处历史硬编码 `https://api.anthropic.com` 的路径，改为使用 `getOauthConfig().BASE_API_URL` 组装。

### 2.2 已知开关

- `CLAUDE_CODE_USE_OPENAI=1`：推理走 OpenAI 兼容路径。
- `CLAUDE_CODE_ALLOW_REMOTE_CONTROL_WITH_3P=1`：允许 3P provider 场景继续启用 Remote Control 所需的 OAuth/GrowthBook/WS 链路。
- `CLAUDE_CODE_API_BASE_URL=https://<your-backend>`：覆盖 Remote Control 相关 API/WS 基址。

### 2.3 仍属默认值（非阻断）

仍存在少量 `api.anthropic.com` 字面量作为默认回退值（例如 `constants/oauth.ts` 的 prod 默认配置），但在设置 `CLAUDE_CODE_API_BASE_URL` 后，Remote Control 主链路请求不再受其限制。

## 3. 总体架构（自建版）

### 3.1 逻辑组件

- `CLI Bridge`：本地轮询 work、spawn 子进程、转发消息。
- `Control API`：环境注册、work 队列、session 元数据管理。
- `Session Ingress WS`：worker 与服务端实时消息通道。
- `Session Subscribe WS`：viewer（web/assistant/CLI remote）订阅通道。

### 3.2 Cloudflare 建议映射

- `Worker Router`：统一路由与鉴权。
- `EnvironmentDO`（按 `environment_id` 分片）：
  - 保存环境信息与 work queue。
  - 处理 poll/ack/heartbeat/stop/reconnect。
- `SessionDO`（按 `session_id` 分片）：
  - 保存 session 元数据与状态。
  - 持有 worker WS 与 subscribers WS。
  - 负责事件广播、control request/response 转发。
- 可选持久化：
  - `D1`: session/environment 索引、审计日志。
  - `R2`: 大体积 transcript/event dump。
  - `KV`: 低频配置缓存。

## 4. 最小协议契约（V1）

以下契约以当前 CLI 调用行为为准，优先满足可跑通。

### 4.1 Environments API

- `POST /v1/environments/bridge`
  - 入参：`machine_name`, `directory`, `branch`, `git_repo_url`, `max_sessions`, `metadata.worker_type`, 可选 `environment_id`（复用）
  - 出参：`{ environment_id, environment_secret }`

- `GET /v1/environments/:environmentId/work/poll`
  - 可选 query：`reclaim_older_than_ms`
  - 出参：`WorkResponse | null`
  - `WorkResponse.secret` 必须是 base64url(JSON) 且满足：
    - `version: 1`
    - `session_ingress_token`
    - `api_base_url`
    - 可选 `use_code_sessions`

- `POST /v1/environments/:environmentId/work/:workId/ack`
- `POST /v1/environments/:environmentId/work/:workId/heartbeat`
- `POST /v1/environments/:environmentId/work/:workId/stop`（body: `{ force: boolean }`）
- `POST /v1/environments/:environmentId/bridge/reconnect`（body: `{ session_id }`）
- `DELETE /v1/environments/bridge/:environmentId`

### 4.2 Sessions API

- `POST /v1/sessions`
  - 入参至少包含：`environment_id`, `events`, `source`
  - 服务端需将 session 入队为可被对应 environment `poll` 的 work。
  - 出参：`{ id, ... }`

- `GET /v1/sessions/:sessionId`
- `PATCH /v1/sessions/:sessionId`（支持改 title）
- `POST /v1/sessions/:sessionId/archive`
- `POST /v1/sessions/:sessionId/events`（`{ events: [...] }`）

### 4.3 WebSocket 通道

- Worker ingress:
  - `WS /v1/session_ingress/ws/:sessionId`
  - 用于本地 worker 与后端实时交换 SDKMessage/control 消息。

- Viewer subscribe:
  - `WS /v1/sessions/ws/:sessionId/subscribe?organization_uuid=<uuid>`
  - 用于 remote viewer 订阅与发回 `control_response`。

## 5. 鉴权设计（建议）

建议最小化为三类 token（可由同一签发系统生成）：

1. `access token`：控制面 API（register/stop/deregister/sessions CRUD）。
2. `environment_secret`：环境级轮询操作（poll/ack/heartbeat）。
3. `session_ingress_token`：session ingress WS + session events 写入。

建议 JWT claims：

- `sub`: user or worker id
- `org_uuid`
- `environment_id`（按需）
- `session_id`（按需）
- `scope`: `bridge:environment`, `bridge:session`, `bridge:events`
- `exp`, `iat`, `iss`, `aud`

服务端需对 `environment_id` / `session_id` 与 token claim 做强校验，防止横向越权。

## 6. CLI 集成设计

### 6.1 当前可用

- 通过 `CLAUDE_CODE_API_BASE_URL` 将 `getOauthConfig().BASE_API_URL` 指向自建后端。
- Remote Control 在 3P provider 场景可通过 `CLAUDE_CODE_ALLOW_REMOTE_CONTROL_WITH_3P=1` 放开必要链路。

### 6.2 建议新增（后续迭代）

为避免复用现有 Anthropic OAuth 语义，建议增加 Remote Control 独立凭据配置：

- `CLAUDE_CODE_REMOTE_CONTROL_TOKEN`
- `CLAUDE_CODE_REMOTE_CONTROL_ORG_UUID`

并在 bridge/sessions 代码路径优先读取上述变量，作为自建后端模式的显式入口。

## 7. Cloudflare 落地建议

### 7.1 路由

- `/v1/environments/*` → `EnvironmentDO`
- `/v1/sessions/*` + `/v1/sessions/ws/*` + `/v1/session_ingress/ws/*` → `SessionDO`

### 7.2 并发与一致性

- 依赖 DO 单线程语义处理同一 `session_id` 的状态更新，避免并发写冲突。
- `work/poll` 使用短轮询（10s 超时）对齐 CLI 行为。
- `heartbeat` 维护租约 TTL，过期后将 work 标记为可 reclaim。

### 7.3 观测与排障

- 每个请求记录 `request_id`, `environment_id`, `session_id`, `work_id`。
- WS 连接事件记录 `connected/disconnected/reconnect` 与 close code。
- 提供 `/healthz` 和最小诊断端点（例如查询 session/work 当前状态）。

## 8. 分阶段计划

### Phase 1: 最小可用（建议先做）

- 实现 Environments API + Sessions API + 两条 WS。
- 实现基础 JWT 校验与租约机制。
- 先仅支持 V1 通道，`use_code_sessions=false`。

### Phase 2: 稳定性

- 加入 reconnect reclaim 策略、重试与死信机制。
- 增强审计日志与指标面板。

### Phase 3: 增强能力

- 视需要支持 `use_code_sessions=true`（CCR v2 语义）。
- 支持多租户隔离、细粒度 RBAC、策略引擎。

## 9. 验收标准

满足以下条件视为自建 Remote Control 可用：

1. CLI 设置 `CLAUDE_CODE_API_BASE_URL` 后，Remote Control 主链路不再访问 Anthropic 托管地址。
2. `claude --rc` 或 `claude remote-control` 可完成 environment 注册、work 拉取、session 建立、消息双向流转。
3. viewer 侧可稳定接收消息并回传 control response。
4. 断网/重连/会话恢复路径可用（至少一次成功恢复验证）。

