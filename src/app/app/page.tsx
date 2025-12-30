"use client";

import { useEffect, useState } from "react";
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

      // Check membership
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

      // Create org automatically
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

  const LegendPill = ({
    label,
    range,
    bg,
    border,
  }: {
    label: string;
    range: string;
    bg: string;
    border: string;
  }) => (
    <div
      style={{
        border: `1px solid ${border}`,
        background: bg,
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        color: "#111",
        whiteSpace: "nowrap",
      }}
    >
      <b>{label}</b>
      <span style={{ color: "#444" }}>{range}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: 0 }}>Home</h2>

      <div style={{ color: "#555", marginTop: 6 }}>
        Signed in as <b>{email}</b>
        {orgName ? (
          <>
            {" "}
            · Organisation: <b>{orgName}</b>
          </>
        ) : null}
      </div>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}

      <hr style={{ margin: "18px 0" }} />

      {/* ✅ Scoring explainer box */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 14,
          background: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>How the Buying Pressure score works</h3>
            <p style={{ marginTop: 0, color: "#444", lineHeight: 1.5 }}>
              The <b>Buying Pressure</b> score ranks accounts by how “ready” they look based on detected
              signals. Higher score = higher likelihood they are actively moving.
            </p>
          </div>

          {/* ✅ Score legend */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <LegendPill label="Low" range="0–100" bg="#f7f7f7" border="#ddd" />
            <LegendPill label="Warm" range="100–150" bg="#fff7e6" border="#f0d9a8" />
            <LegendPill label="Hot" range="150+" bg="#ffecec" border="#f0b3b3" />
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
          <div>
            <b>1) Signals add points</b>
            <div style={{ color: "#444", marginTop: 4 }}>
              Each signal contributes points based on strength and relevance.
            </div>
          </div>

          <div>
            <b>2) Recent signals count more</b>
            <div style={{ color: "#444", marginTop: 4 }}>
              New signals matter more than old ones. Recency pushes accounts up the list.
            </div>
          </div>

          <div>
            <b>3) Multiple signals stack</b>
            <div style={{ color: "#444", marginTop: 4 }}>
              Several signals together increase confidence vs a single weak signal.
            </div>
          </div>

          <div>
            <b>4) Your filter sets the threshold</b>
            <div style={{ color: "#444", marginTop: 4 }}>
              Filters control min score, countries, and signal types. Radar shows only what matches.
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #eee",
            background: "#fafafa",
            color: "#333",
          }}
        >
          <b>Quick example:</b> 3 strong recent signals might score <b>160+</b>. One weak old signal might be{" "}
          <b>80</b>.
        </div>
      </div>
    </div>
  );
}
