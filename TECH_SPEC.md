## 技术设计文档（TECH_SPEC）

### 0. 范围说明（本文档后端部分）
本文档描述 LightTable 后端在 **双引擎架构（Dual-Engine Architecture）** 下的核心实现方式：

- **Knowledge Engine（静态知识）**：`llama-index` + `sentence-transformers` 本地向量化，用于“食谱 RAG”检索与引用。
- **Memory Engine（动态画像）**：`mem0ai`，用于“长期记忆/偏好/目标”的沉淀与召回。
- **Orchestrator（编排层）**：FastAPI 负责端到端决策流，把“库存识别结果 + 记忆召回 + 知识检索”合并为最终推荐与解释。

> 目标：在不要求用户显式打分的前提下，通过隐式/显式反馈不断增强个性化；同时保证检索可控（库存过滤、可解释引用、低延迟）。

---

## 1. 技术栈选型（Backend）

### 1.1 Knowledge Engine
- **索引/检索框架**：`llama-index`
- **Embedding（本地）**：`sentence-transformers`
  - 推荐模型：`BAAI/bge-small-zh-v1.5` 或同等体量本地模型（兼顾中文与菜谱短文本语义）
- **向量库（持久化）**：建议选用支持 Metadata Filtering 的本地持久化向量库
  - 推荐：Chroma（本地持久化，便于开发与迭代）
  - 说明：如果未来切换到 Qdrant / Milvus 等，也不影响上层 `KnowledgeService` 接口，只需替换底层 VectorStore 适配器。

### 1.2 Memory Engine
- **长期记忆服务**：`mem0ai`（Python）
  - 用途：记录用户偏好、忌口、目标、厨艺水平、复杂度倾向、菜系喜好、强负反馈（不喜欢/过敏）等
  - 交互：通过 `add()` 写入记忆，通过 `search()` 召回相关画像文本

### 1.3 Orchestrator
- **Web 框架**：FastAPI
- **并发/性能**：async endpoints + 线程池/后台任务（用于索引构建、批处理写入记忆）
- **配置管理**：环境变量（如 `MEM0_API_KEY`、Embedding 模型名、向量库持久化路径等）

---

## 2. 模块详细设计（Backend）

### 2.0 目录与职责划分（建议）
以下为建议的后端工程结构（与本文的文件路径一致）：

- `backend/`
  - `main.py`：FastAPI 入口（路由注册、依赖注入）
  - `services/`
    - `knowledge_service.py`：食谱知识库索引与检索（LlamaIndex）
    - `memory_service.py`：用户长期记忆写入与召回（Mem0）
    - `orchestrator.py`：核心编排逻辑（Recall → Refine → Retrieve → Generate）
  - `schemas/`：请求/响应 Pydantic 模型
  - `config.py`：配置（env 读取、路径、模型名等）
- `data/recipes.json`：静态食谱数据源

> 说明：即使当前仓库尚未创建上述目录，本文档仍以这些路径为“接口契约”。后续落地时按此补齐代码即可。

---

## 2.A 知识库模块（LlamaIndex）

### 文件
`backend/services/knowledge_service.py`

### 职责
- 加载 `data/recipes.json`
- 将每条食谱转换为 LlamaIndex `Document`（正文 + metadata）
- 构建并持久化 `VectorStoreIndex`
- 支持 **Metadata Filtering**：允许根据“用户当前库存（Inventory）”缩小检索范围
- 对上层提供“Top-K 检索结果 + 可解释引用材料”的稳定接口

### 数据输入：`data/recipes.json`（建议字段）
为支持后续过滤、解释与个性化重排，建议每条食谱至少包含：

- `recipe_id`：唯一 ID
- `title`：菜名
- `ingredients`：原料列表（结构化）
- `tags`：口味/菜系/烹饪方式标签（如：辣、清淡、蒸、炒）
- `time_minutes`：总耗时
- `difficulty`：复杂度等级（A/B/C 或 1~3）
- `steps`：步骤（可选；RAG 可只放“摘要版步骤”）
- `nutrition`：可选（低糖/低脂/高蛋白等粗粒度标签即可）

### Document 构建策略
**正文（Document.text）**：用于语义检索，建议由“菜名 + 摘要 + 核心要点”组成，例如：
- `title`
- “适合低糖/低脂/高蛋白”的一句话摘要（若有）
- 关键烹饪手法提示（中式语境：少许、适量）

**元数据（Document.metadata）**：用于过滤与排序，建议包含：
- `recipe_id`
- `title`
- `ingredient_tokens`：标准化后的食材 token 列表（用于库存过滤）
- `tags`
- `time_minutes`
- `difficulty`
- `nutrition_tags`（如：`["low_sugar", "high_protein"]`）

> 食材标准化建议：将“精选黑猪五花肉/五花肉/猪五花”统一为 `pork_belly` 或 `pork` 级别 token；同义词用映射表维护（便于稳定过滤）。

### 索引构建与持久化（推荐实现）
- **初始化时**检查向量库持久化目录是否存在：
  - 存在：加载 index（启动更快）
  - 不存在：从 `recipes.json` 构建并持久化（可放入后台任务或启动阶段一次性完成）
- **Embedding** 使用 `sentence-transformers` 本地模型（HuggingFace）

### Metadata Filtering：库存过滤设计
用户图片识别得到的库存食材（示例：`["Pork", "Pepper"]`）会被标准化为 token：
- `["pork", "pepper"]`

过滤目标：只检索“至少包含其中一个核心食材/或优先包含全部核心食材”的食谱集合。

#### 方案 1（推荐）：向量库原生过滤
如果底层 VectorStore 支持 metadata 过滤（如 Chroma/Qdrant），则：
- 在检索前构造 filters：
  - **宽松召回**（OR）：`ingredient_tokens` 包含任一库存 token
  - **严格召回**（AND）：`ingredient_tokens` 同时包含全部库存 token
- 实践建议：先 OR 召回 Top-N（例如 50），再在结果集内做二次筛选/重排，最终输出 Top-5（兼顾召回率与准确度）。

#### 方案 2（兜底）：Python 侧二次过滤
若底层 VectorStore 对 list contains 过滤支持不足，则：
- 先做向量 Top-N 召回（N 比最终 K 大，比如 50~200）
- 在 Python 层依据 `ingredient_tokens` 做：
  - 必须命中：至少包含 1 个库存 token
  - 优先命中：包含更多库存 token 的排前
- 输出最终 Top-K

### 对上层接口（建议）
`KnowledgeService.search_recipes(query: str, inventory_tokens: list[str], top_k: int = 5) -> list[RecipeHit]`

其中 `RecipeHit` 建议包含：
- `recipe_id`
- `title`
- `snippet`：用于 LLM 的证据片段（来自 Document.text 或摘要字段）
- `metadata`：用于解释与排序（耗时、难度、标签等）
- `score`：向量相似度/综合分

### 关键实现片段（伪代码示意）
下面示意“库存过滤 + Top-N 召回 + 应用侧二次过滤/重排”的基本形态（具体 API 以实际 `llama-index` 版本为准）：

```python
class KnowledgeService:
    def search_recipes(self, query: str, inventory_tokens: list[str], top_k: int = 5):
        # 1) 先用 metadata 做范围收敛（如向量库支持）
        filters = {"ingredient_tokens": {"$contains_any": inventory_tokens}}  # 示意

        # 2) 语义召回 Top-N（N > K）
        hits = self.retriever.search(query=query, filters=filters, top_n=50)

        # 3) 兜底：如果库端过滤不可靠，在应用层做二次过滤
        hits = [h for h in hits if set(h.metadata["ingredient_tokens"]) & set(inventory_tokens)]

        # 4) 业务重排（库存命中数、时间/难度、营养标签等）
        hits.sort(key=lambda h: (match_cnt(h, inventory_tokens), h.score), reverse=True)

        return hits[:top_k]
```

---

## 2.B 记忆模块（Mem0）

### 文件
`backend/services/memory_service.py`

### 职责
- 初始化 Mem0 Client
- 封装统一的长期记忆写入与召回接口
- 约束写入内容的格式与“可召回性”（避免噪声、避免写入敏感信息）

### 初始化与配置
建议以环境变量配置：
- `MEM0_API_KEY` / `MEM0_ENDPOINT`（如适用）
- `MEM0_APP_ID`（如适用）

初始化时只创建一个 client 实例，供 FastAPI 依赖注入复用（避免每个请求重复握手/初始化）。

### Add Memory（写入记忆）
Mem0 写入的质量直接决定个性化效果。为了让“可召回、可解释、可演进”，约定统一的写入格式与分类标签。

#### 记忆分类（建议）
- **Preference（偏好）**：口味、菜系、烹饪方式倾向
  - 例：`Likes spicy food. Prefers stir-fry over steaming.`
- **Constraint（约束/忌口）**：过敏、宗教/健康限制、强负反馈
  - 例：`Avoids sugar. Allergic to peanuts.`
- **Goal（目标）**：减脂/增肌/低碳/控糖等
  - 例：`User is on a keto diet.`
- **Capability（能力/场景）**：厨艺水平、时间预算、设备限制
  - 例：`Weekday cooking time budget is 20 minutes.`

#### 写入内容模板（建议）
为减少噪声，写入时将事件转为“短、肯定句、可检索”的文本：
- 偏好正向：`User likes <X>.`
- 偏好负向：`User dislikes <X>.`
- 目标/约束：`User is on <goal>.` / `User avoids <Y>.`
- 场景：`User prefers quick recipes on weekdays.`

#### 写入触发点
- **显式反馈**（`POST /api/v1/feedback`）：喜欢/不喜欢某道菜、设置目标、补充忌口
- **隐式反馈**（后续可扩展）：点击“开始烹饪/完成烹饪/跳过刷新”等行为信号（写入时要做去重与降噪）

#### 写入示例（与需求对齐）
当用户评价菜品或设置目标时：

```python
m.add("User is on a keto diet", user_id="cavy_01")
```

建议在工程里统一由 `MemoryService.add_memory()` 包装，避免上层散落字符串：
- 统一追加时间/来源（可选）
- 统一去重（相同语义短期内不重复写入）
- 统一打标签（如果 Mem0 支持 metadata，可带上 `type=goal/preference/...`）

### Search Memory（召回画像）
生成推荐前，Orchestrator 需要从 Mem0 召回与“饮食偏好/约束/目标”相关的用户画像文本：

```python
m.search("food preferences", user_id="cavy_01")
```

#### 召回策略（建议）
- **Query 约定**：固定使用一组意图明确的查询词，覆盖偏好/约束/目标/场景
  - 例：`"food preferences"`, `"diet constraints"`, `"health goals"`, `"cooking time and difficulty"`
- **Top-N**：每类召回 Top-3~Top-5，再在应用侧合并为“画像摘要”
- **去噪**：对互相矛盾的记忆做简单仲裁（例如“喜欢甜”与“避免糖”同时存在时，以约束优先）

#### 画像聚合输出（重要）
`MemoryService.get_profile_text(user_id)` 应输出 **短、结构化** 的画像文本，供编排层拼接：
- 示例输出：`"Likes spicy. Avoids sugar. Prefers quick weekday recipes."`

> 注意：不要把 Mem0 的原始返回对象直接塞进 Prompt；应先“筛选 + 摘要 + 去重”，避免提示词膨胀与隐私泄露。

### 关键实现片段（伪代码示意）
```python
class MemoryService:
    def add_memory(self, user_id: str, text: str):
        # 去重/降噪（示意）：短时间内相同句子不重复写入
        if self.is_duplicate(user_id, text):
            return
        self.m.add(text, user_id=user_id)

    def get_profile_text(self, user_id: str) -> str:
        prefs = self.m.search("food preferences", user_id=user_id)[:5]
        cons  = self.m.search("diet constraints", user_id=user_id)[:5]
        goals = self.m.search("health goals", user_id=user_id)[:5]

        # 应用侧：按优先级聚合与仲裁（约束 > 目标 > 偏好）
        return self.summarize(prefs=prefs, constraints=cons, goals=goals)
```

---

## 2.C 核心决策流（Orchestrator Logic）

### 文件
`backend/services/orchestrator.py`

### 职责
- 把 “Input（库存识别结果）→ Recall（记忆召回）→ Refine（查询改写）→ Retrieve（知识检索）→ Generate（生成与解释）” 串成一次可观测、可复用的端到端流程
- 统一管理：
  - Top-K、召回阈值、过滤规则
  - Prompt 模板（含引用、解释、约束优先级）
  - 超时与降级策略

### 端到端流程（与需求完全对齐）
#### 1) Input
用户上传图片后（视觉识别在本文档之外），得到库存食材：
- `["Pork", "Pepper"]`

编排层将其标准化为 `inventory_tokens`：
- `["pork", "pepper"]`

#### 2) Recall（Mem0）
调用 `MemoryService` 获取用户偏好画像，得到文本：
- `"Likes spicy, avoids sugar"`

#### 3) Refine Query（查询改写）
把库存与画像融合为检索 query（既能表达“想吃什么”，也能表达“不能吃什么/偏好什么”）：
- `"Spicy pork and pepper recipes, low sugar"`

改写原则（建议）：
- **约束优先**：忌口/过敏/医疗饮食 > 偏好
- **库存强约束**：必须出现至少一个核心库存食材（通过 metadata filter 保证）
- **复杂度/时间**：若画像包含“快手/工作日 20 分钟”，则 query 加入 `quick`/`<20 minutes>` 语义或在重排阶段使用 metadata 打分

#### 4) Retrieve（LlamaIndex）
调用 `KnowledgeService.search_recipes(query, inventory_tokens, top_k=5)`：
- 先用库存过滤缩小候选范围（见 2.A）
- 再按 query 做语义检索，拿到 Top-5 `RecipeHit`

#### 5) Generate（LLM 生成与解释）
LLM 输入由三部分组成：
- **用户上下文**：库存 token + 用户画像摘要
- **检索证据**：Top-5 食谱的标题/摘要/snippet/关键 metadata
- **输出约束**：必须解释推荐理由，并显式指出“与用户偏好/约束的匹配点”

输出要求（建议）：
- 生成 2~3 组方案（A/B/C 复杂度分级与 PRD 一致）
- 每道菜给出：
  - 推荐理由（库存消耗 + 偏好匹配 + 目标匹配）
  - 预估耗时与难度
  - 若不满足约束（如含糖），必须剔除或给出替代建议

### 编排主函数（伪代码示意）
```python
class Orchestrator:
    async def recommend(self, user_id: str, inventory: list[str], context: dict | None = None):
        inventory_tokens = normalize_inventory(inventory)

        profile = self.memory.get_profile_text(user_id=user_id)  # "Likes spicy. Avoids sugar."
        refined_query = refine_query(inventory_tokens, profile, context)  # "Spicy pork and pepper recipes, low sugar"

        hits = self.knowledge.search_recipes(
            query=refined_query,
            inventory_tokens=inventory_tokens,
            top_k=5,
        )

        prompt = build_prompt(profile=profile, inventory=inventory_tokens, hits=hits, context=context)
        answer = await self.llm.generate(prompt)

        return {
            "profile_summary": profile,
            "refined_query": refined_query,
            "plans": parse_plans(answer),
            "retrieval": summarize_hits(hits),
        }
```

### 协同关键点（Mem0 × LlamaIndex）
双引擎的分工边界与协作方式如下：

- **Mem0 负责“你是谁/你想要什么/你不能吃什么”**（长期、动态、可更新）
- **LlamaIndex 负责“世界上有哪些可选食谱/它们包含什么”**（静态、可引用、可过滤）
- **Orchestrator 负责把两者融合成“这一次该给你什么”**（策略、排序、解释、降级）

可视为：
\[
\text{Recommendation} = f(\text{Inventory}, \text{UserProfile}_{Mem0}, \text{Recipes}_{RAG})
\]

### 重排（Re-rank）建议（可选但强烈推荐）
在 `KnowledgeService` 返回的 Top-N 结果上做一个轻量的“业务重排”：
- **库存命中数**：命中更多库存 token 的排前
- **约束一致性**：若画像包含 `avoids sugar`，则 `nutrition_tags` 含 `low_sugar` 的加分
- **时间/难度**：工作日优先 `time_minutes` 小、`difficulty` 低
- **多样性**：3 天内同主菜去重（PRD 规则）

### 失败与降级策略
- **Mem0 不可用**：画像为空，退化为“仅库存 + 通用健康目标（若用户未设置则不加约束）”
- **知识库不可用/无结果**：
  - 兜底 1：放宽库存过滤（OR → 任一命中）
  - 兜底 2：输出“采购建议”（PRD 兜底机制）
- **LLM 超时**：直接返回 Top-5 食谱候选 + 简短规则化解释（模板生成）

---

## 3. API 接口（FastAPI）

### 3.1 `POST /api/v1/recommend`
触发完整流程：Input → Recall → Refine → Retrieve → Generate

#### Request（建议）
```json
{
  "user_id": "cavy_01",
  "inventory": ["Pork", "Pepper"],
  "context": {
    "day_type": "weekday",
    "time_budget_minutes": 20
  }
}
```

说明：
- `inventory`：来自图像识别的原始食材名（后端会标准化）
- `context`：可选；如果前端已知“工作日/周末、时间预算”，可以直接传入，用于重排与生成约束

#### Response（建议）
```json
{
  "request_id": "req_20260204_xxx",
  "profile_summary": "Likes spicy. Avoids sugar.",
  "refined_query": "Spicy pork and pepper recipes, low sugar",
  "candidates": [
    {
      "recipe_id": "r_1024",
      "title": "青椒肉丝（低糖版）",
      "matched_inventory": ["pork", "pepper"],
      "time_minutes": 20,
      "difficulty": "B",
      "why": "推荐这道菜是因为它命中你的嗜辣偏好，同时可用青椒和猪肉快速完成；并且可通过少糖/不放糖的调味满足控糖约束。"
    }
  ],
  "plans": [
    {
      "plan_id": "A",
      "label": "极简",
      "dishes": ["青椒肉丝（快手）"],
      "reason": "优先消耗库存 + 20 分钟内完成"
    },
    {
      "plan_id": "B",
      "label": "标准",
      "dishes": ["青椒肉丝", "番茄蛋汤（少糖）"],
      "reason": "更均衡，仍符合控糖与嗜辣偏好"
    }
  ],
  "retrieval": {
    "top_k": 5,
    "hits": [
      {
        "recipe_id": "r_1024",
        "title": "青椒肉丝（低糖版）",
        "score": 0.78
      }
    ]
  }
}
```

> 响应里建议包含 `profile_summary` 与 `refined_query`，便于调试“记忆是否生效、查询是否正确改写”，同时可用于埋点与 A/B 实验。

### 3.2 `POST /api/v1/feedback`
用户喜欢/不喜欢某道菜（或设置目标/忌口）→ 写入 Mem0，增强长期个性化。

#### Request（建议）
```json
{
  "user_id": "cavy_01",
  "recipe_id": "r_1024",
  "signal": "like",
  "note": "喜欢辣一点，但不要放糖"
}
```

字段说明：
- `signal`：`like` / `dislike` / `goal_update` / `constraint_update`（可扩展）
- `note`：可选；若用户写了自然语言偏好，后端可抽取成更稳定的记忆句式写入 Mem0

#### Mem0 写入行为（与需求对齐）
最小实现：
- `like`：`m.add("User likes <dish or flavor>", user_id=...)`
- `dislike`：`m.add("User dislikes <dish or ingredient>", user_id=...)`
- `goal_update`：`m.add("User is on a keto diet", user_id=...)`

#### Response（建议）
```json
{
  "ok": true,
  "written_memories": [
    "User likes spicy food",
    "User avoids sugar"
  ]
}
```

---

## 4. 可观测性与评估（建议）
为验证“双引擎协同”是否真正提升个性化，建议记录以下关键日志/指标（注意脱敏）：
- **Mem0 召回命中率**：本次请求是否召回到画像；画像摘要长度
- **查询改写质量**：`refined_query` 中是否包含关键约束词（如 low sugar）
- **检索质量**：库存命中数分布、Top-K 相似度分布
- **反馈闭环**：`/feedback` 写入后，后续 `/recommend` 中相关偏好是否更常出现
- **端到端时延**：Recall / Retrieve / Generate 分段耗时

---

## 5. 安全与隐私（最低要求）
- **user_id**：仅作为 Mem0 的分区键；避免写入可识别个人身份信息（手机号/地址等）
- **记忆内容**：仅存饮食相关偏好、约束与目标；必要时对用户自由文本做规则过滤与摘要后写入
- **日志脱敏**：不要把完整 Mem0 原文与用户自由文本写入可检索日志

