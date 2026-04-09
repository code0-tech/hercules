import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        target: "node18",
        ssr: resolve(__dirname, 'index.ts'), // ✅ correct SSR entry
        rollupOptions: {
            external: (id) =>
                [
                    'fs',
                    'path',
                    'typescript',
                    '@code0-tech/hercules'
                ].includes(id) || id.startsWith('node:')
        }
    }
});