import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "../../dashboard/dist");
const target = join(here, "../dashboard");

if (!existsSync(join(source, "index.html"))) {
  console.warn("No dashboard build at packages/dashboard/dist. The server will show a build hint until you run pnpm --filter @open-support/dashboard build.");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
