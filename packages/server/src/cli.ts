#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";

const config = loadConfig();
const app = createApp(config);

app.server.listen(config.port, config.host, () => {
  const origin = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
  console.log(`Open Support server listening on ${origin}`);
  console.log(`Dashboard: ${origin}/`);
  console.log(`Database: ${config.databasePath}`);
  if (app.generatedAdminKey) {
    console.log("");
    console.log("No ADMIN_KEY was set. This admin key was generated for this process only:");
    console.log(app.generatedAdminKey);
    console.log("Set ADMIN_KEY in the environment to keep a stable admin key.");
    console.log("");
  }
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, closing.`);
  app.close().then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
