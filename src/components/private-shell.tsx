"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Bell, BookOpen, Box, ChartNoAxesCombined, ChevronDown, CreditCard, Hammer, LayoutDashboard, Layers, LibraryBig, Menu, Plug, Settings, Sparkles, Store, UserRound, X } from "lucide-react";
import type { MemberRole } from "@/server/auth/permissions";
import { GeekMark } from "./tcg-art";

const items = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/products", label: "Produtos", icon: Box },
  { href: "/catalog", label: "Catálogo", icon: LibraryBig },
  { href: "/market", label: "Mercado", icon: ChartNoAxesCombined },
  { href: "/recommendations", label: "Autopilot", icon: Sparkles },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/collections", label: "Coleções geek", icon: BookOpen },
  { href: "/commissions", label: "Encomendas geek", icon: Hammer },
];

export function PrivateShell({ userName, organizationName, role, children }: { userName: string; organizationName: string; role: MemberRole; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const active = usePathname();
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand"><GeekMark/><span>GeekPrice<small>THE COLLECTOR WORKSPACE</small></span><button aria-label="Fechar menu" className="mobile-close" onClick={() => setOpen(false)}><X size={20}/></button></div>
      <div className="workspace"><div className="workspace-avatar">{organizationName.slice(0, 2).toUpperCase()}</div><div><strong>{organizationName}</strong><span>Ambiente da loja</span></div><ChevronDown size={16}/></div>
      <nav aria-label="Menu principal"><p className="nav-label">SEU WORKSPACE</p>{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={active === href ? "active" : ""} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></Link>)}
        <p className="nav-label second">PLATAFORMA</p>
        <Link href="/platform" className={active === "/platform" ? "active" : ""}><Layers size={19}/><span>Meus softwares</span></Link>
        <Link href="/billing" className={active === "/billing" ? "active" : ""}><CreditCard size={19}/><span>Plano e consumo</span></Link>
        <p className="nav-label second">GESTÃO</p>
        <Link href="/store" className={active === "/store" ? "active" : ""}><Store size={19}/><span>Minha loja</span></Link>
        <Link href="/settings" className={active === "/settings" ? "active" : ""}><Settings size={19}/><span>Configurações</span></Link>
        <Link href="/integrations" className={active === "/integrations" ? "active" : ""}><Plug size={19}/><span>Integrações</span></Link>
        {(role === "owner" || role === "admin") && <Link href="/team" className={active === "/team" ? "active" : ""}><UserRound size={19}/><span>Equipe</span></Link>}
      </nav>
      <button className="profile profile-button" onClick={() => signOut({ callbackUrl: "/login" })}><div className="avatar">{userName.slice(0, 2).toUpperCase()}</div><div><strong>{userName}</strong><span>Sair da conta</span></div><ChevronDown size={16}/></button>
    </aside>
    <main><header className="topbar page-topbar"><button aria-label="Abrir menu" aria-expanded={open} className="mobile-menu" onClick={() => setOpen(true)}><Menu size={22}/></button><span className="topbar-breadcrumb">Workspace <span>/</span></span><strong>{active === "/dashboard" ? "Visão geral" : active === "/platform" ? "Meus softwares" : items.find((item) => item.href === active)?.label ?? (active === "/store" ? "Minha loja" : active === "/integrations" ? "Integrações" : active === "/billing" ? "Plano e consumo" : active === "/team" ? "Equipe" : "Configurações")}</strong><span className="topbar-tcg"><i/> TCG WORKSPACE <Sparkles size={14}/></span></header><div key={active} className="workspace-page-enter">{children}</div></main>
    {open && <div className="backdrop" onClick={() => setOpen(false)}/>} 
  </div>;
}
