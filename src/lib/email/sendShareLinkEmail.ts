type SendShareLinkEmailOpts = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendShareLinkEmail(opts: SendShareLinkEmailOpts): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const payload: Record<string, string> = {
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) {
    payload.html = opts.html;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    console.error("resend_send_error", {
      status: res.status,
      body,
    });
    throw new Error("Email delivery failed");
  }
}
