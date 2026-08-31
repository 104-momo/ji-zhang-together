import tcb from '@cloudbase/js-sdk'
// 副作用导入：加载 functions / database 组件模块（模块内部会完成全局组件注册）
import '@cloudbase/js-sdk/functions'
import '@cloudbase/js-sdk/database'
/**
 * 共享的 CloudBase app 实例。
 * auth.ts 和 cloudbase.ts 必须用同一个实例，否则登录态不共享。
 *
 * 说明：SDK 3.x 在访问 auth.currentUser / callFunction / database 时
 * 会按需自动懒注册组件，因此这里【不要】再手动 registerFunctions/registerDatabase，
 * 否则会与 SDK 内部注册冲突，报 "Duplicate component functions/database"。
 */
const ENV_ID = (import.meta.env.VITE_CLOUDBASE_ENV as string | undefined) || ''
let appInstance: ReturnType<typeof tcb.init> | null = null
let authInstance: any = null
export function getCloudApp() {
  if (!appInstance) {
    if (!ENV_ID) throw new Error('CloudBase 未配置环境 ID（VITE_CLOUDBASE_ENV）')
    appInstance = tcb.init({ env: ENV_ID })
    console.log('[CloudBase] app 初始化完成（SDK 3.x，组件按需自动注册）')
  }
  return appInstance
}
export function getCloudAuth() {
  // 必须复用同一个 auth 实例：否则登录态不同步（currentUser 为空导致 uid 丢失）
  if (!authInstance) {
    authInstance = getCloudApp().auth({ persistence: 'local' })
  }
  return authInstance
}
export function getCloudDb() {
  return getCloudApp().database()
}
