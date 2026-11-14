import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenant } from '@/lib/auth/tenant';
import { runAutomation } from '@/lib/automation/service';
import { automationServiceClient, SupabaseAutomationRepository } from '@/lib/automation/supabase-repository';
export async function POST(request:Request) {
 const {organizationId}=await requireTenant();
 const input=z.object({conversationId:z.uuid(),messageId:z.uuid()}).strict().safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid automation input'},{status:400});
 try {return NextResponse.json(await runAutomation(new SupabaseAutomationRepository(automationServiceClient()),organizationId,input.data.conversationId,input.data.messageId));}
 catch {return NextResponse.json({error:'Automation unavailable or message inaccessible'},{status:503});}
}
