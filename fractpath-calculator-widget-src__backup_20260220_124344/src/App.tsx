import { useMemo, useState } from "react";

import "./App.css";

type Persona = "Buyer" | "Homeowner" | "Realtor";

export default function App({
  initialPersona = "Buyer",
}: { initialPersona?: Persona }) {

  // State is seeded from the widget entry point
  const [persona] = useState<Persona>(initialPersona);

  // Simple, visible framing to prove persona switching works
  const personaDescription = useMemo(() => {
    switch (persona) {
      case "Buyer":
        return "Buyer view: explore illustrative equity earned over time.";
      case "Homeowner":
        return "Homeowner view: explore equity retained and optional buyback framing.";
      case "Realtor":
        return "Realtor view: explore a simple projected commission heuristic.";
      default:
        return "";
    }
  }, [persona]);

  return (
    <>
      

      <h1>FractPath Scenario Tool (Widget)</h1>

      <div className="card" style={{ textAlign: "left" }}>
        <p>
          <strong>Viewing as:</strong> {persona}
        </p>
        <p>{personaDescription}</p>

        <hr />

        <p style={{ fontSize: 14 }}>
          This is an early scaffolding view. Next we’ll replace this with the
          actual scenario inputs/outputs and email gating.
        </p>
      </div>

      <p className="read-the-docs">
        Dev test: persona is controlled by <code>window.FractPathCalculator.setPersona(...)</code>
      </p>
    </>
  );
}
