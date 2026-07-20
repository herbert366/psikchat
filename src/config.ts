export const APP_CONFIG = {
  tablePageSize: 4,
  clusterPageSize: 2,
  maxCaracteresMemory: 20,
  maxCaracteresMemoryToCreateMemory: 500,
  maxCaracteresMemoryContext: 500,
  maxMemoriesPerReply: 20,
  embeddingSimilarityThreshold: 0.18,
  seedChats: [
    {
      id: 1,
      title: 'Reescrever Prompt UI Memórias',
      created_at: '2026-06-01',
      updated_at: '2026-07-12',
      messages: [
        { id: 'message-1', author: 'assistant' as const, text: 'Como posso ajudar voce hoje?' },
        { id: 'message-2', author: 'user' as const, text: 'Quero organizar minhas metas da semana.' },
        { id: 'message-3', author: 'assistant' as const, text: 'Claro. Podemos transformar suas metas em pequenas acoes e definir uma prioridade para cada dia.' },
      ],
    },
    {
      id: 2,
      title: 'Bilhão e Valuation',
      created_at: '2026-06-07',
      updated_at: '2026-07-10',
      messages: [
        { id: 'message-4', author: 'user' as const, text: 'Como penso sobre valuation de uma empresa?' },
        { id: 'message-5', author: 'assistant' as const, text: 'Comece separando crescimento, margem, risco e o fluxo de caixa que o negocio pode gerar.' },
      ],
    },
    {
      id: 3,
      title: 'Neymar e o Ranking de Gols',
      created_at: '2026-06-12',
      updated_at: '2026-07-16',
      messages: [
        { id: 'message-6', author: 'user' as const, text: 'Quero comparar os numeros de gols por temporada.' },
        { id: 'message-7', author: 'assistant' as const, text: 'Podemos montar a comparacao por clube, selecao e competicao para evitar conclusoes enviesadas.' },
      ],
    },
  ],
  seedMemories: [
    { id: 1, text: 'Prefere listas objetivas', feedback_score: 4, usage_count: 18, created_at: '2026-06-02', updated_at: '2026-07-12' },
    { id: 2, text: 'Esta organizando metas semanais em formato de checklist', feedback_score: 3, usage_count: 11, created_at: '2026-06-09', updated_at: '2026-07-10' },
    { id: 3, text: 'Gosta de exemplos praticos antes de definicoes formais', feedback_score: 5, usage_count: 24, created_at: '2026-05-21', updated_at: '2026-07-15' },
    { id: 4, text: 'Tom direto, sem enrolacao', feedback_score: 4, usage_count: 32, created_at: '2026-04-18', updated_at: '2026-07-18' },
    { id: 5, text: 'Prefere comparar cenarios antes de decidir', feedback_score: 2, usage_count: 7, created_at: '2026-07-01', updated_at: '2026-07-16' },
  ],
} as const

export const clusterGroups = [
  { id: 1, items: [{ id: 1, text: 'Prefere listas objetivas' }, { id: 4, text: 'Tom direto, sem enrolacao' }, { id: 3, text: 'Exemplos praticos antes da teoria' }] },
  { id: 2, items: [{ id: 2, text: 'Organizando metas semanais' }, { id: 5, text: 'Comparar cenarios antes de decidir' }] },
] as const
