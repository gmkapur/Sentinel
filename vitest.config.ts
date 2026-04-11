import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        env: {
            LOG_LEVEL: 'silent',
        },
        include: ['packages/*/src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: [
                'packages/agent/src/**/*.ts',
                'packages/gateway/src/**/*.ts',
            ],
            exclude: [
                'packages/*/src/**/*.test.ts',
                'packages/*/src/index.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@sentinel/shared': path.resolve(
                __dirname,
                'packages/shared/src/index.ts',
            ),
        },
    },
});
