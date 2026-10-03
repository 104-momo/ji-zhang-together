import Taro from '@tarojs/taro'

/**
 * 每日记账提醒 · 订阅消息模板 ID
 *
 * 配置步骤（小程序管理后台）：
 * 1. 「功能 → 订阅消息 → 公共模板库」中选一个待办/提醒类模板（建议含 事项标题、时间、备注 三个字段）
 * 2. 添加后把模板 ID 填到下面引号内
 * 3. 云函数 cloudfunctions/ledgerApi/index.js 顶部 REMINDER_TMPL_ID 保持空串即可，
 *    也可在云函数环境变量 REMINDER_TMPL_ID 中配置（环境变量优先）
 * 4. 若模板字段与 reminderData() 里的 thing1/time2/thing3 不一致，同步修改云函数字段名
 *
 * 留空时：前端提示「提醒功能待配置」，不会调起微信授权。
 */
export const REMINDER_TEMPLATE_ID: string = '-wq0aZvKONxkdQeqgJCMnnn4Ev1uYXnczkduVE0OQ3g'

/** 调起微信订阅授权，返回用户对本模板的选择 */
export async function requestReminderAuth(): Promise<'accept' | 'reject' | 'ban'> {
  if (!REMINDER_TEMPLATE_ID) throw new Error('NOT_CONFIGURED')
  // 微信端只需 tmplIds；Taro 类型定义额外要求 entityIds，与运行时无关，故 as any
  const res = await Taro.requestSubscribeMessage({ tmplIds: [REMINDER_TEMPLATE_ID] } as any)
  return (res as Record<string, 'accept' | 'reject' | 'ban'>)[REMINDER_TEMPLATE_ID]
}
