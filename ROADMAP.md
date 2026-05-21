# Hivemind — Game-Focused Roadmap

> 把 Hivemind 从"学术 multi-agent 模拟"重定位为"金融题材社交推理游戏"。
> 护城河：4-layer agent state（public / private / desired / action）+ 11 个有人格的 character。
> 不是另一个 paper trading 工具。

---

## North Star

**一句话定位**："Among Us × Wall Street" —— 32 天里识破 11 个 AI agent 谁在骗你，看你能不能跑赢蜂群。

**核心 JTBD**：玩家雇用这个游戏来 *"抓出谁在骗我，证明我比 AI 聪明"*。
**不是**："学交易"、"模拟投资"、"研究 emergent dynamics"。

**核心机制**：peek（偷看 agent 私心，有限次）+ accuse（标记说谎者）+ endgame reveal。
**主分**：detection score（识破准确率），不是 PnL。PnL 是副产品。

---

## 路径：Now / Next / Later

### 🟢 Now（week 1-3）：validate，不要 build

目标：在投视觉/剧情之前，**先证明"识破说谎者"真的好玩**。

| 任务 | 文件 | 工期 | 来源 |
|---|---|---|---|
| 重写 `README.md` 为游戏定位（删 research 描述、加 "Spot the lying AI" tagline） | `README.md` | 1h | RICE #2 |
| Mock provider 输出做丰富（playtest 不烧 API key） | `lib/llm-provider.ts` | 0.5d | RICE #7 |
| **最小可玩 reveal UI**：agent card + peek 预算 + 反转动画。**不做 accuse**。 | `components/AgentCard.tsx`（新）, `app/play/page.tsx` | 2-3d | RICE #1（切片） |
| **5 人 playtest**（screenshare 30 min/人，观察不引导） | — | 1 周 | — |

**验证指标**：
- 5/5 playtester 说"peek 那一刻最爽"
- ≥3/5 不被提示自己跑完 32 天
- Time-to-first-peek < 3 min（教程清晰度的代理指标）

---

### 🟡 Next（week 4-10）：核心循环上线

**前提**：Now 阶段验证通过（见 Kill Criteria）。

| 任务 | 文件 | 工期 | 来源 |
|---|---|---|---|
| **Accuse 机制 + endgame detection score**：detection 取代 PnL 成主分 | `lib/store.ts`, `components/AccusationPanel.tsx`（新） | 1w | RICE #1（完整） |
| **成本控制**：5-10 个 canonical 32 天 run 预跑成缓存 JSON；real-time LLM 只留给 scenario projector | `lib/scenarios.ts`（新）, `app/api/agents/decide/route.ts` | 1w | RICE #8 |
| **Shareable endgame card**：OG 图 + 一键分享（"I caught 7/11 liars. MVP: Sarah Klein."） | `app/api/og/endgame/route.ts`（新） | 3d | RICE #5 |

**验证指标**：
- 单局成本 < $0.50（缓存 + 限次 peek）
- 完局玩家 ≥30% 分享 endgame card
- D2 留存 > 20%

---

### 🔵 Later（month 3+）：replay value + 品牌

| 任务 | 文件 | 工期 | 来源 |
|---|---|---|---|
| **Character art**：11 个 agent 头像 + 签名动作 + 口头禅 | `public/agents/*`, `components/AgentCard.tsx` | 2-3w | RICE #3 |
| **多剧本 / 多 ticker**：5 个剧情（COVID 2020 / GME 2021 / carry trade 2024 / etc.） | `lib/scenarios.ts` 扩展 | 3-4w | RICE #4 |
| **Scenario projector UI**：现成 API 接到 UI（"如果 Fed 降息呢？"） | `app/play/page.tsx`, `components/ScenarioProjector.tsx`（新） | 1w | RICE #6 |

---

## Kill Criteria（什么情况砍掉游戏方向）

- ❌ Week 3 playtest：< 2/5 觉得说谎机制好玩 → 游戏方向证伪，回去做研究工具
- ❌ Week 10：单局缓存成本压不到 $1 以下 → 商业模型不成立
- ❌ Month 3：D2 留存 polish 后还 < 5% → 不是 game-product fit
- ❌ 任何时候：竞品先做出同样机制 + 更大分发 → 重新想 wedge

---

## 明确不做的事（防 scope creep）

- ❌ 多人实时对战（v1 单机）
- ❌ 真实交易 / 券商对接（这是游戏不是 broker）
- ❌ "学交易"投教定位（那是另一个产品）
- ❌ 移动端 native（web responsive 足够）
- ❌ 11 个 agent 之外再加角色
- ❌ Player-facing 暴露任何 `DESIGN.md` 里的研究指标（entropy / reputation drift variance / public-private gap）—— 这些放 research 报告，不是给玩家看的

---

## 已有资产（不要重做）

游戏化只是 UX 层，底层已就绪：

| 资产 | 文件 | 状态 |
|---|---|---|
| 11 agent 系统提示词 | `lib/agents.ts` | ✅ |
| 4-layer state 类型契约 | `lib/types.ts` | ✅ |
| 11 agent 并行 LLM 调用 | `app/api/agents/decide/route.ts` | ✅ |
| β-anchored 价格引擎 | `lib/price-engine.ts` | ✅ |
| Zustand + localStorage | `lib/store.ts` | ✅ |
| Mock provider（playtest 用） | `lib/llm-provider.ts` | ✅ |
| Scenario projector API | `app/api/agents/scenario-react/route.ts` | ✅（UI 没接） |
| AAPL 5 年 OHLCV | `public/data/AAPL.json` | ✅ |

**游戏改造只动 UI + store + 新增 scenarios 缓存，核心 agent 逻辑不动**。

---

## 第一周具体动作清单

按这个顺序，三天就能进入 playtest 准备：

1. `README.md` 重写（1h）
2. `lib/llm-provider.ts` 的 mock 输出做出 11 个 agent 各自语气区分（0.5d）
3. 新建 `components/AgentCard.tsx`，从 `app/play/page.tsx` 抽出 agent 渲染逻辑（0.5d）
4. AgentCard 加 peek 状态：默认只显示 `publicStatement`，点 peek 反转动画露出 `privateBelief`（1d）
5. `lib/store.ts` 加 `peekBudget: number` 字段，每天重置为 3（0.5d）
6. 拉 3 个朋友先 dry-run，调教程（0.5d）
7. 正式 5 人 playtest（1w，包含约时间）
