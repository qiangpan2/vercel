import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || Boolean(process.env.VITEST);

  return {
    ssr: {
      external: ["better-sqlite3", "bindings"],
    },
    plugins: [
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      tanstackStart(),
      ...(isTest
        ? []
        : [
            nitro({
              config: {
                noExternals: false,
                externals: {
                  external: ["better-sqlite3", "bindings"],
                },
              },
            }),
          ]),
      viteReact(),
    ],
  };
});
