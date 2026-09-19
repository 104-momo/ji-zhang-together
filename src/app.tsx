import type { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import './app.css'
import { CLOUD_ENV } from './services/env'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    if (CLOUD_ENV) {
      Taro.cloud.init({ env: CLOUD_ENV, traceUser: true })
    }
  })
  return children
}

export default App
