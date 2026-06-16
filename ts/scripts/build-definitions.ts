import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {execSync} from "node:child_process";
import {generate} from "ts-to-zod";
import {Project} from "ts-morph";

const args = process.argv.slice(2);
const versionIndex = args.indexOf("--version");
if (versionIndex === -1 || !args[versionIndex + 1]) {
    console.error("Usage: npm run build:definitions -- --version <version>");
    process.exit(1);
}
const version = args[versionIndex + 1];

const REPO = "code0-tech/code0-definition";
const OUTPUT_DIR = path.resolve("src/definitions");

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPascalCase(str: string): string {
    return str
        .replace(/::/g, "_")
        .split(/[_-]/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join("");
}

function fileNameToClassName(file: string): string {
    return toPascalCase(path.basename(file, ".proto.json"));
}

function toSchemaName(identifier: string): string {
    // HTTP_METHOD → httpMethodSchema
    return identifier.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + "Schema";
}

function srcRelativePath(relModule: string, ...segments: string[]): string {
    const depth = relModule.split(path.sep).filter(Boolean).length + 1;
    return "../".repeat(depth) + segments.join("/");
}

type Translation = { code: string; content: string };

function renderTranslations(decorator: string, arr: Translation[]): string[] {
    if (!arr?.length) return [];
    return [
        `@${decorator}(`,
        ...arr.map(t => `    {code: "${t.code}", content: ${JSON.stringify(t.content)}},`),
        `)`,
    ];
}

function renderTranslationsInline(arr: Translation[]): string {
    return arr.map(t => `{code: "${t.code}", content: ${JSON.stringify(t.content)}}`).join(", ");
}

// ── Data type definitions ─────────────────────────────────────────────────────

interface DataTypeDef {
    identifier: string;
    type: string;
    genericKeys: string[];
    relModule: string;
    className: string;
    fileName: string;
}

function buildCombinedSource(defs: DataTypeDef[]): string {
    return defs.map(({identifier, type, genericKeys}) => {
        let resolved = type;
        if (/\[.*in keyof/.test(resolved)) {
            // Identity mapped type (e.g. { [K in keyof T]: T[K] }) → Record<string, unknown>
            resolved = "Record<string, unknown>";
        } else {
            for (const key of genericKeys) {
                resolved = resolved.replace(new RegExp(`\\b${key}\\b`, "g"), "unknown");
            }
        }
        return `export type ${identifier} = ${resolved};`;
    }).join("\n");
}

function relativeImport(fromRelModule: string, toDef: DataTypeDef, toFile: string): string {
    const from = fromRelModule.split(path.sep).filter(Boolean);
    const to = toDef.relModule.split(path.sep).filter(Boolean);
    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common])
        common++;
    const up = "../".repeat(from.length - common);
    const down = [...to.slice(common), toFile].join("/");
    return up ? up + down : "./" + down;
}

// ── Meta-decorator helpers ────────────────────────────────────────────────────

function collectMetaDecorators(json: Record<string, unknown>): string[] {
    return [
        "Identifier",
        ...(json.signature ? ["Signature"] : []),
        ...(Array.isArray(json.name) && json.name.length ? ["Name"] : []),
        ...(Array.isArray(json.description) && json.description.length ? ["Description"] : []),
        ...(Array.isArray(json.documentation) && json.documentation.length ? ["Documentation"] : []),
        ...(Array.isArray(json.displayMessage) && json.displayMessage.length ? ["DisplayMessage"] : []),
        ...(Array.isArray(json.alias) && json.alias.length ? ["Alias"] : []),
        ...(json.displayIcon ? ["DisplayIcon"] : []),
    ];
}

function buildMetaDecorators(json: Record<string, unknown>, identifierKey: string): string[] {
    return [
        `@Identifier(${JSON.stringify(json[identifierKey])})`,
        ...(json.signature
            ? [`@Signature(${JSON.stringify(json.signature)})`]
            : []),
        ...(Array.isArray(json.name) && json.name.length
            ? renderTranslations("Name", json.name as Translation[])
            : []),
        ...(Array.isArray(json.description) && json.description.length
            ? renderTranslations("Description", json.description as Translation[])
            : []),
        ...(Array.isArray(json.documentation) && json.documentation.length
            ? renderTranslations("Documentation", json.documentation as Translation[])
            : []),
        ...(Array.isArray(json.displayMessage) && json.displayMessage.length
            ? renderTranslations("DisplayMessage", json.displayMessage as Translation[])
            : []),
        ...(Array.isArray(json.alias) && json.alias.length
            ? renderTranslations("Alias", json.alias as Translation[])
            : []),
        ...(json.displayIcon
            ? [`@DisplayIcon(${JSON.stringify(json.displayIcon)})`]
            : []),
    ];
}

// ── Generators ────────────────────────────────────────────────────────────────

function buildSettingDecorators(settings: any[]): string[] {
    return settings.flatMap(s => {
        const props = [
            `identifier: ${JSON.stringify(s.identifier)},`,
            ...(s.unique && s.unique !== "NONE" ? [`unique: ${JSON.stringify(s.unique)} as any,`] : []),
            ...(Array.isArray(s.name) && s.name.length ? [`name: [${renderTranslationsInline(s.name)}],`] : []),
            ...(Array.isArray(s.description) && s.description.length ? [`description: [${renderTranslationsInline(s.description)}],`] : []),
            ...(s.optional ? [`optional: true,`] : []),
            ...(s.hidden ? [`hidden: true,`] : []),
        ];
        return [`@RuntimeEventSetting({`, ...props.map(p => `    ${p}`), `})`];
    });
}

function buildParameterDecorators(params: any[]): string[] {
    return params.flatMap(p => {
        const props = [
            `runtimeName: ${JSON.stringify(p.runtimeName)},`,
            ...(Array.isArray(p.name) && p.name.length ? [`name: [${renderTranslationsInline(p.name)}],`] : []),
            ...(Array.isArray(p.description) && p.description.length ? [`description: [${renderTranslationsInline(p.description)}],`] : []),
            ...(p.optional ? [`optional: true,`] : []),
            ...(p.hidden ? [`hidden: true,`] : []),
        ];
        return [`@RuntimeParameter({`, ...props.map(p => `    ${p}`), `})`];
    });
}

function generateRuntimeFlowType(json: Record<string, unknown>, className: string, relModule: string): string {
    const src = (seg: string) => srcRelativePath(relModule, seg);
    const linkedIds = json.linkedDataTypeIdentifiers as string[] | undefined;
    const settings = json.runtimeSettings as any[] | undefined;
    const metaDecorators = collectMetaDecorators(json);

    const imports = [
        `import {RuntimeEventRunnable} from "${src("models/runtime_event.model")}";`,
        `import {${metaDecorators.join(", ")}} from "${src("decorators/meta")}";`,
        ...(linkedIds?.length ? [`import {LinkedDataTypeIdentifiers} from "${src("decorators/function")}";`] : []),
        ...(settings?.length ? [`import {RuntimeEventSetting} from "${src("decorators/runtime-event")}";`] : []),
    ];

    const decorators = [
        ...buildMetaDecorators(json, "identifier"),
        ...(linkedIds?.length ? [`@LinkedDataTypeIdentifiers(${linkedIds.map(s => JSON.stringify(s)).join(", ")})`] : []),
        ...buildSettingDecorators(settings ?? []),
    ];

    return [
        ...imports,
        "",
        ...decorators,
        `export class ${className} implements RuntimeEventRunnable {}`,
        "",
    ].join("\n");
}

function generateRuntimeFunction(json: Record<string, unknown>, className: string, relModule: string): string {
    const src = (seg: string) => srcRelativePath(relModule, seg);
    const linkedIds = json.linkedDataTypeIdentifiers as string[] | undefined;
    const params = json.runtimeParameterDefinitions as any[] | undefined;
    const metaDecorators = collectMetaDecorators(json);
    const funcDecorators = [
        "OmitFunctionDefinition",
        ...(json.throwsError ? ["ThrowsError"] : []),
        ...(params?.length ? ["RuntimeParameter"] : []),
        ...(linkedIds?.length ? ["LinkedDataTypeIdentifiers"] : []),
    ];

    const imports = [
        `import {RuntimeFunctionRunnable} from "${src("models/runtime_function.model")}";`,
        `import {${metaDecorators.join(", ")}} from "${src("decorators/meta")}";`,
        `import {${funcDecorators.join(", ")}} from "${src("decorators/function")}";`,
        `import type {PlainValue} from "@code0-tech/tucana/helpers";`,
    ];

    const decorators = [
        `@OmitFunctionDefinition()`,
        ...buildMetaDecorators(json, "runtimeName"),
        ...(json.throwsError ? [`@ThrowsError()`] : []),
        ...(linkedIds?.length ? [`@LinkedDataTypeIdentifiers(${linkedIds.map(s => JSON.stringify(s)).join(", ")})`] : []),
        ...buildParameterDecorators(params ?? []),
    ];

    return [
        ...imports,
        "",
        ...decorators,
        `export class ${className} implements RuntimeFunctionRunnable {`,
        `    run(..._args: (PlainValue | undefined)[]): Promise<PlainValue> | PlainValue {`,
        `        throw new Error(\`${className}.run() is not implemented\`);`,
        `    }`,
        `}`,
        "",
    ].join("\n");
}

// ── Directory walker ──────────────────────────────────────────────────────────

type DefHandler = (
    json: Record<string, unknown>,
    className: string,
    fileName: string,
    relModule: string,
    typeFolder: string,
) => void;

function walkDefs(dir: string, relModule: string, handler: DefHandler): void {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkDefs(fullPath, path.join(relModule, entry.name), handler);
            continue;
        }
        if (!entry.name.endsWith(".proto.json")) continue;
        const json = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as Record<string, unknown>;
        const typeFolder = relModule.split(path.sep).at(-1) ?? "";
        const className = fileNameToClassName(entry.name);
        const fileName = path.basename(entry.name, ".proto.json");
        handler(json, className, fileName, relModule, typeFolder);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const url = `https://github.com/${REPO}/releases/download/${version}/definitions.zip`;
    console.log(`Downloading ${url}...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hercules-definitions-"));
    const zipPath = path.join(tmpDir, "definitions.zip");
    const extractDir = path.join(tmpDir, "extracted");

    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
    fs.mkdirSync(extractDir, {recursive: true});
    execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

    const defsDir = path.join(extractDir, "definitions");

    // ── Collect all data type definitions ─────────────────────────────────────
    const dataTypeDefs: DataTypeDef[] = [];
    walkDefs(defsDir, "", (json, className, fileName, relModule, typeFolder) => {
        if (typeFolder !== "data_types" || !json.identifier || !json.type) return;
        dataTypeDefs.push({
            identifier: json.identifier as string,
            type: json.type as string,
            genericKeys: (json.genericKeys as string[]) ?? [],
            relModule,
            className,
            fileName,
        });
    });

    // ── Generate all schemas via ts-to-zod ────────────────────────────────────
    const combinedSource = buildCombinedSource(dataTypeDefs);
    const {getZodSchemasFile, errors} = generate({sourceText: combinedSource});
    if (errors.length) console.warn("ts-to-zod warnings:", errors);
    const schemasSource = getZodSchemasFile("schemas");

    // ── Parse ts-to-zod output with ts-morph ──────────────────────────────────
    const morphProject = new Project({useInMemoryFileSystem: true});
    const sf = morphProject.createSourceFile("schemas", schemasSource);

    const schemaBodyMap = new Map<string, string>();
    for (const stmt of sf.getVariableStatements()) {
        for (const decl of stmt.getDeclarations()) {
            const init = decl.getInitializer()?.getText();
            if (init) schemaBodyMap.set(decl.getName(), init);
        }
    }

    const schemaToFile = new Map<string, DataTypeDef>();
    for (const def of dataTypeDefs) {
        schemaToFile.set(toSchemaName(def.identifier), def);
    }

    // ── Write output ──────────────────────────────────────────────────────────
    fs.rmSync(OUTPUT_DIR, {recursive: true, force: true});
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});

    let count = 0;
    const allSchemaNames = new Set(schemaBodyMap.keys());
    const generatedFiles: string[] = [];

    for (const def of dataTypeDefs) {
        const schemaName = toSchemaName(def.identifier);
        const body = schemaBodyMap.get(schemaName);
        if (!body) continue;

        const refs = [
            ...new Set(
                [...body.matchAll(/\b(\w+Schema)\b/g)]
                    .map(m => m[1])
                    .filter(n => n !== schemaName && allSchemaNames.has(n))
            ),
        ];
        const typeParams = def.genericKeys.length > 0
            ? `<${def.genericKeys.map(k => `${k} = unknown`).join(", ")}>`
            : "";

        const lines = [
            `import {z} from "zod";`,
            ...refs.flatMap(ref => {
                const refDef = schemaToFile.get(ref);
                return refDef ? [`import {${ref}} from "${relativeImport(def.relModule, refDef, refDef.fileName)}";`] : [];
            }),
            ``,
            `export const ${schemaName} = ${body};`,
            `export type ${def.className}${typeParams} = z.infer<typeof ${schemaName}>;`,
            ``,
        ];

        const outDir = path.join(OUTPUT_DIR, def.relModule);
        fs.mkdirSync(outDir, {recursive: true});
        fs.writeFileSync(path.join(outDir, `${def.fileName}.ts`), lines.join("\n"));
        generatedFiles.push([def.relModule, def.fileName].filter(Boolean).join("/"));
        count++;
    }

    walkDefs(defsDir, "", (json, className, fileName, relModule, typeFolder) => {
        let content: string | null = null;
        if (typeFolder === "runtime_flow_types") content = generateRuntimeFlowType(json, className, relModule);
        else if (typeFolder === "runtime_functions") content = generateRuntimeFunction(json, className, relModule);
        if (content === null) return;

        const outDir = path.join(OUTPUT_DIR, relModule);
        fs.mkdirSync(outDir, {recursive: true});
        fs.writeFileSync(path.join(outDir, `${fileName}.ts`), content);
        generatedFiles.push([relModule, fileName].filter(Boolean).join("/"));
        count++;
    });

    const indexContent = generatedFiles
        .sort()
        .map(f => `export * from "./${f}";`)
        .join("\n") + "\n";
    fs.writeFileSync(path.join(OUTPUT_DIR, "index.ts"), indexContent);

    fs.rmSync(tmpDir, {recursive: true, force: true});
    console.log(`Generated ${count} definition files in src/definitions/`);
}

main().catch(err => { console.error(err); process.exit(1); });
