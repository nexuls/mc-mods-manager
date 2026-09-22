import { describe, expect, test } from 'bun:test'
import { ApiClientError } from '@/lib/api'
import { serverStatus } from './use-health'

const base = { isError: false, isSuccess: false, error: null, failureCount: 0, failureReason: null }
const unauthorized = new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'Missing token' })

describe('serverStatus', () => {
  test.each([
    ['checking', base],
    ['connected', { ...base, isSuccess: true }],
    ['reconnecting', { ...base, isSuccess: true, failureCount: 1, failureReason: new TypeError() }],
    ['disconnected', { ...base, isError: true, error: new TypeError(), failureCount: 3 }],
    ['unauthorized', { ...base, isError: true, error: unauthorized, failureCount: 3 }],
    // Already while retrying: the server answered, so it isn't a connection problem.
    ['unauthorized', { ...base, failureCount: 1, failureReason: unauthorized }],
  ] as const)('%s', (status, health) => {
    expect(serverStatus(health)).toBe(status)
  })
})
