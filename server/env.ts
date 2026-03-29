export const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? process.env.VITE_OPENROUTER_API_KEY ?? '',
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai',
  LMSTUDIO_URL: process.env.LMSTUDIO_URL ?? process.env.VITE_LMSTUDIO_URL ?? 'http://localhost:1234',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  get isDev() {
    return this.NODE_ENV !== 'production';
  },
  MAX_OUTPUT_TOKENS: Number(process.env.MAX_OUTPUT_TOKENS ?? 16384),
} as const;
