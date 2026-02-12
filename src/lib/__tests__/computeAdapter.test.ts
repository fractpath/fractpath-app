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

console.log("\n--- computeDeal adapter (real integration) ---\n");

(async () => {
  await test("returns ok:true with valid inputs", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, `expected ok:true but got ${JSON.stringify(result)}`);
  });

  await test("result has terms_version string", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "should succeed");
    if (result.ok) {
      assert(
        typeof result.result.terms_version === "string" &&
          result.result.terms_version.length > 0,
        "terms_version should be a non-empty string",
      );
    }
  });

  await test("result has outputs.summary object", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "should succeed");
    if (result.ok) {
      assert(
        typeof result.result.outputs.summary === "object" &&
          result.result.outputs.summary !== null,
        "summary should be an object",
      );
    }
  });

  await test("result has outputs.schedule array", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "should succeed");
    if (result.ok) {
      assert(
        Array.isArray(result.result.outputs.schedule) &&
          result.result.outputs.schedule.length > 0,
        "schedule should be a non-empty array",
      );
    }
  });

  await test("returns COMPUTE_FAILED for invalid inputs", async () => {
    const result = await computeDeal({
      home_value: -100,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === false, "should fail");
    assert(
      (result as any).code === "COMPUTE_FAILED",
      `expected COMPUTE_FAILED but got ${(result as any).code}`,
    );
  });

  await test("golden fixture: 500k scenario matches expected values", async () => {
    const result = await computeDeal({
      home_value: 500000,
      fractional_percent: 10,
      term_years: 10,
      appreciation_rate: 3,
      discount_rate: 5,
    });
    assert(result.ok === true, "should succeed");
    if (result.ok) {
      const s = result.result.outputs.summary as any;
      assert(s.buy_amount === 50000, `buy_amount: expected 50000 got ${s.buy_amount}`);
      assert(
        s.estimated_end_value === 671958.19,
        `estimated_end_value: expected 671958.19 got ${s.estimated_end_value}`,
      );
    }
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
  if (failed > 0) process.exit(1);
})();
