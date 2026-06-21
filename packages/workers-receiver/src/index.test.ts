import { describe, expect, test } from 'bun:test'

import worker from './index'

const secret = 'test-secret'

type StoredObject = {
  body: Uint8Array
  httpMetadata: Record<string, unknown>
  customMetadata: Record<string, string>
}

function makeEnv(initial: Record<string, string>) {
  const store = new Map<string, StoredObject>(
    Object.entries(initial).map(([key, value]) => [
      key,
      {
        body: new TextEncoder().encode(value),
        httpMetadata: { contentType: 'message/rfc822' },
        customMetadata: {},
      },
    ]),
  )

  return {
    env: {
      HERALD_API_URL: 'https://api.test',
      HERALD_INTERNAL_SECRET: secret,
      R2: {
        async list({ prefix }: { prefix: string }) {
          return {
            objects: [...store.entries()]
              .filter(([key]) => key.startsWith(prefix))
              .map(([key, object]) => ({
                key,
                size: object.body.byteLength,
                uploaded: new Date('2026-06-21T00:00:00Z'),
                customMetadata: object.customMetadata,
              })),
          }
        },
        async get(key: string) {
          return store.get(key) ?? null
        },
        async put(key: string, body: Uint8Array, options?: { httpMetadata?: Record<string, unknown>; customMetadata?: Record<string, string> }) {
          store.set(key, {
            body,
            httpMetadata: options?.httpMetadata ?? {},
            customMetadata: options?.customMetadata ?? {},
          })
        },
        async delete(key: string) {
          store.delete(key)
        },
      },
    },
    store,
  }
}

function request(url: string, init?: RequestInit) {
  return new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...init?.headers,
    },
  })
}

describe('unprocessed R2 recovery endpoints', () => {
  test('fetches an object by query key with message-id characters', async () => {
    const key = 'inbound/1781957572049-<CALxcYY914rfKe3Ti+OBHwNhe3PHXZf8_0NxrgjmYznRq73pN+w@mail.gmail.com>.eml'
    const { env } = makeEnv({ [key]: 'raw mime' })

    const res = await worker.fetch(
      request(`https://worker.test/internal/unprocessed?key=${encodeURIComponent(key)}`),
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('raw mime')
  })

  test('keeps compatibility with older path-key requests', async () => {
    const key = 'inbound/1781966051108-30fc37b3-35c6-4065-86b2-7041ffe9fe13.eml'
    const { env } = makeEnv({ [key]: 'uuid raw mime' })

    const res = await worker.fetch(request(`https://worker.test/internal/unprocessed/${key}`), env)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('uuid raw mime')
  })

  test('moves fetched mail to processed by query key', async () => {
    const key = 'inbound/1781959047886-<CALxcYY85bFyTWZo76hY4NusiU-PxaPda7vcUW6ax=Yg9xWp-UQ@mail.gmail.com>.eml'
    const { env, store } = makeEnv({ [key]: 'raw mime' })

    const res = await worker.fetch(
      request(`https://worker.test/internal/unprocessed?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
      env,
    )

    expect(res.status).toBe(200)
    expect(store.has(key)).toBe(false)
    expect(store.has(`processed/${key.slice('inbound/'.length)}`)).toBe(true)
  })
})
