import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Lab 05: `vitest run --coverage` writes Cobertura for Jenkins' Coverage plugin and
    // LCOV for SonarQube. Only src/ is measured; the thresholds live in the SonarQube
    // quality gate, not here, so a coverage drop fails the gate stage, not the test stage.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: ['text-summary', 'cobertura', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
