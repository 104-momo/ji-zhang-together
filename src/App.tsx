import { useEffect, useState } from 'react'
import { useLedger } from './store/useLedger'
import { auth, type AuthUser } from './services/auth'
import HomePage from './components/HomePage'
import LedgerPage from './components/LedgerPage'
import StatsPage from './components/StatsPage'
import AuthPage from './components/AuthPage'

interface JoinParams {
  ledgerId: string
  code: string
}

function parseJoinParams(): JoinParams | null {
  const p = new URLSearchParams(location.search)
  const ledgerId = p.get('join')
  const code = p.get('code')
  if (ledgerId && code) return { ledgerId, code }
  return null
}

export default function App() {
  const {
    myLedgers,
    current,
    error,
    createLedger,
    joinLedger,
    openLedger,
    leaveLedger,
    addEntry,
    updateEntry,
    deleteEntry,
    renameLedger,
    removeMember,
    updateNickname,
    regenerateInviteCode,
    deleteLedger,
    updateCategories,
    clearError,
    setError,
  } = useLedger()

  const [join, setJoin] = useState<JoinParams | null>(parseJoinParams)
  const [user, setUser] = useState<AuthUser | null>(() => auth.getCurrentUser())
  const [showStats, setShowStats] = useState(false)

  // 监听登录态变化
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u) {
        // 登出后清空当前账本
        leaveLedger()
        setShowStats(false)
      }
    })
    return unsub
  }, [leaveLedger])

  // 已登录且有 join 参数时，自动加入账本（兜底：直接打开邀请链接/登录态恢复）
  useEffect(() => {
    if (user && join && !current) {
      const nickname = user.nickname || user.email?.split('@')[0] || '我'
      joinLedger(join.ledgerId, join.code, nickname)
        .then(() => setJoin(null))
        .catch((e) => {
          console.error('[自动加入账本失败(useEffect)]', e)
          setError(e instanceof Error ? e.message : '加入失败')
        })
    }
  }, [user, join, current, joinLedger, setError])

  // 进入账本后清理 URL 上的 join 参数，避免刷新/返回时反复自动加入
  useEffect(() => {
    if (!current) return
    const url = new URL(location.href)
    if (url.searchParams.has('join') || url.searchParams.has('code')) {
      url.searchParams.delete('join')
      url.searchParams.delete('code')
      history.replaceState(null, '', url)
    }
  }, [current])

  // 切换账本时关闭统计页
  useEffect(() => {
    if (!current) setShowStats(false)
  }, [current])

  const handleCreate = async (name: string, nickname: string) => {
    await createLedger(name, nickname)
  }

  const handleOpen = (ledgerId: string) => {
    openLedger(ledgerId).catch((e) => setError(e instanceof Error ? e.message : '打开失败'))
  }

  // 登录/注册成功后回调：如果带着 join 参数，直接自动加入账本
  const handleAuthSuccess = async () => {
    // 等待 auth 单例实例的 currentUser 就绪（登录态同步可能有极短延迟）
    let u: AuthUser | null = null
    for (let i = 0; i < 25; i++) {
      u = auth.getCurrentUser()
      if (u?.uid) break
      await new Promise((r) => setTimeout(r, 200))
    }
    setUser(u)
    if (u?.uid && join) {
      const nickname = u.nickname || u.email?.split('@')[0] || '我'
      try {
        await joinLedger(join.ledgerId, join.code, nickname)
        setJoin(null)
      } catch (e) {
        console.error('[自动加入账本失败]', e)
        setError(e instanceof Error ? e.message : '加入失败')
      }
    }
  }

  const handleRename = async (name: string) => {
    if (!current) return
    await renameLedger(name)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!current) return
    await removeMember(memberId)
  }

  const handleRegenerate = async () => {
    if (!current) return
    await regenerateInviteCode()
  }
  const handleUpdateNickname = async (nickname: string) => {
    if (!current) return
    await updateNickname(nickname)
  }

  const handleUpdateCats = async (cats: string[]) => {
    if (!current) return
    await updateCategories(cats)
  }
  const handleDeleteLedger = async () => {
    if (!current) return
    await deleteLedger()
  }

  // —— 未登录：显示登录注册页（如果有 join 参数，提示登录后自动加入） ——
  if (!user) {
    return (
      <div className="app-frame">
        <AuthPage onSuccess={handleAuthSuccess} joinHint={join ? '登录后将自动加入账本' : undefined} />
        {error ? (
          <div className="toast toast-err">
            {error} <button onClick={clearError}>知道了</button>
          </div>
        ) : null}
      </div>
    )
  }

  // —— 已登录：正常页面路由 ——
  let page
  if (current && showStats) {
    page = <StatsPage entries={current.entries} members={current.members} onBack={() => setShowStats(false)} />
  } else if (current) {
    page = (
      <LedgerPage
        view={current}
        onAddEntry={addEntry}
        onUpdateEntry={updateEntry}
        onDeleteEntry={deleteEntry}
        onBack={leaveLedger}
        onOpenStats={() => setShowStats(true)}
        onRename={handleRename}
        onRemoveMember={handleRemoveMember}
        onUpdateNickname={handleUpdateNickname}
        onRegenerateInvite={handleRegenerate}
        onUpdateCategories={handleUpdateCats}
        onDeleteLedger={handleDeleteLedger}
      />
    )
  } else {
    page = <HomePage myLedgers={myLedgers} onCreate={handleCreate} onOpen={handleOpen} />
  }

  return (
    <div className="app-frame">
      {page}
      {error ? (
        <div className="toast toast-err">
          {error} <button onClick={clearError}>知道了</button>
        </div>
      ) : null}
    </div>
  )
}
