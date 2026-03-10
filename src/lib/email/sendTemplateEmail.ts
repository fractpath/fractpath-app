type SendTemplateEmailOpts = {
  to: string;
  from: string;
  subject: string;
  template: {
    id: string;
    variables: Record<string, string>;
  };
};

function buildHtml(subject: string, vars: Record<string, string>): string {
  const actionUrl = vars.ACTION_URL || vars.SHARE_URL || "";
  const dealTitle = vars.DEAL_TITLE || "";
  const rows: string[] = [];

  if (dealTitle) rows.push(`<p style="margin:0 0 12px;font-size:14px;color:#374151;">Deal: <strong>${esc(dealTitle)}</strong></p>`);

  const extraKeys = Object.keys(vars).filter(
    (k) => !["ACTION_URL", "SHARE_URL", "DEAL_TITLE"].includes(k),
  );
  for (const k of extraKeys) {
    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    rows.push(`<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${esc(label)}: ${esc(vars[k])}</p>`);
  }

  const btnHtml = actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${esc(actionUrl)}" style="display:inline-block;padding:10px 24px;background:#111827;color:#ffffff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:500;">View in FractPath</a></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:32px;">
<tr><td>
<h1 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#111827;">${esc(subject)}</h1>
${rows.join("\n")}
${btnHtml}
<p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">FractPath &mdash; Exploratory real estate scenarios</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendTemplateEmail(
  opts: SendTemplateEmailOpts,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const html = buildHtml(opts.subject, opts.template.variables);

  const payload = {
    from: opts.from,
    to: [opts.to],
    subject: opts.subject,
    html,
  };

  const rawUrl = opts.template.variables.ACTION_URL || opts.template.variables.SHARE_URL || "";
  let safeUrl = "(none)";
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      safeUrl = `${u.origin}${u.pathname}`;
    } catch {
      safeUrl = "(invalid url)";
    }
  }

  console.log("resend_send_attempt", {
    templateId: opts.template.id,
    to: opts.to,
    from: opts.from,
    subject: opts.subject,
    variableKeys: Object.keys(opts.template.variables),
    actionUrlPath: safeUrl,
  });

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

  let responseId: string | undefined;
  try {
    const parsed = JSON.parse(rawBody);
    responseId = parsed?.id;
  } catch {}

  console.log("resend_send_ok", {
    status: res.status,
    resendId: responseId,
    templateId: opts.template.id,
    to: opts.to,
    subject: opts.subject,
  });
}
