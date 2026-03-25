type SendInlineEmailOpts = {
  to: string;
  from: string;
  subject: string;
  html: string;
};

export async function sendInlineEmail(opts: SendInlineEmailOpts): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  const rawBody = await res.text().catch(() => "(no body)");

  if (!res.ok) {
    console.error("resend_send_error", {
      status: res.status,
      body: rawBody,
      subject: opts.subject,
      from: opts.from,
    });
    throw new Error(`Resend send failed (${res.status}): ${rawBody}`);
  }

  console.log("resend_send_ok", {
    status: res.status,
    subject: opts.subject,
  });
}
