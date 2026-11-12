import { useMemo } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { Activity, BookOpen, Boxes, ClipboardList, DoorOpen, House, Leaf, ListChecks, LockKeyhole, ShieldCheck, UsersRound, UserRoundSearch, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import Reception from "./Reception";
import Relationship from "./Relationship";
import Queue from "./Queue";
import Cronogramas from "./Cronogramas";
import { AuditPage, CleaningPage, InventoryPage, LibraryPage, ManagementPage, TeamPage } from "./Modules";
import NotFound from "./NotFound";

const links: Array<{ href: string; label: string; icon: LucideIcon; group: string; roles?: string[] }> = [
  { href: "/", label: "Recepção", icon: House, group: "Operação" },
  { href: "/relacionamento", label: "Relacionamento", icon: UserRoundSearch, group: "Operação", roles: ["admin", "manager", "reception", "professional"] },
  { href: "/lista-da-vez", label: "Lista da Vez", icon: ListChecks, group: "Operação", roles: ["admin", "manager", "reception", "professional"] },
  { href: "/procedimentos", label: "Procedimentos", icon: BookOpen, group: "Biblioteca" },
  { href: "/treinamentos", label: "Treinamentos", icon: ClipboardList, group: "Biblioteca" },
  { href: "/cronogramas", label: "Cronogramas · revisão", icon: ClipboardList, group: "Gestão", roles: ["admin", "manager"] },
  { href: "/estoque", label: "Controles · Estoque", icon: Boxes, group: "Setores", roles: ["admin", "manager", "controls"] },
  { href: "/ambientizacao", label: "Ambientização", icon: Leaf, group: "Setores", roles: ["admin", "manager", "cleaning"] },
  { href: "/gestao", label: "Gestão", icon: Activity, group: "Gestão", roles: ["admin", "manager"] },
  { href: "/equipe", label: "Equipe", icon: UsersRound, group: "Gestão", roles: ["admin"] },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck, group: "Gestão", roles: ["admin", "manager"] },
];

function LoginScreen() {
  return <div className="login-screen"><section className="login-card"><img src="/elab-logo.png" alt="e.lab. Boutique" style={{ width: 58, height: 58, objectFit: "cover", marginBottom: 16 }} /><div className="elab-micro">e.lab. boutique · operação integrada</div><h1>O cuidado começa na recepção.</h1><p>Entre com sua conta Manus autorizada para acessar a operação, os relacionamentos e os módulos da equipe.</p><button className="button" onClick={() => startLogin()}><LockKeyhole size={14} /> Entrar com Manus</button><p style={{ marginTop: 18, fontSize: 9 }}>O Meu Perfil E.lab tem uma rota pública própria; os módulos internos permanecem restritos.</p></section></div>;
}

function RestrictedScreen({ email, signOut }: { email: string; signOut: () => void }) {
  return <div className="login-screen"><section className="login-card"><div className="elab-micro">acesso controlado</div><h1>Este espaço é reservado.</h1><p>A conta {email || "atual"} ainda não foi autorizada pela Gestão. Não há dados da operação disponíveis nesta sessão.</p><button className="button secondary" onClick={signOut}><DoorOpen size={14} /> Sair</button></section></div>;
}

function Loading() { return <div className="login-screen"><div className="elab-micro">e.lab. · preparando seu espaço</div></div>; }

function StaffContent({ role }: { role: string }) {
  return <Switch>
    <Route path="/">{() => <Reception />}</Route>
    <Route path="/recepcao">{() => <Reception />}</Route>
    <Route path="/relacionamento">{() => <Relationship role={role} />}</Route>
    <Route path="/lista-da-vez">{() => <Queue />}</Route>
    <Route path="/procedimentos">{() => <LibraryPage kind="procedimentos" />}</Route>
    <Route path="/treinamentos">{() => <LibraryPage kind="treinamentos" />}</Route>
    <Route path="/cronogramas">{() => ["admin", "manager"].includes(role) ? <Cronogramas /> : <NotFound />}</Route>
    <Route path="/estoque">{() => <InventoryPage />}</Route>
    <Route path="/ambientizacao">{() => <CleaningPage />}</Route>
    <Route path="/gestao">{() => <ManagementPage />}</Route>
    <Route path="/equipe">{() => <TeamPage />}</Route>
    <Route path="/auditoria">{() => <AuditPage />}</Route>
    <Route component={NotFound} />
  </Switch>;
}

export default function StaffShell() {
  const [location] = useLocation();
  const auth = trpc.auth.me.useQuery(undefined, { staleTime: 30_000, retry: false });
  const access = trpc.access.me.useQuery(undefined, { enabled: Boolean(auth.data), retry: false, staleTime: 15_000 });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.assign("/"); }, onError: error => toast.error(error.message) });
  const visibleLinks = useMemo(() => links.filter(link => !link.roles || (access.data?.role && link.roles.includes(access.data.role))), [access.data?.role]);

  if (auth.isLoading || (auth.data && access.isLoading)) return <Loading />;
  if (!auth.data) return <LoginScreen />;
  if (access.isError || !access.data?.allowed) return <RestrictedScreen email={auth.data.email ?? ""} signOut={() => logout.mutate()} />;

  const currentName = access.data.name ?? "Equipe";
  const currentRole = access.data.role ?? "reception";
  const title = visibleLinks.find(link => link.href === location)?.label ?? "Recepção";
  const groups = [...new Set(visibleLinks.map(link => link.group))];
  const nav = (mobile = false) => <nav className={mobile ? "mobile-nav" : "nav-list"}>{visibleLinks.map(item => {
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} className={`nav-link ${location === item.href ? "active" : ""}`}><Icon /><span>{item.label}</span></Link>;
  })}</nav>;

  return <div className="elab-app"><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><img className="brand-logo" src="/elab-logo.png" alt="e.lab. Boutique" /><strong>e.lab.</strong><span>boutique</span></a>
      {groups.map(group => <div key={group}><div className="sidebar-label">{group}</div>{navForGroup(visibleLinks, group)}</div>)}
      <div className="sidebar-foot">Painel integrado<br />Atualização entre dispositivos ativa</div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="topbar-title">{title} <span style={{ color: "var(--sand-deep)" }}> / </span> experiência de cuidado</span><div className="topbar-right"><div className="user-chip"><span className="avatar-dot">{(currentName || "E").slice(0, 1).toUpperCase()}</span><span>{currentName} · {roleLabel(currentRole)}</span></div><button className="button subtle" aria-label="Sair" onClick={() => logout.mutate()}><DoorOpen size={14} /> Sair</button></div></header>
      <StaffContent role={currentRole} />
    </div>
    {nav(true)}
  </div></div>;
}

function navForGroup(items: typeof links, group: string) {
  return <nav className="nav-list">{items.filter(item => item.group === group).map(item => {
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} className={`nav-link ${window.location.pathname === item.href ? "active" : ""}`}><Icon /><span>{item.label}</span></Link>;
  })}</nav>;
}
function roleLabel(role: string) { return ({ admin: "Gestão", manager: "Gestão", reception: "Recepção", professional: "Profissional", controls: "Controles", cleaning: "Ambientização" } as Record<string, string>)[role] ?? "Equipe"; }
