# DayTrace

个人日程与任务管理工具，双栏时间轴(计划/实际)对照执行，配合周复盘数据分析。

![Vue3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vuedotjs&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.x-000?logo=flask)
![License](https://img.shields.io/badge/License-MIT-blue)

## 功能

**日程管理**
- 天/周/月三种视图切换
- 计划(Plan)与实际(Actual)双栏对照
- 拖拽创建、移动、调整时长
- 循环日程: 每天/工作日/每周重复，支持单次编辑或批量修改

**任务系统**
- 左侧面板按分组管理任务，支持拖拽排序
- 本周视图(按截止日期筛选) + 总览视图(全部任务，按完成状态排序)
- 循环任务: 和循环日程相同的repeat机制
- 任务可拖入日历生成计划事件
- 任务与周目标双向同步

**数据复盘**
- 日/周/月/自定义范围的执行统计
- 执行率、准时率、时长偏差分析
- 每日分数趋势折线图
- 时段效率分布

**其他**
- 深色/浅色主题切换
- 多设备自动同步(500ms防抖推送)
- Ctrl+Z/Y撤销重做
- AI助手(接入火山引擎豆包大模型)

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue3 + Pinia + Vite |
| 后端 | Flask + PyMySQL |
| 数据库 | MySQL |
| AI | 火山引擎ARK(豆包大模型) |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/Zuokaiqi/dayTrace.git
cd dayTrace
```

### 2. 前端构建

```bash
cd vue-app
npm install
npm run build
```

### 3. 后端配置

创建 `server/.env` 文件:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=daytrace
JWT_SECRET=your_jwt_secret

# AI功能(可选)
ARK_API_KEY=your_ark_api_key
ARK_MODEL=your_model_id
```

### 4. 安装依赖并启动

```bash
cd server
pip install -r requirements.txt
python app.py
```

访问 http://localhost:5000

## 项目结构

```
dayTrace/
  server/
    app.py              # Flask后端，API + 静态文件托管
    requirements.txt
  vue-app/
    src/
      components/       # Vue组件(36个)
      composables/      # 组合式函数(11个)
      stores/           # Pinia状态管理(6个)
      styles/           # 全局CSS
      views/            # 页面视图
    dist/               # 构建产物
```

## License

MIT
