import "reflect-metadata";
import {existsSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {Module} from "@code0-tech/tucana/shared";
import {Action, registeredActions} from "./action";

const USAGE = `Usage: hercules export <entry-file> [options]

Loads the given entry file (without connecting to aquila) and prints the
Action as a JSON document in the shape of the tucana protobuf Module type.

Options:
  -o, --out <file>   Write the JSON to a file instead of stdout
  --compact          Emit compact JSON instead of pretty-printed
  -h, --help         Show this help message

Examples:
  hercules export src/index.ts
  hercules export dist/index.js -o module.json
`;

interface ExportArgs {
    entry: string;
    out?: string;
    compact: boolean;
}

function fail(message: string): never {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

function parseExportArgs(argv: string[]): ExportArgs {
    let entry: string | undefined;
    let out: string | undefined;
    let compact = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            process.stdout.write(USAGE);
            process.exit(0);
        } else if (arg === "-o" || arg === "--out") {
            out = argv[++i];
            if (out == null) fail(`Missing value for ${arg}\n\n${USAGE}`);
        } else if (arg === "--compact") {
            compact = true;
        } else if (arg.startsWith("-")) {
            fail(`Unknown option: ${arg}\n\n${USAGE}`);
        } else if (entry == null) {
            entry = arg;
        } else {
            fail(`Unexpected argument: ${arg}\n\n${USAGE}`);
        }
    }
    if (entry == null) fail(`Missing <entry-file> argument\n\n${USAGE}`);
    return {entry, out, compact};
}

function isAction(value: unknown): value is Action {
    if (value instanceof Action) return true;
    // The entry file may have loaded a different copy of this module (e.g. the
    // CJS build), in which case instanceof fails — fall back to duck typing.
    const candidate = value as Action | null;
    return typeof candidate?.buildModule === "function"
        && typeof candidate.identifier === "string"
        && typeof candidate.registerFunction === "function";
}

function findAction(entryExports: Record<string, unknown>): Action {
    for (const value of [entryExports.default, ...Object.values(entryExports)]) {
        if (isAction(value)) return value;
    }
    const registered = registeredActions();
    if (registered.length > 0) return registered[registered.length - 1];
    throw new Error("No Action found. Export your Action instance from the entry file or construct it during module load.");
}

async function loadEntry(entry: string): Promise<Record<string, unknown>> {
    const entryPath = resolve(process.cwd(), entry);
    if (!existsSync(entryPath)) fail(`Entry file not found: ${entryPath}`);
    if (/\.[mc]?tsx?$/.test(entryPath)) {
        const tsxApi = "tsx/esm/api";
        let tsx;
        try {
            tsx = await import(/* @vite-ignore */ tsxApi);
        } catch {
            try {
                // Not resolvable from the hercules install; try the user's project.
                const requireFromCwd = createRequire(resolve(process.cwd(), "package.json"));
                tsx = await import(/* @vite-ignore */ pathToFileURL(requireFromCwd.resolve(tsxApi)).href);
            } catch {
                fail("Loading a TypeScript entry requires 'tsx'. Install it (npm i -D tsx) or point the command at your built JavaScript entry.");
            }
        }
        tsx.register();
    }
    return await import(/* @vite-ignore */ pathToFileURL(entryPath).href);
}

async function runExport(argv: string[]) {
    const args = parseExportArgs(argv);
    // Must be set before the entry file is loaded: it makes connect() a no-op
    // and registers constructed Action instances for findAction.
    process.env.HERCULES_EXPORT = "1";
    const action = findAction(await loadEntry(args.entry));
    const moduleJson = Module.toJson(action.buildModule());
    const json = `${JSON.stringify(moduleJson, null, args.compact ? undefined : 2)}\n`;
    if (args.out) {
        const outPath = resolve(process.cwd(), args.out);
        writeFileSync(outPath, json);
        process.stderr.write(`Module written to ${outPath}\n`);
    } else {
        process.stdout.write(json);
    }
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    if (command == null || command === "-h" || command === "--help") {
        process.stdout.write(USAGE);
        process.exit(command == null ? 1 : 0);
    }
    if (command !== "export") fail(`Unknown command: ${command}\n\n${USAGE}`);
    await runExport(rest);
    // The entry file may have started timers or other handles; exit explicitly.
    process.exit(0);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
