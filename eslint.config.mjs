// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // These four fire on every property access into an `any`-typed value
      // (prescription?.mzno, detail?.medhisid, ...) — this codebase leans on
      // `any` deliberately for loosely-typed HIS/machine payloads, so keeping
      // these at 'error' just floods the editor with red squiggles for
      // intentional, working code rather than real bugs. Downgraded to
      // 'warn' to match no-unsafe-argument above; tsc (the actual compiler)
      // is unaffected either way.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
