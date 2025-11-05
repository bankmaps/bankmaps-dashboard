import { NextResponse } from "next/server";
import { sendAdminPurchaseNotice } from "@/lib/email";

export const runtime = "nodejs";

export async function GET() {
  try {
    await sendAdminPurchaseNotice(
      "Test email from BankMaps",
      "<p>This proves Postmark is working.</p>"
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Postmark test failed:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
