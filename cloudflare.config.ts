import { bindings, defineConfig, exports } from "cf/config";

export default defineConfig({
  accountId: "0f477dd8124eb3a644ac0c0e5f159ef0",
  worker: {
    name: "bricks-asmr",
    entrypoint: "./src/index.mjs",
    compatibilityDate: "2026-11-08",
    workersDev: true,
    exports: {
      BrickRoom: exports.durableObject({ storage: "sqlite" }),
    },
    env: {
      DB: bindings.d1({
        name: "bricks-asmr",
        id: "786779d1-68ed-49d0-a6ee-434d76143b85",
      }),
      ROOMS: bindings.durableObject({
        worker: "bricks-asmr",
        exportName: "BrickRoom",
      }),
    },
  },
});
