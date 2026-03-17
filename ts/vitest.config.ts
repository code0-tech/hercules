import {defineConfig} from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
    },
    resolve: {
        // Allow .js extension imports to resolve .ts source files (used by @code0-tech/tucana helpers)
        extensionAlias: {
            ".js": [".ts", ".js"],
        },
    },
});
