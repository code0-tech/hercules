/**
 * Schema conversion helper for the hercules Python SDK.
 *
 * Reads a single JSON request from stdin and writes a JSON response to stdout.
 * Two modes are supported:
 *
 *   {"mode": "json_schema_to_ts", "schema": <json-schema>, "name": "<Name>"}
 *       -> {"type": "<inline TypeScript type expression>"}
 *
 *   {"mode": "ts_to_json_schema", "ts": "<type expr>", "name": "<Name>",
 *    "preamble": "<extra TS declarations>"}
 *       -> {"schema": <json-schema>}
 *
 * The Python side (hercules.internal.schema / hercules.internal.pydantic_codegen)
 * is responsible for pre-processing JSON schemas (resolving refs, injecting
 * `tsType` identifier references, stripping titles) before calling this helper.
 */
import {compile} from "json-schema-to-typescript";
import {createGenerator} from "ts-json-schema-generator";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function readStdin() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => (data += chunk));
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
    });
}

/** Collapse json-schema-to-typescript output into a single inline type expression. */
function inlineType(tsText, name) {
    const blocks = tsText.split(/\n(?=export )/).map(b => b.trim()).filter(Boolean);
    const collapse = s => s.replace(/\s+/g, " ").trim();
    let target = blocks[0];
    if (blocks.length > 1) {
        const byName = blocks.find(b =>
            new RegExp(`^export (?:interface|type)\\s+${name}\\b`).test(b));
        if (byName) target = byName;
    }
    const iface = target.match(/^export interface \S+\s*({[\s\S]*})\s*$/);
    if (iface) return collapse(iface[1]);
    const alias = target.match(/^export type \S+\s*=\s*([\s\S]*?);?\s*$/);
    if (alias) return collapse(alias[1]);
    return collapse(target);
}

async function jsonSchemaToTs(req) {
    const ts = await compile(req.schema, req.name, {
        bannerComment: "",
        format: true,
        additionalProperties: false,
        unknownAny: true,
    });
    return {type: inlineType(ts, req.name)};
}

function tsToJsonSchema(req) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hercules-tsgen-"));
    const file = path.join(dir, "input.ts");
    const preamble = req.preamble ? req.preamble + "\n" : "";
    fs.writeFileSync(file, `${preamble}export type ${req.name} = ${req.ts};\n`);
    try {
        const generator = createGenerator({
            path: file,
            type: req.name,
            skipTypeCheck: true,
            additionalProperties: false,
            expose: "none",
        });
        return {schema: generator.createSchema(req.name)};
    } finally {
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

async function main() {
    const req = JSON.parse(await readStdin());
    let res;
    if (req.mode === "json_schema_to_ts") {
        res = await jsonSchemaToTs(req);
    } else if (req.mode === "ts_to_json_schema") {
        res = tsToJsonSchema(req);
    } else {
        throw new Error(`Unknown mode: ${req.mode}`);
    }
    process.stdout.write(JSON.stringify(res));
}

main().catch(err => {
    process.stderr.write(String(err && err.stack ? err.stack : err));
    process.exit(1);
});
