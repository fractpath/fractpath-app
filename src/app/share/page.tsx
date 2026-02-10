export default function ShareLandingPage() {
  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Open your shared scenario</h1>
      <p style={{ lineHeight: 1.6, marginBottom: 16 }}>
        This is the entry point for FractPath share links. Next we’ll connect it
        to saved deals so it can load a shared scenario and resume the flow.
      </p>
      <p style={{ lineHeight: 1.6 }}>
        If you reached this page from an email, you can keep this tab open while
        we finish wiring it up.
      </p>
    </main>
  );
}
