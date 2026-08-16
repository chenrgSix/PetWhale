import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/lib/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/node_modules/**',
      '**/.tools/**',
      '**/coverage/**',
      '**/.changeset/**',
      '**/vendor/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
