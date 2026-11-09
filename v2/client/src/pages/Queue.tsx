import { useMemo, useState } from "react";
import { CalendarPlus, Check, Clock3, Plus, RefreshCw, UserRound, UserX } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { inverseOrder, order, QUEUE_SERVICES, type QueueServiceId, type QueueState } from "../../../shared/queueLogic";

export default function Queue() {
  const [service, setService] = useState<QueueServiceId>("hair");
  const [view, setView] = useState<"now" | "agenda">("now");
  const [newPerson, setNewPerson] = useState("");
  const [client, setClient] = useState("");
  const [when, setWhen] = useState("");
  const query = trpc.queue.list.useQuery(undefined, { refetchInterval: 3000, refetchOnWindowFocus: true });
  const events = trpc.queue.events.useQuery({ service }, { refetchInterval: 5000 });
  const utils = trpc.useUtils();
  const mutate = trpc.queue.mutate.useMutation({ onSuccess: () => { utils.queue.list.invalidate(); utils.queue.events.invalidate(); }, onError: error => { toast.error(error.message); utils.queue.list.invalidate(); } });
  const selected = query.data?.find(item => item.id === service);
  const state = selected?.state as unknown as QueueState | undefined;
  const currentOrder = useMemo(() => state ? (view === "now" ? order(state) : inverseOrder(state)) : [], [state, view]);
  // Keep ineligible people visible so their status can be restored.
  const inactivePeople = (state?.people ?? []).filter(person => !currentOrder.includes(person));
  const next = state?.nextUp ?? null;
  const future = (state?.futureQueue ?? []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));

  function send(event: Parameters<typeof mutate.mutate>[0]["event"]) {
    if (!selected) return;
    mutate.mutate({ service, expectedRevision: selected.revision, event });
  }
  function add() {
    const name = newPerson.trim();
    if (!name) return;
    send({ type: "added", person: name }); setNewPerson("");
  }
  function schedule(event: React.FormEvent) {
    event.preventDefault();
    if (!client.trim() || !when) return;
    send({ type: "scheduled", client: client.trim(), at: new Date(when).toISOString() }); setClient(""); setWhen("");
  }

  return <main className="content">
    <div className="page-head"><div><div className="elab-micro">operação · lista da vez</div><h1>Uma fila, todos os aparelhos.</h1><p className="page-sub">A ordem e os estados são compartilhados. Se houver uma alteração simultânea, a Lista avisa e atualiza sem sobrescrever silenciosamente.</p></div><span className="badge green">Sincronização ativa · atualização em poucos segundos</span></div>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="toolbar" style={{ justifyContent: "space-between" }}><div className="period-tabs">{QUEUE_SERVICES.map(item => <button key={item.id} className={`period-tab ${service === item.id ? "active" : ""}`} onClick={() => setService(item.id)}>{item.label}</button>)}</div><div className="period-tabs"><button className={`period-tab ${view === "now" ? "active" : ""}`} onClick={() => setView("now")}>Agora</button><button className={`period-tab ${view === "agenda" ? "active" : ""}`} onClick={() => setView("agenda")}>Agenda</button></div></div>
    </div>
    <div className="panel-grid two">
      <section className="card">
        <div className="card-heading"><div><h2>{QUEUE_SERVICES.find(item => item.id === service)?.label}</h2><p>Próxima pessoa: {next || "ainda não definida"}</p></div><span className="badge">Versão {selected?.revision ?? 0}</span></div>
        <form className="toolbar" onSubmit={event => { event.preventDefault(); add(); }} style={{ marginBottom: 12 }}><input className="field" style={{ flex: 1, minWidth: 120 }} value={newPerson} onChange={event => setNewPerson(event.target.value)} placeholder="Adicionar profissional à fila" maxLength={100} /><button className="button" disabled={!newPerson.trim() || mutate.isPending}><Plus size={13} /> Adicionar</button></form>
        {!state?.people.length ? <div className="empty-state">A fila deste serviço está vazia.</div> : [...currentOrder, ...inactivePeople].map((person, index) => {
          const status = state.absent.includes(person) ? "Ausente" : state.occupied.includes(person) ? "Ocupada" : "Presente";
          const eligible = currentOrder.includes(person);
          return <div className="queue-person" key={person}><span className={`queue-index ${view === "now" && index === 0 && eligible ? "next" : ""}`}>{eligible ? index + 1 : "—"}</span><div><div className="list-title">{person}</div><div className="list-meta">{status} · {state.weeklyCount[person] ?? 0} atendimentos na semana{person === next ? " · próxima da vez" : ""}</div></div><div className="toolbar">
            <button className="button secondary" title="Alternar status" onClick={() => send({ type: "status", person, to: status === "Presente" ? "occupied" : status === "Ocupada" ? "absent" : "present" })}><UserRound size={13} /> {status === "Presente" ? "Ocupar" : status === "Ocupada" ? "Ausente" : "Retorno"}</button>
            <button className="button secondary" disabled={!eligible} onClick={() => send({ type: "pass", person, mode: view })}>Passar</button>
            <button className="button" disabled={!eligible} onClick={() => send({ type: "attendance", person })}><Check size={13} /> Atendeu</button>
            <button className="button subtle" title="Retirar da lista" onClick={() => { if (window.confirm(`Retirar ${person} da fila?`)) send({ type: "removed", person }); }}><UserX size={13} /></button>
          </div></div>;
        })}
        <p className="list-meta" style={{ marginTop: 10 }}>As pessoas ausentes ou ocupadas ficam fora da fila elegível. A ocupação preserva a posição de próxima vez.</p>
      </section>
      <section className="card">
        <div className="card-heading"><div><h2>Agenda</h2><p>Agendamentos futuros associados a este serviço.</p></div><CalendarPlus size={17} color="var(--gold)" /></div>
        <form className="form-row" onSubmit={schedule}>
          <div className="form-grid"><label><span className="field-label">Cliente</span><input className="field" value={client} onChange={event => setClient(event.target.value)} maxLength={120} /></label><label><span className="field-label">Data e hora</span><input className="field" type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} /></label></div>
          <button className="button secondary" disabled={!client.trim() || !when || mutate.isPending}><CalendarPlus size={13} /> Adicionar à agenda</button>
        </form>
        {future.length ? <div className="list-stack">{future.map(row => <div className="list-row" key={String(row.eventId)}><div><div className="list-title">{String(row.client || "Cliente")}</div><div className="list-meta"><Clock3 size={12} style={{ verticalAlign: "middle" }} /> {new Date(String(row.at)).toLocaleString("pt-BR")}</div></div><button className="button subtle" onClick={() => send({ type: "schedule-removed", eventId: String(row.eventId) })}>Remover</button></div>)}</div> : <div className="empty-state">Nenhum horário futuro registrado.</div>}
        <div className="card-heading" style={{ marginTop: 22 }}><div><h2>Eventos recentes</h2><p>Registro de mudanças compartilhado entre sessões.</p></div><RefreshCw size={15} color="var(--gold)" /></div>
        {events.data?.length ? <div className="list-stack">{events.data.slice(0, 8).map(event => <div className="list-row" key={event.id}><div><div className="list-title">{event.type}</div><div className="list-meta">{event.actorEmail} · {new Date(event.createdAt).toLocaleString("pt-BR")}</div></div><span className="badge">{event.service}</span></div>)}</div> : <div className="list-meta">Ainda não há eventos registrados para esta lista.</div>}
      </section>
    </div>
  </main>;
}
