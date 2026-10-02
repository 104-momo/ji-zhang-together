import { Component, PropsWithChildren } from 'react'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CLOUD_ENV } from './services/env'
import './app.css'

export default class App extends Component<PropsWithChildren> {
  componentDidMount() {
    if (CLOUD_ENV && Taro.cloud) {
      Taro.cloud.init({
        env: CLOUD_ENV,
        traceUser: true,
      })
    }
  }

  render() {
    return <View>{this.props.children}</View>
  }
}
