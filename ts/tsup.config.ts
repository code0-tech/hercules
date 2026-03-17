import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/action_sdk.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: [/@code0-tech\/tucana\/helpers/],
});
