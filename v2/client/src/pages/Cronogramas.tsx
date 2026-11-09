import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { trpc } from "@/lib/trpc";
import catalog from "../../../data/cronogramas-operacionais.json";

type Area = "all" | "reception" | "stock" | "cleaning";
const areaLabels: Record<Area, string> = {
  all: "Todos os setores",
  reception: "Recepção",
  stock: "Estoque",
  cleaning: "Limpeza",
};
const cadenceLabels: Record<string, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  three_per_week: "3 vezes na semana",
  on_demand: "Sob demanda",
};

/** Catálogo de importação em conferência: não gera execuções nem altera o banco. */
export default function Cronogramas() {
  const [area, setArea] = useState<Area>("all");
  const [query, setQuery] = useState("");
  const fromDb = trpc.calendar.list.useQuery(undefined, { retry: false });
  const sourceRows = fromDb.data?.length ? fromDb.data.map(item => ({
    id: item.id, area: item.area, title: item.title, cadence: item.cadence,
    when: item.whenText, sourceKey: item.sourceKey, active: item.active,
  })) : catalog.routines.map(item => ({
    id: item.id, area: item.area, title: item.title, cadence: item.cadence,
    when: item.when, sourceKey: item.sourceKey, active: false,
  }));
  const rows = useMemo(() => sourceRows.filter(item =>
    (area === "all" || item.area === area) &&
    `${item.title} ${item.when} ${item.cadence}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))
  ), [area, query, fromDb.data]);

  return <main className="content">
    <div className="page-head"><div>
      <div className="elab-micro">e.lab. 2.0 · importação conferível</div>
      <h1>Cronogramas do Drive.</h1>
      <p className="page-sub">{catalog.counts.total} atividades preservadas com setor e frequência. Nenhuma execução ou histórico foi importado.</p>
    </div><ClipboardList size={22} color="var(--gold)" /></div>
    <div className="notice" style={{ marginBottom: 18 }}>
      Em conferência: os registros abaixo são uma prévia do catálogo. Ainda não entram nos percentuais de conclusão, não substituem as rotinas atuais e não criam pendências para a equipe.
    </div>
    <p className="list-meta" style={{ marginBottom: 15 }}>{fromDb.data?.length ? "Catálogo lido do banco operacional em staging." : "Prévia local; banco ainda não confirmou o catálogo."}</p>
    <div className="toolbar" style={{ marginBottom: 16 }}>
      <select className="select" value={area} onChange={event => setArea(event.target.value as Area)} aria-label="Filtrar setor">
        {(Object.keys(areaLabels) as Area[]).map(key => <option key={key} value={key}>{areaLabels[key]}</option>)}
      </select>
      <input className="field" style={{ flex: 1, minWidth: 160 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar uma atividade" aria-label="Buscar atividade" />
      <span className="badge">{rows.length} atividades</span>
    </div>
    <section className="card"><div className="table-wrap"><table className="table">
      <thead><tr><th>Setor</th><th>Atividade</th><th>Frequência</th><th>Quando</th><th>Estado</th></tr></thead>
      <tbody>{rows.map(item => <tr key={item.id}>
        <td>{areaLabels[item.area as Area]}</td>
        <td><strong>{item.title}</strong></td>
        <td><span className="badge">{cadenceLabels[item.cadence] ?? item.cadence}</span></td>
        <td>{item.when}</td>
        <td><span className="badge">{item.active ? "Ativa" : "Em conferência"}</span></td>
      </tr>)}</tbody>
    </table></div>{rows.length === 0 && <div className="empty-state">Nenhuma atividade encontrada.</div>}</section>
  </main>;
}
