"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/app`,
      },
    });

    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "Arial" }}>
      <h1 style={{ marginBottom: 4 }}>LifeScienceSignals</h1>
      <p style={{ marginTop: 0, color: "#444" }}>
        Sign in with a magic link (no password).
      </p>

      <form onSubmit={sendLink}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={{
            width: "100%",
            padding: 12,
            marginTop: 12,
            marginBottom: 10,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
        <button
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          Send login link
        </button>
      </form>

      {sent && <p style={{ marginTop: 12 }}>✅ Check your email for the login link.</p>}
      {error && <p style={{ marginTop: 12, color: "red" }}>❌ {error}</p>}
    </div>
  );
}

