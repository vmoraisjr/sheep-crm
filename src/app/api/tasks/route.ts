import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant";
export async function GET() {
  const { supabase, organizationId } = await requireTenant();
  const { data, error } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("organization_id", organizationId);
  if (error)
    return NextResponse.json(
      { error: "Tarefas indisponíveis" },
      { status: 503 },
    );
  return NextResponse.json(
    data.map((i) => ({
      id: i.id,
      contactId: i.contact_id,
      dueAt: i.due_at,
      assignee: i.assignee,
      notes: i.notes,
      completed: i.completed,
    })),
  );
}
const schema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  dueAt: z.iso.datetime(),
  assignee: z.string().max(200),
  notes: z.string().min(1).max(2000),
  completed: z.boolean(),
});
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  const { supabase, organizationId } = await requireTenant();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const i = parsed.data;
  const { error } = await supabase
    .from("crm_tasks")
    .upsert(
      {
        id: i.id,
        organization_id: organizationId,
        contact_id: i.contactId,
        due_at: i.dueAt,
        assignee: i.assignee,
        notes: i.notes,
        completed: i.completed,
      },
      { onConflict: "id" },
    );
  return error
    ? NextResponse.json({ error: "Não foi possível salvar" }, { status: 409 })
    : NextResponse.json({ ok: true });
}
