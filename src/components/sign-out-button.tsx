"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({
  className = "secondary small",
  callbackUrl = "/",
}: {
  className?: string;
  callbackUrl?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => signOut({ callbackUrl })}
      title="Sair da conta"
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
    >
      <LogOut size={14} />
      <span>Sair</span>
    </button>
  );
}
