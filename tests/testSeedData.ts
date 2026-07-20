import type { Message } from '../src/appTypes'

type SeedChat = {
  id: number
  title: string
  created_at: string
  updated_at: string
  pinned: number
  messages: Message[]
}

type SeedMemory = {
  id: number
  text: string
  feedback_score: number
  usage_count: number
  created_at: string
  updated_at: string
}

export const TEST_SEED_DATA: { chats: SeedChat[]; memories: SeedMemory[] } = {
  chats: [
    {
      id: 1,
      title: 'Reescrever Prompt UI Memórias',
      created_at: '2026-06-01',
      updated_at: '2026-07-20',
      pinned: 0,
      messages: [
        { id: 'message-1', author: 'assistant', text: 'Como posso ajudar voce hoje?' },
        { id: 'message-2', author: 'user', text: 'Quero organizar minhas metas da semana.' },
        { id: 'message-3', author: 'assistant', text: 'Claro. Podemos transformar suas metas em pequenas acoes e definir uma prioridade para cada dia.' },
      ],
    },
    {
      id: 2,
      title: 'Bilhão e Valuation',
      created_at: '2026-06-07',
      updated_at: '2026-07-10',
      pinned: 0,
      messages: [
        { id: 'message-4', author: 'user', text: 'Como penso sobre valuation de uma empresa?' },
        { id: 'message-5', author: 'assistant', text: 'Comece separando crescimento, margem, risco e o fluxo de caixa que o negocio pode gerar.' },
      ],
    },
    {
      id: 3,
      title: 'Neymar e o Ranking de Gols',
      created_at: '2026-06-12',
      updated_at: '2026-07-16',
      pinned: 0,
      messages: [
        { id: 'message-6', author: 'user', text: 'Quero comparar os numeros de gols por temporada.' },
        { id: 'message-7', author: 'assistant', text: 'Podemos montar a comparacao por clube, selecao e competicao para evitar conclusoes enviesadas.' },
      ],
    },
  ],
  memories: [
    { id: 1, text: 'Prefere listas', feedback_score: 4, usage_count: 18, created_at: '2026-06-02', updated_at: '2026-07-12' },
    { id: 2, text: 'Metas checklist', feedback_score: 3, usage_count: 11, created_at: '2026-06-09', updated_at: '2026-07-10' },
    { id: 3, text: 'Gosta de exemplos', feedback_score: 5, usage_count: 24, created_at: '2026-05-21', updated_at: '2026-07-15' },
    { id: 4, text: 'Tom direto', feedback_score: 4, usage_count: 32, created_at: '2026-04-18', updated_at: '2026-07-18' },
    { id: 5, text: 'Comparar cenarios', feedback_score: 2, usage_count: 7, created_at: '2026-07-01', updated_at: '2026-07-16' },
    { id: 6, text: 'Listas claras', feedback_score: 1, usage_count: 9, created_at: '2026-07-03', updated_at: '2026-07-11' },
  ],
}
