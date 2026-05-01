import { sendInlineEmail } from "@/lib/email/sendInlineEmail";
import { getAppBaseUrlServer } from "@/lib/appBaseUrl";

const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "admin@fractpath.com";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "notifications@notify.fractpath.com";

/**
 * Sent when a property owner uploads identity verification documents
 * (selfie / drivers_license / utility_bill) that require admin review.
 */
export async function sendAdminPropertyVerificationNeededEmail(params: {
  propertyId: string;
  propertyAddress?: string | null;
  ownerEmail?: string | null;
}): Promise<void> {
  const appBase = getAppBaseUrlServer();
  const adminUrl = `${appBase}/admin/properties/${params.propertyId}`;
  const addressDisplay = params.propertyAddress?.trim() || params.propertyId;

  await sendInlineEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    from: FROM_EMAIL,
    subject: "FractPath admin action needed: Property verification submitted",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
        <h2 style="font-size:16px;margin-bottom:12px;">Property verification submitted</h2>
        <p style="font-size:14px;margin-bottom:16px;">
          A property owner has uploaded verification documents that require admin review.
        </p>
        <table style="font-size:13px;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Property</td>
            <td style="padding:4px 0;">${addressDisplay}</td>
          </tr>
          ${params.ownerEmail ? `
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Owner email</td>
            <td style="padding:4px 0;">${params.ownerEmail}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Property ID</td>
            <td style="padding:4px 0;font-size:12px;color:#999;">${params.propertyId}</td>
          </tr>
        </table>
        <p>
          <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">
            Review in admin
          </a>
        </p>
      </div>
    `.trim(),
  });
}

/**
 * Sent when a deal transitions to ACCEPTED status and needs admin review
 * before the execution workflow proceeds.
 */
export async function sendAdminAcceptedDealReviewNeededEmail(params: {
  dealId: string;
  propertyAddress?: string | null;
  buyerEmail?: string | null;
  ownerEmail?: string | null;
}): Promise<void> {
  const appBase = getAppBaseUrlServer();
  const adminUrl = `${appBase}/admin/deals/${params.dealId}`;
  const addressDisplay = params.propertyAddress?.trim() || "unknown property";

  await sendInlineEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    from: FROM_EMAIL,
    subject: "FractPath admin action needed: Accepted deal pending review",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
        <h2 style="font-size:16px;margin-bottom:12px;">Accepted deal pending admin review</h2>
        <p style="font-size:14px;margin-bottom:16px;">
          A deal has been accepted by both parties and is awaiting admin review.
        </p>
        <table style="font-size:13px;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Property</td>
            <td style="padding:4px 0;">${addressDisplay}</td>
          </tr>
          ${params.buyerEmail ? `
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Buyer email</td>
            <td style="padding:4px 0;">${params.buyerEmail}</td>
          </tr>` : ""}
          ${params.ownerEmail ? `
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Owner email</td>
            <td style="padding:4px 0;">${params.ownerEmail}</td>
          </tr>` : ""}
          <tr>
            <td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;">Deal ID</td>
            <td style="padding:4px 0;font-size:12px;color:#999;">${params.dealId}</td>
          </tr>
        </table>
        <p>
          <a href="${adminUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;">
            Review in admin
          </a>
        </p>
      </div>
    `.trim(),
  });
}
