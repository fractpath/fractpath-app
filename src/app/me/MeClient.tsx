"use client";

import * as React from "react";

type State = { loading: boolean; status: number | null; json: any; err: string | null };

export default function MeClient() {
  const [state, setState] = React.useState<State>({ loading: true, status: null, json: null, err: null });

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { method: "GET", credentials: "include", cache: "no-store" });
        let j: any = null;
        try { j = await r.json(); } catch {}
        setState({ loading: false, status: r.status, json: j, err: null });
      } catch (e: any) {
        setState({ loading: false, status: null, json: null, err: String(e?.message ?? e) });
      }
    })();
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>/me debug</h1>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Calls <code>/api/me</code> from the browser (cookies included) and prints the result.
      </p>
      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
        {state.loading ? (
          <p>Loading…</p>
        ) : state.err ? (
          <pre style={{ whiteSpace: "pre-wrap" }}>{state.err}</pre>
        ) : (
          <>
            <p><b>Status:</b> {String(state.status)}</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(state.json, null, 2)}</pre>
          </>
        )}
      </div>
    </main>
  );
}

