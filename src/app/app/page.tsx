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


      // 1️⃣ Check if user already belongs to an org
      const { data: memberships } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", auth.user.id);

      if (memberships && memberships.length > 0) {
        // User already has an org — fetch its name
        const { data: org } = await supabase
          .from("orgs")
          .select("name")
          .eq("id", memberships[0].org_id)
          .single();

        if (org) setOrgName(org.name);
        return;
      }

      // 2️⃣ Create a new org automatically
      const defaultOrgName =
        auth.user.email?.split("@")[1] || "My Organisation";

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
      await supabase.from("org_members").insert({
        org_id: newOrg.id,
        user_id: auth.user.id,
        role: "owner",
      });

      setOrgName(newOrg.name);
    }

    init();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "Arial" }}>
      <h2>LifeScienceSignals</h2>
      <p>
        Signed in as: <b>{email}</b>
      </p>

      {orgName && (
        <p>
          Organisation: <b>{orgName}</b>
        </p>
      )}

      <button
        onClick={logout}
        style={{
          padding: 12,
          borderRadius: 8,
          border: "1px solid #ccc",
          cursor: "pointer",
        }}
      >
        Log out
      </button>

      <hr style={{ margin: "24px 0" }} />

      <p>✅ Organisation is now set up automatically.</p>
    </div>
  );
}
