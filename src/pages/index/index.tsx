import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { useLedger } from '../../store/useLedger'
import { auth, type AuthUser } from '../../services/auth'
import HomePage from '../../components/HomePage'
import LedgerPage from '../../components/LedgerPage'
import StatsPage from '../../components/StatsPage'
import SearchPage from '../../components/SearchPage'
import CalendarPage from '../../components/CalendarPage'
import ReportPage from '../../components/ReportPage'
import BudgetPage from '../../components/BudgetPage'
import CategoryBudgetPage from '../../components/CategoryBudgetPage'
import OnboardPage from '../../components/OnboardPage'
import { shareState, resetShare } from '../../share'

type SubPage = 'ledger' | 'stats' | 'search' | 'calendar' | 'report' | 'budget' | 'catBudget'

interface JoinParams {
  ledgerId: string
  code: string
}

function readJoinParams(): JoinParams | null {
  try {
    const opts = Taro.getEnterOptionsSync()
    const q = (opts.query || {}) as Record<string, string>
    const ledgerId = q.join
    const code = q.code
    if (ledgerId && code) return { ledgerId, code }
  } catch {}
  return null
}

export default function Index() {
  const {
    myLedgers, ledgersLoading, ledgersError, refreshMyLedgers,
    current, error,
    createLedger, joinLedger, openLedger, leaveLedger,
    addEntry, updateEntry, deleteEntry,
    renameLedger, removeMember, updateNickname, regenerateInviteCode, deleteLedger, updateCategories,
    updateBudget, updateCategoryBudgets, getReminderStatus, subscribeReminder, unsubscribeReminder,
    clearError, setError,
  } = useLedger()

  const [join, setJoin] = useState<JoinParams | null>(null)
  const [user, setUser] = useState<AuthUser | null>(() => auth.getCurrentUser())
  const [subPage, setSubPage] = useState<SubPage>('ledger')
  const joinHandledRef = useRef(false)

  useShareAppMessage(() => ({
    title: shareState.title || '一起记账',
    path: shareState.path || '/pages/index/index',
  }))
  const readJoin = () => {
    if (joinHandledRef.current) return
    const p = readJoinParams()
    if (p) setJoin(p)
  }
  useEffect(() => { readJoin() }, [])
  useDidShow(() => { readJoin() })

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u)
      if (!u) { leaveLedger(); setSubPage('ledger') }
    })
    return unsub
  }, [leaveLedger])

  useEffect(() => {
    if (user && join && !current) {
      const nickname = user.nickname || '我'
      joinLedger(join.ledgerId, join.code, nickname)
        .then(() => { joinHandledRef.current = true; setJoin(null) })
        .catch((e) => { setError(e instanceof Error ? e.message : '加入失败') })
    }
  }, [user, join, current, joinLedger, setError])

  useEffect(() => { if (!current) setSubPage('ledger') }, [current])

  const handleCreate = async (name: string, nickname: string) => { await createLedger(name, nickname) }
  const handleOpen = (ledgerId: string) => { openLedger(ledgerId).catch((e) => setError(e instanceof Error ? e.message : '打开失败')) }
  const handleJoin = async (ledgerId: string, code: string, nickname: string) => { await joinLedger(ledgerId, code, nickname) }

  const handleAuthSuccess = async () => {
    const u = auth.getCurrentUser()
    setUser(u)
    void refreshMyLedgers()
    if (u?.uid && join) {
      const nickname = u.nickname || '我'
      try { await joinLedger(join.ledgerId, join.code, nickname); joinHandledRef.current = true; setJoin(null) }
      catch (e) { setError(e instanceof Error ? e.message : '加入失败') }
    }
  }

  const handleRename = async (name: string) => { if (current) await renameLedger(name) }
  const handleRemoveMember = async (memberId: string) => { if (current) await removeMember(memberId) }
  const handleRegenerate = async () => { if (current) await regenerateInviteCode() }
  const handleUpdateNickname = async (nickname: string) => { if (current) await updateNickname(nickname) }
  const handleUpdateCats = async (cats: string[]) => { if (current) await updateCategories(cats) }
  const handleDeleteLedger = async () => { if (current) await deleteLedger() }

  if (!user) {
    return (
      <View className="app-frame">
        <OnboardPage onSuccess={handleAuthSuccess} joinHint={join ? '进入后将自动加入账本' : undefined} />
        {error ? (<View className="toast toast-err">{error} <Text onClick={clearError}>知道了</Text></View>) : null}
      </View>
    )
  }

  let page
  const isOwner = !!current && (current.ledger.ownerId === current.myMember.id || (!!current.myMember.uid && current.ledger.ownerId === current.myMember.uid))
  if (current && subPage === 'stats') {
    page = (
      <StatsPage
        entries={current.entries} members={current.members} categories={current.ledger.categories || undefined}
        onBack={() => setSubPage('ledger')}
        onOpenCalendar={() => setSubPage('calendar')}
        onOpenReport={() => setSubPage('report')}
      />
    )
  } else if (current && subPage === 'search') {
    page = <SearchPage entries={current.entries} members={current.members} categories={current.ledger.categories || undefined} onBack={() => setSubPage('ledger')} />
  } else if (current && subPage === 'calendar') {
    page = <CalendarPage entries={current.entries} members={current.members} onBack={() => setSubPage('stats')} />
  } else if (current && subPage === 'budget') {
    page = (
      <BudgetPage
        entries={current.entries} categories={current.ledger.categories || undefined}
        monthlyBudget={current.ledger.monthlyBudget}
        categoryBudgets={current.ledger.categoryBudgets}
        isOwner={isOwner}
        onSetBudget={updateBudget}
        onOpenCatBudget={() => setSubPage('catBudget')}
        onBack={() => setSubPage('ledger')}
      />
    )
  } else if (current && subPage === 'catBudget') {
    page = (
      <CategoryBudgetPage
        categories={current.ledger.categories || undefined}
        categoryBudgets={current.ledger.categoryBudgets}
        onBack={() => setSubPage('budget')}
        onSave={updateCategoryBudgets}
      />
    )
  } else if (current && subPage === 'report') {
    page = (
      <ReportPage
        entries={current.entries} members={current.members} categories={current.ledger.categories || undefined}
        monthlyBudget={current.ledger.monthlyBudget}
        onBack={() => setSubPage('stats')}
      />
    )
  } else if (current) {
    page = (
      <LedgerPage view={current} onAddEntry={addEntry} onUpdateEntry={updateEntry} onDeleteEntry={deleteEntry}
        onBack={leaveLedger}
        onOpenStats={() => setSubPage('stats')}
        onOpenSearch={() => setSubPage('search')}
        onOpenBudget={() => setSubPage('budget')}
        onRename={handleRename}
        onRemoveMember={handleRemoveMember} onUpdateNickname={handleUpdateNickname}
        onRegenerateInvite={handleRegenerate} onUpdateCategories={handleUpdateCats}
        onDeleteLedger={handleDeleteLedger}
        onGetReminderStatus={getReminderStatus}
        onSubscribeReminder={subscribeReminder}
        onUnsubscribeReminder={unsubscribeReminder} />
    )
  } else {
    page = (
      <HomePage myLedgers={myLedgers} loading={ledgersLoading} error={ledgersError}
        onRefresh={() => void refreshMyLedgers()} onCreate={handleCreate} onOpen={handleOpen} onJoin={handleJoin} />
    )
  }

  return (
    <View className="app-frame">
      {page}
      {error ? (<View className="toast toast-err">{error} <Text onClick={clearError}>知道了</Text></View>) : null}
    </View>
  )
}
