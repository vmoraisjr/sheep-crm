import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant";
import { stages } from "@/lib/crm/model";
export async function GET() {
  const { supabase, organizationId } = await requireTenant();
  const { data, error } = await supabase
    .from("crm_stage_rules")
    .select("*")
    .eq("organization_id", organizationId);
  return error
    ? NextResponse.json({ error: "Regras indisponíveis" }, { status: 503 })
    : NextResponse.json(data);
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const { supabase, organizationId, role } = await requireTenant();
  if (!["owner", "admin"].includes(role))
    return NextResponse.json(
      { error: "Perfil sem permissão" },
      { status: 403 },
    );
  const parsed = z
    .object({
      from: z.enum(stages),
      to: z.enum(stages),
      enabled: z.boolean(),
      notes: z.string().min(1).max(2000),
      delay: z.number().int().min(0).max(8760),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Regra inválida" }, { status: 400 });
  const i = parsed.data;
  const { error } = await supabase
    .from("crm_stage_rules")
    .upsert(
      {
        organization_id: organizationId,
        from_stage: i.from,
        to_stage: i.to,
        enabled: i.enabled,
        task_notes: i.notes,
        delay_hours: i.delay,
      },
      { onConflict: "organization_id,from_stage,to_stage" },
    );
  return error
    ? NextResponse.json({ error: "Não foi possível salvar" }, { status: 409 })
    : NextResponse.json({ ok: true });
}
