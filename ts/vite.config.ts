import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'triangulum',
            fileName: (format) => `hercules.${format}.js`,
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: [
                'typescript',
                '@code0-tech/tucana',
                'path',
                'fs'
            ],
            output: {
                globals: {
                    typescript: 'ts'
                }
            }
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

