/**
 * 认证服务：注册/登录/登出/当前用户/登录态监听。
 *
 * - mock 实现：localStorage 模拟用户系统，本地单人演示用
 * - cloudbase 实现：@cloudbase/js-sdk auth，邮箱注册登录，真实共享用
 *
 * 自动切换：配置了 VITE_CLOUDBASE_ENV 用 cloudbase，否则用 mock。
 */
import { getCloudAuth } from './cloudbase-app'
export interface AuthUser {
  uid: string
  email: string
  nickname: string
}
export interface AuthAPI {
  /** 发送邮箱验证码，返回 verificationId 和该邮箱是否已注册 */
  sendVerificationCode(email: string): Promise<{ verificationId: string; isUser: boolean }>
  /** 校验验证码，返回 verification_token（用于注册/登录） */
  verifyCode(verificationId: string, code: string): Promise<string>
  /** 注册：邮箱+验证码+token+密码+昵称，成功后自动登录 */
  signUp(email: string, code: string, token: string, password: string, nickname: string): Promise<AuthUser>
  /** 登录：邮箱+密码 */
  signIn(email: string, password: string): Promise<AuthUser>
  /** 登出 */
  signOut(): Promise<void>
  /** 当前登录用户（未登录返回 null） */
  getCurrentUser(): AuthUser | null
  /** 登录态变化监听，返回取消监听函数 */
  onAuthStateChanged(cb: (user: AuthUser | null) => void): () => void
  /** 更新昵称 */
  updateNickname(nickname: string): Promise<void>
}
// ============================================================
// Mock 实现（localStorage）
// ============================================================
const K_USERS = 'jz_auth_users'
const K_CURRENT = 'jz_auth_current'
interface MockUserRecord {
  uid: string
  email: string
  password: string
  nickname: string
}
function loadUsers(): MockUserRecord[] {
  try {
    return JSON.parse(localStorage.getItem(K_USERS) || '[]') as MockUserRecord[]
  } catch {
    return []
  }
}
function saveUsers(users: MockUserRecord[]): void {
  localStorage.setItem(K_USERS, JSON.stringify(users))
}
function toAuthUser(u: MockUserRecord): AuthUser {
  return { uid: u.uid, email: u.email, nickname: u.nickname }
}
// mock 模式登录态监听（同标签页内操作后手动触发 + 跨标签页 storage 事件）
const mockListeners: Array<(user: AuthUser | null) => void> = []
function notifyMockListeners() {
  const user = (() => {
    try {
      const raw = localStorage.getItem(K_CURRENT)
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  })()
  mockListeners.forEach((cb) => cb(user))
}
const mockAuth: AuthAPI = {
  async sendVerificationCode(email) {
    // mock 模式：固定验证码 123456
    const users = loadUsers()
    const isUser = users.some((u) => u.email === email.trim().toLowerCase())
    return { verificationId: `mock_${Date.now()}`, isUser }
  },
  async verifyCode(_verificationId, code) {
    if (code !== '123456') throw new Error('验证码错误')
    return `mock_token_${Date.now()}`
  },
  async signUp(email, _code, _token, password, nickname) {
    if (!_token) throw new Error('请先完成邮箱验证')
    const users = loadUsers()
    if (users.some((u) => u.email === email)) {
      throw new Error('该邮箱已注册，请直接登录')
    }
    if (password.length < 6) throw new Error('密码至少 6 位')
    const user: MockUserRecord = {
      uid: `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      email: email.trim().toLowerCase(),
      password,
      nickname: nickname.trim() || '我',
    }
    saveUsers([...users, user])
    localStorage.setItem(K_CURRENT, JSON.stringify(toAuthUser(user)))
    notifyMockListeners()
    return toAuthUser(user)
  },
  async signIn(email, password) {
    const users = loadUsers()
    const user = users.find((u) => u.email === email.trim().toLowerCase())
    if (!user) throw new Error('邮箱未注册')
    if (user.password !== password) throw new Error('密码错误')
    localStorage.setItem(K_CURRENT, JSON.stringify(toAuthUser(user)))
    notifyMockListeners()
    return toAuthUser(user)
  },
  async signOut() {
    localStorage.removeItem(K_CURRENT)
    notifyMockListeners()
  },
  getCurrentUser() {
    try {
      const raw = localStorage.getItem(K_CURRENT)
      return raw ? (JSON.parse(raw) as AuthUser) : null
    } catch {
      return null
    }
  },
  onAuthStateChanged(cb) {
    // 同标签页内操作后手动触发
    mockListeners.push(cb)
    // 跨标签页同步
    const handler = (e: StorageEvent) => {
      if (e.key === K_CURRENT) {
        cb(this.getCurrentUser())
      }
    }
    window.addEventListener('storage', handler)
    return () => {
      const idx = mockListeners.indexOf(cb)
      if (idx >= 0) mockListeners.splice(idx, 1)
      window.removeEventListener('storage', handler)
    }
  },
  async updateNickname(nickname) {
    const current = this.getCurrentUser()
    if (!current) throw new Error('未登录')
    const users = loadUsers()
    const idx = users.findIndex((u) => u.uid === current.uid)
    if (idx >= 0) {
      users[idx].nickname = nickname.trim() || users[idx].nickname
      saveUsers(users)
      localStorage.setItem(K_CURRENT, JSON.stringify(toAuthUser(users[idx])))
      notifyMockListeners()
    }
  },
}
// ============================================================
// CloudBase 实现（使用共享的 app 实例，确保登录态共享）
// ============================================================
function cbUserToAuthUser(cbUser: any): AuthUser | null {
  if (!cbUser) return null
  return {
    uid: cbUser.uid,
    email: cbUser.email || '',
    nickname: cbUser.nickName || cbUser.nickname || '我',
  }
}
const cloudbaseAuth: AuthAPI = {
  async sendVerificationCode(email) {
    const auth = getCloudAuth()
    const res = await auth.getVerification({ email: email.trim().toLowerCase() })
    return { verificationId: res.verification_id || '', isUser: !!res.is_user }
  },
  async verifyCode(verificationId, code) {
    const auth = getCloudAuth()
    const res = await auth.verify({ verification_id: verificationId, verification_code: code })
    return res.verification_token || ''
  },
  async signUp(email, code, token, password, nickname) {
    const auth = getCloudAuth()
    // v2 邮箱验证码注册：signUp 成功后自动登录
    // 注意：username 字段只允许小写字母开头+6-25位字母数字，中文昵称不能传这里
    // 昵称通过 updateUserBasicInfo 设置
    await auth.signUp({
      email: email.trim().toLowerCase(),
      verification_code: code,
      verification_token: token,
      password,
    })
    // 注册成功后设置昵称
    try {
      await auth.updateUserBasicInfo({ nickname: nickname.trim() || '我' })
    } catch (e) {
      console.warn('[设置昵称失败]', e)
    }
    const user = auth.currentUser
    if (!user) throw new Error('注册后获取用户信息失败')
    return cbUserToAuthUser(user)!
  },
  async signIn(email, password) {
    const auth = getCloudAuth()
    await auth.signIn({ username: email.trim().toLowerCase(), password })
    const user = auth.currentUser
    if (!user) throw new Error('登录后获取用户信息失败')
    return cbUserToAuthUser(user)!
  },
  async signOut() {
    const auth = getCloudAuth()
    await auth.signOut()
  },
  getCurrentUser() {
    try {
      const auth = getCloudAuth()
      const user = auth.currentUser
      return user ? cbUserToAuthUser(user) : null
    } catch {
      return null
    }
  },
  onAuthStateChanged(cb) {
    const auth = getCloudAuth()
    // CloudBase 的登录态监听 API（返回 Promise，不提供取消函数）
    auth.onLoginStateChanged((state: any) => {
      const user = auth.currentUser
      if (state && user) {
        const mapped = cbUserToAuthUser(user)
        if (mapped) cb(mapped)
      } else {
        cb(null)
      }
    })
    // SDK 不提供取消函数，返回空函数
    return () => {}
  },
  async updateNickname(nickname) {
    const auth = getCloudAuth()
    await auth.updateUserBasicInfo({ nickname: nickname.trim() })
  },
}
// ============================================================
// 自动切换导出
// ============================================================
const ENV_ID = (import.meta.env.VITE_CLOUDBASE_ENV as string | undefined) || ''
export const auth: AuthAPI = ENV_ID ? cloudbaseAuth : mockAuth
export const isCloudMode = !!ENV_ID
