import Image from "next/image";
import { type ReactNode } from "react";
import {
  LayoutDashboard,
  MessagesSquare,
  Columns3,
  Settings,
} from "lucide-react";
export function Logo() {
  return (
    <span className="a2-logo">
      <Image
        src="/brand/identity.png"
        alt="A2 CRM"
        width={1536}
        height={1024}
        priority
      />
    </span>
  );
}
export function Navigation({
  simulated = false,
  active,
}: {
  simulated?: boolean;
  active: string;
}) {
  const links = [
    [
      "dashboard",
      "Visão geral",
      LayoutDashboard,
      simulated ? "/demo/dashboard" : "/dashboard",
    ],
    [
      "conversations",
      "Conversas",
      MessagesSquare,
      simulated ? "/demo" : "/conversas",
    ],
    ["deals", "Negócios", Columns3, simulated ? "/demo/crm" : "/negocios"],
    ["settings", "Configurações", Settings, "/onboarding"],
  ] as const;
  return (
    <aside className="sheep-navigation">
      <a
        href={simulated ? "/demo/dashboard" : "/dashboard"}
        className="sheep-brand"
      >
        <Logo />
      </a>
      <nav aria-label="Navegação principal">
        {links.map(([key, label, Icon, url]) => (
          <a
            key={key}
            href={url}
            aria-current={active === key ? "page" : undefined}
          >
            <Icon size={19} />
            <span>{label}</span>
          </a>
        ))}
        {!simulated && (
          <form action="/auth/signout" method="post">
            <button className="nav-signout" type="submit">
              Sair
            </button>
          </form>
        )}
      </nav>
      <div className="sheep-nav-bottom">
        A2 CRM
        <br />
        Atendimento × Automação
      </div>
    </aside>
  );
}
export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <dialog
      open
      className="a2-drawer"
      ref={(node) => {
        if (node && !node.matches(":modal")) {
          node.close();
          node.showModal();
        }
      }}
      onCancel={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button autoFocus onClick={onClose} aria-label="Fechar detalhes">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
