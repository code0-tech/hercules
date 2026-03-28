import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
    build: {
        target: "node18",
        ssr: true,
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'hercules',
            fileName: 'hercules',
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: (id) =>
                ['fs', 'path', 'typescript'].includes(id) || id.startsWith('node:')
        }
    },
    plugins: [
        dts({
            insertTypesEntry: true,
            include: ['src/**/*.ts'],
            afterDiagnostic: diagnostics => {
                if (diagnostics.length > 0) {
                    throw new Error("dts failed");
                }
            }
        })
    ]
});