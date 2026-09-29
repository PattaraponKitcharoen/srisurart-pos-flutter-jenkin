// Lab 06 — SAST with eslint-plugin-security over the server's TypeScript sources.
// Run from this directory: npx eslint -f @microsoft/eslint-formatter-sarif -o <out> ../../server/src
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default [
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { security },
    rules: security.configs.recommended.rules,
  },
];
