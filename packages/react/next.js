// Subpath entry so bundlers that alias "@open-support/react" to this folder
// still resolve "@open-support/react/next" to dist/next.js. package.json
// "exports" is the normal path; this file is the fallback when exports are skipped.
export * from "./dist/next.js";
