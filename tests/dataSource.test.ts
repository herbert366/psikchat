import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createResilientApiDataSource } from '../src/dataSource'
import { db } from '../src/mockDatabase'

describe('apiDataSource', () => {
  beforeEach(() => {
    db.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the application usable with local data when the API is offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    const dataSource = createResilientApiDataSource()

    expect(dataSource.getInitialSnapshot().chats).not.toHaveLength(0)
    await expect(dataSource.loadState()).resolves.toEqual({ chats: db.chats(), memories: db.memories() })

    const result = await dataSource.createChat('Disponivel sem API')
    expect(result.chat?.title).toBe('Disponivel sem API')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
