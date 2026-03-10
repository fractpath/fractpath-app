import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { checkEnvPresence, loadConfig } from "@/lib/docusign/config";
import { getJwtToken } from "@/lib/docusign/auth";
import { getUserInfo } from "@/lib/docusign/client";
import type { DocuSignHealthResult } from "@/lib/docusign/types";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { ok: false, error: admin.error },
      { status: admin.status },
    );
  }

  const envPresent = checkEnvPresence();

  const result: DocuSignHealthResult = {
    ok: false,
    envPresent,
    jwtAuth: { ok: false },
  };

  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    result.error = err.message;
    console.error("docusign_health_config_error", { error: err.message });
    return NextResponse.json(result, { status: 200 });
  }

  try {
    const token = await getJwtToken(config);
    result.jwtAuth = { ok: true };

    try {
      const userInfo = await getUserInfo(config, token.access_token);
      result.accountInfo = {
        accountName: userInfo.name,
        email: userInfo.email,
      };
    } catch (infoErr: any) {
      result.accountInfo = undefined;
      console.warn("docusign_health_userinfo_error", {
        error: infoErr.message,
      });
    }

    result.ok = true;
  } catch (authErr: any) {
    result.jwtAuth = { ok: false, error: authErr.message };
    console.error("docusign_health_auth_error", { error: authErr.message });
  }

  console.log("docusign_health_check", {
    ok: result.ok,
    jwtOk: result.jwtAuth.ok,
    envComplete: Object.values(envPresent).every(Boolean),
    adminEmail: admin.email,
  });

  return NextResponse.json(result, { status: 200 });
}
