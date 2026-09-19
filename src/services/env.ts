export const CLOUD_ENV: string = (process.env.TARO_APP_CLOUDBASE_ENV as string | undefined) || ''
export const isCloudMode = !!CLOUD_ENV
