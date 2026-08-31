import { useState } from 'react'
import { IconSend } from './Icons'
interface Props {
  onSend: (text: string) => Promise<void>
  disabled?: boolean
}
export default function EntryInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const submit = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      await onSend(t)
      setText('')
    } catch {
      // 错误由父级展示
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="input-bar">
      <input
        className="entry-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
        placeholder="说一句话记账，如：吃烤鱼200元"
        disabled={disabled || sending}
      />
      <button className="send-btn" onClick={() => void submit()} disabled={disabled || sending || !text.trim()} aria-label="记一笔">
        <IconSend size={20} />
      </button>
    </div>
  )
}
