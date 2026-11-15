import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant";
import type { InboxConversation } from "@/lib/demo/inbox";
export async function GET() {
  const { supabase, organizationId } = await requireTenant();
  const [conversations, contacts, channels, messages, handoffs, opportunities] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*")
        .eq("organization_id", organizationId)
        .order("last_inbound_at", { ascending: false })
        .limit(100),
      supabase
        .from("contacts")
        .select("id,name,tags,external_id")
        .eq("organization_id", organizationId),
      supabase
        .from("channels")
        .select("id,kind,status")
        .eq("organization_id", organizationId),
      supabase
        .from("messages")
        .select("*")
        .eq("organization_id", organizationId)
        .order("occurred_at", { ascending: false })
        .limit(1000),
      supabase
        .from("handoffs")
        .select("conversation_id,context")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("opportunities")
        .select("contact_id,stage,next_action")
        .eq("organization_id", organizationId),
    ]);
  if (
    [conversations, contacts, channels, messages, handoffs, opportunities].some(
      (result) => result.error,
    )
  )
    return NextResponse.json(
      { error: "Não foi possível carregar as conversas." },
      { status: 503 },
    );
  const data: InboxConversation[] = (conversations.data ?? []).map(
    (conversation) => ({
      id: conversation.id,
      contactId: conversation.contact_id,
      name:
        contacts.data?.find((contact) => contact.id === conversation.contact_id)
          ?.name ?? "Contato",
      externalId: contacts.data?.find(
        (contact) => contact.id === conversation.contact_id,
      )?.external_id,
      connectionStatus: channels.data?.find(
        (channel) => channel.id === conversation.channel_id,
      )?.status,
      channel:
        channels.data?.find((channel) => channel.id === conversation.channel_id)
          ?.kind ?? "whatsapp",
      attendanceState: conversation.attendance_state,
      unread: conversation.unanswered,
      aiPaused: conversation.ai_paused,
      assignee: conversation.assigned_to ?? "",
      opportunity: (() => {
        const opportunity = opportunities.data?.find(
          (item) => item.contact_id === conversation.contact_id,
        );
        return opportunity
          ? {
              stage: opportunity.stage,
              nextAction: opportunity.next_action,
              tags:
                contacts.data?.find(
                  (item) => item.id === conversation.contact_id,
                )?.tags ?? [],
            }
          : undefined;
      })(),
      handoff:
        handoffs.data?.find(
          (handoff) => handoff.conversation_id === conversation.id,
        )?.context ?? "",
      messages: (messages.data ?? [])
        .filter((message) => message.conversation_id === conversation.id)
        .reverse()
        .map((message) => ({
          id: message.id,
          text: message.text || (message.media ? "[Mídia recebida]" : ""),
          direction: message.direction,
          at: message.occurred_at,
          origin: message.origin,
          author: message.author_kind,
          status: message.status,
        })),
    }),
  );
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
