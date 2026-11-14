'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {UsageReport} from '@/lib/usage/limits';
export default function UsagePage(){
 const [report,setReport]=useState<UsageReport|null>(null),[error,setError]=useState('');
 useEffect(()=>{fetch('/api/usage').then(async r=>{if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Entre na sua conta para consultar o uso.');setReport(await r.json());}).catch(e=>setError(e.message));},[]);
 return <main className="mx-auto max-w-4xl p-6"><Link className="text-indigo-700" href="/inbox">← Central de conversas</Link><h1 className="my-6 text-3xl font-bold">Uso da empresa</h1><p>Sem cobrança real. Período mensal em UTC. Uma unidade reservada por conversa automatizada no mês; mensagens confirmadas são contabilizadas separadamente.</p>{error?<p role="alert" className="my-6">{error}</p>:!report?<p role="status">Carregando…</p>:<><p className="my-4">Período: {report.period} • limite {report.mode==='hard'?'bloqueante':'informativo'}</p><dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[['Atendimentos reservados',report.automatedConversations],['Franquia mensal',report.limit],['Disponíveis',report.remaining],['Mensagens',report.messages],['Tokens',report.tokens],['Custo registrado (µ)',report.costMicros]].map(([label,value])=><div className="rounded-xl border p-5" key={label}><dt className="text-slate-600">{label}</dt><dd className="mt-2 text-2xl font-bold">{value}</dd></div>)}</dl>{report.exceeded&&<p role="status" className="mt-6 rounded-xl bg-amber-100 p-4">Franquia atingida. {report.mode==='hard'?'Novas conversas automatizadas são encaminhadas para atendimento humano.':'O modo informativo mantém o atendimento e registra o excedente.'}</p>}</>}</main>;
}
