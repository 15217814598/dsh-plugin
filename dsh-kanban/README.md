# dsh-kanban — DeepSeek Harness 任务看板插件

[English](#) | 中文

DeepSeek Harness Web GUI 的热插拔任务看板插件，提供任务管理、拖拽排序、状态跟踪和持久化存储。

## 功能特性

- 📋 **看板视图** - 直观的三列看板布局（待办/进行中/已完成）
- 🖱️ **拖拽排序** - 支持任务在列之间拖拽移动
- 🏷️ **优先级标签** - 低/中/高/紧急四个优先级
- 📅 **截止日期** - 为任务设置截止时间
- 🔍 **任务描述** - 为任务添加详细描述
- 💾 **持久化存储** - 数据保存到本地文件

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
