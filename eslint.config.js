import globals from 'globals';
import jsEslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tsEslint.config(
  {
    // 数组的每一项，都可以指定适配文件 files，不指定默认适配全部
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
  {
    ignores: [
      'node_modules',
      'esm',
      'dist',
      'coverage',
      '**/backup/',
      '**/backups/',
      '**/*.config.{js,mjs,cjs,ts}',
    ],
  },
  jsEslint.configs.recommended,
  ...tsEslint.configs.all,
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': 'warn',
      '@typescript-eslint/no-explicit-any': 'off', // 作为library项目，允许使用 any
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/max-params': 'off',
    },
  },
);
