import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pyproject = readFileSync(new URL("../services/gkos-intelligence/pyproject.toml", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const notice = readFileSync(new URL("../NOTICE", import.meta.url), "utf8");
const problems = [];
if (pkg.license !== "Apache-2.0") problems.push("package.json must declare Apache-2.0");
if (!/^license\s*=\s*\{\s*text\s*=\s*"Apache-2.0"\s*\}/m.test(pyproject)) problems.push("Python package must declare Apache-2.0");
if (!/## License[\s\S]*Apache-2\.0/.test(readme)) problems.push("README license section must declare Apache-2.0");
if (!/Copyright 2026 Shaun/.test(notice)) problems.push("NOTICE copyright is missing");
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("license metadata consistent: Apache-2.0");
