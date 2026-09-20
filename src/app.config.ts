export default defineAppConfig({
  pages: ['pages/index/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f4f1ea',
    navigationBarTitleText: '一起记账',
    navigationBarTextStyle: 'black',
  },
  plugins: {
    WechatSI: {
      version: '0.3.5',
      provider: 'wx069ba97219f66d99',
    },
  },
  permission: {
    'scope.record': {
      desc: '用于语音记账，说话即可记录消费',
    },
  },
})
