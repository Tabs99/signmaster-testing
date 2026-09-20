import { createHash } from 'node:crypto'

export function hashActivationVerifyBucketValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function buildActivationVerifyIpBucketKey(clientIp: string): string {
  return `ip:${hashActivationVerifyBucketValue(clientIp.trim().toLowerCase())}`
}

export function buildActivationVerifyOrderBucketKey(normalizedOrderId: string): string {
  return `oid:${hashActivationVerifyBucketValue(normalizedOrderId)}`
}

export function buildActivationClaimIpBucketKey(clientIp: string): string {
  return `claim-ip:${hashActivationVerifyBucketValue(clientIp.trim().toLowerCase())}`
}

export function buildActivationClaimUserBucketKey(userId: string): string {
  return `claim-uid:${hashActivationVerifyBucketValue(userId.trim().toLowerCase())}`
}

export function buildActivationClaimContextBucketKey(contextToken: string): string {
  return `claim-ctx:${hashActivationVerifyBucketValue(contextToken)}`
}
