See examples to use the sdk here: [/examples](https://github.com/code0-tech/hercules/tree/main/examples) 

To run a simple example use:

```bash
cd examples/simple-examples-ts
npm install
npm run dev
```

## Exporting an action as a Module JSON

Every project with `@code0-tech/hercules` installed gets a `hercules` CLI. The
`export` command loads your entry file **without connecting to aquila** and
prints the complete action as a JSON document in the shape of the tucana
protobuf `shared.Module` type:

```bash
npx hercules export src/index.ts              # print to stdout
npx hercules export src/index.ts -o module.json
npx hercules export dist/index.js --compact   # built JS entry, compact JSON
```

The command finds your `Action` automatically: either export the instance from
the entry file, or simply construct it during module load (calls to
`action.connect(...)` are turned into no-ops while exporting). Loading a
TypeScript entry directly requires `tsx` as a dev dependency; alternatively
point the command at your built JavaScript entry.
