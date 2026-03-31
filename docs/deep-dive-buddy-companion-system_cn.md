# Deep Dive: Claude Code 的隐藏电子宠物系统 (Buddy / Companion)

[English](deep-dive-buddy-companion-system.md)

> 源码挖掘专题报告 — 基于 2026-03-31 源码快照

## TL;DR

**是真的。** Claude Code 内部隐藏了一套完整的电子宠物 (Virtual Pet) 系统，代号 **"Buddy"**。它被 `feature('BUDDY')` 特性开关保护，在公开版本中默认关闭。这不是一个原型——它有完整的类型系统、ASCII 艺术精灵动画、稀有度系统、属性点分配、语音气泡对话，甚至还有一个"撸宠物"功能。

原计划的 **愚人节彩蛋**：代码中明确写着 teaser 窗口是 **2026 年 4 月 1-7 日**。

---

## 1. 系统架构总览

```
src/buddy/
├── types.ts              # 类型定义：物种、稀有度、属性、眼睛、帽子
├── companion.ts          # 核心逻辑：确定性骰子、缓存、序列化
├── sprites.ts            # 18种物种的 ASCII 精灵 + 帽子 + 动画帧
├── CompanionSprite.tsx   # React/Ink 渲染组件：动画循环、气泡、窄屏适配
├── prompt.ts             # 系统提示注入：让 Claude 知道宠物的存在
└── useBuddyNotification.tsx  # 启动彩虹提示 + teaser 窗口控制
```

相关的外部集成点：
- `src/commands/buddy/index.ts` — `/buddy` 斜杠命令（已 stub，完整实现未包含在源码映射中）
- `src/commands.ts:118` — 命令注册，受 `feature('BUDDY')` 门控
- `src/utils/config.ts:269-271` — 持久化存储：`companion` (灵魂) + `companionMuted` (静音)
- `src/state/AppStateStore.ts:168-171` — 运行时状态：`companionReaction` + `companionPetAt`
- `src/screens/REPL.tsx` — 主界面集成：精灵渲染位置、对话触发、滚动清除

---

## 2. 宠物是怎么"生成"的？

### 确定性骨骼 (Deterministic Bones)

宠物的外观和属性并非随机——它们由用户 ID 的哈希值完全确定：

```typescript
// companion.ts
const SALT = 'friend-2026-401'   // 注意日期暗示：2026年4月1日

export function roll(userId: string): Roll {
  const key = userId + SALT
  const value = rollFrom(mulberry32(hashString(key)))
  return value
}
```

使用 **Mulberry32** 伪随机数生成器（一种轻量级的 seeded PRNG），从 `hash(userId + salt)` 出发，依次掷出：

1. **稀有度 (Rarity)** — 加权随机
2. **物种 (Species)** — 均匀随机
3. **眼睛 (Eye)** — 均匀随机
4. **帽子 (Hat)** — common 没有帽子，其他稀有度随机
5. **闪光 (Shiny)** — 1% 概率
6. **属性点 (Stats)** — 一项峰值、一项洼地、其余随机散布

关键设计：**骨骼永不持久化**。每次读取都从 `hash(userId)` 重新计算。这意味着：
- 用户无法通过编辑 config 伪造稀有度
- 物种重命名/数组调整不会破坏已存储的宠物

### 灵魂 (Soul) — 模型生成

骨骼决定外观，但宠物的 **名字** 和 **个性** 是由 LLM 生成的（代码称之为 "soul"）：

```typescript
// types.ts
export type CompanionSoul = {
  name: string        // LLM 起的名字
  personality: string // LLM 写的性格描述
}

// 实际存储到 config 的内容
export type StoredCompanion = CompanionSoul & { hatchedAt: number }
```

"孵化" (hatching) 过程发生在用户首次执行 `/buddy` 命令时（具体实现在 stub 中未提取到）。

---

## 3. 稀有度系统

完全模仿经典抽卡/gacha 游戏的稀有度分布：

| 稀有度 | 权重 | 概率 | 星标 | 颜色主题 | 属性下限 |
|--------|------|------|------|----------|----------|
| Common | 60 | 60% | ★ | `inactive` (灰色) | 5 |
| Uncommon | 25 | 25% | ★★ | `success` (绿色) | 15 |
| Rare | 10 | 10% | ★★★ | `permission` (蓝色) | 25 |
| Epic | 4 | 4% | ★★★★ | `autoAccept` (紫色) | 35 |
| Legendary | 1 | 1% | ★★★★★ | `warning` (金色) | 50 |

**帽子规则：** Common 稀有度的宠物没有帽子（`'none'`），其他稀有度随机分配。

**闪光 (Shiny)：** 所有稀有度都有 1% 的概率成为闪光版，这是一个独立的 flag。

---

## 4. 物种图鉴：18 种生物

源码使用 `String.fromCharCode()` 编码物种名称，以避免触发构建系统中的字符串检查（注释说某个物种名与模型代号冲突）：

| # | 物种 | ASCII 表情 | 特色 |
|---|------|-----------|------|
| 1 | Duck (鸭子) | `(·>` | 嘴巴会动 `._>` → `.__>` |
| 2 | Goose (鹅) | `(·>` | 脖子会左右摇摆 |
| 3 | Blob (果冻) | `(··)` | 身体会膨胀缩小 |
| 4 | Cat (猫) | `=·ω·=` | 经典颜文字猫脸，尾巴 `~` 摇摆 |
| 5 | Dragon (龙) | `<·~·>` | 有犄角 `/^\`，偶尔头顶冒烟 `~` |
| 6 | Octopus (章鱼) | `~(··)~` | 触须交替 `/\/\` ↔ `\/\/` |
| 7 | Owl (猫头鹰) | `(·)(·)` | 会眨眼 `(·)(-)` |
| 8 | Penguin (企鹅) | `(·>)` | 翅膀上下拍动 `/( )\` ↔ `|( )|` |
| 9 | Turtle (乌龟) | `[·_·]` | 龟壳花纹切换 `[____]` ↔ `[====]` |
| 10 | Snail (蜗牛) | `·(@)` | 眼柄左右摇，尾迹波浪 |
| 11 | Ghost (幽灵) | `/··\` | 底部波浪飘动，头顶浮动 `~` |
| 12 | Axolotl (美西螈) | `}·.·{` | 腮须 `}~` `~{` 交替舞动 |
| 13 | Capybara (水豚) | `(·oo·)` | 耳朵微动 `n___n` ↔ `u___n` |
| 14 | Cactus (仙人掌) | `\|· ·\|` | 手臂上下移动 |
| 15 | Robot (机器人) | `[··]` | 天线闪烁 `*`，嘴巴 `====` ↔ `-==-` |
| 16 | Rabbit (兔子) | `(·..·)` | 一只耳朵偶尔耷拉 `(\__/)` ↔ `(\|__/)` |
| 17 | Mushroom (蘑菇) | `\|· ·\|` | 帽子上的圆点变化 `o-OO-o` ↔ `O-oo-O`，偶尔释放孢子 |
| 18 | Chonk (胖猫) | `(·.·)` | 耳朵微动，尾巴 `~` 摇摆 |

### 眼睛变体

每种物种有 6 种眼睛样式，由骨骼决定：

```
·  ✦  ×  ◉  @  °
```

### 帽子系统

8 种帽子（common 无帽子），渲染在精灵顶部：

```
crown:     \^^^/      （王冠）
tophat:    [___]      （高帽）
propeller:  -+-       （螺旋桨帽）
halo:      (   )      （光环）
wizard:     /^\       （巫师帽）
beanie:    (___)      （毛线帽）
tinyduck:   ,>        （头顶小鸭子！）
```

---

## 5. 属性系统 (Stats)

每只宠物有 5 项属性：

| 属性 | 含义 |
|------|------|
| DEBUGGING | 调试能力 |
| PATIENCE | 耐心 |
| CHAOS | 混乱程度 |
| WISDOM | 智慧 |
| SNARK | 讽刺值 |

分配规则：
- 随机选一项为 **峰值** (peak)：`下限 + 50 + random(0-29)`，封顶 100
- 随机选另一项为 **洼地** (dump)：`max(1, 下限 - 10 + random(0-14))`
- 其余三项：`下限 + random(0-39)`

稀有度越高，属性下限越高。一只 Legendary 宠物的最低属性也有 50 分。

---

## 6. 动画系统

### 精灵动画

每种物种有 **3 帧** ASCII 动画（5 行 × 12 列）：
- **帧 0：** 静止/默认
- **帧 1：** 小幅躁动
- **帧 2：** 特殊帧（可能使用帽子位置渲染烟雾/天线等）

### 空闲循环 (Idle Sequence)

```typescript
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0]
```

大部分时间静止（帧 0），偶尔躁动（帧 1-2），`-1` 表示在帧 0 基础上"眨眼"（将眼睛字符替换为 `-`）。

**Tick 频率：** 500ms

### 反应模式 (Reaction)

当宠物有话要说时（`companionReaction` 不为空），动画切换到快速循环所有帧。

### 撸宠物 (Pet Burst)

执行 `/buddy pet` 后，会触发 2.5 秒的爱心漂浮动画：

```
   ♥    ♥      ← 帧 0
  ♥  ♥   ♥     ← 帧 1
 ♥   ♥  ♥      ← 帧 2
♥  ♥      ♥    ← 帧 3
·    ·   ·     ← 帧 4（消散）
```

---

## 7. 对话气泡系统

宠物坐在用户输入框旁边，能通过语音气泡发表评论。

### 工作原理

1. 每次 Claude 完成一轮回复后，如果 `BUDDY` 特性开启，调用 `fireCompanionObserver()`
2. Observer 分析对话内容，生成一条宠物的反应文本
3. 文本存入 `AppState.companionReaction`
4. `CompanionSprite` 组件渲染带圆角边框的气泡

### 气泡生命周期

- **显示时间：** 20 ticks ≈ 10 秒
- **淡出窗口：** 最后 6 ticks ≈ 3 秒（颜色变暗提示即将消失）
- **滚动清除：** 用户滚动时立即清除气泡
- **窄屏适配：** 终端宽度 < 100 列时，气泡退化为宠物脸旁的引用文字，截断到 24 字符

### 系统提示集成

宠物的存在通过 attachment 注入到对话上下文中：

```typescript
companionIntroText(name, species):
  "A small {species} named {name} sits beside the user's input box
   and occasionally comments in a speech bubble. You're not {name}
   — it's a separate watcher."
```

这告诉 Claude：宠物是独立的观察者，当用户直接和宠物说话时，Claude 应该"让路"。

---

## 8. 发布策略

### 愚人节彩蛋计划

```typescript
// useBuddyNotification.tsx
export function isBuddyTeaserWindow(): boolean {
  const d = new Date()
  return d.getFullYear() === 2026 && d.getMonth() === 3 && d.getDate() <= 7
  // 注意：getMonth() 从 0 开始，3 = April（四月）
}

export function isBuddyLive(): boolean {
  const d = new Date()
  return d.getFullYear() > 2026 ||
    (d.getFullYear() === 2026 && d.getMonth() >= 3)
}
```

- **Teaser 窗口：** 2026 年 4 月 1 日 - 7 日，未孵化宠物的用户会看到彩虹色的 `/buddy` 通知
- **正式上线：** 2026 年 4 月之后永久可用
- **内部优先：** Anthropic 员工（`USER_TYPE === 'ant'`）不受时间限制，随时可用

注释中还透露了策略考量：

> *"Local date, not UTC — 24h rolling wave across timezones. Sustained Twitter buzz instead of a single UTC-midnight spike, gentler on soul-gen load."*
>
> 使用本地时间而非 UTC，让全球用户在 24 小时内滚动式发现，产生持续的 Twitter 讨论热度，而非 UTC 午夜的单一尖峰。同时减轻灵魂生成（soul-gen）的服务器负载。

### 启动通知

未孵化宠物的用户在 teaser 窗口内启动 Claude Code 时，会在状态栏看到 15 秒的彩虹色 `/buddy` 文字闪烁，引导用户发现该功能。

---

## 9. UI 集成细节

### 布局位置

- **宽屏 (≥100 列)：** 完整精灵渲染在输入框右侧
  - 非全屏模式：气泡和精灵内联，输入框宽度自动缩减
  - 全屏模式：气泡作为浮动覆盖层渲染（避免 `overflowY:hidden` 裁切）
- **窄屏 (<100 列)：** 折叠为单行 `表情 名字` 格式
  - 全屏模式：堆叠在输入框上方
  - 非全屏模式：堆叠在输入框下方

### Footer 导航

宠物在底部状态栏有专属的 `companion` 项：
- 选中时名字高亮反色显示
- 按回车等同于执行 `/buddy` 命令

### 输入框中的彩虹渲染

用户在输入框中输入 `/buddy` 时，这几个字符会实时渲染为彩虹色（与 `/slash` 命令补全不同，这是一种纯视觉装饰）。

---

## 10. 防作弊设计

这套系统有几个巧妙的反作弊/防篡改设计：

1. **骨骼不持久化：** 每次读取从 `hash(userId)` 重算，用户无法编辑 config 获得更好的稀有度
2. **Salt 绑定：** `'friend-2026-401'` 硬编码在代码中，不同盐值产生完全不同的结果
3. **缓存优化：** `rollCache` 确保同一 userId 的重复计算（500ms tick、每次按键、每轮对话）不会重复哈希

```typescript
// companion.ts — "好到可以挑鸭子就够了"的注释
// Mulberry32 — tiny seeded PRNG, good enough for picking ducks
```

---

## 11. 代码中的彩蛋注释

- `"good enough for picking ducks"` — 对 PRNG 质量的幽默评价
- `SALT = 'friend-2026-401'` — 暗示"朋友"和愚人节日期
- `tinyduck` 帽子 — 宠物可以头顶一只迷你鸭子 `,>`
- 物种名使用 `String.fromCharCode` 编码 — 因为某个物种名和 Anthropic 模型代号冲突
- `Chonk` 作为物种名 — 互联网梗，指胖胖的猫

---

## 总结

这是一个令人惊讶地完整和精心设计的系统。从 gacha 式稀有度抽取，到 ASCII 逐帧动画，到与 LLM 对话系统的深度集成，再到精心策划的愚人节发布策略——它展示了 Claude Code 团队在严肃工程工具中隐藏的玩心。

每个用户的宠物都由其账户 ID 唯一确定，这意味着这不是一个"选择你的宠物"系统，而是一个"发现你的宠物"系统——更接近 Pokémon 的初始伙伴概念。1% 的传奇概率和 1% 的闪光概率意味着，获得一只闪光传奇宠物的概率仅为万分之一。

这也许是 2026 年最精心设计的 CLI 愚人节彩蛋。
