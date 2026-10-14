"use client";

import { useEffect, useState } from "react";
import type { MemberRole } from "@/server/auth/permissions";

type Member = { userId: string; name: string; email: string; verifiedAt: string | null; role: MemberRole; createdAt: string };
type Invitation = { id: string; email: string; role: "admin" | "member"; expiresAt: string; createdAt: string };

export function TeamManager({ role }: { role: MemberRole }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const canManage = role === "owner" || role === "admin";

  async function refresh() {
    const response = await fetch("/api/team");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a equipe.");
    setMembers(body.members);
    setInvitations(body.invitations);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/team", { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar a equipe.");
        setMembers(body.members);
        setInvitations(body.invitations);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a equipe.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível enviar o convite."); return; }
      setEmail(""); setFeedback(body.message); await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o convite.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(userId: string, nextRole: "admin" | "member") {
    setError(""); setFeedback("");
    const response = await fetch(`/api/team/members/${userId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: nextRole }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Não foi possível alterar o papel."); return; }
    setFeedback(body.message); await refresh();
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remover esta pessoa da equipe?")) return;
    setError(""); setFeedback("");
    const response = await fetch(`/api/team/members/${userId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Não foi possível remover o membro.");
      return;
    }
    setFeedback("Acesso removido."); await refresh();
  }

  async function cancelInvitation(id: string) {
    const response = await fetch(`/api/team/invitations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Não foi possível cancelar o convite.");
      return;
    }
    setInvitations((current) => current.filter((invitation) => invitation.id !== id));
  }

  return <div className="page-content">
    <div className="page-title"><div><p className="eyebrow">ACESSO À LOJA</p><h1>Equipe</h1><p>Convide funcionários e controle os papéis de acesso.</p></div></div>
    {error && <div className="form-error">{error}</div>}{feedback && <div className="feedback">{feedback}</div>}
    {canManage && <form className="panel team-invite-form" onSubmit={invite}>
      <h2>Convidar pessoa</h2>
      <label className="field">E-mail<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label className="field">Papel<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}><option value="member">Funcionário</option>{role === "owner" && <option value="admin">Administrador</option>}</select></label>
      <button className="primary" disabled={busy}>{busy ? "Enviando..." : "Enviar convite"}</button>
      <p>O convite expira em 7 dias. Somente proprietários podem convidar administradores.</p>
    </form>}
    <section className="panel team-panel">
      <h2>Pessoas ({members.length})</h2>
      {loading ? <p>Carregando equipe...</p> : <div className="team-list">{members.map((member) => <div className="team-row" key={member.userId}>
        <div><strong>{member.name}</strong><span>{member.email}</span></div>
        {member.role === "owner" ? <span className="role-badge">Proprietário</span> : role === "owner" ? <select aria-label={`Papel de ${member.name}`} value={member.role} onChange={(event) => updateMember(member.userId, event.target.value as "admin" | "member")}><option value="member">Funcionário</option><option value="admin">Administrador</option></select> : <span className="role-badge">{member.role === "admin" ? "Administrador" : "Funcionário"}</span>}
        {role === "owner" && member.role !== "owner" && <button className="secondary" onClick={() => removeMember(member.userId)}>Remover</button>}
      </div>)}</div>}
    </section>
    {invitations.length > 0 && <section className="panel team-panel"><h2>Convites pendentes ({invitations.length})</h2><div className="team-list">
      {invitations.map((invitation) => <div className="team-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>Expira em {new Date(invitation.expiresAt).toLocaleDateString("pt-BR")}</span></div><span className="role-badge">{invitation.role === "admin" ? "Administrador" : "Funcionário"}</span>{canManage && <button className="secondary" onClick={() => cancelInvitation(invitation.id)}>Cancelar</button>}</div>)}
    </div></section>}
  </div>;
}
