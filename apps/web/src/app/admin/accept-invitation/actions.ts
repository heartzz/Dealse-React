"use server";
import { redirect } from "next/navigation";
import { callDealseApi } from "../../../lib/dealse-api";

export async function acceptAdminInvitation(invitationId: string, accessToken: string): Promise<never> {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) redirect("/admin/login?error=invalid_invitation");
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) redirect("/admin/login?error=invalid_invitation");
  try { await callDealseApi("/auth/admin-invitations/accept", accessToken, { method: "POST", body: { invitationId } }); }
  catch { redirect("/admin/login?error=invalid_invitation"); }
  redirect("/admin/login?error=invitation_accepted");
}
