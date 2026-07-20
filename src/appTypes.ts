export type Message = {
  id: string
  author: 'assistant' | 'user'
  text: string
  memoryIds?: number[]
  rating?: -1 | 0 | 1
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
