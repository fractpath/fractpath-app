import { sendInlineEmail } from "@/lib/email/sendInlineEmail";

const FROM_ADDRESS =
  process.env.NOTIFICATION_FROM_EMAIL ?? "FractPath <noreply@updates.fractpath.com>";

async function resolveOwnerContact(
  svc: any,
  dealId: string,
): Promise<{ email: string; name: string | null; userId: string | null } | null> {
  try {
    const { data: thread } = await (svc.from("deal_threads") as any)
      .select("owner_user_id")
      .eq("deal_id", dealId)
      .in("status", ["accepted", "closed", "negotiating", "pending_owner"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ownerUserId: string | null = thread?.owner_user_id ?? null;
    if (!ownerUserId) return null;

    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(ownerUserId);
    if (authErr || !authUser?.user?.email) return null;

    const email = authUser.user.email as string;

    const { data: profile } = await (svc.from("profiles") as any)
      .select("first_name, last_name")
      .eq("id", ownerUserId)
      .maybeSingle();

    const name =
      profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name ?? null;

    return { email, name, userId: ownerUserId };
  } catch {
    return null;
  }
}

async function resolveOwnerContactViaProperty(
  svc: any,
  propertyId: string,
): Promise<{ email: string; name: string | null; userId: string | null; dealId: string | null } | null> {
  try {
    const { data: thread } = await (svc.from("deal_threads") as any)
      .select("deal_id, owner_user_id")
      .eq("property_id", propertyId)
      .in("status", ["accepted", "closed", "negotiating"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dealId: string | null = thread?.deal_id ?? null;
    const ownerUserId: string | null = thread?.owner_user_id ?? null;
    if (!ownerUserId) return null;

    const { data: authUser, error: authErr } = await svc.auth.admin.getUserById(ownerUserId);
    if (authErr || !authUser?.user?.email) return null;

    const email = authUser.user.email as string;

    const { data: profile } = await (svc.from("profiles") as any)
      .select("first_name, last_name")
      .eq("id", ownerUserId)
      .maybeSingle();

    const name =
      profile?.first_name && profile?.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile?.first_name ?? null;

    return { email, name, userId: ownerUserId, dealId };
  } catch {
    return null;
  }
}

export async function notifyMilestoneForDeal(opts: {
  svc: any;
  dealId: string;
  milestoneLabel: string;
  note?: string | null;
  adminId?: string | null;
}): Promise<void> {
  const { svc, dealId, milestoneLabel, note, adminId } = opts;
  const contact = await resolveOwnerContact(svc, dealId);
  if (!contact) {
    console.warn("MILESTONE_NOTIFY_NO_CONTACT", { dealId, milestoneLabel });
    return;
  }
  await _sendAndLog({ svc, dealId, contact, milestoneLabel, note, adminId });
}

export async function notifyMilestoneForProperty(opts: {
  svc: any;
  propertyId: string;
  milestoneLabel: string;
  note?: string | null;
  adminId?: string | null;
}): Promise<void> {
  const { svc, propertyId, milestoneLabel, note, adminId } = opts;
  const contact = await resolveOwnerContactViaProperty(svc, propertyId);
  if (!contact?.dealId) {
    console.warn("MILESTONE_NOTIFY_NO_CONTACT_VIA_PROPERTY", { propertyId, milestoneLabel });
    return;
  }
  await _sendAndLog({ svc, dealId: contact.dealId, contact, milestoneLabel, note, adminId });
}

async function _sendAndLog(opts: {
  svc: any;
  dealId: string;
  contact: { email: string; name: string | null };
  milestoneLabel: string;
  note?: string | null;
  adminId?: string | null;
}): Promise<void> {
  const { svc, dealId, contact, milestoneLabel, note, adminId } = opts;

  const greeting = contact.name ? `Hi ${contact.name},` : "Hi,";
  const noteHtml = note?.trim()
    ? `<p style="color:#555;font-size:14px;font-style:italic;">${note.trim()}</p>`
    : "";

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
  <h2 style="color:#111;margin-bottom:8px;">Update on your FractPath deal</h2>
  <p style="color:#333;font-size:16px;">${greeting}</p>
  <p style="color:#333;font-size:16px;">Your deal status has been updated:</p>
  <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;margin:16px 0;">
    <p style="color:#111;font-weight:600;font-size:16px;margin:0;">${milestoneLabel}</p>
  </div>
  ${noteHtml}
  <p style="color:#555;font-size:14px;">
    Log in to <a href="https://fractpath.com/deal/${dealId}" style="color:#2563eb;">view deal details</a>.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#999;font-size:12px;">
    FractPath — exploratory scenario tool. This is not a commitment or contract.
  </p>
</div>`;

  let emailOk = false;
  try {
    await sendInlineEmail({
      to: contact.email,
      from: FROM_ADDRESS,
      subject: `FractPath update: ${milestoneLabel}`,
      html,
    });
    emailOk = true;
  } catch (err) {
    console.error("MILESTONE_EMAIL_FAILED", { dealId, milestoneLabel, err });
  }

  try {
    await (svc.from("deal_events") as any).insert({
      deal_id: dealId,
      event_type: "DEAL_WORKFLOW_NOTIFICATION_SENT",
      payload: {
        milestone: milestoneLabel,
        to: contact.email,
        email_ok: emailOk,
        note: note ?? null,
      },
      created_by: adminId ?? null,
    });
  } catch (err) {
    console.error("MILESTONE_EVENT_INSERT_FAILED", { dealId, err });
  }
}
