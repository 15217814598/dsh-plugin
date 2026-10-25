# dsh-kanban 使用指南

## 安装插件

```bash
# 在 DeepSeek Harness 项目目录下执行
dsh plugin --profile web add link:/path/to/dsh-kanban
```

## 开发模式

```bash
# 进入插件目录
cd dsh-kanban

# 安装依赖
npm install

# 构建
npm run build

# 监视模式（开发时使用）
npm run watch
```

## 功能说明

### 创建任务
- 点击列底部的"+ 添加任务"按钮
- 填写任务标题（必填）
- 可选：描述、优先级、截止日期
- 点击"创建"按钮

### 编辑任务
- 点击任务卡片上的 ✏️ 图标
- 修改任务信息
- 点击"保存"按钮

### 删除任务
- 点击任务卡片上的 🗑️ 图标
- 确认删除

### 移动任务
- 拖拽任务卡片到目标列
- 释放鼠标完成移动

### 列说明
- 🟣 **待规划** - 已识别但尚未安排的任务
- ⚪ **待办** - 已安排等待开始的任务
- 🔵 **进行中** - 正在处理的任务
- 🟢 **已完成** - 已完成的任务
- 🔴 **已失败** - 失败或取消的任务

### 优先级说明
- 🔴 **紧急** - 立即处理
- 🟠 **高** - 优先处理
- 🔵 **中** - 正常处理
- ⚪ **低** - 有空处理

## API 使用示例

### 获取所有任务
```bash
curl http://localhost:3080/api/dsh-kanban/tasks
```

### 创建任务
```bash
curl -X POST http://localhost:3080/api/dsh-kanban/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "新任务", "priority": "high"}'
```

### 移动任务
```bash
curl -X PATCH http://localhost:3080/api/dsh-kanban/tasks/{task_id}/move \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress", "order": 0}'
```

### 删除任务
```bash
curl -X DELETE http://localhost:3080/api/dsh-kanban/tasks/{task_id}
```

## 数据存储

任务数据保存在 `~/.dsh/dsh-kanban.json`文件中，格式为 JSON 数组。

示例数据格式：
```json
[
  {
    "id": "task_1234567890_abc123",
    "title": "任务标题",
    "description": "任务描述",
    "status": "todo",
    "priority": "medium",
    "tags": ["标签1", "标签2"],
    "createdAt": "2026-08-22T10:00:00Z",
    "updatedAt": "2026-08-22T10:00:00Z",
    "dueDate": "2026-09-01",
    "order": 0
  }
]
```

## 配置选项

在 `cordis.patch.yml` 中可以配置：

```yaml
- insert:
    - id: kanban
      name: 'dsh-kanban'
      config:
        enabled: true          # 是否启用插件
        maxTasks: 1000         # 最大任务数量
        columns:               # 自定义列配置
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

## 故障排除

### 任务无法加载
- 检查 DeepSeek Harness 是否正在运行
- 检查浏览器控制台是否有错误
- 确认插件已正确安装

### 数据丢失
- 检查 `~/.dsh/dsh-kanban.json`文件是否存在
- 检查文件权限是否正确

### API 返回 401
- 确保已安装并启用 `dsh-auth`插件
- 确保已登录并持有有效的 JWT 令牌
