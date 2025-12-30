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

function scoreBand(score: number) {
  if (score >= 150) return { label: "Hot", bg: "#111", color: "white" };
  if (score >= 100) return { label: "Warm", bg: "#f7f0d9", color: "#111" };
  return { label: "Low", bg: "#f2f2f2", color: "#111" };
}

export default function RadarPage() {
  const [orgName, setOrgName] = useState<string>("");
  const [rows, setRows] = useState<RadarRow[]>([]);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [signals, setSignals] = useState<Record<string, SignalRow[]>>({});
  const [status, setStatus] = useState<string>("Loading...");
  const [activeFilterName, setActiveFilterName] = useState<string>("");

  // ✅ new: score explainer modal state
  const [whyOpenFor, setWhyOpenFor] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }

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

      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("name")
        .eq("id", theOrgId)
        .single();

      if (orgErr) console.error(orgErr);
      setOrgName(org?.name || "");

      // Load most recent filter
      const { data: filterRows, error: filterErr } = await supabase
        .from("filters")
        .select("id,name,countries,signal_types,min_score")
        .eq("org_id", theOrgId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (filterErr) console.error(filterErr);
      const activeFilter = filterRows && filterRows.length > 0 ? filterRows[0] : null;
      setActiveFilterName(activeFilter?.name || "");

      // Load radar rows
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

      if (activeFilter?.min_score) {
        filtered = filtered.filter((r) => r.buying_pressure_index >= activeFilter.min_score);
      }

      if (activeFilter?.countries && activeFilter.countries.length > 0) {
        filtered = filtered.filter((r) => activeFilter.countries.includes(r.account?.country));
      }

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
      setStatus(filtered.length === 0 ? "No accounts match your current filter." : "");
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

  function toggleExpand(accountId: string) {
    const next = expandedAccountId === accountId ? null : accountId;
    setExpandedAccountId(next);
    if (next) loadSignals(next);
  }

  async function openWhy(accountId: string) {
    // ensure signals are loaded so we can explain
    await loadSignals(accountId);
    setWhyOpenFor(accountId);
  }

  function closeWhy() {
    setWhyOpenFor(null);
  }

  const whyRow = whyOpenFor ? rows.find((r) => r.account_id === whyOpenFor) : null;
  const whySignals = whyOpenFor ? signals[whyOpenFor] || [] : [];

  const approxSignalTotal = whySignals.reduce((sum, s) => sum + (s.strength_score || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0 }}>Account Radar</h2>
          <div style={{ color: "#555", marginTop: 6 }}>
            Org <b>{orgName || "…"}</b>
            {activeFilterName ? (
              <>
                {" "}
                · Filter{" "}
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: "#f7f7f7",
                    fontSize: 12,
                  }}
                >
                  {activeFilterName}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      {status && <p style={{ marginTop: 0 }}>{status}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const band = scoreBand(r.buying_pressure_index);
          return (
            <div key={r.account_id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.account.name}</div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: band.bg,
                        color: band.color,
                        fontSize: 12,
                        border: "1px solid #ddd",
                      }}
                    >
                      {band.label}
                    </span>
                  </div>

                  <div style={{ color: "#444", marginTop: 4 }}>
                    {r.account.segment || "—"} · {r.account.country || "—"} · {r.account.domain || "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{r.buying_pressure_index}</div>
                  <div style={{ color: "#666" }}>Buying pressure</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => toggleExpand(r.account_id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  {expandedAccountId === r.account_id ? "Hide signals" : "View signals"}
                </button>

                <button
                  onClick={() => openWhy(r.account_id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Why this score?
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
                            {s.category} · {s.type} · {s.occurred_at} · signal score {s.strength_score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ✅ Simple modal for score explanation */}
      {whyOpenFor && whyRow && (
        <div
          onClick={closeWhy}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              background: "white",
              borderRadius: 14,
              border: "1px solid #ddd",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{whyRow.account.name}</div>
                <div style={{ color: "#555", marginTop: 4 }}>
                  Total Buying Pressure: <b>{whyRow.buying_pressure_index}</b>
                </div>
              </div>

              <button
                onClick={closeWhy}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "white",
                }}
              >
                Close
              </button>
            </div>

            <hr style={{ margin: "14px 0" }} />

            <div style={{ color: "#444", lineHeight: 1.5 }}>
              This is a simple breakdown using the most recent signals we have for this account. Each signal has a{" "}
              <b>strength_score</b> and those scores contribute to buying pressure (recency + stacking affects the final
              number).
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 700 }}>Recent signals (points)</div>
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {whySignals.length === 0 ? (
                  <div style={{ color: "#666" }}>No signals loaded yet.</div>
                ) : (
                  whySignals.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        background: "white",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{s.title}</div>
                        <div style={{ color: "#555", marginTop: 3 }}>
                          {s.category} · {s.type} · {s.occurred_at}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 70 }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{s.strength_score}</div>
                        <div style={{ color: "#777", fontSize: 12 }}>points</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {whySignals.length > 0 && (
                <div style={{ marginTop: 10, color: "#444" }}>
                  Approx signal points (last 5): <b>{approxSignalTotal}</b>
                  <div style={{ color: "#777", fontSize: 12, marginTop: 3 }}>
                    Note: buying pressure may also include weighting for recency + stacking beyond the last 5 signals.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
