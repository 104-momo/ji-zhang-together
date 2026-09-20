import { useRef, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { IconMic, IconMicStop, IconSend } from './Icons'

interface Props {
  onSend: (text: string) => Promise<void>
  disabled?: boolean
}

export default function EntryInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const recMgrRef = useRef<any>(null)

  const ensureRecorder = () => {
    if (recMgrRef.current) return recMgrRef.current
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin.getRecordRecognitionManager()
      manager.onStart = () => setRecording(true)
      manager.onRecognize = (res: any) => {
        if (res.result) setText(res.result)
      }
      manager.onStop = (res: any) => {
        setRecording(false)
        if (res.result) {
          const t = res.result.trim()
          if (t) {
            setText(t)
            setSending(true)
            onSend(t).then(() => setText('')).catch(() => {}).finally(() => setSending(false))
          }
        }
      }
      manager.onError = () => {
        setRecording(false)
        Taro.showToast({ title: '语音识别失败', icon: 'none' })
      }
      recMgrRef.current = manager
      return manager
    } catch {
      Taro.showToast({ title: '请先添加同声传译插件', icon: 'none' })
      return null
    }
  }

  const toggleRecord = () => {
    const mgr = ensureRecorder()
    if (!mgr) return
    if (recording) {
      mgr.stop()
    } else {
      mgr.start({ duration: 10000, lang: 'zh_CN' })
    }
  }

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
    <View className="input-bar">
      <Button
        className={`mic-btn ${recording ? 'recording' : ''}`}
        onClick={toggleRecord}
        disabled={disabled || sending}
        aria-label={recording ? '停止录音' : '语音输入'}
      >
        {recording ? <IconMicStop size={20} /> : <IconMic size={20} />}
      </Button>
      <Input
        className="entry-input"
        value={text}
        onInput={(e) => setText(e.detail.value)}
        confirmType="send"
        onConfirm={() => void submit()}
        placeholder={recording ? '正在听...' : '说一句话记账，如：吃烤鱼200元'}
        disabled={disabled || sending || recording}
        adjustPosition
      />
      <Button
        className="send-btn"
        onClick={() => void submit()}
        disabled={disabled || sending || !text.trim()}
        aria-label="记一笔"
      >
        <IconSend size={20} />
      </Button>
    </View>
  )
}
