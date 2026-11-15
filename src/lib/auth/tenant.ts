import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isRole } from "./roles";
export async function requireTenant() {
  if (!hasSupabaseConfig()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const preferred = (await cookies()).get("sheep-organization")?.value;
  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id,role")
    .eq("user_id", user.id)
    .order("created_at");
  if (membershipError)
    throw new Error("Não foi possível verificar sua empresa.");
  const membership =
    memberships?.find((item) => item.organization_id === preferred) ??
    memberships?.[0];
  if (!membership) redirect("/organizations/new");
  if (!isRole(membership.role)) throw new Error("Perfil inválido.");
  return {
    supabase,
    user,
    organizationId: membership.organization_id as string,
    role: membership.role,
  };
}
