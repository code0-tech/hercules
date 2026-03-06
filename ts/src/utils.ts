import ts from "typescript";


/**
 * Minimal TypeScript library definitions for the virtual compiler environment.
 */
export const MINIMAL_LIB = `
    interface Array<T> { 
        [n: number]: T; 
        length: number; 
    }
    interface String { readonly length: number; }
    interface Number { }
    interface Boolean { }
    interface Object { }
    interface Function { }
    interface CallableFunction extends Function {}
    interface NewableFunction extends Function {}
    interface IArguments { }
    interface RegExp { }
`;

/**
 * Common configuration for the TypeScript compiler host across different validation/inference tasks.
 */
export function createCompilerHost(
    fileName: string,
    sourceCode: string,
    sourceFile: ts.SourceFile
): ts.CompilerHost {
    return {
        getSourceFile: (name) => {
            if (name === fileName) return sourceFile;
            if (name.includes("lib.") || name.endsWith(".d.ts")) return ts.createSourceFile(name, MINIMAL_LIB, ts.ScriptTarget.Latest);
            return undefined;
        },
        writeFile: () => {
        },
        getDefaultLibFileName: () => "lib.d.ts",
        useCaseSensitiveFileNames: () => true,
        getCanonicalFileName: (f) => f,
        getCurrentDirectory: () => "/",
        getNewLine: () => "\n",
        fileExists: (f) => f === fileName || f.includes("lib.") || f.endsWith(".d.ts"),
        readFile: (f) => (f === fileName ? sourceCode : (f.includes("lib.") || f.endsWith(".d.ts") ? MINIMAL_LIB : undefined)),
        directoryExists: () => true,
        getDirectories: () => [],
    };
}

/**
 * Common TypeScript compiler options used for validation and type inference.
 */
export const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    lib: ["lib.esnext.d.ts"],
    noEmit: true,
    strictNullChecks: true,
};