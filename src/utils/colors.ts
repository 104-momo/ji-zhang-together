import type { Category } from '../types'

/** 分类色：降饱和暖调，映射到 CSS 变量（在 index.css :root 定义） */
export const CATEGORY_COLOR_VAR: Record<Category, string> = {
  餐饮: 'var(--c-food)',
  交通: 'var(--c-transit)',
  购物: 'var(--c-shop)',
  日用: 'var(--c-daily)',
  娱乐: 'var(--c-fun)',
  居住: 'var(--c-live)',
  医疗: 'var(--c-med)',
  人情: 'var(--c-social)',
  其他: 'var(--c-other)',
}

/** 需要十六进制的场景（如内联 style 无法用 CSS 变量渐变时）用这组实际值 */
export const CATEGORY_HEX: Record<string, string> = {
  餐饮: '#e0893c',
  交通: '#4a90c2',
  购物: '#d2688c',
  日用: '#3f9e97',
  娱乐: '#9b7bd4',
  居住: '#5fa87a',
  医疗: '#d4645c',
  人情: '#dd8a4a',
  其他: '#9a9388',
}

/** 由昵称生成稳定的头像底色（色相落在青绿-暖陶区间，低饱和） */
const AVATAR_COLORS = ['#1f8a70', '#4a90c2', '#9b7bd4', '#d2688c', '#c08431', '#5fa87a', '#4a8fb0', '#b06a54']
export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
