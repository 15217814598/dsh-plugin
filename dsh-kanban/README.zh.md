# dsh-kanban — DeepSeek Harness 任务看板插件

[English](README.md) | 中文

DeepSeek Harness Web GUI 的热插拔任务看板插件，提供任务管理、拖拽排序、状态跟踪和持久化存储。

## 功能特性

- 📋 **看板视图** - 直观的多列看板布局（待规划/待办/进行中/评审中/已完成）
- 🖱️ **拖拽排序** - 支持任务在列之间拖拽移动
- 🤖 **自动任务** - 定时把待办任务作为后续对话轮次投递给 DSH AI 执行（`agent.followup()`，无需打开浏览器），AI 通过 HTTP API 认领、汇报并完成任务
- 🏷️ **优先级标签** - 低/中/高/紧急四个优先级
- 📅 **截止日期** - 为任务设置截止时间
- 🔍 **任务描述** - 为任务添加详细描述
- 💾 **持久化存储** - SQLite（WAL）本地存储

### 自动任务工作方式

1. 插件启动时向 DSH 系统提示词注册 kanban API 协议说明（system-prompt section）
2. 定时器触发时，调度器从「待办」列取第一个任务，按配置的**执行方式**投递给 AI：
   - **每个任务新建独立会话**（默认）：通过 `ctx.agents.create()` 为任务开一条新对话，任务绑定的项目名会经 `ctx.workspaceRegistry` 解析为工作目录（解析不到则使用宿主默认目录）；执行完自动释放会话，对话历史保留可回看。创建失败时自动降级为投递到现有会话。
   - **投递到现有会话**：通过 `agent.followup()` 把任务作为后续轮次追加到当前空闲的会话（都不空闲则选最新会话，排队执行）。
3. AI 在会话中执行任务，并按协议调用 claim / progress / comment / complete / fail HTTP API 更新状态
4. 会话结束后若任务仍停留在「进行中」，看板会显示提示事件

注意：没有任何活跃会话且模式为「投递到现有会话」时，任务保留在「待办」，下一个周期重试；「新建独立会话」模式不依赖已打开的会话。

## 快速开始

### 安装

```bash
dsh plugin --profile web add link:/path/to/dsh-kanban
```

### 使用方法

1. 启动 DSH Web GUI
2. 在侧边栏或顶部导航找到"任务看板"入口
3. 点击"+"按钮或在输入框中输入任务标题创建新任务
4. 拖拽任务卡片在列之间移动
5. 点击任务卡片上的编辑按钮修改任务详情

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/dsh-kanban/tasks` | 获取所有任务 |
| GET | `/api/dsh-kanban/tasks/:id` | 获取单个任务 |
| POST | `/api/dsh-kanban/tasks` | 创建新任务 |
| PUT | `/api/dsh-kanban/tasks/:id` | 更新任务 |
| PATCH | `/api/dsh-kanban/tasks/:id/move` | 移动任务 |
| DELETE | `/api/dsh-kanban/tasks/:id` | 删除任务 |

### 请求示例

**创建任务**

```json
POST /api/dsh-kanban/tasks
{
  "title": "完成项目文档",
  "description": "编写 README 和 API 文档",
  "priority": "high",
  "tags": ["文档", "项目"],
  "dueDate": "2026-09-01"
}
```

**移动任务**

```json
PATCH /api/dsh-kanban/tasks/:id/move
{
  "status": "in-progress",
  "order": 0
}
```

## 配置

在 `cordis.patch.yml` 中：

```yaml
- insert:
    - id: kanban
      name: 'dsh-kanban'
      config:
        enabled: true
        maxTasks: 1000
        columns:
          - id: todo
            title: '待办'
            color: '#6b7280'
          - id: in-progress
            title: '进行中'
            color: '#3b82f6'
          - id: done
            title: '已完成'
            color: '#22c55e'
```

## 数据存储

- **数据库**: SQLite（`node:sqlite` DatabaseSync，零原生依赖），路径 `$DSH_HOME/dsh-kanban.db`（`DSH_HOME` 缺省为 `~/.dsh`，与 DSH 官方路径解析一致）
- **日志模式**: WAL + `synchronous=NORMAL`，插件卸载时 checkpoint 并关闭
- **配置存储**: 自动任务与飞书配置保存在同库 `settings` 表，重启后自动加载
- **旧数据迁移**: 首次启动自动导入 `dsh-kanban.json`（及 auto-task / feishu 旧配置文件），原文件改名为 `.bak` 保留

## 开发

```bash
# 安装依赖
npm install

# 构建（服务端 tsc + 客户端 esbuild）
npm run build

# 分步构建
npm run build:server
npm run build:client
```

## 许可证

MIT
