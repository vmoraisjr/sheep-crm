import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant";
import { stages } from "@/lib/crm/model";
export async function GET() {
  const { supabase, organizationId } = await requireTenant();
  const [opportunities, contacts, pending, followups, channels, tasks] =
    await Promise.all([
      supabase
        .from("opportunities")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("id,name,tags,channel_id")
        .eq("organization_id", organizationId),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("unanswered", true),
      supabase
        .from("followups")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["pending", "claimed"]),
      supabase
        .from("channels")
        .select("id,kind")
        .eq("organization_id", organizationId),
      supabase
        .from("crm_tasks")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("completed", false)
        .order("due_at"),
    ]);
  if (
    [opportunities, contacts, pending, followups, channels, tasks].some(
      (item) => item.error,
    )
  )
    return NextResponse.json({ error: "CRM indisponível." }, { status: 503 });
  return NextResponse.json(
    {
      opportunities: (opportunities.data ?? []).map((item) => ({
        id: item.id,
        contactId: item.contact_id,
        followupAt:
          tasks.data?.find((task) => task.contact_id === item.contact_id)
            ?.due_at ?? null,
        channel:
          channels.data?.find(
            (channel) =>
              channel.id ===
              contacts.data?.find((contact) => contact.id === item.contact_id)
                ?.channel_id,
          )?.kind ?? "whatsapp",
        company: item.company,
        priority: item.priority,
        expectedCloseAt: item.expected_close_at,
        name:
          item.title ||
          contacts.data?.find((contact) => contact.id === item.contact_id)
            ?.name ||
          "Contato",
        stage: item.stage,
        position: item.position ?? 0,
        history: item.movement_history ?? [],
        createdAt: item.created_at,
        assignee: item.assignee ?? "",
        nextAction: item.next_action,
        valueCents: item.value_cents,
        tags:
          contacts.data?.find((contact) => contact.id === item.contact_id)
            ?.tags ?? [],
      })),
      pending: pending.count ?? 0,
      followups: followups.count ?? 0,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
const input = z.object({
  id: z.uuid(),
  stage: z.enum(stages).optional(),
  title: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  expectedCloseAt: z.iso.datetime().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  assignee: z.literal("self").optional(),
  nextAction: z.string().max(2000).optional(),
  valueCents: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER)
    .nullable()
    .optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});
export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { supabase, organizationId } = await requireTenant();
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const { id, ...patch } = parsed.data;
  const { error } = patch.stage
    ? await supabase.rpc("move_crm_opportunity", {
        p_organization_id: organizationId,
        p_id: id,
        p_stage: patch.stage,
        p_position: patch.position ?? 0,
      })
    : await supabase.rpc("update_crm_opportunity", {
        p_organization_id: organizationId,
        p_id: id,
        p_patch: patch,
      });
  if (error)
    return NextResponse.json(
      { error: "Oportunidade não pôde ser atualizada." },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { supabase, organizationId } = await requireTenant();
  const parsed = z
    .object({ contactId: z.uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Contato inválido" }, { status: 400 });
  const { data: contact } = await supabase
    .from("contacts")
    .select("id,opted_out")
    .eq("organization_id", organizationId)
    .eq("id", parsed.data.contactId)
    .single();
  if (!contact || contact.opted_out)
    return NextResponse.json(
      { error: "Contato indisponível" },
      { status: 409 },
    );
  const { error } = await supabase
    .from("opportunities")
    .upsert(
      { organization_id: organizationId, contact_id: contact.id },
      { onConflict: "organization_id,contact_id", ignoreDuplicates: true },
    );
  if (error)
    return NextResponse.json(
      { error: "Não foi possível criar o negócio" },
      { status: 409 },
    );
  const { data } = await supabase
    .from("opportunities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contact.id)
    .single();
  return data
    ? NextResponse.json(data)
    : NextResponse.json({ error: "Negócio indisponível" }, { status: 409 });
}
