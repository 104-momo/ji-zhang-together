import Taro from '@tarojs/taro'
import { call, CLOUD_ENV } from './cloud'

export interface AuthUser { uid: string; nickname: string }
export interface AuthAPI {
  ensureUser(nickname: string): Promise<AuthUser>
  getCurrentUser(): AuthUser | null
  onAuthStateChanged(cb: (user: AuthUser | null) => void): () => void
  signOut(): Promise<void>
  updateNickname(nickname: string): Promise<void>
}

const K_CURRENT = 'jz_auth_current'
const K_UID = 'jz_uid'
const K_NICK = 'jz_nickname'
const listeners: Array<(user: AuthUser | null) => void> = []

function getCurrentUser(): AuthUser | null {
  try { const raw = Taro.getStorageSync(K_CURRENT) as string; return raw ? JSON.parse(raw) : null } catch { return null }
}
function notify(): void { const user = getCurrentUser(); listeners.forEach((cb) => cb(user)) }
function makeLocalUid(): string { return `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` }

export const auth: AuthAPI = {
  async ensureUser(nickname) {
    const nick = (nickname || '').trim() || (Taro.getStorageSync(K_NICK) as string) || '我'
    let uid = Taro.getStorageSync(K_UID) as string
    if (!uid || (CLOUD_ENV && uid.startsWith('u_'))) {
      if (CLOUD_ENV) { try { uid = (await call('whoami', {})).uid } catch { uid = makeLocalUid() } }
      else { uid = makeLocalUid() }
      Taro.setStorageSync(K_UID, uid)
    }
    Taro.setStorageSync(K_NICK, nick)
    const user: AuthUser = { uid, nickname: nick }
    Taro.setStorageSync(K_CURRENT, JSON.stringify(user))
    notify()
    return user
  },
  getCurrentUser,
  onAuthStateChanged(cb) { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1) } },
  async signOut() { Taro.removeStorageSync(K_CURRENT); Taro.removeStorageSync(K_UID); notify() },
  async updateNickname(nickname) {
    const current = getCurrentUser(); if (!current) throw new Error('未登录')
    current.nickname = nickname.trim() || current.nickname
    Taro.setStorageSync(K_NICK, current.nickname)
    Taro.setStorageSync(K_CURRENT, JSON.stringify(current))
    notify()
  },
}
