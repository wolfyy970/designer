import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '**/_archived/**', '.vendor/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Ratchet: avoid churn refactors to React 19 patterns; revisit incrementally.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'src/api/**/*.{ts,tsx}',
      'src/lib/**/*.{ts,tsx}',
      'server/services/**/*.ts',
      'packages/auto-designer-pi/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'error',
    },
  },
  {
    /**
     * Boundary rule from `ARCHITECTURE.md:257`: "server/lib/ must not import
     * upward into server/services/".
     *
     * It was documented and unenforced, so five violations accumulated unnoticed.
     * A rule needs a mechanism, not a paragraph.
     *
     * `allowTypeImports` is on because a type-only import is erased at runtime and
     * does not create the dependency this rule exists to prevent — leaving it off
     * would flag `agentic-sse-map.ts`'s `import type`, which moves no code.
     */
    files: ['server/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../services/*', '../../services/*', '**/server/services/*'],
              allowTypeImports: true,
              message:
                'server/lib must not import upward into server/services (ARCHITECTURE.md:257). ' +
                'Either move the shared piece down into server/lib, or the dependent piece up into server/services.',
            },
          ],
        },
      ],
    },
  },
])
