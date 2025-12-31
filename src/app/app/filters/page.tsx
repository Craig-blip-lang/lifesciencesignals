"use client";

import { useEffect, useState } from "react";
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
const SIGNAL_OPTIONS = [
  "CSV_HIRING",
  "ANNEX11_HIRING",
  "DATA_INTEGRITY_HIRING",
  "QA_SYSTEMS_HIRING",
  "SERIALIZATION_HIRING",
  "MES_LIMS_HIRING",
  "FACILITY_EXPANSION",
  "NEW_SITE_STARTUP",
];

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

      const { data: org, error: orgErr } = await supabase
        .from("orgs")
        .select("name")
        .eq("id", theOrgId)
        .single();

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

  async function createFilter() {
    if (!orgId) return;

    setStatus("Saving filter...");

    const { error } = await supabase.from("filters").insert({
      org_id: orgId,
      name: filterName,
      countries,
      signal_types: signalTypes,
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

    const { error } = await supabase
      .from("filters")
      .delete()
      .eq("id", filterId)
      .eq("org_id", orgId); // extra safety

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
            <label>Signal types</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {SIGNAL_OPTIONS.map((s) => (
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
                >
                  {s.replaceAll("_", " ")}
                </button>
              ))}
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
