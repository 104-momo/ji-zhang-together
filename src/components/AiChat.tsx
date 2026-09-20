import { useEffect, useRef, useState } from 'react'
import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { Entry, Member } from '../types'
import { IconX } from './Icons'

interface ChatMsg {
  role: 'user' | 'ai'
  text: string
}

interface Props {
  ledgerName: string
  entries: Entry[]
  members: Member[]
  onClose: () => void
}

function buildContext(ledgerName: string, entries: Entry[], members: Member[]): string {
  const active = entries.filter((e) => !e.deleted)
  const total = active.reduce((s, e) => s + e.amount, 0)
  const byCat: Record<string, number> = {}
  const byMember: Record<string, number> = {}
  for (const e of active) {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount
    byMember[e.nickname] = (byMember[e.nickname] || 0) + e.amount
  }
  const catStr = Object.entries(byCat).map(([k, v]) => `${k}¥${v.toFixed(0)}`).join('、')
  const memStr = Object.entries(byMember).map(([k, v]) => `${k}¥${v.toFixed(0)}`).join('、')
  const recent = active.slice(-10).reverse().map((e) => `${e.entryDate} ${e.nickname} ${e.category} ${e.note || e.rawText} ¥${e.amount}`).join('\n')
  return `账本：${ledgerName}\n总支出：¥${total.toFixed(2)}（${active.length}笔）\n分类：${catStr || '无'}\n成员支出：${memStr || '无'}\n最近记录：\n${recent || '无'}`
}

export default function AiChat({ ledgerName, entries, members, onClose }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'ai', text: `你好！我是「${ledgerName}」的 AI 财务助手。可以问我：\n• 这个月花了多少？\n• 哪类花得最多？\n• 帮我分析下最近的支出` },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<any>(null)

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd?.()
    }, 100)
  }, [msgs])

  const askAI = async (question: string) => {
    setLoading(true)
    try {
      const model = (wx as any).cloud.extend.AI.createModel('hunyuan-exp')
      const context = buildContext(ledgerName, entries, members)
      const res = await model.generateText({
        model: 'hunyuan-exp',
        messages: [
          {
            role: 'system',
            content: `你是一个友好的家庭记账助手。根据以下账本数据回答用户问题，简洁口语化，不要超过100字。\n\n${context}`,
          },
          { role: 'user', content: question },
        ],
      })
      const reply = res?.data?.choices?.[0]?.message?.content || '抱歉，我没理解这个问题'
      setMsgs((m) => [...m, { role: 'ai', text: reply }])
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'ai', text: 'AI 服务暂时不可用，请稍后再试' }])
    } finally {
      setLoading(false)
    }
  }

  const send = () => {
    const q = input.trim()
    if (!q || loading) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setInput('')
    void askAI(q)
  }

  const quickQs = ['这个月花了多少？', '哪类支出最多？', '帮我总结下']

  return (
    <View className="ai-chat-overlay">
      <View className="ai-chat-panel">
        <View className="ai-chat-header">
          <Text className="ai-chat-title">AI 财务助手</Text>
          <Button className="modal-close" onClick={onClose}><IconX size={15} /></Button>
        </View>
        <ScrollView className="ai-chat-msgs" scrollY ref={scrollRef}>
          {msgs.map((m, i) => (
            <View key={i} className={`ai-msg-row ${m.role === 'user' ? 'mine' : 'ai'}`}>
              <View className="ai-msg-bubble">{m.text}</View>
            </View>
          ))}
          {loading && (
            <View className="ai-msg-row ai">
              <View className="ai-msg-bubble typing">思考中...</View>
            </View>
          )}
        </ScrollView>
        <View className="ai-chat-quick">
          {quickQs.map((q) => (
            <Button key={q} className="ai-quick-btn" onClick={() => { setMsgs((m) => [...m, { role: 'user', text: q }]); void askAI(q) }}>{q}</Button>
          ))}
        </View>
        <View className="ai-chat-inputbar">
          <Input
            className="ai-chat-input"
            value={input}
            onInput={(e) => setInput(e.detail.value)}
            confirmType="send"
            onConfirm={send}
            placeholder="问问你的账本..."
            disabled={loading}
          />
          <Button className="send-btn" onClick={send} disabled={loading || !input.trim()}>↑</Button>
        </View>
      </View>
    </View>
  )
}
