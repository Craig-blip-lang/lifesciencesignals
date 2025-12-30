"use client";

import Image from "next/image";
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
    const active =
      href === "/app"
        ? pathname === "/app" // ✅ Home only active on exact match
        : pathname.startsWith(href); // ✅ Other tabs active on sub-routes

    return (
      <Link
        href={href}
        style={{
          textDecoration: "none",
          padding: "8px 12px",
          borderRadius: 10,
          border: active ? "1px solid #111" : "1px solid #ddd",
          background: active ? "#111" : "white",
          color: active ? "white" : "#111",
          fontSize: 14,
          fontWeight: active ? 600 : 400,
          transition: "all 0.15s ease",
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* ✅ Logo (visual only, not clickable) */}
            <Image
              src="/logo/logo.svg" // change to /logo/logo.png if needed
              alt="LifeScienceSignals"
              width={240}
              height={120}
              priority
            />

            {/* ✅ Navigation */}
            <div style={{ display: "flex", gap: 8 }}>
              <NavLink href="/app" label="Home" />
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

