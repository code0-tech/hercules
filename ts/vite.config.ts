import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
    build: {
        target: 'node18',
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'triangulum',
            fileName: (format) => `hercules.${format}.js`,
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: [
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`),
                'typescript',
                '@code0-tech/tucana',
                '@grpc/grpc-js',
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

