import type { CSSProperties, ReactNode } from 'react'
import { Text } from '@tarojs/components'

interface IconProps {
  size?: number
  style?: CSSProperties
}

function Glyph({ size = 20, style, children }: IconProps & { children: ReactNode }) {
  return (
    <Text
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        fontSize: size * 0.8,
        lineHeight: 1,
        color: 'currentColor',
        ...style,
      }}
    >
      {children}
    </Text>
  )
}

export const IconArrowLeft = (p: IconProps) => <Glyph {...p}>←</Glyph>
export const IconPlus = (p: IconProps) => <Glyph {...p}>+</Glyph>
export const IconGear = (p: IconProps) => <Glyph {...p}>⚙</Glyph>
export const IconChart = (p: IconProps) => <Glyph {...p}>📊</Glyph>
export const IconSend = (p: IconProps) => <Glyph {...p}>↑</Glyph>
export const IconPencil = (p: IconProps) => <Glyph {...p}>✎</Glyph>
export const IconTrash = (p: IconProps) => <Glyph {...p}>🗑</Glyph>
export const IconX = (p: IconProps) => <Glyph {...p}>✕</Glyph>
export const IconUsers = (p: IconProps) => <Glyph {...p}>👥</Glyph>
export const IconWallet = (p: IconProps) => <Glyph {...p}>💰</Glyph>
export const IconChevronDown = (p: IconProps) => <Glyph {...p}>▾</Glyph>
export const IconSignOut = (p: IconProps) => <Glyph {...p}>↩</Glyph>
export const IconMic = (p: IconProps) => <Glyph {...p}>🎤</Glyph>
export const IconMicStop = (p: IconProps) => <Glyph {...p}>⏹</Glyph>
export const IconAI = (p: IconProps) => <Glyph {...p}>✨</Glyph>
