export const APP_CONFIG = {
  tablePageSize: 4,
  clusterPageSize: 10,
  maxCaracteresMemory: 80,
  maxCaracteresMemoryToCreateMemory: 500,
  maxCaracteresMemoryContext: 500,
  maxMemoriesPerReply: 20,
  embeddingSimilarityThreshold: 0.3,
  similarityThresholdToCreate: 0.86,
  memoryClusterSimilarityThreshold: 0.55,
  memoryClusterLexicalFloor: 0.3,
  memoryClusterEmbeddingThreshold: 0.55,
  memoryClusterSimilarityWeights: {
    lexical: 0.65,
    embedding: 0.35,
  },
} as const
