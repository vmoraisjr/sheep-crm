import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { automationServiceClient, SupabaseAutomationRepository } from '@/lib/automation/supabase-repository';
import { runAutomation } from '@/lib/automation/service';
import { dispatchAutomationOutbox } from '@/lib/automation/dispatch';
export async function POST(request:Request){
 const secret=process.env.AUTOMATION_WORKER_SECRET;
 const actual=request.headers.get('authorization')??'',expected=`Bearer ${secret??''}`;
 if(!secret||secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const db=automationServiceClient();
  const {data:pending,error}=await db.rpc('pending_automation_messages');if(error)throw error;
  const repository=new SupabaseAutomationRepository(db);
  const decisions=[];
  for(const message of pending??[]){
   try{decisions.push(await runAutomation(repository,message.organization_id,message.conversation_id,message.message_id));}
   catch{decisions.push({failed:true});}
  }
  return NextResponse.json({decisions,outcomes:await dispatchAutomationOutbox(db)});
 }
 catch{return NextResponse.json({error:'Automation unavailable'},{status:503});}
}
