export type Message = {
  id: string
  author: 'assistant' | 'user' | 'system'
  text: string
  memoryIds?: number[]
  memoryMatches?: MemoryMatch[]
  rating?: -1 | 0 | 1
  memoryEvent?: MemoryEvent
  memoryEvents?: MemoryEvent[]
  memoryFeedbacks?: MemoryFeedback[]
  memoryPrompt?: string
}

export type MemoryMatch = {
  memoryId: number
  similarityPercent: number
}

export type MemoryStatus = {
  status: 'positive' | 'negative'
  at: string
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

export type MemoryFeedback = {
  memoryId: number
  memoryText: string
  score: -1 | 0 | 1
  status: 'positive' | 'negative' | 'neutral'
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
  statusHistory: MemoryStatus[]
}

export type MemoryEmbeddingSimilarity = Pick<Memory, 'id' | 'text' | 'created_at' | 'updated_at' | 'feedback_score' | 'usage_count'> & {
  embeddingSimilarityPercent: number
}

export type MemoryEmbeddingSimilarityPage = {
  items: MemoryEmbeddingSimilarity[]
  page: number
  pageSize: number
  total: number
  totalPages: number
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

