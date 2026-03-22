# LightTable

智能家庭饮食决策助手：基于库存与用户偏好，用 RAG + LLM 推荐今日吃什么、怎么做。

---

## 功能概览

- **首页**：入口与快捷操作
- **决策 (Decide)**：根据当前库存与用户画像，生成今日食谱推荐与理由
- **库存 (Inventory)**：管理家中食材（含临期提醒）
- **食谱 (Recipe)**：查看菜谱详情
- **设置 (Me)**：身体档案（身高/体重/目标）、忌口与厨艺水平、调试模式等；偏好会同步到 Mem0 供 Agent 回忆

技术上：**关系型 DB（SQLite）** 存用户设置与偏好；**RAG（LlamaIndex + ChromaDB）** 做食谱检索；**Mem0** 做 Agent 长期记忆；**OpenRouter** 提供大模型能力。

---

## 技术栈

| 层级     | 技术 |
|----------|------|
| 前端     | Next.js 15、React 19、TypeScript、Tailwind CSS、Zustand、Framer Motion |
| 后端     | FastAPI、Python 3.x |
| 用户数据 | SQLite（`backend/data/lighttable.db`） |
| 知识检索 | LlamaIndex、ChromaDB、HuggingFace Embedding |
| 记忆     | Mem0（可选，未配置则本地 fallback） |
| LLM      | OpenRouter（如 GPT-4o-mini） |

---

## 项目结构

```
LightTable/
├── backend/                 # FastAPI 后端
│   ├── main.py              # 应用入口，注册路由与 startup
│   ├── database.py          # SQLite 用户表与 CRUD
│   ├── core/config.py       # 环境变量与路径
│   ├── routers/             # 路由：user, recommend, inventory, recipe
│   ├── schemas/             # Pydantic 请求/响应模型
│   ├── services/            # LLM、Mem0、RAG 编排等
│   └── data/                # recipes.json、chroma_db、lighttable.db
├── frontend/                # Next.js 前端
│   ├── app/                 # 页面：/, /decide, /inventory, /recipe/[id], /settings
│   ├── components/          # 布局、设置、UI 组件
│   └── lib/                 # store、api、工具函数
├── doc/                     # PRD、设置与偏好等文档
├── .env.example              # 环境变量示例
├── requirements.txt
└── README.md
```

---

## 环境变量

在项目根目录复制 `cp .env.example .env` 并填写：

| 变量 | 说明 | 必填 |
|------|------|------|
| `OPENROUTER_API_KEY` | OpenRouter API Key（LLM 推荐与解释） | 推荐 |
| `OPENROUTER_BASE_URL` | 默认 `https://openrouter.ai/api/v1` | 否 |
| `OPENROUTER_MODEL` | 默认 `openai/gpt-4o-mini` | 否 |
| `OPENROUTER_RECIPE_MODEL` | 高质量推荐链路模型，默认 `openai/gpt-4o` | 否 |
| `MEM0_API_KEY` | Mem0 记忆服务；不填则用本地内存 fallback | 否 |
| `EMBEDDING_MODEL_NAME` | 向量模型，默认 `BAAI/bge-small-zh-v1.5` | 否 |
| `LIGHTTABLE_DATA_DIR` | 运行时可写数据目录；Render 建议 `/var/data/lighttable` | 否 |
| `LIGHTTABLE_CORS_ALLOW_ORIGINS` | 允许跨域的前端域名，逗号分隔 | 否 |
| `LIGHTTABLE_RATE_LIMIT_RECOMMEND_PER_HOUR` | `/api/v1/recommend` 每 IP 每小时限额 | 否 |
| `LIGHTTABLE_RATE_LIMIT_RECOGNIZE_PER_HOUR` | `/api/v1/inventory/recognize` 每 IP 每小时限额 | 否 |
| `LIGHTTABLE_RATE_LIMIT_PARSE_TEXT_PER_HOUR` | `/api/v1/inventory/parse-text` 每 IP 每小时限额 | 否 |

---

## 本地运行

### 1. 后端

```bash
# 建议使用虚拟环境
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

- API 文档：<http://localhost:8000/docs>
- 健康检查：<http://localhost:8000/api/v1/status>

### 2. 前端

```bash
cd frontend
npm install
npm run dev          # 仅本机访问
# 或
npm run dev:lan      # 局域网访问 (0.0.0.0)
```

浏览器打开 <http://localhost:3000>。

---

## Render 部署

仓库根目录已经包含 `render.yaml`，按 Blueprint 方式导入即可。当前方案是：

- `lighttable-frontend` 为公开 Web Service，承载 Next.js。
- `lighttable-backend` 为公开 Web Service，但 OpenRouter Key 只保留在后端环境变量。
- `OPENROUTER_API_KEY` 只配置在后端 Render 环境变量中，不进入前端 bundle，也不写入仓库。
- 前端通过服务端代理访问后端公开 URL，浏览器不会直接看到你的 key。

### 为什么这样能保护 key

- 用户浏览器永远只请求你的前端 `/api/backend/*` 代理路径，看不到真实 LLM key。
- Blueprint 中的密钥变量使用 `sync: false`，Render 在首次创建 Blueprint 时会单独要求你填值，不会把值保存进 `render.yaml`。
- 代码里对高成本接口增加了服务端限流，降低公开站点被脚本批量消耗额度的风险。

### 部署步骤

1. 把当前仓库推送到 GitHub。
2. 在 Render 控制台选择 `New +` -> `Blueprint`。
3. 连接这个仓库并导入根目录的 `render.yaml`。
4. 首次创建时填写 `OPENROUTER_API_KEY`；如果你使用 Mem0，再填写 `MEM0_API_KEY`。
5. 等待 Render 创建两个服务，公开访问前端服务地址即可。

### 安全边界说明

- 你的 key 不会被前端逆向拿走，但公开用户仍然是在“借用你的后端额度”。
- 因此真正的安全不是“绝对不会消耗”，而是“别人拿不到 key，且无法无限制滥刷”。
- 如果后面你要面向更大规模公网用户，建议继续加登录、验证码或你自己的用户级配额，而不要只依赖单机内存限流。
- 当前 `render.yaml` 走免费实例，不挂载 persistent disk，因此 SQLite/本地文件数据会在重启、重部署或平台维护后丢失，只适合演示或轻量试用。
- 免费实例不能接收 private network 流量，因此前端需通过 `BACKEND_PUBLIC_BASE` 访问后端公开地址。如果你的后端实际子域名不是 `lighttable-backend.onrender.com`，把前端这个环境变量改成 Render 面板里显示的真实后端 URL。

---

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/user/profile` | 获取用户设置（身体档案、偏好、系统） |
| PATCH | `/api/v1/user/profile` | 更新身高/体重/目标 |
| POST | `/api/v1/user/preference/update` | 更新忌口或厨艺水平（会同步 Mem0） |
| POST | `/api/v1/recommend` | 根据库存与用户画像做食谱推荐 |
| GET | `/api/v1/status` | 各服务配置状态（OpenRouter、Mem0 等） |

---

## 设计说明

- **UI**：Morandi Flat 风格，背景 `#F5F7F6`，主色 Sage Green `#7C9082`，纯白卡片与细线分隔。
- **数据**：用户基础设置以 SQLite 为唯一可信来源；偏好变更时再写入 Mem0，供决策时 Agent 回忆；RAG 仅用于食谱/知识检索。

---

## 文档

- `doc/setting&peference.md`：设置与偏好 PRD
- `doc/` 下其他 PRD、技术说明与 UI 设计
