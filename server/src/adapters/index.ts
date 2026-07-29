import type { StorageAdapter, BucketType } from './types.js'
import { S3Adapter } from './s3.js'
import { QiniuAdapter } from './qiniu.js'
import { UpyunAdapter } from './upyun.js'

/**
 * 阿里云 OSS 与腾讯云 COS 均提供 S3 兼容接口，因此复用 S3Adapter。
 * 若未显式填写 endpoint，则按 region 推导官方 S3 兼容接入域名：
 *   阿里云 OSS  → https://oss-{region}.aliyuncs.com
 *   腾讯云 COS  → https://cos.{region}.myqcloud.com
 */
function withS3Endpoint(type: BucketType, config: any): any {
  if ((type === 'aliyun-oss' || type === 'tencent-cos') && !config.endpoint) {
    const region = config.region || ''
    const endpoint =
      type === 'aliyun-oss'
        ? `https://oss-${region}.aliyuncs.com`
        : `https://cos.${region}.myqcloud.com`
    return { ...config, endpoint, forcePathStyle: config.forcePathStyle ?? false }
  }
  return config
}

export function createAdapter(type: BucketType, config: any): StorageAdapter {
  switch (type) {
    case 'r2':
    case 's3':
      return new S3Adapter(config)
    case 'aliyun-oss':
    case 'tencent-cos':
      return new S3Adapter(withS3Endpoint(type, config))
    case 'qiniu':
      return new QiniuAdapter(config)
    case 'upyun':
      return new UpyunAdapter(config)
    default:
      throw new Error(`不支持的存储类型: ${type}`)
  }
}

export * from './types.js'
