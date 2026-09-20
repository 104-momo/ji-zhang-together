// Taro 构建时注入 .env 中 TARO_APP_ 前缀的环境变量；此处补充 TS 声明
declare const process: {
  env: {
    NODE_ENV?: string
    TARO_APP_CLOUDBASE_ENV?: string
    [key: string]: string | undefined
  }
}

// 微信同声传译插件
declare function requirePlugin(name: string): any
