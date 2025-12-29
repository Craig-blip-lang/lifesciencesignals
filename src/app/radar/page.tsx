"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RadarRow = {
  account_id: string;
  buying_pressure_index: number;
  account: {
    name: string;
    domain: string | null;
    country: string | null;
    segment: string | null;
  };
};

type SignalRow = {
  id: string;
  title: string;
  type: string;
  category: string;
  occurred_at: string;
  strength_score: number;
};

export default function RadarPage() {
  const [orgId, setOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [signals, setSignals] = useState<Record<string, SignalRow[]>>({});
  const [status, setStatus] = useState<string>("Loading...");

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }
      setEmail(auth.user.email || "");

      // get org
      const { data: memberships, error: memErr } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id);

      if (memErr || !memberships || memberships.length === 0) {
        setStatus("Could not load organisation membership.");
        console.error(memErr);
        return;
      }

      const theOrgId = memberships[0].org_id as string;
      setOrgId(theOrgId);

      const { data: org } = await supabase.from("orgs").select("name").eq("id", theOrgId).single();
      setOrgName(org?.name || "");

      // ✅ Load most recent filter
      const { data: filterRows, error: filterErr } = await supabase
        .from("filters")
        .select("id,name,countries,signal_types,min_score")
        .eq("org_id", theOrgId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (filterErr) console.error(filterErr);

      const activeFilter = filterRows && filterRows.length > 0 ? filterRows[0] : null;

      // ✅ Load radar rows
      const { data: radarRows, error: radarErr } = await supabase
        .from("org_account_scores")
        .select(
          `
          account_id,
          buying_pressure_index,
          account:accounts ( name, domain, country, segment )
        `
        )
        .eq("org_id", theOrgId)
        .order("buying_pressure_index", { ascending: false });

      if (radarErr) {
        setStatus("Error loading radar.");
        console.error(radarErr);
        return;
      }

      let filtered = (radarRows as any[]) || [];

      // ✅ Apply min score
      if (activeFilter?.min_score) {
        filtered = filtered.filter((r) => r.buying_pressure_index >= activeFilter.min_score);
      }

      // ✅ Apply country filter
      if (activeFilter?.countries && activeFilter.countries.length > 0) {
        filtered = filtered.filter((r) => activeFilter.countries.includes(r.account?.country));
      }

      // ✅ Apply signal type filter
      if (activeFilter?.signal_types && activeFilter.signal_types.length > 0) {
        const { data: sigTypesRows, error: sigTypesErr } = await supabase
          .from("account_latest_signal_types")
          .select("account_id, signal_types");

        if (sigTypesErr) {
          console.error(sigTypesErr);
        } else {
          const map = new Map<string, string[]>();
          (sigTypesRows as any[]).forEach((row) => map.set(row.account_id, row.signal_types || []));

          filtered = filtered.filter((r) => {
            const types = map.get(r.account_id) || [];
            return types.some((t) => activeFilter.signal_types.includes(t));
          });
        }
      }

      setRows(filtered as any);
      setStatus(activeFilter ? `Filter applied: ${activeFilter.name}` : "");
    }

    init();
  }, []);

  async function loadSignals(accountId: string) {
    if (signals[accountId]) return;

    const { data, error } = await supabase
      .from("signals")
      .select("id,title,type,category,occurred_at,strength_score")
      .eq("account_id", accountId)
      .order("occurred_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error(error);
      return;
    }

    setSignals((prev) => ({ ...prev, [accountId]: (data as SignalRow[]) || [] }));
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function toggleExpand(accountId: string) {
    const next = expandedAccountId === accountId ? null : accountId;
    setExpandedAccountId(next);
    if (next) loadSignals(next);
  }

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>Account Radar</h2>
          <div style={{ color: "#444" }}>
            Signed in as <b>{email}</b> · Org <b>{orgName || "…"}</b>
          </div>
        </div>
        <button
          onClick={logout}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
        >
          Log out
        </button>
      </div>

      <hr style={{ margin: "20px 0" }} />

      {status && <p>{status}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.account_id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{r.account.name}</div>
                <div style={{ color: "#444", marginTop: 4 }}>
                  {r.account.segment || "—"} · {r.account.country || "—"} · {r.account.domain || "—"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{r.buying_pressure_index}</div>
                <div style={{ color: "#666" }}>Buying pressure</div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => toggleExpand(r.account_id)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer" }}
              >
                {expandedAccountId === r.account_id ? "Hide signals" : "View signals"}
              </button>
            </div>

            {expandedAccountId === r.account_id && (
              <div style={{ marginTop: 12 }}>
                {(signals[r.account_id] || []).length === 0 ? (
                  <div style={{ color: "#666" }}>No signals found.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {(signals[r.account_id] || []).map((s) => (
                      <div key={s.id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                        <div style={{ fontWeight: 700 }}>{s.title}</div>
                        <div style={{ color: "#444", marginTop: 4 }}>
                          {s.category} · {s.type} · {s.occurred_at} · score {s.strength_score}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <hr style={{ margin: "20px 0" }} />
      <p style={{ color: "#666" }}>
        Next: daily email digests + instant alerts per filter.
      </p>
    </div>
  );
}
