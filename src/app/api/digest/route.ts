import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FilterRow = {
  id: string;
  name: string;
  countries: string[] | null;
  signal_types: string[] | null;
  min_score: number | null;
  email_alerts: boolean | null;
  digest_frequency: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  segment: string | null;
};

type ScoreRow = {
  account_id: string;
  buying_pressure_index: number;
};

type SignalRow = {
  title: string;
  type: string;
  occurred_at: string;
  strength_score: number;
};

export async function GET() {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.FROM_EMAIL || "LifeScienceSignals <onboarding@resend.dev>";

    // 1) Load all orgs
    const { data: orgs, error: orgErr } = await supabaseAdmin.from("orgs").select("id,name");
    if (orgErr) throw orgErr;

    let sentCount = 0;

    for (const org of orgs || []) {
      // 2) Load most recent filter for org
      const { data: filters, error: filterErr } = await supabaseAdmin
        .from("filters")
        .select("id,name,countries,signal_types,min_score,email_alerts,digest_frequency")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (filterErr) throw filterErr;

      const filter = (filters && filters.length > 0 ? (filters[0] as FilterRow) : null);
      if (!filter) continue;

      // only daily + enabled
      if (filter.email_alerts !== true || filter.digest_frequency !== "daily") continue;

      const minScore = filter.min_score ?? 0;
      const countries = filter.countries ?? [];
      const signalTypes = filter.signal_types ?? [];

      // 3) Load top account scores for this org
      const { data: scoreRows, error: scoreErr } = await supabaseAdmin
        .from("org_account_scores")
        .select("account_id,buying_pressure_index")
        .eq("org_id", org.id)
        .gte("buying_pressure_index", minScore)
        .order("buying_pressure_index", { ascending: false })
        .limit(10);

      if (scoreErr) throw scoreErr;
      if (!scoreRows || scoreRows.length === 0) continue;

      const typedScores = scoreRows as ScoreRow[];
      const accountIds = typedScores.map((r) => r.account_id);

      // 4) Load account details
      const { data: accounts, error: accErr } = await supabaseAdmin
        .from("accounts")
        .select("id,name,domain,country,segment")
        .in("id", accountIds);

      if (accErr) throw accErr;

      let filteredAccounts = (accounts as AccountRow[]) || [];

      // Apply country filter
      if (countries.length > 0) {
        filteredAccounts = filteredAccounts.filter((a) => a.country && countries.includes(a.country));
      }
      if (filteredAccounts.length === 0) continue;

      // 5) Build digest items based on signals in last 7 days
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekAgoISO = weekAgo.toISOString().slice(0, 10);

      const digestItems: {
        name: string;
        country: string | null;
        segment: string | null;
        score: number;
        signals: SignalRow[];
      }[] = [];

      for (const a of filteredAccounts) {
        const score = typedScores.find((s) => s.account_id === a.id)?.buying_pressure_index ?? 0;

        const { data: sigs, error: sigErr } = await supabaseAdmin
          .from("signals")
          .select("title,type,occurred_at,strength_score")
          .eq("account_id", a.id)
          .gte("occurred_at", weekAgoISO)
          .order("occurred_at", { ascending: false })
          .limit(5);

        if (sigErr) throw sigErr;

        let sigList = ((sigs as any) || []) as SignalRow[];

        // Apply signal type filter (if selected)
        if (signalTypes.length > 0) {
          sigList = sigList.filter((s) => signalTypes.includes(s.type));
          // If they selected types, require at least one match
          if (sigList.length === 0) continue;
        }

        digestItems.push({
          name: a.name,
          country: a.country ?? null,
          segment: a.segment ?? null,
          score,
          signals: sigList,
        });
      }

      if (digestItems.length === 0) continue;

      // 6) Find recipients: org members -> profiles emails
      const { data: orgMembers, error: memErr } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", org.id);

      if (memErr) throw memErr;
      if (!orgMembers || orgMembers.length === 0) continue;

      const memberIds = orgMembers.map((m: any) => m.user_id);

      const { data: profiles, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .in("id", memberIds);

      if (profErr) throw profErr;

      const to = (profiles || []).map((p: any) => p.email).filter(Boolean);
      if (to.length === 0) continue;

      // 7) Send email
      const emailSubject = `LifeScienceSignals Daily Digest — ${filter.name}`;
      const emailHtml = renderDigestHtml(org.name, filter.name, digestItems);

      await resend.emails.send({
        from: fromEmail,
        to,
        subject: emailSubject,
        html: emailHtml,
      });

      sentCount += 1;
    }

    return NextResponse.json({ ok: true, sent: sentCount });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

function renderDigestHtml(
  orgName: string,
  filterName: string,
  items: {
    name: string;
    country: string | null;
    segment: string | null;
    score: number;
    signals: SignalRow[];
  }[]
) {
  const blocks = items
    .map((i) => {
      const sigs = (i.signals || [])
        .map(
          (s) =>
            `<li><b>${escapeHtml(s.title)}</b><br/><span style="color:#555">${escapeHtml(
              s.type
            )} · ${escapeHtml(s.occurred_at)} · strength ${s.strength_score}</span></li>`
        )
        .join("");

      return `
        <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin:12px 0;">
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-size:16px;font-weight:700;">${escapeHtml(i.name)}</div>
              <div style="color:#555;margin-top:4px;">${escapeHtml(i.segment || "—")} · ${escapeHtml(
        i.country || "—"
      )}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:20px;font-weight:800;">${i.score}</div>
              <div style="color:#777;">Buying pressure</div>
            </div>
          </div>
          <div style="margin-top:10px;">
            <div style="font-weight:700;margin-bottom:6px;">Recent signals (7 days)</div>
            <ul style="margin:0;padding-left:18px;display:grid;gap:8px;">${sigs || "<li>—</li>"}</ul>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial;max-width:720px;margin:0 auto;padding:18px;">
      <h2 style="margin:0 0 6px 0;">LifeScienceSignals — Daily Digest</h2>
      <div style="color:#555;margin-bottom:14px;">
        Org: <b>${escapeHtml(orgName)}</b> · Filter: <b>${escapeHtml(filterName)}</b>
      </div>
      ${blocks}
      <div style="color:#777;margin-top:16px;font-size:12px;">
        You’re receiving this because email alerts are enabled for your daily digest filter.
      </div>
    </div>
  `;
}

function escapeHtml(str: string) {
  return (str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
