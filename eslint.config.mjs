import { fileURLToPath } from 'url';
import tseslint from 'typescript-eslint';
import path from 'path';
import globals from 'globals';
import perfectionistPlugin from 'eslint-plugin-perfectionist';
import importNewline from 'eslint-plugin-import-newlines';
import stylisticPlugin from '@stylistic/eslint-plugin';
import js from '@eslint/js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ignoreFiles = [];

export default tseslint.config(
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    extends: [
      js.configs.recommended,
      perfectionistPlugin.configs['recommended-natural'],
      stylisticPlugin.configs.customize({
        blockSpacing: true,
        braceStyle: '1tbs',
        commaDangle: 'always-multiline',
        flat: true,
        indent: 2,
        quotes: 'single',
        semi: true,
      }),
    ],
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    ignores: ignoreFiles,
    plugins: {
      'import-newlines': importNewline,
    },
    rules: {
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/indent-binary-ops': 'off',
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/object-curly-newline': ['error', { consistent: true, multiline: true }],
      '@stylistic/object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
      'import-newlines/enforce': [
        'error',
        {
          'items': 2,
          'max-len': 120,
          'semi': true,
        },
      ],
      'max-len': ['error', {
        code: 120,
        ignoreComments: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      }],
      'no-restricted-imports': [
        'error',
        {
          paths: [],
          patterns: [
            {
              group: ['src/**/*'],
              message: 'Используйте импорт из @/',
            },
          ],
        },
      ],
      'no-shadow': 'warn',
      'perfectionist/sort-array-includes': 'off',
      'perfectionist/sort-classes': 'off',
      'perfectionist/sort-imports': ['error', {
        groups: [
          'type',
          ['builtin', 'external'],
          'internal-type',
          'internal',
          ['parent-type', 'sibling-type', 'index-type'],
          ['parent', 'sibling', 'index'],
          'object',
          'unknown',
        ],
        internalPattern: [
          '@/**',
        ],
        newlinesBetween: 'always',
        order: 'desc',
        type: 'natural',
      }],
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-maps': 'off',
      'perfectionist/sort-object-types': 'off',
      'perfectionist/sort-objects': 'off',

      'perfectionist/sort-union-types': 'off',
    },
  },
  {
    files: ['**/*.{ts,mts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    rules: {
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
    },
  },
  {
    files: ['**/*.test.ts', 'vitest/setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
