# DayTrace 日程管理器 — 项目文档

## 项目概述

DayTrace 是一个面向个人的智能日程规划与时间管理工具，采用飞书风格的 UI 设计。支持日/周/月三种日历视图，集成目标管理、任务追踪、链接收藏、晚间复盘等功能。前端为 Vue 3 SPA，后端为 Flask REST API，数据存储使用 MySQL。支持 PWA 离线使用。

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue 3 (Composition API + `<script setup>`) | 3.5.x |
| 状态管理 | Pinia | 3.0.x |
| 路由 | Vue Router | 4.6.x |
| 构建工具 | Vite | 8.0.x |
| 后端框架 | Flask | latest |
| 数据库 | MySQL (PyMySQL) | 8.x |
| 认证 | 自实现 JWT (HS256, 无第三方依赖) | — |
| 部署 | PWA (manifest.json + service-worker.js) | — |

---

## 项目结构

```
├── vue-app/                    # Vue 3 前端（主要开发目录）
│   ├── src/
│   │   ├── main.js             # 入口：挂载 Pinia、Router、全局 CSS
│   │   ├── App.vue             # 根组件：暗色模式切换、Toast
│   │   ├── router/index.js     # 路由：/ (主视图, 需登录) 和 /login
│   │   ├── views/
│   │   │   ├── MainView.vue    # 主布局：TopBar + GoalsPanel + 视图区 + ReviewPanel
│   │   │   └── LoginView.vue   # 登录/注册页
│   │   ├── components/         # 所有 UI 组件（详见下方）
│   │   ├── composables/        # 可复用逻辑（拖拽、弹窗、撤销等）
│   │   ├── stores/             # Pinia 状态仓库
│   │   ├── utils/              # 工具函数（时间计算、API、布局算法）
│   │   └── styles/             # 全局 CSS（变量、各模块样式）
│   ├── dist/                   # 构建产物（Flask 直接 serve）
│   └── vite.config.js          # Vite 配置：dev 代理 /api → localhost:5000
├── server/
│   ├── app.py                  # Flask 后端（API + 静态文件服务）
│   └── requirements.txt        # flask, flask-cors, pymysql
├── index.html                  # 旧版原生 JS 入口（已弃用）
├── js/                         # 旧版原生 JS 代码（已弃用）
├── css/                        # 旧版 CSS（已弃用）
├── manifest.json               # PWA 配置
└── service-worker.js           # PWA Service Worker
```

---

## Pinia 状态仓库

### `stores/events.js` — 日程事件
- **数据结构**: `{ id, title, tag, date, repeat, repeatEnd, excludes, plan: {start, end}, actual: {start, end, note} }`
- **repeat 类型**: `null | 'daily' | 'weekday' | 'weekly'`
- **核心方法**:
  - `eventsForDate(date)` — 获取指定日期的事件（含重复事件克隆）
  - `matchesRepeat(event, date, dateKey)` — 判断重复事件是否匹配指定日期
  - `addEvent / updateEvent / removeEvent` — CRUD
  - `addExclude(id, dateStr)` — 排除重复事件的某一天
  - `stopRepeatFrom(id, dateStr)` — 从某天起停止重复
  - `forkInstance(id, viewDate, overrides)` — 从重复事件中分离单个实例为独立事件
- **持久化**: localStorage (`dt_events`, `dt_nid`) + 防抖 500ms 同步到服务器

### `stores/tasks.js` — 任务与目标
- **冻结视图任务 (tasks)**: `{ id, title, tag, completed, subtasks[], deadline, createdAt }`
- **月度目标 (monthlyGoals)**: `{ id, title, tag, month, done }`
- **周任务 (weeklyTasks)**: `{ id, title, tag, monthGoalId, month, weekStart, startDate, deadline, done, frozenTaskId }`
- **双向同步**: weeklyTasks 通过 `frozenTaskId` 与 tasks 关联，`findFrozenMatch()` 查找对应关系，`toggleWeeklyDone()` 同步完成状态
- **持久化**: localStorage (`dt_tasks`, `dt_tnid`, `dt_goals`) + 防抖同步到服务器

### `stores/links.js` — 链接收藏
- **数据结构**: `{ id, name, url, group, tags[], starred, clicks, favicon, domain, createdAt }`
- **分组管理**: 独立的 `groups[]` 列表，支持增删改排序
- **持久化**: localStorage (`dt_links`, `dt_link_groups`) + 防抖 600ms 同步到服务器

### `stores/ui.js` — UI 状态
- **视图切换**: `view` = `'day' | 'week' | 'month'`
- **日期导航**: `curDate`，`prev() / next() / goToday() / goToDate()`
- **主题**: `theme` = `'light' | 'dark'`，`toggleTheme()`
- **标题计算**: 根据当前视图和日期自动生成中文标题

### `stores/auth.js` — 用户认证
- JWT Token 存储在 localStorage (`dt_token`)
- `login / register / fetchProfile / logout`

### `stores/undo.js` — 撤销/重做
- 快照范围: events + tasks + monthlyGoals + weeklyTasks + links + linkGroups
- 最大栈深度: 50
- 快捷键: Ctrl+Z 撤销, Ctrl+Y / Ctrl+Shift+Z 重做
- `pushUndo()` 在每次数据变更前调用

---

## 核心组件

### 日历视图

| 组件 | 功能 |
|------|------|
| `DayView.vue` | 日视图：左右双列（计划/实际），时间网格 0:00-24:00，拖拽创建/移动/调整事件，DDL 任务栏 |
| `WeekView.vue` | 周视图：7 列网格，每列顶部 DDL 任务栏，事件显示逻辑为"有 actual 显示 actual，否则显示 plan" |
| `MonthView.vue` | 月视图：日历网格，每格显示事件摘要 |
| `EventBlock.vue` | 事件块渲染：根据 plan/actual/delayed/early/unplanned 显示不同颜色和标记，支持 overlap 并排布局 |
| `EventPopover.vue` | 事件编辑弹窗：标题、时间（TimePicker）、日期（DatePicker）、标签、重复设置、备注，支持重复事件的"仅此日程/此日程及以后"选择 |
| `NowLine.vue` | 当前时间指示线 |

### 目标管理（左侧面板）

| 组件 | 功能 |
|------|------|
| `GoalsPanel.vue` | 左侧面板容器：任务 Tab + 甘特图 Tab，可拖拽调整宽度 |
| `WeeklyTab.vue` | 任务列表：按分组显示周任务，支持拖拽排序、右键菜单（编辑/重命名/截止日期/完成/删除）、折叠分组 |
| `WeeklyCard.vue` | 单个任务卡片：checkbox、标签色、拖拽到日历创建事件、inline 重命名 |
| `GanttTab.vue` | 甘特图：按月显示目标和子任务的时间条，今日线标记 |
| `TaskMiniPop.vue` | 快速创建任务弹窗：名称、标签、截止日期、所属分组 |
| `TaskEditPop.vue` | 任务编辑弹窗：名称、标签、开始日期、截止日期、所属分组（自定义下拉框），保存时双向同步 frozen tasks 和 weeklyTasks |

### 复盘面板（右侧面板）

| 组件 | 功能 |
|------|------|
| `ReviewPanel.vue` | 晚间复盘：执行评分环（执行率/准时率/利用率）、数据概览、时间分布条形图、今日反思文本框，可拖拽调整宽度 |

### 链接管理

| 组件 | 功能 |
|------|------|
| `LinksPanel.vue` | 右侧滑出面板：分组显示链接，网格/列表切换，搜索，拖拽排序，右键菜单（复制/编辑/收藏/删除），底部添加表单（自定义分组下拉框） |
| `LinkEditPop.vue` | 链接编辑弹窗：名称、URL、分组（自定义下拉框） |

### 通用组件

| 组件 | 功能 |
|------|------|
| `TopBar.vue` | 顶栏：日期导航、视图切换、撤销/重做按钮、主题切换、个人资料/链接入口，全局键盘快捷键监听 |
| `DatePicker.vue` | 日期选择器：日历面板，Teleport 定位，支持清除 |
| `TimePicker.vue` | 时间选择器：30 分钟间隔的下拉列表 |
| `ContextMenu.vue` | 右键菜单：Teleport 定位，自动边界检测，Promise 返回选择结果 |
| `PromptDialog.vue` | 通用输入弹窗：替代浏览器原生 `prompt()`，统一 UI 风格 |
| `Toast.vue` | 轻提示 |
| `ProfilePanel.vue` | 个人资料面板：头像、昵称、密码修改 |

---

## Composables（可复用逻辑）

| 文件 | 功能 |
|------|------|
| `usePopover.js` | provide/inject 模式共享 EventPopover 实例，任何子组件可调用 `openCreate / openEdit` |
| `useDragCreate.js` | 日历空白区域拖拽创建事件（mousedown → mousemove 画 ghost → mouseup 打开 popover） |
| `useDragMove.js` | 拖拽移动已有事件块（支持跨列/跨天，120ms 延迟激活防误触，snap 到 30 分钟网格） |
| `useResize.js` | 拖拽事件块底部 resize handle 调整时长 |
| `useTaskDrag.js` | 从任务面板拖拽任务到日历创建事件（全局 reactive 状态 + floating ghost） |
| `useDdlTodo.js` | DDL 任务栏逻辑：从 frozen tasks 获取指定日期的任务，toggle 完成状态双向同步，修改截止日期，删除 |
| `useToast.js` | 全局 Toast 消息 |

---

## 工具函数

### `utils/time.js`
- **常量**: `SH=0, EH=24`（显示时间范围），`SL=40`（每 30 分钟格高度 px），`SNAP=30`（吸附间隔分钟）
- **时间转换**: `t2m('09:30') → 570`, `m2t(570) → '09:30'`
- **位置计算**: `pos(time) → px`, `y2m(y) → minutes`, `hgt(start, end) → px`
- **日期工具**: `dateKey(date) → 'YYYY-MM-DD'`, `weekStart(date)`, `sameDay(a, b)`
- **显示常量**: `TAG_COLORS`, `TAG_NAMES`, `WD`（中文星期）, `WDE`（英文星期缩写）

### `utils/layout.js`
- `calcOverlapLayout(items)` — 计算重叠事件的并排布局，返回 `Map<id, {col, totalCols}>`，用于 EventBlock 的水平定位

### `utils/api.js`
- `authFetch(url, opts)` — 带 JWT Token 的 fetch 封装，401 时自动跳转登录页
- `logout()` — 清除所有 localStorage 数据并跳转登录页

---

## 后端 API

Flask 应用，所有数据接口需 JWT 认证（`@require_auth`），数据按 `user_id` 隔离。

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 注册（用户名 ≥2 字符，密码 ≥6 字符） |
| POST | `/api/login` | 登录，返回 JWT Token（30 天有效） |
| GET | `/api/me` | 获取当前用户信息 |
| PUT | `/api/profile` | 更新昵称、头像 |
| PUT | `/api/password` | 修改密码 |

### 数据同步
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/events` | 日程事件（POST 为全量覆盖） |
| GET/POST | `/api/tasks` | 冻结视图任务（POST 为全量覆盖） |
| GET/POST | `/api/goals` | 月度目标 + 周任务（JSON blob） |
| GET/POST | `/api/links` | 链接收藏（JSON blob） |
| GET/POST | `/api/reflections` | 每日反思（key-value） |
| GET/POST/DELETE | `/api/ai/chats` | AI 对话记录 |
| GET/POST | `/api/ai/prompts` | AI 自定义提示词 |

### 数据库表
| 表名 | 主键 | 说明 |
|------|------|------|
| `users` | `id` | 用户表（username, salt, password_hash, nickname, avatar） |
| `events` | `(user_id, id)` | 日程事件（结构化字段存储） |
| `tasks` | `(user_id, id)` | 冻结任务（JSON data 字段） |
| `goals` | `user_id` | 目标数据（JSON blob） |
| `links` | `user_id` | 链接数据（JSON blob） |
| `reflections` | `(user_id, rkey)` | 反思内容（key-value） |
| `meta` | `(user_id, k)` | 元数据（next_id 等） |
| `ai_chats` | `id` | AI 对话（user_id 索引） |
| `ai_prompts` | `user_id` | AI 提示词（JSON blob） |

---

## 数据流

```
用户操作 → pushUndo() → 修改 Pinia Store → save() 写入 localStorage → 防抖同步到 Flask API → MySQL
                                                                    ↑
应用启动 → syncFromServer() → 服务器数据覆盖本地 ─────────────────────┘
```

- **离线优先**: 所有操作先写 localStorage，异步同步到服务器
- **冲突策略**: 启动时服务器数据覆盖本地（last-write-wins）
- **防抖同步**: events 500ms, tasks 500ms, goals 600ms, links 600ms

---

## 交互模式

### 事件创建
1. **拖拽创建**: 在日历空白区域按住鼠标向下拖拽 → 显示蓝色虚线 ghost 块（实时显示时间范围）→ 松开后打开 EventPopover 填写详情
2. **任务拖入日历**: 从左侧 GoalsPanel 的任务卡片（非拖拽手柄区域）按住拖拽 → 出现 floating ghost 跟随鼠标 → 拖到日历网格松开 → 自动创建 1 小时 plan 事件（标题和标签继承自任务）
3. **DDL 拖入日历**: 从顶部 DDL 任务栏拖拽任务到日历网格 → 同上创建事件
4. **DDL 栏快速创建**: 点击 DDL 栏右侧的 "+" 按钮 → 弹出 TaskMiniPop（名称、标签、截止日期、所属分组）→ 同时创建 frozen task 和 weeklyTask
5. **日历双列创建（日视图）**: 在 PLANNED 列拖拽创建 plan 事件，在 ACTUAL 列拖拽创建 actual 事件

### 事件编辑
- **点击事件块**: 打开 EventPopover，可编辑标题、计划/实际时间、标签、重复设置、备注
- **拖拽移动**: 按住事件块 120ms 后激活（防误触），拖拽到新时间位置；日视图支持跨列（plan↔actual），周视图支持跨天
- **底部 resize**: 拖拽事件块底部的 resize handle 调整时长，snap 到 30 分钟网格
- **右键菜单（事件块）**: 挪到明天、挪到下周、提醒开关、删除
- **右键菜单（DDL 任务栏）**: 编辑（打开 TaskEditPop）、挪到明天、挪到下周、标记完成/未完成、删除
- **开始执行**: 在 EventPopover 中点击"▶ 开始执行"按钮，自动在 actual 列创建当前时间开始的事件

### 重复事件处理
- **创建**: EventPopover 中选择重复类型（每天/工作日/每周），重复事件只能在 plan 列创建
- **显示**: `eventsForDate()` 通过 `matchesRepeat()` 判断重复事件是否匹配指定日期，非原始日期的实例会被克隆（带 `_viewDate` 和 `_repeatSrc` 标记）
- **编辑非原始日期**: 弹出选择对话框 → "仅此日程"调用 `forkInstance()` 分离为独立事件 + 原事件 `excludes` 排除该日期 → "此日程及以后"直接修改原事件
- **删除非原始日期**: "删除此日程" → `addExclude()` → "删除此日程及以后" → `stopRepeatFrom()` 设置 `repeatEnd`
- **排除机制**: `excludes[]` 数组存储被排除的日期字符串，`matchesRepeat()` 在判断时检查

### 任务系统与多处同步

项目中"任务"存在于三个位置，它们之间保持双向同步：

```
┌─────────────────┐     frozenTaskId      ┌──────────────────┐
│  frozen tasks    │◄────────────────────►│  weeklyTasks     │
│  (tasks store)   │     findFrozenMatch() │  (tasks store)   │
│                  │                       │                  │
│  左侧面板显示    │                       │  左侧面板显示    │
│  DDL 任务栏显示  │                       │  甘特图显示      │
└─────────────────┘                       └──────────────────┘
```

#### 三层数据结构
1. **frozen tasks** (`tasks[]`): 核心任务数据，包含 `id, title, tag, completed, subtasks[], deadline`。在 DDL 任务栏中按 `deadline` 日期显示
2. **weeklyTasks** (`weeklyTasks[]`): 周维度的任务视图，包含 `monthGoalId`（关联分组）、`startDate`、`deadline`、`done`、`frozenTaskId`（关联 frozen task）
3. **monthlyGoals** (`monthlyGoals[]`): 分组/目标，weeklyTasks 通过 `monthGoalId` 归属到某个分组

#### 同步规则
- **创建任务**（TaskMiniPop / WeeklyTab.addTask）: 同时创建 frozen task 和 weeklyTask，通过 `frozenTaskId` 关联
- **完成状态同步**（`toggleWeeklyDone`）: 勾选 weeklyTask → 通过 `findFrozenMatch()` 找到对应 frozen task → 同步 `completed` 状态；如果 frozen task 有 subtasks，则全部标记
- **重命名同步**（WeeklyTab.onRename / TaskEditPop）: 修改 weeklyTask 标题 → 同步到 frozen task 的 `title`
- **截止日期同步**: 修改 weeklyTask 的 deadline → 同步到 frozen task 的 `deadline`
- **删除同步**（WeeklyTab.onDelete）: 删除 weeklyTask → 同时删除关联的 frozen task
- **DDL 任务栏操作**（useDdlTodo）: 从 frozen tasks 中按 `deadline === dateKey` 筛选当天任务 → 显示时拼接分组名（`分组 · 任务名`）→ toggle/delete/changeDdlDeadline 都会双向同步到 weeklyTask
- **关联查找**（`findFrozenMatch`）: 优先按 `frozenTaskId` 查找，fallback 按 `title + deadline` 匹配，再 fallback 到 subtasks 匹配
- **迁移**（`migrateFrozenTaskIds`）: 应用启动时，对没有 `frozenTaskId` 的 weeklyTask 尝试按 `title + deadline` 补全关联

#### DDL 任务栏（顶部冻结区域）
- **数据来源**: `useDdlTodo.getTasksForDate(dateKey)` 从 frozen tasks 中筛选 `deadline === dateKey` 的任务和子任务
- **显示格式**: 如果任务关联了分组，显示为 `分组名 · 任务名`；子任务显示为 `父任务名 · 子任务名`
- **checkbox**: 勾选后双向同步 frozen task 和 weeklyTask 的完成状态
- **拖拽换天（周视图）**: 在周视图中，DDL 任务可以拖拽到其他天的 DDL 栏，自动修改 deadline 并同步
- **拖拽到日历**: DDL 任务可以拖拽到日历网格，创建对应的日程事件
- **右键菜单**: 编辑（TaskEditPop，可改名/标签/日期/分组）、挪到明天、挪到下周、标记完成、删除

### 左侧目标面板交互

#### 任务 Tab（WeeklyTab）
- **周导航**: 按周切换，显示当前周范围内有 deadline 的任务
- **分组折叠**: 点击分组标题折叠/展开
- **分组右键**: 重命名、删除（子任务变为未关联）
- **分组拖拽排序**: 通过分组标题左侧的拖拽手柄排序
- **任务卡片右键**: 编辑（TaskEditPop）、重命名（inline 编辑）、设置截止日期（DatePicker 浮层）、标记完成/未完成、删除
- **任务卡片拖拽排序**: 通过卡片左侧的 ⠿ 手柄在同组内排序
- **任务卡片拖入日历**: 按住卡片非手柄区域拖拽到日历，创建日程事件
- **新建分组**: 底部输入框回车创建
- **组内添加任务**: 点击分组底部的 "+ 添加任务"

#### 甘特图 Tab（GanttTab）
- **月导航**: 按月切换
- **显示**: 每个月度目标为一行，其下的 weeklyTasks 显示为时间条
- **时间条**: 根据 `startDate` 和 `deadline` 计算位置和宽度，已完成显示绿色
- **今日线**: 当前月份显示红色竖线标记今天

### 链接面板交互
- **打开方式**: 点击 TopBar 的链接图标，右侧滑出面板
- **搜索**: 实时过滤链接名称、URL、域名
- **视图切换**: 网格视图 / 列表视图
- **分组折叠**: 点击分组标题折叠/展开
- **链接点击**: 新标签页打开链接，同时记录点击次数
- **链接右键**: 复制链接（带 fallback 兼容非 HTTPS）、新标签打开、收藏/取消收藏、编辑（LinkEditPop，可改名/URL/分组）、删除
- **链接拖拽**: 拖拽到其他链接位置排序，跨分组拖拽自动改组
- **添加链接**: 底部表单输入 URL + 名称 + 分组（自定义下拉框），粘贴 URL 自动填充域名
- **分组管理**: 下拉框中右键分组可重命名/删除，拖拽排序，"+ 新分组"创建（PromptDialog 弹窗）
- **撤销支持**: 所有链接操作（增删改、排序、收藏、分组操作）都支持 Ctrl+Z 撤销

### 复盘面板交互
- **打开方式**: 点击右侧折叠标签，面板从右侧滑出
- **宽度调整**: 左边缘拖拽 resize handle
- **数据联动**: 自动根据当前日期（`ui.curDate`）计算当天的执行评分、数据概览、时间分布
- **评分算法**: `score = 执行率 × 0.5 + 准时率 × 0.3 + (100 - 临时插入惩罚) × 0.2`
- **准时判定**: 实际开始时间与计划开始时间偏差 ≤ 10 分钟视为准时
- **反思文本**: 按日期存储在 localStorage（`dt_refl_{dateKey}`），防抖 800ms 同步到服务器

### 全局键盘快捷键
- **Ctrl+Z**: 撤销（在 input/textarea/select 中不触发）
- **Ctrl+Y / Ctrl+Shift+Z**: 重做
- **Escape**: 关闭当前打开的弹窗（EventPopover、TaskEditPop 等）

### 视图切换逻辑
- **日视图**: 双列（PLANNED + ACTUAL），每列独立的事件块渲染和交互
- **周视图**: 7 列单列，每个事件只渲染一次，优先显示 actual 时间，无 actual 则显示 plan 时间；事件块支持文字换行避免窄列截断
- **月视图**: 日历网格，每格显示事件摘要（最多若干条 + "更多"），点击日期跳转日视图
- **周视图点击日期**: 跳转到该天的日视图

---

## 样式系统

- **CSS 变量**: 定义在 `styles/variables.css`，包含颜色、圆角、阴影、字体等
- **暗色模式**: `html.dark` 类切换，变量在 `:root` 和 `html.dark` 中分别定义
- **布局变量**: `--topbar-h`, `--task-panel-w`, `--review-panel-w`（可拖拽调整）
- **无 CSS 框架**: 全部手写 CSS，飞书风格设计

---

## 开发与部署

### 本地开发
```bash
# 前端
cd vue-app
npm install
npm run dev          # Vite dev server on :3000, proxy /api → :5000

# 后端
cd server
pip install -r requirements.txt
python app.py        # Flask on :5000
```

### 构建部署
```bash
cd vue-app
npm run build        # 输出到 vue-app/dist/

# Flask 直接 serve dist/ 目录
cd server
USE_VUE=1 python app.py
```

### 环境变量
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `USE_VUE` | `1` | 是否使用 Vue 构建产物 |
| `JWT_SECRET` | `daytrace_secret_key_change_in_prod` | JWT 签名密钥 |
| `DB_HOST` | (阿里云 RDS) | MySQL 主机 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `rainbow` | MySQL 用户 |
| `DB_PASS` | (见代码) | MySQL 密码 |
| `DB_NAME` | `daytrace` | 数据库名 |
| `PORT` | `5000` | Flask 监听端口 |
