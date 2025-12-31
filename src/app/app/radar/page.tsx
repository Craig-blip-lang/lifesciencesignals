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
  } | null; // ✅ account can be null if join blocked / missing
};

type SignalRow = {
  id: string;
  title: string;
  type: string;
  category: string;
  occurred_at: string;
  strength_score: number;
};

type BreakdownRow = {
  signal_id: string;
  title: string;
  type: string;
  category: string;
  occurred_at: string;
  strength_score: number;
  type_weight: number;
  recency_multiplier: number;
  points: number;
  rule: string;
};

function scoreBand(score: number) {
  if (score >= 150) return { label: "Hot", bg: "#111", color: "white" };
  if (score >= 100) return { label: "Warm", bg: "#f7f0d9", color: "#111" };
  return { label: "Low", bg: "#f2f2f2", color: "#111" };
}

function daysAgo(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function LegendPill({
  label,
  range,
  bg,
  border,
}: {
  label: string;
  range: string;
  bg: string;
  border: string;
}) {
  return (
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
}

export default function RadarPage() {
  const [orgId, setOrgId] = useState<string>(""); // ✅ needed for RPC
  const [orgName, setOrgName] = useState<string>("");

  const [rows, setRows] = useState<RadarRow[]>([]);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [signals, setSignals] = useState<Record<string, SignalRow[]>>({});

  // ✅ NEW: last signal timestamp per account
  const [lastSignalAt, setLastSignalAt] = useState<Record<string, string>>({});

  const [status, setStatus] = useState<string>("Loading...");
  const [activeFilterName, setActiveFilterName] = useState<string>("");

  // ✅ NEW: page-level collapsible explainer
  const [helpOpen, setHelpOpen] = useState<boolean>(false);

  // ✅ modal state
  const [whyOpenFor, setWhyOpenFor] = useState<string | null>(null);

  // ✅ breakdown state (RPC)
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState<boolean>(false);
  const [breakdownError, setBreakdownError] = useState<string>("");

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
      setOrgId(theOrgId);

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

    const rows = (data as SignalRow[]) || [];
    setSignals((prev) => ({ ...prev, [accountId]: rows }));

    // ✅ NEW: store most recent signal date (for "Last signal: X days ago")
    if (rows.length > 0) {
      setLastSignalAt((prev) => ({ ...prev, [accountId]: rows[0].occurred_at }));
    }
  }

  function toggleExpand(accountId: string) {
    const next = expandedAccountId === accountId ? null : accountId;
    setExpandedAccountId(next);
    if (next) loadSignals(next);
  }

  async function openWhy(accountId: string) {
    if (!orgId) return;

    // Ensure we have last signal date too (nice to keep consistent)
    await loadSignals(accountId);

    setWhyOpenFor(accountId);
    setBreakdown([]);
    setBreakdownError("");
    setBreakdownLoading(true);

    const { data, error } = await supabase.rpc("get_score_breakdown", {
      p_org_id: orgId,
      p_account_id: accountId,
      p_limit: 10,
    });

    setBreakdownLoading(false);

    if (error) {
      console.error(error);
      setBreakdownError(error.message || "Could not load breakdown.");
      return;
    }

    setBreakdown((data as BreakdownRow[]) || []);
  }

  function closeWhy() {
    setWhyOpenFor(null);
    setBreakdown([]);
    setBreakdownError("");
    setBreakdownLoading(false);
  }

  const whyRow = whyOpenFor ? rows.find((r) => r.account_id === whyOpenFor) : null;
  const breakdownTotal = breakdown.reduce((sum, b) => sum + (b.points || 0), 0);
  const scoreDelta = whyRow ? Math.max(0, (whyRow.buying_pressure_index || 0) - breakdownTotal) : 0;

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

        {/* ✅ Legend */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <LegendPill label="Low" range="0–100" bg="#f7f7f7" border="#ddd" />
          <LegendPill label="Warm" range="100–149" bg="#fff7e6" border="#f0d9a8" />
          <LegendPill label="Hot" range="150+" bg="#ffecec" border="#f0b3b3" />
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      {/* ✅ Collapsible explainer (expand +) */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          background: "white",
          marginBottom: 14,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setHelpOpen((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: 14,
            border: 0,
            background: "white",
            cursor: "pointer",
            textAlign: "left",
          }}
          aria-expanded={helpOpen}
        >
          <div style={{ fontWeight: 800 }}>How to use Account Radar</div>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              border: "1px solid #ddd",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              color: "#111",
              lineHeight: 1,
              userSelect: "none",
            }}
            title={helpOpen ? "Collapse" : "Expand"}
          >
            {helpOpen ? "–" : "+"}
          </div>
        </button>

        {helpOpen && (
          <div style={{ padding: "0 14px 14px 14px", color: "#444", lineHeight: 1.55 }}>
            <div>
              <b>Account Radar</b> helps you focus on the accounts most likely to be actively buying, based on real-world
              signals rather than assumptions. Each account is scored using a <b>Buying Pressure Index</b> that combines
              signal strength, recency, and signal stacking.
            </div>

            <div style={{ marginTop: 10 }}>
              Accounts are ranked by Buying Pressure so you can quickly identify high-intent opportunities. Use{" "}
              <b>View signals</b> to see recent activity behind a score, and <b>Why this score?</b> to understand how
              individual signals contributed to the total.
            </div>

            <div style={{ marginTop: 10 }}>
              If filters are active, Radar only shows accounts that match your targeting criteria such as score
              threshold, country, or signal type. If no accounts appear, try adjusting or clearing the current filter.
            </div>

            <div style={{ marginTop: 10 }}>
              Missing company details (industry, domain, or location) simply mean that information is not yet available
              — scoring is still driven entirely by verified signals and their timing.
            </div>
          </div>
        )}
      </div>

      {status && <p style={{ marginTop: 0 }}>{status}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => {
          const band = scoreBand(r.buying_pressure_index);
          const last = lastSignalAt[r.account_id];

          return (
            <div key={r.account_id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.account?.name ?? "(Unknown account)"}</div>
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
                    {r.account?.segment || "—"} · {r.account?.country || "—"} · {r.account?.domain || "—"}
                  </div>

                  {/* ✅ NEW: "Last signal: X days ago" */}
                  <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                    Last signal: {last ? <b>{daysAgo(last)} days ago</b> : <span style={{ color: "#888" }}>—</span>}
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

      {/* ✅ Modal for score explanation (RPC-backed) */}
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
              width: "min(760px, 100%)",
              background: "white",
              borderRadius: 14,
              border: "1px solid #ddd",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{whyRow.account?.name ?? "(Unknown account)"}</div>
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
              This breakdown shows how points are calculated per signal using scoring rules (type weight + recency
              multiplier). The total Buying Pressure score can be higher than the sum below because it also includes
              account-level momentum/stacking effects across signals.
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
              <div style={{ fontWeight: 700 }}>Signals contributing points</div>

              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                {breakdownLoading ? (
                  <div style={{ color: "#666" }}>Loading breakdown…</div>
                ) : breakdownError ? (
                  <div style={{ color: "red" }}>❌ {breakdownError}</div>
                ) : breakdown.length === 0 ? (
                  <div style={{ color: "#666" }}>No breakdown available.</div>
                ) : (
                  breakdown.map((b) => (
                    <div
                      key={b.signal_id}
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
                        <div style={{ fontWeight: 700 }}>{b.title}</div>
                        <div style={{ color: "#555", marginTop: 3 }}>
                          {b.category} · {b.type} · {b.occurred_at}
                        </div>
                        <div style={{ color: "#777", marginTop: 4, fontSize: 12 }}>
                          strength {b.strength_score} × type {Number(b.type_weight).toFixed(2)} × recency{" "}
                          {Number(b.recency_multiplier).toFixed(2)} · rule {b.rule}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", minWidth: 90 }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{b.points}</div>
                        <div style={{ color: "#777", fontSize: 12 }}>points</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {breakdown.length > 0 && !breakdownLoading && !breakdownError && (
                <div style={{ marginTop: 10, color: "#444" }}>
                  Points from last {breakdown.length} signals: <b>{breakdownTotal}</b>

                  {/* ✅ Explicit explainer showing the delta */}
                  <div style={{ color: "#666", fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>
                    <b>Why is Total higher?</b> The signal list totals <b>{breakdownTotal}</b> base points. We add{" "}
                    <b>{scoreDelta}</b> extra points for <b>account-level momentum/stacking</b> (e.g., multiple recent
                    signals across types), which is why the total is <b>{whyRow.buying_pressure_index}</b>.
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
