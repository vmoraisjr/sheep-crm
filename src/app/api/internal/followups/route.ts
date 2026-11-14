import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { automationServiceClient } from '@/lib/automation/supabase-repository';
import { SupabaseFollowupRepository } from '@/lib/followups/supabase-repository';
import { configuredFollowupTransport } from '@/lib/followups/configured-transport';
import { runFollowups } from '@/lib/followups/scheduler';
export async function POST(request:Request){
 const secret=process.env.FOLLOWUP_WORKER_SECRET;
 const supplied=request.headers.get('authorization')??'';
 const expected=`Bearer ${secret??''}`;
 if(!secret||secret.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{const db=automationServiceClient();return NextResponse.json({outcomes:await runFollowups(new SupabaseFollowupRepository(db),configuredFollowupTransport(db))});}
 catch{return NextResponse.json({error:'Worker unavailable'},{status:503});}
}
