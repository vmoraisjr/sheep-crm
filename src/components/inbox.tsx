'use client';
import { useEffect, useRef, useState } from 'react';
import { demoConversations, filterConversations, manualReply, type InboxConversation } from '@/lib/demo/inbox';
import './workspace.css';
const labels: Record<string, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram' };
export function Inbox({ simulated = false }: { simulated?: boolean }) {
  const [items, setItems] = useState<InboxConversation[]>([]);
  const [selectedId, select] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, search] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestKey = useRef<string | null>(null);
  const [sending,setSending]=useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (simulated) {
          let data = demoConversations;
          try { const saved = localStorage.getItem('sheep:inbox:demo:v1'); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.every((item) => typeof item.id === 'string' && Array.isArray(item.messages))) data = parsed; } } catch { /* corrupted demo storage resets safely */ }
          if (active) { setItems(data); select(data[0]?.id ?? ''); }
        } else {
          const result = await fetch('/api/inbox');
          if (!result.ok) throw new Error('Não foi possível carregar as conversas. Verifique sua sessão e tente novamente.');
          const data: InboxConversation[] = await result.json();
          if (active) { setItems(data); select(data[0]?.id ?? ''); }
        }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Falha ao carregar.'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [simulated]);
  function persist(next: InboxConversation[]) { setItems(next); if (simulated) { try { localStorage.setItem('sheep:inbox:demo:v1', JSON.stringify(next)); } catch { setNotice('Alterações disponíveis nesta sessão; armazenamento local indisponível.'); } } }
  const selected = items.find((item) => item.id === selectedId);
  async function update(patch: Partial<InboxConversation>) {
    if (!selected) return;
    if (!simulated) {
      const response=await fetch(`/api/inbox/${selected.id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({aiPaused:patch.aiPaused,handoff:patch.handoff, ...(patch.assignee!==undefined?{assignToMe:!!patch.assignee}:{})})});
      if(!response.ok) {setError('Não foi possível salvar a alteração.');return;}
    }
    persist(items.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  }
  async function reply(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (!selected || sending) return;
    if (!simulated) {
      setSending(true);
      requestKey.current ??= crypto.randomUUID();
      try {
        const result=await fetch(`/api/inbox/${selected.id}/reply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:draft,idempotencyKey:requestKey.current})});
        const data=await result.json();
        if(!result.ok || data.status!=='sent') {setError(data.error??'Envio não confirmado.');return;}
        const message={id:data.messageId,text:draft.trim(),direction:'outbound' as const,at:new Date().toISOString(),origin:data.origin as 'meta'|'simulated',status:'sent'};
        persist(items.map(item=>item.id===selected.id?{...item,unread:false,aiPaused:true,messages:[...item.messages,message]}:item));setDraft('');requestKey.current=null;setNotice(data.origin==='simulated'?'Resposta simulada registrada.':'Resposta aceita pelo provedor oficial.');
      } catch {setError('Resultado de envio desconhecido. Confira o histórico antes de reenviar.');}
      finally {setSending(false);}
      return;
    }
    try { const next = manualReply(selected, draft, crypto.randomUUID(), new Date().toISOString()); persist(items.map((item) => item.id === next.id ? next : item)); setDraft(''); setNotice('Resposta simulada adicionada. IA pausada pela intervenção humana.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao responder.'); }
  }
  const visible = filterConversations(items, filter, query);
  return <main className="sheep-workspace">
    <aside className="sheep-navigation"><a className="sheep-brand" href="/demo">◈ <span>Sheep CRM</span></a><span className="sheep-nav-caption">SEU ESPAÇO DE TRABALHO</span><nav aria-label="Navegação principal"><a aria-current="page" href={simulated ? '/demo' : '/inbox'}>◉ Conversas</a><a href="/demo/crm">▥ Funil comercial</a><a href="/demo/dashboard">▦ Visão geral</a><a href="/onboarding">⚙ Configuração</a></nav><div className="sheep-nav-bottom">Atendimento próximo.<br />Negócios bem cuidados.</div></aside>
    <section className="sheep-main"><header className="sheep-header"><div><span className="sheep-eyebrow">CENTRAL DE ATENDIMENTO</span><h1>Conversas</h1><p>Todos os canais. Uma conversa de cada vez.</p></div><span className="sheep-status">{simulated ? 'Ambiente de demonstração' : 'Workspace autenticado'}</span></header>
    {simulated && <div className="sheep-demo-banner" role="note"><strong>Dados e envios simulados.</strong> WhatsApp e Instagram não estão conectados. As alterações ficam somente neste navegador.</div>}
    {error && <div className="sheep-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar erro">×</button></div>}
    <div className="sheep-sr" role="status" aria-live="polite">{notice}</div>
    <div className="sheep-inbox"><section className="sheep-conversation-list" aria-label="Conversas"><div className="sheep-list-top"><h2>Caixa de entrada <span>{items.filter((item) => item.unread).length}</span></h2><label className="sheep-sr" htmlFor="conversation-search">Buscar conversas</label><input id="conversation-search" placeholder="Buscar por nome ou mensagem" value={query} onChange={(event) => search(event.target.value)} /><div className="sheep-filters" aria-label="Filtrar conversas">{[['all','Todos'],['whatsapp','WA'],['instagram','IG'],['unanswered','Não respondidos']].map(([key,label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
    {loading ? <p role="status" className="sheep-empty">Carregando conversas…</p> : visible.length === 0 ? <p className="sheep-empty">Nenhuma conversa encontrada.</p> : visible.map((item) => <button key={item.id} className={`sheep-conversation ${selected?.id === item.id ? 'is-selected' : ''}`} onClick={() => { select(item.id); setDraft(''); setError(''); }} aria-pressed={selected?.id === item.id}><span className={`sheep-avatar ${item.channel}`}>{item.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><span className="sheep-preview"><strong>{item.name}</strong><small>{labels[item.channel]} {item.unread && '· Pendente'}</small><span>{item.messages.at(-1)?.text}</span></span>{item.unread && <span className="sheep-unread" aria-label="Não respondida" />}</button>)}</section>
    {selected ? <section className="sheep-thread" aria-label={`Conversa com ${selected.name}`}><header className="sheep-thread-header"><div><h2>{selected.name}</h2><span>{labels[selected.channel]} · {simulated ? 'Simulado' : 'Canal oficial'}</span></div><button className="sheep-toggle" aria-pressed={!selected.aiPaused} onClick={() => void update({ aiPaused: !selected.aiPaused })}>IA {selected.aiPaused ? 'pausada' : 'ativa'}</button></header><div className="sheep-timeline" role="log" aria-label="Histórico de mensagens">{selected.messages.map((message) => <article key={message.id} className={`sheep-message ${message.direction}`}><p>{message.text}</p><footer><time dateTime={message.at}>{new Date(message.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute:'2-digit' })}</time> · {message.origin === 'simulated' ? 'Simulado' : 'Meta'} {message.status && `· ${message.status}`}</footer></article>)}</div><form className="sheep-compose" onSubmit={reply}><label htmlFor="reply">Resposta manual</label><textarea id="reply" value={draft} maxLength={4096} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva sua mensagem…" rows={3} /><div><small>A intervenção humana pausa a IA.</small><button className="sheep-primary" disabled={!draft.trim() || sending} type="submit">{simulated ? 'Simular envio' : 'Enviar resposta'} ↗</button></div></form></section> : <section className="sheep-empty">Selecione uma conversa para começar.</section>}
    <aside className="sheep-context"><h2>Contexto do contato</h2>{selected ? <><span className="sheep-context-label">RESPONSÁVEL</span><label className="sheep-sr" htmlFor="assignee">Responsável</label><input id="assignee" readOnly={!simulated} value={selected.assignee} placeholder="Sem responsável" onChange={(event) => void update({ assignee: event.target.value, aiPaused: true })} />{!simulated && <button className="sheep-toggle" onClick={() => void update({assignee:'Você',aiPaused:true})}>Atribuir a mim</button>}<span className="sheep-context-label">TRANSFERÊNCIA HUMANA</span><label className="sheep-sr" htmlFor="handoff">Contexto da transferência</label><textarea id="handoff" rows={5} key={selected.id} defaultValue={selected.handoff} placeholder="Registre o motivo e os próximos passos…" onBlur={(event) => {if(event.target.value!==selected.handoff) void update({ handoff: event.target.value, aiPaused: true });}} /><div className="sheep-context-note">{selected.aiPaused ? 'A IA está pausada. O atendimento está sob controle humano.' : 'A IA está ativa para as regras aprovadas.'}</div></> : <p>Nenhum contato selecionado.</p>}</aside></div></section></main>;
}
