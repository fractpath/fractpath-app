const fs = require("fs");

const p = "src/components/deal/DealDetailWidgetPanel.tsx";
let s = fs.readFileSync(p, "utf8");

// Exact snippet we will replace (keep this tight and deterministic)
const needle =
`    const typedInputs = inputs as {
      deal_terms: DealTerms;
      scenario: ScenarioAssumptions;
    } | null;
    const typedResults = results as DealResults | null;`;

if (!s.includes(needle)) {
  console.error("needle not found; file may have changed. Aborting.");
  process.exit(1);
}

const replacement =
`    const typedInputs = inputs as {
      deal_terms: DealTerms;
      scenario: ScenarioAssumptions;
    } | null;

    // Defensive defaults for widget expectations (prevents undefined currency fields)
    const normalizedInputs = typedInputs
      ? {
          ...typedInputs,
          deal_terms: {
            ...(typedInputs.deal_terms as any),
            realtor_representation_mode:
              (typedInputs.deal_terms as any).realtor_representation_mode ?? "NONE",
            realtor_commission_pct:
              (typedInputs.deal_terms as any).realtor_commission_pct ?? 0,
          } as any,
        }
      : null;

    const typedResults = (results
      ? ({
          ...(results as any),
          realtor_fee_total_projected:
            (results as any).realtor_fee_total_projected ?? 0,
        } as any)
      : null) as DealResults | null;`;

s = s.replace(needle, replacement);
fs.writeFileSync(p, s);
console.log("patched DealDetailWidgetPanel defaults");
