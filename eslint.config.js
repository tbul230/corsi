import js from '@eslint/js';
import unocss from '@unocss/eslint-config/flat';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      unocss,
      prettier
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      camelcase: 'off',
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
      quotes: ['error', 'single'],
      'no-duplicate-imports': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
]);
