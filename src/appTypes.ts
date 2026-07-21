export type Message = {
  id: string
  author: 'assistant' | 'user' | 'system'
  text: string
  memoryIds?: number[]
  memoryMatches?: MemoryMatch[]
  rating?: -1 | 0 | 1
  memoryEvent?: MemoryEvent
  memoryEvents?: MemoryEvent[]
}

export type MemoryMatch = {
  memoryId: number
  similarityPercent: number
}

export type MemoryEvent = {
  action: 'create'
  status: 'created' | 'rejected'
  reason: 'created' | 'empty' | 'too_long' | 'already_exists' | 'too_similar'
  sourceText: string
  storedText?: string
  conflictingMemoryText?: string
  similarityPercent?: number
  embeddingSimilarityPercent?: number
  lexicalSimilarityPercent?: number
  truthSimilaritySource?: 'embedding' | 'lexical'
  similarityThresholdPercent?: number
  maxCharacters?: number
  characterCount?: number
  detail: string
}

export type Memory = {
  id: number
  text: string
  created_at: string
  updated_at: string
  feedback_score: number
  usage_count: number
  embedding: number[]
}

export type Chat = {
  id: number
  title: string
  created_at: string
  updated_at: string
  history_chat_json: string
  messages: Message[]
  pinned: boolean
}

