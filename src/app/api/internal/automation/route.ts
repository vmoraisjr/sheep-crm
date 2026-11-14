import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { automationServiceClient } from '@/lib/automation/supabase-repository';
import { dispatchAutomationOutbox } from '@/lib/automation/dispatch';
export async function POST(request:Request){
 const secret=process.env.AUTOMATION_WORKER_SECRET;
 const actual=request.headers.get('authorization')??'',expected=`Bearer ${secret??''}`;
 if(!secret||secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{return NextResponse.json({outcomes:await dispatchAutomationOutbox(automationServiceClient())});}
 catch{return NextResponse.json({error:'Automation unavailable'},{status:503});}
}
