/**
 * 飞书文档集成模块
 * 支持从飞书多维表格同步任务到看板
 */

import type { Task, TaskStatus, CreateTaskInput } from './types.ts'

/** 飞书配置 */
export interface FeishuConfig {
  /** 应用 ID */
  appId: string
  /** 应用密钥 */
  appSecret: string
  /** 多维表格 App Token */
  appToken: string
  /** 数据表 ID */
  tableId: string
  /** 字段映射 */
  fieldMapping?: FieldMapping
}

/** 字段映射配置 */
export interface FieldMapping {
  title: string
  description?: string
  status?: string
  priority?: string
  tags?: string
  dueDate?: string
}

/** 默认字段映射 */
const defaultFieldMapping: FieldMapping = {
  title: '标题',
  description: '描述',
  status: '状态',
  priority: '优先级',
  tags: '标签',
  dueDate: '截止日期',
}

/** 飞书 API 响应 */
interface FeishuApiResponse {
  code: number
  msg: string
  data: any
}

/** 飞书记录 */
interface FeishuRecord {
  record_id: string
  fields: Record<string, any>
}

/**
 * 飞书 API 客户端
 */
export class FeishuClient {
  private appId: string
  private appSecret: string
  private appToken: string
  private tableId: string
  private fieldMapping: FieldMapping
  private tenantAccessToken: string | null = null
  private tokenExpiry: number = 0

  constructor(config: FeishuConfig) {
    this.appId = config.appId
    this.appSecret = config.appSecret
    this.appToken = config.appToken
    this.tableId = config.tableId
    this.fieldMapping = { ...defaultFieldMapping, ...config.fieldMapping }
  }

  /**
   * 获取租户访问令牌
   */
  private async getTenantAccessToken(): Promise<string> {
    // 检查缓存的令牌是否有效
    if (this.tenantAccessToken && Date.now() < this.tokenExpiry) {
      return this.tenantAccessToken
    }

    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    })

    const data: FeishuApiResponse = await response.json()

    if (data.code !== 0) {
      throw new Error(`获取飞书访问令牌失败: ${data.msg}`)
    }

    this.tenantAccessToken = data.data.tenant_access_token
    // 令牌有效期为 2 小时，提前 5 分钟刷新
    this.tokenExpiry = Date.now() + (data.data.expire - 300) * 1000

    return this.tenantAccessToken
  }

  /**
   * 发送 API 请求
   */
  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await this.getTenantAccessToken()

    const response = await fetch(`https://open.feishu.cn/open-apis${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options?.headers,
      },
    })

    const data: FeishuApiResponse = await response.json()

    if (data.code !== 0) {
      throw new Error(`飞书 API 错误: ${data.msg}`)
    }

    return data.data
  }

  /**
   * 获取多维表格记录列表
   */
  async getRecords(pageToken?: string): Promise<{ items: FeishuRecord[]; pageToken?: string; hasMore: boolean }> {
    let path = `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records?page_size=100`
    if (pageToken) {
      path += `&page_token=${pageToken}`
    }

    const data = await this.request<{
      items: FeishuRecord[]
      page_token?: string
      has_more: boolean
    }>(path)

    return {
      items: data.items || [],
      pageToken: data.page_token,
      hasMore: data.has_more || false,
    }
  }

  /**
   * 获取所有记录（自动分页）
   */
  async getAllRecords(): Promise<FeishuRecord[]> {
    const allRecords: FeishuRecord[] = []
    let pageToken: string | undefined
    let hasMore = true

    while (hasMore) {
      const result = await this.getRecords(pageToken)
      allRecords.push(...result.items)
      pageToken = result.pageToken
      hasMore = result.hasMore
    }

    return allRecords
  }

  /**
   * 创建记录
   */
  async createRecord(fields: Record<string, any>): Promise<FeishuRecord> {
    const data = await this.request<{ record: FeishuRecord }>(
      `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records`,
      {
        method: 'POST',
        body: JSON.stringify({ fields }),
      }
    )

    return data.record
  }

  /**
   * 更新记录
   */
  async updateRecord(recordId: string, fields: Record<string, any>): Promise<FeishuRecord> {
    const data = await this.request<{ record: FeishuRecord }>(
      `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records/${recordId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      }
    )

    return data.record
  }

  /**
   * 删除记录
   */
  async deleteRecord(recordId: string): Promise<void> {
    await this.request(
      `/bitable/v1/apps/${this.appToken}/tables/${this.tableId}/records/${recordId}`,
      {
        method: 'DELETE',
      }
    )
  }

  /**
   * 将飞书记录转换为任务
   */
  recordToTask(record: FeishuRecord): Task {
    const fields = record.fields
    const mapping = this.fieldMapping

    // 解析状态
    const statusValue = fields[mapping.status || '状态']
    let status: TaskStatus = 'todo'
    if (typeof statusValue === 'string') {
      status = this.parseStatus(statusValue)
    }

    // 解析优先级
    const priorityValue = fields[mapping.priority || '优先级']
    let priority: Task['priority'] = 'medium'
    if (typeof priorityValue === 'string') {
      priority = this.parsePriority(priorityValue)
    }

    // 解析标签
    const tagsValue = fields[mapping.tags || '标签']
    let tags: string[] = []
    if (Array.isArray(tagsValue)) {
      tags = tagsValue.map(t => typeof t === 'string' ? t : t.text || '')
    }

    // 解析截止日期
    const dueDateValue = fields[mapping.dueDate || '截止日期']
    let dueDate: string | undefined
    if (dueDateValue) {
      // 飞书日期字段是时间戳（毫秒）
      dueDate = new Date(dueDateValue).toISOString().split('T')[0]
    }

    return {
      id: record.record_id,
      title: fields[mapping.title || '标题'] || '无标题',
      description: fields[mapping.description || '描述'],
      status,
      priority,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dueDate,
      order: 0,
    }
  }

  /**
   * 将任务转换为飞书记录字段
   */
  taskToRecord(task: Task): Record<string, any> {
    const mapping = this.fieldMapping
    const fields: Record<string, any> = {}

    fields[mapping.title || '标题'] = task.title

    if (task.description) {
      fields[mapping.description || '描述'] = task.description
    }

    if (mapping.status) {
      fields[mapping.status] = this.formatStatus(task.status)
    }

    if (mapping.priority) {
      fields[mapping.priority] = this.formatPriority(task.priority)
    }

    if (mapping.tags && task.tags.length > 0) {
      fields[mapping.tags] = task.tags
    }

    if (mapping.dueDate && task.dueDate) {
      fields[mapping.dueDate] = new Date(task.dueDate).getTime()
    }

    return fields
  }

  /**
   * 解析状态字符串
   */
  private parseStatus(statusStr: string): TaskStatus {
    const statusMap: Record<string, TaskStatus> = {
      '待办': 'todo',
      '待开始': 'todo',
      '进行中': 'in-progress',
      '处理中': 'in-progress',
      '评审中': 'review',
      '评审': 'review',
      '已完成': 'done',
      '完成': 'done',
    }

    return statusMap[statusStr] || 'todo'
  }

  /**
   * 格式化状态为中文
   */
  private formatStatus(status: TaskStatus): string {
    const statusMap: Record<TaskStatus, string> = {
      'todo': '待办',
      'in-progress': '进行中',
      'review': '评审中',
      'done': '已完成',
    }

    return statusMap[status] || '待办'
  }

  /**
   * 解析优先级字符串
   */
  private parsePriority(priorityStr: string): Task['priority'] {
    const priorityMap: Record<string, Task['priority']> = {
      '紧急': 'urgent',
      '高优': 'high',
      '高': 'high',
      '中优': 'medium',
      '中': 'medium',
      '低优': 'low',
      '低': 'low',
      'urgent': 'urgent',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'P0': 'urgent',
      'P1': 'high',
      'P2': 'medium',
      'P3': 'low',
    }

    return priorityMap[priorityStr] || 'medium'
  }

  /**
   * 格式化优先级为中文
   */
  private formatPriority(priority: Task['priority']): string {
    const priorityMap: Record<Task['priority'], string> = {
      'urgent': '紧急',
      'high': '高优',
      'medium': '中优',
      'low': '低优',
    }

    return priorityMap[priority] || '中优'
  }

  /**
   * 从飞书同步任务
   */
  async syncFromFeishu(): Promise<Task[]> {
    const records = await this.getAllRecords()
    return records.map(record => this.recordToTask(record))
  }

  /**
   * 将任务同步到飞书
   */
  async syncToFeishu(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      const fields = this.taskToRecord(task)

      if (task.id.startsWith('rec')) {
        // 已存在的飞书记录，更新
        await this.updateRecord(task.id, fields)
      } else {
        // 新记录，创建
        await this.createRecord(fields)
      }
    }
  }
}
