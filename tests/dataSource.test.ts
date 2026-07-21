import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiDataSource } from '../src/dataSource'

function createJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiDataSource', () => {
  it('maps frontend operations to the SQLite API routes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(createJsonResponse({ chats: [], memories: [] }))
      .mockResolvedValueOnce(createJsonResponse({ chat: null, state: { chats: [], memories: [] } }))

    vi.stubGlobal('fetch', fetchMock)
    const dataSource = createApiDataSource('http://localhost:8787')

    await dataSource.loadState()
    await dataSource.createChat('Disponivel no sqlite')

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:8787/api/state', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:8787/api/chats', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Disponivel no sqlite' }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }))
  })

  it('surfaces connection failures instead of masking them with local state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const dataSource = createApiDataSource('http://localhost:8787')

    await expect(dataSource.loadState()).rejects.toThrow('Failed to fetch')
  })
})
