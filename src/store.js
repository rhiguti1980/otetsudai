import { supabase } from "./supabase.js";

// camelCase (app) ↔ snake_case (DB) の変換
const fromDb = {
  chores: (r) => ({
    id: r.id,
    title: r.title,
    amount: r.amount,
    memo: r.memo,
    claimedBy: r.claimed_by,
    claimedAt: r.claimed_at,
    createdAt: r.created_at,
    self: r.self,
  }),
  notes: (r) => ({
    id: r.id,
    choreTitle: r.chore_title,
    amount: r.amount,
    who: r.who,
    at: r.at,
    seen: r.seen,
    self: r.self,
  }),
  expenses: (r) => ({
    id: r.id,
    what: r.what,
    amount: r.amount,
    spentDate: r.spent_date,
    who: r.who,
    submittedAt: r.submitted_at,
  }),
  history: (r) => ({
    id: r.id,
    who: r.who,
    kind: r.kind,
    count: r.count,
    amount: r.amount,
    at: r.at,
  }),
};

const toDb = {
  chores: (o) => ({
    id: o.id,
    title: o.title,
    amount: o.amount,
    memo: o.memo ?? "",
    claimed_by: o.claimedBy ?? null,
    claimed_at: o.claimedAt ?? null,
    created_at: o.createdAt,
    self: o.self ?? false,
  }),
  notes: (o) => ({
    id: o.id,
    chore_title: o.choreTitle,
    amount: o.amount,
    who: o.who,
    at: o.at,
    seen: o.seen,
    self: o.self ?? false,
  }),
  expenses: (o) => ({
    id: o.id,
    what: o.what,
    amount: o.amount,
    spent_date: o.spentDate ?? "",
    who: o.who,
    submitted_at: o.submittedAt,
  }),
  history: (o) => ({
    id: o.id,
    who: o.who,
    kind: o.kind,
    count: o.count,
    amount: o.amount,
    at: o.at,
  }),
};

const TABLE = {
  "board:chores": "chores",
  "board:notes": "notes",
  "board:expenses": "expenses",
  "board:history": "history",
  "board:settings": "settings",
};

export const STORE = {
  async load(key, fallback) {
    const table = TABLE[key];
    try {
      if (table === "settings") {
        const { data } = await supabase
          .from("settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();
        return data ? { names: data.names } : fallback;
      }
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      return data.map(fromDb[table]);
    } catch {
      return fallback;
    }
  },

  async save(key, value) {
    const table = TABLE[key];
    try {
      if (table === "settings") {
        const { error } = await supabase
          .from("settings")
          .upsert({ id: "default", names: value.names });
        if (error) throw error;
        return;
      }

      const rows = value.map(toDb[table]);
      const keepIds = rows.map((r) => r.id);

      // 削除されたレコードを除去
      const { data: existing, error: selErr } = await supabase.from(table).select("id");
      if (selErr) throw selErr;
      const toDelete = (existing ?? [])
        .map((r) => r.id)
        .filter((id) => !keepIds.includes(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase.from(table).delete().in("id", toDelete);
        if (delErr) throw delErr;
      }

      // 現在の全レコードを upsert
      if (rows.length > 0) {
        const { error: upsertErr } = await supabase.from(table).upsert(rows);
        if (upsertErr) throw upsertErr;
      }
    } catch (e) {
      console.error("save failed", table, e);
    }
  },
};
