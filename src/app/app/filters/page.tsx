"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type FilterRow = {
  id: string;
  name: string;
  countries: string[] | null;
  signal_types: string[] | null;
  min_score: number;
  digest_frequency: string;
  email_alerts: boolean;
};

const COUNTRY_OPTIONS = ["IE", "UK", "DE", "FR", "NL", "BE", "ES", "IT", "CH", "SE", "DK", "PL", "AT"];

type SignalGroup = { label: string; items: string[] };

// Expanded + grouped signals (UI-friendly)
const SIGNAL_GROUPS: SignalGroup[] = [
  {
    label: "Validation & Quality",
    items: [
      "CSV_HIRING",
      "ANNEX11_HIRING",
      "DATA_INTEGRITY_HIRING",
      "QA_SYSTEMS_HIRING",
      "AUDIT_READINESS",
      "GXP_COMPLIANCE",
      "ELECTRONIC_RECORDS",
      "ELECTRONIC_SIGNATURES",
      "QUALITY_COMPLIANCE",
      "QUALITY_ENGINEERING",
      "QUALITY_ASSURANCE",
    ],
  },
  {
    label: "Manufacturing & Operations",
    items: [
      "MANUFACTURING_MANAGEMENT",
      "MANUFACTURING_ENGINEERING",
      "PROCESS_ENGINEERING",
      "PRODUCTION_ENGINEERING",
      "OPERATIONS_MANAGEMENT",
      "TECHNICAL_OPERATIONS",
      "CONTINUOUS_IMPROVEMENT",
      "LEAN_MANUFACTURING",
      "OPERATIONAL_EXCELLENCE",
    ],
  },
  {
    label: "Automation & Digital",
    items: [
      "INDUSTRIAL_AUTOMATION",
      "PLC_SCADA",
      "DCS_AUTOMATION",
      "ROBOTICS_AUTOMATION",
      "INDUSTRY_4_0",
      "SMART_FACTORY",
      "DIGITAL_MANUFACTURING",
    ],
  },
  {
    label: "MES / LIMS / MOM",
    items: [
      "MES_LIMS_HIRING",
      "MES_IMPLEMENTATION",
      "LIMS_ADMIN",
      "MOM_SYSTEMS",
      "SHOP_FLOOR_SYSTEMS",
      "BATCH_RECORDS",
      "ELECTRONIC_BATCH_RECORDS",
    ],
  },
  {
    label: "Traceability & Supply Chain",
    items: [
      "SERIALIZATION_HIRING",
      "TRACK_AND_TRACE",
      "TRACEABILITY_PROGRAM",
      "SUPPLY_CHAIN_VISIBILITY",
      "WAREHOUSE_SYSTEMS",
      "WMS_TMS",
      "LOGISTICS_TECH",
      "ANTI_COUNTERFEITING",
    ],
  },
  {
    label: "IT & Architecture",
    items: [
      "IT_OT_CONVERGENCE",
      "SYSTEMS_INTEGRATION",
      "ENTERPRISE_ARCHITECTURE",
      "SAP_MANUFACTURING",
      "ERP_INTEGRATION",
      "DATA_ARCHITECTURE",
      "MASTER_DATA_MANAGEMENT",
    ],
  },
  {
    label: "CapEx & Facilities",
    items: [
      "CAPITAL_PROJECTS",
      "FACILITY_EXPANSION",
      "NEW_SITE_STARTUP",
      "GREENFIELD_SITE",
      "BROWNFIELD_UPGRADE",
      "ENGINEERING_PROJECTS",
      "TECH_TRANSFER",
    ],
  },
  {
    label: "Sustainability",
    items: [
      "SUSTAINABILITY_SYSTEMS",
      "CARBON_TRACKING",
      "CSRD_READINESS",
      "EUDR_COMPLIANCE",
      "DIGITAL_PRODUCT_PASSPORT",
      "RESPONSIBLE_SOURCING",
    ],
  },
];

// Flattened list (kept for logic convenience)
const SIGNAL_OPTIONS = SIGNAL_GROUPS.flatMap((g) => g.items);

function prettySignal(s: string) {
  return s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FiltersPage() {
  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");

  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [status, setStatus] = useState<string>("");

  // Form state
  const [filterName, setFilterName] = useState("EU Default");
  const [countries, setCountries] = useState<string[]>(["IE", "UK", "DE"]);
  const [signalTypes, setSignalTypes] = useState<string[]>(["CSV_HIRING", "ANNEX11_HIRING"]);
  const [minScore, setMinScore] = useState<number>(120);
  const [digest, setDigest] = useState<string>("daily");
  const [emailAlerts, setEmailAlerts] = useState<boolean>(true);

  // UI helpers
  const [signalSearch, setSignalSearch] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [highIntentOnly, setHighIntentOnly] = useState(false);

  // Optional: mark which are "high intent"
  const HIGH_INTENT = useMemo(
    () =>
      new Set<string>([
        "CSV_HIRING",
        "ANNEX11_HIRING",
        "DATA_INTEGRITY_HIRING",
        "QA_SYSTEMS_HIRING",
        "MES_LIMS_HIRING",
        "MES_IMPLEMENTATION",
        "ELECTRONIC_BATCH_RECORDS",
        "SERIALIZATION_HIRING",
        "TRACK_AND_TRACE",
        "FACILITY_EXPANSION",
        "NEW_SITE_STARTUP",
        "CAPITAL_PROJECTS",
        "PLC_SCADA",
        "INDUSTRIAL_AUTOMATION",
        "IT_OT_CONVERGENCE",
        "SYSTEMS_INTEGRATION",
      ]),
    []
  );

  // Optional: mark which are alert-eligible (keep lean; adjust later)
  const ALERT_ELIGIBLE = useMemo(
    () =>
      new Set<string>([
        "CSV_HIRING",
        "ANNEX11_HIRING",
        "DATA_INTEGRITY_HIRING",
        "QA_SYSTEMS_HIRING",
        "AUDIT_READINESS",
        "GXP_COMPLIANCE",
        "ELECTRONIC_RECORDS",
        "ELECTRONIC_SIGNATURES",
        "MANUFACTURING_MANAGEMENT",
        "INDUSTRIAL_AUTOMATION",
        "PLC_SCADA",
        "DCS_AUTOMATION",
        "MES_LIMS_HIRING",
        "MES_IMPLEMENTATION",
        "ELECTRONIC_BATCH_RECORDS",
        "SERIALIZATION_HIRING",
        "TRACK_AND_TRACE",
        "TRACEABILITY_PROGRAM",
        "SUPPLY_CHAIN_VISIBILITY",
        "IT_OT_CONVERGENCE",
        "SYSTEMS_INTEGRATION",
        "CAPITAL_PROJECTS",
        "FACILITY_EXPANSION",
        "NEW_SITE_STARTUP",
        "TECH_TRANSFER",
        "CARBON_TRACKING",
        "CSRD_READINESS",
        "DIGITAL_PRODUCT_PASSPORT",
      ]),
    []
  );

  const filteredSignalGroups = useMemo(() => {
    const q = signalSearch.trim().toLowerCase();

    const match = (s: string) => {
      if (alertsOnly && !ALERT_ELIGIBLE.has(s)) return false;
      if (highIntentOnly && !HIGH_INTENT.has(s)) return false;
      if (!q) return true;
      return s.toLowerCase().includes(q) || prettySignal(s).toLowerCase().includes(q);
    };

    return SIGNAL_GROUPS.map((g) => ({
      label: g.label,
      items: g.items.filter(match),
    })).filter((g) => g.items.length > 0);
  }, [signalSearch, alertsOnly, highIntentOnly, ALERT_ELIGIBLE, HIGH_INTENT]);

  useEffect(() => {
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }
      setEmail(auth.user.email || "");

      // find org membership
      const { data: memberships, error: memErr } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id);

      if (memErr) {
        setStatus("Membership error: " + memErr.message);
        console.error(memErr);
        return;
      }

      if (!memberships || memberships.length === 0) {
        setStatus("No organisation membership found for this user.");
        return;
      }

      const theOrgId = memberships[0].org_id as string;
      setOrgId(theOrgId);

      const { data: org, error: orgErr } = await supabase.from("orgs").select("name").eq("id", theOrgId).single();

      if (orgErr) console.error(orgErr);
      setOrgName(org?.name || "");

      await loadFilters(theOrgId);
    }

    init();
  }, []);

  async function loadFilters(theOrgId: string) {
    const { data, error } = await supabase
      .from("filters")
      .select("id,name,countries,signal_types,min_score,digest_frequency,email_alerts")
      .eq("org_id", theOrgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setStatus("Error loading filters.");
      return;
    }
    setFilters((data as FilterRow[]) || []);
  }

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function selectAllSignalsInView() {
    const inView = new Set<string>();
    filteredSignalGroups.forEach((g) => g.items.forEach((s) => inView.add(s)));
    setSignalTypes(Array.from(new Set([...signalTypes, ...Array.from(inView)])));
  }

  function clearSignalsInView() {
    const inView = new Set<string>();
    filteredSignalGroups.forEach((g) => g.items.forEach((s) => inView.add(s)));
    setSignalTypes(signalTypes.filter((s) => !inView.has(s)));
  }

  async function createFilter() {
    if (!orgId) return;

    setStatus("Saving filter...");

    // If user selects all signals, store null to mean "Any" (optional nice behavior)
    const storeSignals = signalTypes.length === SIGNAL_OPTIONS.length ? null : signalTypes;

    const { error } = await supabase.from("filters").insert({
      org_id: orgId,
      name: filterName,
      countries,
      signal_types: storeSignals,
      min_score: minScore,
      digest_frequency: digest,
      email_alerts: emailAlerts,
    });

    if (error) {
      console.error(error);
      setStatus("Error saving filter (check security).");
      return;
    }

    setStatus("Filter saved ✅");
    await loadFilters(orgId);
  }

  async function deleteFilter(filterId: string) {
    if (!orgId) return;

    const ok = confirm("Delete this filter? This cannot be undone.");
    if (!ok) return;

    setStatus("Deleting filter...");

    const { error } = await supabase.from("filters").delete().eq("id", filterId).eq("org_id", orgId); // extra safety

    if (error) {
      console.error(error);
      setStatus("Error deleting filter.");
      return;
    }

    setStatus("Filter deleted ✅");
    await loadFilters(orgId);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0 }}>Filters</h2>
          <div style={{ color: "#555", marginTop: 6 }}>
            Org <b>{orgName || "…"}</b> · Signed in as <b>{email}</b>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ marginTop: 0 }}>Create a filter</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <label>Filter name</label>
          <input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
          />

          <div style={{ marginTop: 12 }}>
            <label>Min score</label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value || "0", 10))}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Digest</label>
            <select
              value={digest}
              onChange={(e) => setDigest(e.target.value)}
              style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 8, marginTop: 6 }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="instant">Instant</option>
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
              Email alerts enabled
            </label>
          </div>

          <button
            onClick={createFilter}
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Save filter
          </button>

          {status && <p style={{ marginTop: 10 }}>{status}</p>}
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <label>Countries</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {COUNTRY_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setCountries(toggle(countries, c))}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: countries.includes(c) ? "#ddd" : "white",
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <label>Signal types</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: "#666", fontSize: 12 }}>
                  Selected: <b>{signalTypes.length}</b> / {SIGNAL_OPTIONS.length}
                </span>
                <button
                  onClick={() => setSignalTypes(SIGNAL_OPTIONS)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Select all
                </button>
                <button
                  onClick={() => setSignalTypes([])}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              value={signalSearch}
              onChange={(e) => setSignalSearch(e.target.value)}
              placeholder="Search signals..."
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ccc",
                borderRadius: 8,
                marginTop: 8,
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#333" }}>
                <input type="checkbox" checked={alertsOnly} onChange={(e) => setAlertsOnly(e.target.checked)} />
                Alerts only
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#333" }}>
                <input type="checkbox" checked={highIntentOnly} onChange={(e) => setHighIntentOnly(e.target.checked)} />
                High intent only
              </label>

              <button
                onClick={selectAllSignalsInView}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "white",
                }}
              >
                Select shown
              </button>
              <button
                onClick={clearSignalsInView}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "white",
                }}
              >
                Clear shown
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
              {filteredSignalGroups.map((group) => (
                <div key={group.label}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{group.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {group.items.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSignalTypes(toggle(signalTypes, s))}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: "1px solid #ccc",
                          cursor: "pointer",
                          background: signalTypes.includes(s) ? "#ddd" : "white",
                        }}
                        title={s}
                      >
                        {prettySignal(s)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredSignalGroups.length === 0 && (
                <div style={{ color: "#666", marginTop: 6 }}>No signals match your search/filters.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "18px 0" }} />

      <h3 style={{ marginTop: 0 }}>Saved filters</h3>
      {filters.length === 0 ? (
        <p>No filters yet. Create your first one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filters.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div>
                <b>{f.name}</b>
                <div style={{ color: "#444", marginTop: 6, lineHeight: 1.5 }}>
                  Countries: {(f.countries || []).join(", ") || "Any"}
                  <br />
                  Signal types: {(f.signal_types || []).join(", ") || "Any"}
                  <br />
                  Min score: {f.min_score} · Digest: {f.digest_frequency} · Email: {f.email_alerts ? "On" : "Off"}
                </div>
              </div>

              <button
                onClick={() => deleteFilter(f.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "white",
                  color: "#900",
                  whiteSpace: "nowrap",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
