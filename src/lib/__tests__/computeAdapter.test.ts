import { computeDeal } from "../computeAdapter";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  const result = fn();
  const finish = (err?: any) => {
    if (err) {
      failed++;
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message ?? err}`);
    } else {
      passed++;
      console.log(`  PASS: ${name}`);
    }
  };
  if (result && typeof (result as any).then === "function") {
    (result as Promise<void>).then(() => finish()).catch(finish);
  } else {
    finish();
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

console.log("\n--- computeDeal adapter ---\n");

(async () => {
  await test("returns NOT_INTEGRATED when package is missing", async () => {
    const result = await computeDeal({ home_value: 500000 });
    assert(result.ok === false, "should not be ok");
    assert(
      (result as any).code === "NOT_INTEGRATED",
      `expected NOT_INTEGRATED but got ${(result as any).code}`,
    );
  });

  await test("error includes helpful message", async () => {
    const result = await computeDeal({});
    assert(result.ok === false, "should not be ok");
    assert(
      (result as any).error.includes("not yet integrated"),
      `expected integration message but got: ${(result as any).error}`,
    );
  });

  await test("accepts arbitrary input shapes", async () => {
    const result = await computeDeal({ a: 1, b: "test", c: { nested: true } });
    assert(result.ok === false, "should fail without package");
    assert((result as any).code === "NOT_INTEGRATED", "should be NOT_INTEGRATED");
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  if (failed > 0) process.exit(1);
})();
