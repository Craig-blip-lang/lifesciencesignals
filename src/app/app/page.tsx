"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function AppHome() {
  const [email, setEmail] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();

      if (!auth.user) {
        window.location.href = "/login";
        return;
      }

      setEmail(auth.user.email || "");

      // Ensure profile exists (store email for digests)
      if (auth.user.email) {
        await supabase.from("profiles").upsert({
          id: auth.user.id,
          email: auth.user.email,
        });
      }

      // 1️⃣ Check if user already belongs to an org
      const { data: memberships, error: memErr } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id);

      if (memErr) {
        console.error(memErr);
        setStatus("Could not load your organisation membership.");
        return;
      }

      if (memberships && memberships.length > 0) {
        // User already has an org — fetch its name
        const { data: org, error: orgErr } = await supabase
          .from("orgs")
          .select("name")
          .eq("id", memberships[0].org_id)
          .single();

        if (orgErr) console.error(orgErr);
        if (org) setOrgName(org.name);

        setStatus("Organisation ready ✅");
        return;
      }

      // 2️⃣ Create a new org automatically
      const defaultOrgName = auth.user.email?.split("@")[1] || "My Organisation";

      const { data: newOrg, error: orgCreateError } = await supabase
        .from("orgs")
        .insert({ name: defaultOrgName, created_by: auth.user.id })
        .select()
        .single();

      if (orgCreateError || !newOrg) {
        console.error("Error creating org", orgCreateError);
        setStatus("Error creating organisation (security policy likely blocking).");
        return;
      }

      // 3️⃣ Attach user to org as owner
      const { error: memberErr } = await supabase.from("org_members").insert({
        org_id: newOrg.id,
        user_id: auth.user.id,
        role: "owner",
      });

      if (memberErr) {
        console.error(memberErr);
        setStatus("Organisation created, but membership link failed.");
        return;
      }

      setOrgName(newOrg.name);
      setStatus("Organisation created ✅");
    }

    init();
  }, []);

  // ✅ No logout button here anymore — the top menu (layout) handles logout

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginBottom: 6 }}>Welcome</h2>

      <p style={{ marginTop: 0, color: "#444" }}>
        Signed in as: <b>{email}</b>
        {orgName ? (
          <>
            {" "}
            · Organisation: <b>{orgName}</b>
          </>
        ) : null}
      </p>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      <hr style={{ margin: "20px 0" }} />

      <div style={{ display: "grid", gap: 12 }}>
        <Link
          href="/app/radar"
          style={{
            display: "block",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "#111",
          }}
        >
          <b>Go to Radar</b>
          <div style={{ color: "#555", marginTop: 4 }}>
            View ranked accounts and the signals driving buying pressure.
          </div>
        </Link>

        <Link
          href="/app/filters"
          style={{
            display: "block",
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "#111",
          }}
        >
          <b>Manage Filters</b>
          <div style={{ color: "#555", marginTop: 4 }}>
            Control countries, signal types, thresholds, and digest frequency.
          </div>
        </Link>
      </div>
    </div>
  );
}

