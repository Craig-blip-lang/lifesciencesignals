import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * RSS ingestion endpoint
 *
 * Call via Vercel Cron:
 *   GET https://your-domain.com/api/ingest/rss
 *
 * Optional security:
 *  - Set env CRON_SECRET in Vercel
 *  - Send header: x-cron-secret: <value>
 */

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "LifeScienceSignalsRSS/1.0",
  },
});

// Very simple classification rules (improve later)
function classifySignalType(title: string, summary: string) {
  const t = `${title} ${summary}`.toLowerCase();

  if (t.includes("annex 11") || t.includes("annex11")) return "ANNEX11_HIRING";
  if (t.includes("data integrity")) return "DATA_INTEGRITY_HIRING";
  if (t.includes("serialization")) return "SERIALIZATION_HIRING";
  if (t.includes("csv")) return "CSV_HIRING";
  if (t.includes("mes") || t.includes("lims")) return "MES_LIMS_HIRING";
  if (t.includes("quality") || t.includes("qa")) return "QA_SYSTEMS_HIRING";
  if (t.includes("expansion") || t.includes("capacity") || t.includes("new facility")) return "FACILITY_EXPANSION";
  if (t.includes("new site") || t.includes("greenfield")) return "NEW_SITE_STARTUP";

  return "OTHER";
}

// Simple scoring (improve later)
function scoreFromText(title: string, summary: string) {
  const t = `${title} ${summary}`.toLowerCase();

  // “Hotter” words
  const hotWords = ["expansion", "new site", "greenfield", "launch", "capacity", "funding", "investment", "validation"];
  const warmWords = ["hiring", "recruiting", "engineer", "manager", "director", "lead", "gmp", "qa", "csv"];

  let score = 50;

  for (const w of warmWords) if (t.includes(w)) score += 10;
  for (const w of hotWords) if (t.includes(w)) score += 20;

  // Clamp
  return Math.max(10, Math.min(200, score));
}

function safeDate(d?: string) {
  if (!d) return new Date().toISOString();
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export async function GET(req: Request) {
  // Optional cron protection
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const headerSecret = req.headers.get("x-cron-secret");
    if (headerSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 1) Load enabled feeds
  const { data: feeds, error: feedErr } = await supabaseAdmin
    .from("rss_sources")
    .select("id,name,url,category,enabled")
    .eq("enabled", true);

  if (feedErr) {
    console.error(feedErr);
    return NextResponse.json({ error: "Could not load rss_sources" }, { status: 500 });
  }

  if (!feeds || feeds.length === 0) {
    return NextResponse.json({ ok: true, message: "No enabled feeds" });
  }

  let totalFetched = 0;
  let totalNew = 0;
  const perFeedResults: any[] = [];

  // 2) Fetch + parse each feed
  for (const feed of feeds) {
    let fetched = 0;
    let inserted = 0;
    let errors: string[] = [];

    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];
      fetched = items.length;
      totalFetched += fetched;

      // Limit per feed (avoid huge runs)
      const limited = items.slice(0, 25);

      for (const item of limited) {
        const title = item.title || "(untitled)";
        const link = item.link || "";
        const summary = (item.contentSnippet || item.content || "") as string;

        // GUID: prefer item.guid; fall back to link; fall back to title+date
        const guid =
          (item.guid as string) ||
          (item.id as string) ||
          link ||
          `${title}__${item.pubDate || item.isoDate || ""}`;

        // 3) Dedupe via rss_items unique(feed_id,guid)
        const { error: rssInsertErr } = await supabaseAdmin.from("rss_items").insert({
          feed_id: feed.id,
          guid,
          title,
          link,
          published_at: safeDate((item.isoDate as string) || (item.pubDate as string) || ""),
        });

        // If it already exists, skip silently
        if (rssInsertErr) {
          // Postgres unique violation code is 23505
          // Supabase often puts it in .code
          const code = (rssInsertErr as any).code;
          if (code === "23505") continue;

          console.error("rss_items insert error", rssInsertErr);
          errors.push(`rss_items: ${rssInsertErr.message}`);
          continue;
        }

        // 4) Create a signal row
        // IMPORTANT: if your `signals.account_id` is NOT NULL, you must:
        //  - either allow NULL, or
        //  - insert into a "raw_signals" table instead.
        const type = classifySignalType(title, summary);
        const strength_score = scoreFromText(title, summary);

        const { error: sigErr } = await supabaseAdmin.from("signals").insert({
          // account_id: null, // <- leave commented unless your column allows NULL
          title,
          type,
          category: feed.category || "rss",
          occurred_at: safeDate((item.isoDate as string) || (item.pubDate as string) || ""),
          strength_score,
          // Optional extra fields if you have them (uncomment if your table includes them):
          // source: "rss",
          // source_url: link,
          // meta: { feed: feed.name, guid },
        });

        if (sigErr) {
          console.error("signals insert error", sigErr);
          errors.push(`signals: ${sigErr.message}`);
          continue;
        }

        inserted += 1;
        totalNew += 1;
      }
    } catch (e: any) {
      console.error("RSS parse error", feed.url, e);
      errors.push(e?.message || "unknown parse error");
    }

    perFeedResults.push({
      feed: feed.name,
      url: feed.url,
      fetched,
      inserted,
      errors,
    });
  }

  return NextResponse.json({
    ok: true,
    totalFeeds: feeds.length,
    totalFetched,
    totalNew,
    results: perFeedResults,
  });
}
