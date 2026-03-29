-- CreateTable
CREATE TABLE "Prompt" (
    "key" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "promptKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptVersion_promptKey_fkey" FOREIGN KEY ("promptKey") REFERENCES "Prompt" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Skill" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "nodeTypes" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "skillKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillVersion_skillKey_fkey" FOREIGN KEY ("skillKey") REFERENCES "Skill" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_promptKey_version_key" ON "PromptVersion"("promptKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillKey_version_key" ON "SkillVersion"("skillKey", "version");
