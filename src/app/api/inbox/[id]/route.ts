import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant";
const input = z.object({
  aiPaused: z.boolean().optional(),
  attendanceState: z.enum(["ai", "human", "paused", "closed"]).optional(),
  assignToMe: z.boolean().optional(),
  handoff: z.string().max(4000).optional(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const { supabase, organizationId, user } = await requireTenant();
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success)
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  if (parsed.data.aiPaused === false || parsed.data.attendanceState === "ai") {
    const { data: profile, error: profileError } = await supabase
      .from("onboarding_profiles")
      .select("agent_enabled,revision,approved_revision,approved_at")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (
      profileError ||
      !profile?.agent_enabled ||
      !profile.approved_at ||
      profile.revision !== profile.approved_revision
    )
      return NextResponse.json(
        { error: "Aprove a revisão do conhecimento antes de ativar o agente." },
        { status: 409 },
      );
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.attendanceState) {
    patch.attendance_state = parsed.data.attendanceState;
    patch.ai_paused = parsed.data.attendanceState !== "ai";
  }

  if (parsed.data.aiPaused !== undefined)
    patch.ai_paused = parsed.data.aiPaused;
  if (parsed.data.assignToMe !== undefined) {
    patch.assigned_to = parsed.data.assignToMe ? user.id : null;
    patch.ai_paused = true;
  }
  if (parsed.data.handoff !== undefined) patch.ai_paused = true;
  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data)
    return NextResponse.json(
      { error: "Conversa indisponível." },
      { status: 404 },
    );
  if (parsed.data.handoff !== undefined) {
    const { error: handoffError } = await supabase
      .from("handoffs")
      .insert({
        organization_id: organizationId,
        conversation_id: id,
        reason: "manual",
        context: parsed.data.handoff,
        assigned_to: user.id,
      });
    if (handoffError)
      return NextResponse.json(
        { error: "IA pausada; não foi possível salvar o contexto." },
        { status: 503 },
      );
  }
  return NextResponse.json({ ok: true });
}
