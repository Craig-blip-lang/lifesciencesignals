"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        style={{
          textDecoration: "none",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: active ? "#f2f2f2" : "white",
          color: "#111",
          fontSize: 14,
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ fontFamily: "Arial" }}>
      <div
        style={{
          borderBottom: "1px solid #eee",
          background: "white",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/app" style={{ textDecoration: "none", color: "#111" }}>
              <b>LifeScienceSignals</b>
            </Link>

            <div style={{ display: "flex", gap: 8, marginLeft: 10 }}>
              <NavLink href="/app/radar" label="Radar" />
              <NavLink href="/app/filters" label="Filters" />
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "white",
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 16px" }}>
        {children}
      </div>
    </div>
  );
}
