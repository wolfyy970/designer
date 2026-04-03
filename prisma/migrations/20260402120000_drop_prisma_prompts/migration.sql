-- Prompt bodies now live in Langfuse; remove legacy SQLite tables.
DROP TABLE IF EXISTS "PromptVersion";
DROP TABLE IF EXISTS "Prompt";
