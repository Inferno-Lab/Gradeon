import { defineConfig } from 'vitest/config';

// These tests run migrations, seeds and backups on a real PostgreSQL; with every package testing at once the 5 s default is too short.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], hookTimeout: 240_000, testTimeout: 60_000 },
});
