const { spawnSync } = require("node:child_process");

let failed = 0;
for (const script of ["ux", "capture", "portability"]) {
  console.log(`\n=== e2e/${script}.cjs ===`);
  const result = spawnSync(process.execPath, [`e2e/${script}.cjs`], { stdio: "inherit" });
  if (result.status !== 0) failed++;
}
console.log(failed ? `\n${failed} e2e suite(s) failed` : "\nAll e2e suites passed");
process.exit(failed ? 1 : 0);
