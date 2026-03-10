type SendTemplateEmailOpts = {
  to: string;
  from: string;
  subject: string;
  template: {
    id: string;
    variables: Record<string, string>;
  };
};

export async function sendTemplateEmail(
  opts: SendTemplateEmailOpts,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const payload = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    template: {
      id: opts.template.id,
      variables: opts.template.variables,
    },
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawBody = await res.text().catch(() => "(no body)");

  if (!res.ok) {
    console.error("resend_send_error", {
      status: res.status,
      body: rawBody,
      templateId: opts.template.id,
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
    });
    throw new Error(`Resend send failed (${res.status}): ${rawBody}`);
  }
}
