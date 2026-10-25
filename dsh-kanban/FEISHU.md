# 飞书集成使用指南

## 前置条件

1. 拥有飞书开放平台账号
2. 创建一个企业自建应用
3. 创建一个多维表格用于存储任务

## 步骤一：创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 点击「创建企业自建应用」
3. 填写应用名称和描述
4. 在「凭证与基础信息」页面获取：
   - **App ID**
   - **App Secret**

## 步骤二：配置应用权限

在应用的「权限管理」页面，添加以下权限：

| 权限 | 说明 |
|------|------|
| `bitable:app` | 多维表格应用权限 |
| `bitable:app:readonly` | 多维表格只读权限（最小权限） |

## 步骤三：创建多维表格

1. 在飞书中创建一个多维表格
2. 添加以下字段（字段名称需与配置一致）：

| 字段名 | 字段类型 | 说明 |
|--------|----------|------|
| 标题 | 文本 | 任务标题（必填） |
| 描述 | 文本 | 任务描述 |
| 状态 | 单选 | 待规划/待办/进行中/评审中/已完成 |
| 优先级 | 单选 | 低/中/高/紧急 |
| 标签 | 多选 | 自定义标签 |
| 截止日期 | 日期 | 任务截止时间 |
| 项目 | 文本 | 关联的 DSH 项目名（须与侧栏项目名完全一致，自动任务按它定位执行项目；可留空） |
| 负责人 | 文本 | 任务负责人（可留空） |

3. 获取多维表格信息：
   - **App Token**: 表格 URL 中的 `/base/` 后面的字符串
   - **Table ID**: 表格 URL 中的 `table=` 参数

例如，URL 为：
```
https://xxx.feishu.cn/base/abc123def456?table=tblXXX
```
- App Token: `abc123def456`
- Table ID: `tblXXX`

## 步骤四：配置插件

编辑 `cordis.patch.yml`，填入飞书配置：

```yaml
- insert:
    - id: kanban
      name: 'dsh-kanban'
      config:
        enabled: true
        feishu:
          appId: 'cli_xxxxxxxxxx'
          appSecret: 'xxxxxxxxxxxxxxxxxxxx'
          appToken: 'abc123def456'
          tableId: 'tblXXX'
          fieldMapping:
            title: '标题'
            description: '描述'
            status: '状态'
            priority: '优先级'
            tags: '标签'
            dueDate: '截止日期'
```

## 使用方法

### 从飞书同步到看板

将飞书多维表格中的记录导入到看板：

```bash
curl -X POST http://localhost:3080/api/dsh-kanban/feishu/sync-from
```

或在看板界面点击「从飞书同步」按钮。

### 从看板同步到飞书

将看板中的任务导出到飞书多维表格：

```bash
curl -X POST http://localhost:3080/api/dsh-kanban/feishu/sync-to
```

或在看板界面点击「同步到飞书」按钮。

## 字段映射

如果飞书表格中的字段名称与默认不同，可以通过 `fieldMapping` 配置自定义映射：

```yaml
feishu:
  fieldMapping:
    title: '任务名称'        # 飞书中的字段名
    description: '任务详情'
    status: '当前状态'
    priority: '优先级别'
    tags: '分类标签'
    dueDate: '截止时间'
    project: '所属项目'
    assignee: '负责人'
```

## 状态值映射

飞书中的状态值会自动映射到看板状态：

| 飞书状态值 | 看板状态 |
|-----------|---------|
| 待规划、规划中 | planned |
| 待办、待开始 | todo |
| 进行中、处理中 | in-progress |
| 评审中、评审 | review |
| 已完成、完成 | done |
| 其他值（含失败/取消） | 回落为 todo |

## 优先级映射

| 飞书优先级值 | 看板优先级 |
|-------------|-----------|
| 低、低优先级 | low |
| 中、中优先级 | medium |
| 高、高优先级 | high |
| 紧急、紧急优先级 | urgent |

## 故障排除

### 同步失败：权限不足

确保应用已添加 `bitable:app` 权限，并且已发布应用版本。

### 同步失败：找不到表格

检查 `appToken` 和 `tableId` 是否正确，确保应用有访问该表格的权限。

### 字段映射错误

检查 `fieldMapping` 中的字段名称是否与飞书表格中的字段名完全一致（区分大小写）。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dsh-kanban/feishu/status` | 检查飞书连接状态 |
| POST | `/api/dsh-kanban/feishu/sync-from` | 从飞书同步任务 |
| POST | `/api/dsh-kanban/feishu/sync-to` | 同步任务到飞书 |
