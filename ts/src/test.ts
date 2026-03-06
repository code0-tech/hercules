import fs from "node:fs";
import ts from "typescript";
import {createCompilerHost} from "./utils";

fs.readFile("implemented_action.ts", "utf-8", (err, data) => {
    const sourceFile = ts.createSourceFile("test.ts", data, ts.ScriptTarget.Latest);

    // 3. Setup a minimal compiler host.
    const host = createCompilerHost("test.ts", data, sourceFile);

    const program = ts.createProgram(["test.ts"], {target: ts.ScriptTarget.Latest, noEmit: true}, host);

})