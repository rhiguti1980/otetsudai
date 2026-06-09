import React, { useState, useEffect, useCallback } from "react";

// ── お手伝い＆おこづかい管理アプリ「おてつだいボード」 ──────────
// データは共有ストレージに保存（このアーティファクトを開いた家族全員で同期）
// キー設計:
//   board:chores    → お手伝いの配列
//   board:notes     → 「やるよ！」通知の配列
//   board:expenses  → 必要経費の申請の配列
//   board:settings  → 娘の名前など

const STORE = {
  async load(key, fallback) {
    try {
      const r = await window.storage.get(key, true);
      return r ? JSON.parse(r.value) : fallback;
    } catch {
      return fallback;
    }
  },
  async save(key, value) {
    try {
      await window.storage.set(key, JSON.stringify(value), true);
    } catch (e) {
      console.error("save failed", e);
    }
  },
};

const uid = () => Math.random().toString(36).slice(2, 9);

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=Klee+One:wght@400;600&display=swap');
`;

const palette = {
  cream: "#FFF7E8",
  ink: "#3A2E22",
  coral: "#FF6B5E",
  sun: "#FFC23C",
  leaf: "#5BB98B",
  sky: "#5AA9E6",
  paper: "#FFFDF7",
  line: "#E8DCC4",
};

const daughterColors = ["#FF6B5E", "#5AA9E6"];

// 金額ユーティリティ
const choreYen = (c) => {
  if (typeof c.amount === "number") return c.amount;
  const digits = String(c.reward || "").replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : 0;
};
const yen = (n) => `${(n || 0).toLocaleString("ja-JP")}円`;

export default function App() {
  const [loading, setLoading] = useState(true);
  const [chores, setChores] = useState([]);
  const [notes, setNotes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState({ names: ["小春", "七海"] });
  const [role, setRole] = useState("dad"); // 'dad' | 0 | 1
  const [sortBy, setSortBy] = useState("new");
  const [editingNames, setEditingNames] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, n, e, h, s] = await Promise.all([
        STORE.load("board:chores", []),
        STORE.load("board:notes", []),
        STORE.load("board:expenses", []),
        STORE.load("board:history", []),
        STORE.load("board:settings", { names: ["小春", "七海"] }),
      ]);
      setChores(c);
      setNotes(n);
      setExpenses(e);
      setHistory(h);
      setSettings(s);
      setLoading(false);
    })();
  }, []);

  const persistChores = useCallback((next) => {
    setChores(next);
    STORE.save("board:chores", next);
  }, []);
  const persistNotes = useCallback((next) => {
    setNotes(next);
    STORE.save("board:notes", next);
  }, []);
  const persistExpenses = useCallback((next) => {
    setExpenses(next);
    STORE.save("board:expenses", next);
  }, []);
  const persistHistory = useCallback((next) => {
    setHistory(next);
    STORE.save("board:history", next);
  }, []);
  const persistSettings = useCallback((next) => {
    setSettings(next);
    STORE.save("board:settings", next);
  }, []);

  // お手伝い追加（父）
  const addChore = (title, amount, memo) => {
    persistChores([
      { id: uid(), title, amount, memo, claimedBy: null, createdAt: Date.now() },
      ...chores,
    ]);
  };
  const removeChore = (id) => persistChores(chores.filter((c) => c.id !== id));

  // 「やるよ！」（娘）
  const claim = (id, daughterIdx) => {
    const target = chores.find((c) => c.id === id);
    if (!target || target.claimedBy !== null) return;
    persistChores(
      chores.map((c) =>
        c.id === id ? { ...c, claimedBy: daughterIdx, claimedAt: Date.now() } : c
      )
    );
    persistNotes([
      {
        id: uid(),
        choreTitle: target.title,
        amount: choreYen(target),
        who: daughterIdx,
        at: Date.now(),
        seen: false,
      },
      ...notes,
    ]);
  };
  const clearNotes = () => persistNotes([]);
  const markSeen = () => {
    if (notes.some((n) => !n.seen)) {
      persistNotes(notes.map((n) => ({ ...n, seen: true })));
    }
  };

  // 必要経費の申請（娘）
  const addExpense = (what, amount, spentDate, daughterIdx) => {
    persistExpenses([
      { id: uid(), what, amount, spentDate, who: daughterIdx, submittedAt: Date.now() },
      ...expenses,
    ]);
  };
  const removeExpense = (id) => persistExpenses(expenses.filter((e) => e.id !== id));

  // 娘ごとの精算（お駄賃＋必要経費をまとめて消し、履歴に記録）
  const settleDaughter = (idx) => {
    const choreItems = chores.filter((c) => c.claimedBy === idx);
    const expItems = expenses.filter((e) => e.who === idx);
    if (choreItems.length === 0 && expItems.length === 0) return;
    const now = Date.now();
    const rows = [];
    if (choreItems.length) {
      rows.push({
        id: uid(),
        who: idx,
        kind: "お駄賃",
        count: choreItems.length,
        amount: choreItems.reduce((s, c) => s + choreYen(c), 0),
        at: now,
      });
    }
    if (expItems.length) {
      rows.push({
        id: uid(),
        who: idx,
        kind: "必要経費",
        count: expItems.length,
        amount: expItems.reduce((s, e) => s + (e.amount || 0), 0),
        at: now,
      });
    }
    persistHistory([...rows, ...history]);
    if (choreItems.length) persistChores(chores.filter((c) => c.claimedBy !== idx));
    if (expItems.length) persistExpenses(expenses.filter((e) => e.who !== idx));
  };
  const clearHistory = () => persistHistory([]);

  // 娘が自分でやったお手伝いを登録（最初から「やったよ」状態）
  const addDoneChore = (title, amount, memo, idx) => {
    const now = Date.now();
    persistChores([
      { id: uid(), title, amount, memo, claimedBy: idx, claimedAt: now, createdAt: now, self: true },
      ...chores,
    ]);
    persistNotes([
      { id: uid(), choreTitle: title, amount, who: idx, at: now, seen: false, self: true },
      ...notes,
    ]);
  };

  const sorted = [...chores].sort((a, b) => {
    if (sortBy === "reward") return choreYen(b) - choreYen(a);
    if (sortBy === "name") return a.title.localeCompare(b.title, "ja");
    return b.createdAt - a.createdAt;
  });

  const unseen = notes.filter((n) => !n.seen).length;

  if (loading) {
    return (
      <Shell>
        <p style={{ fontFamily: "'Zen Maru Gothic'", color: palette.ink, textAlign: "center", paddingTop: 80 }}>
          よみこみ中…
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <style>{FONTS}</style>
      <Header />

      <RoleSwitch
        role={role}
        setRole={(r) => {
          setRole(r);
          if (r === "dad") markSeen();
        }}
        names={settings.names}
        unseen={unseen}
      />

      {role === "dad" ? (
        <DadView
          chores={sorted}
          names={settings.names}
          notes={notes}
          expenses={expenses}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onAdd={addChore}
          onRemove={removeChore}
          onClearNotes={clearNotes}
          onRemoveExpense={removeExpense}
          onSettle={settleDaughter}
          history={history}
          onClearHistory={clearHistory}
          editingNames={editingNames}
          setEditingNames={setEditingNames}
          onSaveNames={(names) => persistSettings({ ...settings, names })}
        />
      ) : (
        <DaughterView
          chores={sorted}
          daughterIdx={role}
          names={settings.names}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onClaim={claim}
          onAddExpense={addExpense}
          onAddDone={addDoneChore}
        />
      )}
    </Shell>
  );
}

// ── レイアウト ───────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 20% 10%, #FFE9B0 0%, transparent 45%), radial-gradient(circle at 90% 20%, #FFD2CC 0%, transparent 40%), ${palette.cream}`,
        padding: "20px 14px 60px",
        boxSizing: "border-box",
        fontFamily: "'Klee One', sans-serif",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ textAlign: "center", marginBottom: 18 }}>
      <h1
        style={{
          fontFamily: "'Zen Maru Gothic'",
          fontWeight: 900,
          fontSize: 32,
          color: palette.ink,
          margin: 0,
          letterSpacing: "0.02em",
          textShadow: `2px 2px 0 ${palette.sun}`,
        }}
      >
        🧹 おてつだいボード
      </h1>
      <p style={{ color: "#9b8a6e", margin: "4px 0 0", fontSize: 13 }}>
        おてつだいと おこづかいの かんり
      </p>
    </div>
  );
}

function RoleSwitch({ role, setRole, names, unseen }) {
  const Btn = ({ value, label, color, badge }) => {
    const active = role === value;
    return (
      <button
        onClick={() => setRole(value)}
        style={{
          position: "relative",
          flex: 1,
          padding: "12px 6px",
          border: `2.5px solid ${palette.ink}`,
          borderRadius: 16,
          background: active ? color : palette.paper,
          color: active ? "#fff" : palette.ink,
          fontFamily: "'Zen Maru Gothic'",
          fontWeight: 700,
          fontSize: 15,
          cursor: "pointer",
          boxShadow: active ? `0 4px 0 ${palette.ink}` : `0 2px 0 ${palette.line}`,
          transform: active ? "translateY(-1px)" : "none",
          transition: "all .12s",
        }}
      >
        {label}
        {badge > 0 && (
          <span
            style={{
              position: "absolute",
              top: -8,
              right: -6,
              background: palette.coral,
              color: "#fff",
              borderRadius: 999,
              minWidth: 20,
              height: 20,
              fontSize: 12,
              border: `2px solid ${palette.ink}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <Btn value="dad" label="👨 ぱぱ" color={palette.leaf} badge={unseen} />
      <Btn value={0} label={`👧 ${names[0]}`} color={daughterColors[0]} />
      <Btn value={1} label={`👧 ${names[1]}`} color={daughterColors[1]} />
    </div>
  );
}

// ── 共通パーツ ───────────────────────────────────────────────
function SortBar({ sortBy, setSortBy }) {
  const opts = [
    ["new", "あたらしい順"],
    ["reward", "ごほうび順"],
    ["name", "なまえ順"],
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
      {opts.map(([v, l]) => (
        <button
          key={v}
          onClick={() => setSortBy(v)}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: `2px solid ${palette.ink}`,
            background: sortBy === v ? palette.sun : palette.paper,
            color: palette.ink,
            fontFamily: "'Klee One'",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Card({ children, accent }) {
  return (
    <div
      style={{
        background: palette.paper,
        border: `2.5px solid ${palette.ink}`,
        borderLeft: `8px solid ${accent || palette.sun}`,
        borderRadius: 16,
        padding: "14px 16px",
        marginBottom: 12,
        boxShadow: `0 3px 0 ${palette.line}`,
      }}
    >
      {children}
    </div>
  );
}

function RewardTag({ amount }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: "#FFF2CC",
        border: `2px solid ${palette.sun}`,
        borderRadius: 999,
        padding: "2px 10px",
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        fontSize: 14,
        color: "#9a6b00",
        whiteSpace: "nowrap",
      }}
    >
      ⭐ {yen(amount)}
    </span>
  );
}

function ExpenseTag({ amount }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        background: "#FFE6E2",
        border: `2px solid ${palette.coral}`,
        borderRadius: 999,
        padding: "2px 10px",
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        fontSize: 14,
        color: "#b23a2e",
        whiteSpace: "nowrap",
      }}
    >
      🧾 {yen(amount)}
    </span>
  );
}

// ── 父ビュー ─────────────────────────────────────────────────
function DadView({
  chores, names, notes, expenses, sortBy, setSortBy, onAdd, onRemove,
  onClearNotes, onRemoveExpense, onSettle, history, onClearHistory, editingNames, setEditingNames, onSaveNames,
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [n0, setN0] = useState(names[0]);
  const [n1, setN1] = useState(names[1]);

  const submit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), parseInt(amount, 10) || 0, memo.trim());
    setTitle("");
    setAmount("");
    setMemo("");
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: `2px solid ${palette.line}`,
    borderRadius: 10,
    fontFamily: "'Klee One'",
    fontSize: 15,
    color: palette.ink,
    background: "#fff",
    marginBottom: 8,
  };

  // 娘ごとの集計
  const summary = [0, 1].map((idx) => {
    const choreTotal = chores
      .filter((c) => c.claimedBy === idx)
      .reduce((s, c) => s + choreYen(c), 0);
    const expenseTotal = expenses
      .filter((e) => e.who === idx)
      .reduce((s, e) => s + (e.amount || 0), 0);
    return { choreTotal, expenseTotal, total: choreTotal + expenseTotal };
  });

  return (
    <div>
      {/* おかね まとめ */}
      <SectionTitle>💰 おかね まとめ</SectionTitle>
      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        {[0, 1].map((idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              background: palette.paper,
              border: `2.5px solid ${palette.ink}`,
              borderTop: `8px solid ${daughterColors[idx]}`,
              borderRadius: 16,
              padding: "12px 14px",
              boxShadow: `0 3px 0 ${palette.line}`,
            }}
          >
            <div
              style={{
                fontFamily: "'Zen Maru Gothic'",
                fontWeight: 700,
                fontSize: 16,
                color: daughterColors[idx],
                marginBottom: 8,
              }}
            >
              👧 {names[idx]}
            </div>
            <Row label="お駄賃" value={yen(summary[idx].choreTotal)} />
            <Row label="必要経費" value={yen(summary[idx].expenseTotal)} />
            <div style={{ height: 1, background: palette.line, margin: "6px 0" }} />
            <Row
              label="ごうけい"
              value={yen(summary[idx].total)}
              strong
              color={daughterColors[idx]}
            />
            <div style={{ marginTop: 10 }}>
              <ConfirmButton
                label="精算完了"
                confirmLabel="精算する？（もう一度タップ）"
                tone="ok"
                onConfirm={() => onSettle(idx)}
              />
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#a99", margin: "0 0 4px" }}>
        ※「ごうけい」は、いま渡す金額（やったお駄賃＋申請中の経費）です。
      </p>

      {/* 通知 */}
      <SectionTitle>📣 おしらせ</SectionTitle>
      {notes.length === 0 ? (
        <Empty text="まだ「やったよ！」はありません" />
      ) : (
        <>
          {notes.slice(0, 8).map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: n.seen ? palette.paper : "#FFF8E0",
                border: `2px solid ${palette.ink}`,
                borderRadius: 12,
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 22 }}>🙋</span>
              <div style={{ flex: 1, fontSize: 14, color: palette.ink }}>
                <b style={{ color: daughterColors[n.who] }}>{names[n.who]}</b>
                {" が "}
                <b>「{n.choreTitle}」</b>
                {" をやったよ！"}
                {n.self && (
                  <span style={{ fontSize: 11, color: "#a98", marginLeft: 4 }}>
                    （じぶんで登録）
                  </span>
                )}
                <div style={{ fontSize: 11, color: "#a99" }}>{fmtDateTime(n.at)}</div>
              </div>
              <RewardTag amount={n.amount} />
            </div>
          ))}
          <button onClick={onClearNotes} style={ghostBtn}>
            おしらせを消す
          </button>
        </>
      )}

      {/* 追加フォーム */}
      <SectionTitle>➕ おてつだいを とうろく</SectionTitle>
      <Card accent={palette.leaf}>
        <input
          style={inputStyle}
          placeholder="なにをする？（れい：おさらあらい）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          style={inputStyle}
          type="number"
          inputMode="numeric"
          placeholder="ごほうび（円）　れい：100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          style={{ ...inputStyle, marginBottom: 12 }}
          placeholder="メモ（なくてもOK）"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <button onClick={submit} style={primaryBtn(palette.leaf)}>
          リストに ついか
        </button>
      </Card>

      {/* 登録済みリスト */}
      <SectionTitle>📋 とうろく中の おてつだい</SectionTitle>
      <SortBar sortBy={sortBy} setSortBy={setSortBy} />
      {chores.length === 0 ? (
        <Empty text="まだ おてつだいが ありません" />
      ) : (
        chores.map((c) => (
          <Card
            key={c.id}
            accent={c.claimedBy !== null ? daughterColors[c.claimedBy] : palette.sun}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "'Zen Maru Gothic'",
                    fontWeight: 700,
                    fontSize: 17,
                    color: palette.ink,
                  }}
                >
                  {c.title}
                </div>
                {c.memo && (
                  <div style={{ fontSize: 13, color: "#8a7c66", marginTop: 2 }}>
                    {c.memo}
                  </div>
                )}
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <RewardTag amount={choreYen(c)} />
                  {c.claimedBy !== null && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        background: daughterColors[c.claimedBy],
                        borderRadius: 999,
                        padding: "2px 10px",
                      }}
                    >
                      ✋ {names[c.claimedBy]} がやったよ
                    </span>
                  )}
                  {c.self && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#8a6d3b",
                        background: "#FFF2CC",
                        border: `1.5px solid ${palette.sun}`,
                        borderRadius: 999,
                        padding: "1px 8px",
                      }}
                    >
                      📝 じぶんで登録
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#a99", marginTop: 6 }}>
                  とうろく: {fmtDateTime(c.createdAt)}
                  {c.claimedBy !== null && c.claimedAt
                    ? ` ／ やったよ: ${fmtDateTime(c.claimedAt)}`
                    : ""}
                </div>
              </div>
              <button
                onClick={() => onRemove(c.id)}
                title="消す"
                style={{
                  border: `2px solid ${palette.ink}`,
                  background: palette.paper,
                  color: palette.ink,
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontFamily: "'Zen Maru Gothic'",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                消す
              </button>
            </div>
          </Card>
        ))
      )}

      {/* 必要経費の申請 */}
      <SectionTitle>🧾 ひつようけいひ の しんせい</SectionTitle>
      {[0, 1].map((idx) => {
        const list = expenses
          .filter((e) => e.who === idx)
          .sort((a, b) => b.submittedAt - a.submittedAt);
        return (
          <div key={idx} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontFamily: "'Zen Maru Gothic'",
                fontWeight: 700,
                fontSize: 14,
                color: daughterColors[idx],
                marginBottom: 6,
              }}
            >
              👧 {names[idx]}（けい {yen(summary[idx].expenseTotal)}）
            </div>
            {list.length === 0 ? (
              <Empty text="申請は ありません" />
            ) : (
              list.map((e) => (
                <Card key={e.id} accent={daughterColors[idx]}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "'Zen Maru Gothic'",
                          fontWeight: 700,
                          fontSize: 16,
                          color: palette.ink,
                        }}
                      >
                        {e.what}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <ExpenseTag amount={e.amount} />
                      </div>
                      <div style={{ fontSize: 11, color: "#a99", marginTop: 6 }}>
                        使った日: {e.spentDate || "（みきにゅう）"} ／ 申請: {fmtDateTime(e.submittedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveExpense(e.id)}
                      style={{
                        border: `2px solid ${palette.ink}`,
                        background: palette.paper,
                        color: palette.ink,
                        borderRadius: 10,
                        padding: "8px 10px",
                        fontFamily: "'Zen Maru Gothic'",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      消す
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        );
      })}

      {/* 精算履歴 */}
      <SectionTitle>📜 せいさん りれき</SectionTitle>
      {history.length === 0 ? (
        <Empty text="まだ せいさんは ありません" />
      ) : (
        <div
          style={{
            border: `2.5px solid ${palette.ink}`,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: `0 3px 0 ${palette.line}`,
            marginBottom: 10,
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: palette.sun }}>
                <Th>日時</Th>
                <Th>だれ</Th>
                <Th>しゅるい</Th>
                <Th align="right">件数</Th>
                <Th align="right">金額</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr
                  key={h.id}
                  style={{ background: i % 2 ? "#FFFBF0" : palette.paper }}
                >
                  <Td>{fmtDateTime(h.at)}</Td>
                  <Td>
                    <span style={{ color: daughterColors[h.who], fontWeight: 700 }}>
                      {names[h.who]}
                    </span>
                  </Td>
                  <Td>{h.kind}</Td>
                  <Td align="right">{h.count}件</Td>
                  <Td align="right" strong>
                    {yen(h.amount)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history.length > 0 && (
        <ConfirmButton label="りれきを ぜんぶ消す" onConfirm={onClearHistory} />
      )}

      {/* 名前設定 */}
      <SectionTitle>⚙️ なまえの せってい</SectionTitle>
      {!editingNames ? (
        <button onClick={() => setEditingNames(true)} style={ghostBtn}>
          むすめの なまえを かえる（いま: {names[0]} / {names[1]}）
        </button>
      ) : (
        <Card accent={palette.sky}>
          <input style={inputStyle} value={n0} onChange={(e) => setN0(e.target.value)} />
          <input style={{ ...inputStyle, marginBottom: 12 }} value={n1} onChange={(e) => setN1(e.target.value)} />
          <button
            onClick={() => {
              onSaveNames([n0.trim() || "むすめ1", n1.trim() || "むすめ2"]);
              setEditingNames(false);
            }}
            style={primaryBtn(palette.sky)}
          >
            ほぞん
          </button>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, strong, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
      <span style={{ fontSize: 13, color: "#8a7c66" }}>{label}</span>
      <span
        style={{
          fontFamily: "'Zen Maru Gothic'",
          fontWeight: strong ? 900 : 700,
          fontSize: strong ? 18 : 14,
          color: color || palette.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Th({ children, align }) {
  return (
    <th
      style={{
        textAlign: align || "left",
        padding: "8px 10px",
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        fontSize: 12,
        color: palette.ink,
        borderBottom: `2px solid ${palette.ink}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align, strong }) {
  return (
    <td
      style={{
        textAlign: align || "left",
        padding: "8px 10px",
        color: palette.ink,
        fontWeight: strong ? 700 : 400,
        fontFamily: strong ? "'Zen Maru Gothic'" : "'Klee One'",
        borderBottom: `1px solid ${palette.line}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, tone }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const activeColor = tone === "ok" ? palette.leaf : palette.coral;
  return (
    <button
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
      style={{
        width: "100%",
        border: `2px solid ${armed ? activeColor : palette.ink}`,
        background: armed ? activeColor : palette.paper,
        color: armed ? "#fff" : palette.ink,
        borderRadius: 10,
        padding: "8px 8px",
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        transition: "all .12s",
      }}
    >
      {armed ? confirmLabel || "ほんとに消す？（もう一度タップ）" : label}
    </button>
  );
}

// ── 娘ビュー ─────────────────────────────────────────────────
function DaughterView({ chores, daughterIdx, names, sortBy, setSortBy, onClaim, onAddExpense, onAddDone }) {
  const [justDid, setJustDid] = useState(null);
  const [flash, setFlash] = useState(null);
  const [eWhat, setEWhat] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eDate, setEDate] = useState("");
  const [sTitle, setSTitle] = useState("");
  const [sAmount, setSAmount] = useState("");
  const [sMemo, setSMemo] = useState("");
  const color = daughterColors[daughterIdx];

  const available = chores.filter((c) => c.claimedBy === null);
  const mine = chores.filter((c) => c.claimedBy === daughterIdx);

  const handleClaim = (c) => {
    onClaim(c.id, daughterIdx);
    setJustDid(c.title);
    setTimeout(() => setJustDid(null), 2500);
  };

  const submitSelf = () => {
    if (!sTitle.trim()) return;
    onAddDone(sTitle.trim(), parseInt(sAmount, 10) || 0, sMemo.trim(), daughterIdx);
    setJustDid(sTitle.trim());
    setSTitle("");
    setSAmount("");
    setSMemo("");
    setTimeout(() => setJustDid(null), 2500);
  };

  const submitExpense = () => {
    if (!eWhat.trim() || !(parseInt(eAmount, 10) > 0)) return;
    onAddExpense(eWhat.trim(), parseInt(eAmount, 10), eDate.trim(), daughterIdx);
    setFlash(`「${eWhat.trim()}」(${yen(parseInt(eAmount, 10))}) を申請したよ！`);
    setEWhat("");
    setEAmount("");
    setEDate("");
    setTimeout(() => setFlash(null), 2800);
  };

  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    border: `2px solid ${palette.line}`,
    borderRadius: 10,
    fontFamily: "'Klee One'",
    fontSize: 15,
    color: palette.ink,
    background: "#fff",
    marginBottom: 8,
  };

  return (
    <div>
      <div
        style={{
          textAlign: "center",
          fontFamily: "'Zen Maru Gothic'",
          fontWeight: 700,
          fontSize: 16,
          color,
          marginBottom: 12,
        }}
      >
        こんにちは、{names[daughterIdx]}！🌟
      </div>

      {justDid && (
        <Banner color={color}>🎉 「{justDid}」を ぱぱに おしらせしたよ！</Banner>
      )}
      {flash && <Banner color={palette.coral}>🧾 {flash}</Banner>}

      <SectionTitle>🌈 できる おてつだい</SectionTitle>
      <SortBar sortBy={sortBy} setSortBy={setSortBy} />
      {available.length === 0 ? (
        <Empty text="いまは おてつだいが ないみたい" />
      ) : (
        available.map((c) => (
          <Card key={c.id} accent={color}>
            <div
              style={{
                fontFamily: "'Zen Maru Gothic'",
                fontWeight: 700,
                fontSize: 18,
                color: palette.ink,
              }}
            >
              {c.title}
            </div>
            {c.memo && (
              <div style={{ fontSize: 13, color: "#8a7c66", margin: "2px 0" }}>{c.memo}</div>
            )}
            <div style={{ margin: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <RewardTag amount={choreYen(c)} />
              <button onClick={() => handleClaim(c)} style={primaryBtn(color, true)}>
                やったよ！✋
              </button>
            </div>
          </Card>
        ))
      )}

      {mine.length > 0 && (
        <>
          <SectionTitle>✨ やった おてつだい</SectionTitle>
          {mine.map((c) => (
            <Card key={c.id} accent={palette.leaf}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Zen Maru Gothic'", fontWeight: 700, color: palette.ink }}>
                  {c.title}
                </span>
                <RewardTag amount={choreYen(c)} />
              </div>
            </Card>
          ))}
        </>
      )}

      {/* 自分でやったお手伝いを登録 */}
      <SectionTitle>📝 やった おてつだいを とうろく</SectionTitle>
      <Card accent={color}>
        <input
          style={inputStyle}
          placeholder="なにを やった？（れい：くつをならべた）"
          value={sTitle}
          onChange={(e) => setSTitle(e.target.value)}
        />
        <input
          style={inputStyle}
          type="number"
          inputMode="numeric"
          placeholder="ごほうび（円）　れい：100"
          value={sAmount}
          onChange={(e) => setSAmount(e.target.value)}
        />
        <input
          style={{ ...inputStyle, marginBottom: 12 }}
          placeholder="メモ（なくてもOK）"
          value={sMemo}
          onChange={(e) => setSMemo(e.target.value)}
        />
        <button onClick={submitSelf} style={primaryBtn(color)}>
          やったよ！✋
        </button>
      </Card>

      {/* 必要経費の申請 */}
      <SectionTitle>🧾 ひつようけいひ を しんせい</SectionTitle>
      <Card accent={palette.coral}>
        <input
          style={inputStyle}
          placeholder="なにに つかった？（れい：えんぴつ）"
          value={eWhat}
          onChange={(e) => setEWhat(e.target.value)}
        />
        <input
          style={inputStyle}
          type="number"
          inputMode="numeric"
          placeholder="いくら つかった？（円）"
          value={eAmount}
          onChange={(e) => setEAmount(e.target.value)}
        />
        <input
          style={{ ...inputStyle, marginBottom: 12 }}
          placeholder="いつ つかった？（れい：5/30）"
          value={eDate}
          onChange={(e) => setEDate(e.target.value)}
        />
        <button onClick={submitExpense} style={primaryBtn(palette.coral)}>
          しんせい する
        </button>
      </Card>
    </div>
  );
}

function Banner({ color, children }) {
  return (
    <div
      style={{
        background: color,
        color: "#fff",
        border: `2.5px solid ${palette.ink}`,
        borderRadius: 14,
        padding: "12px 14px",
        textAlign: "center",
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        marginBottom: 14,
        boxShadow: `0 3px 0 ${palette.ink}`,
      }}
    >
      {children}
    </div>
  );
}

// ── 小物 ─────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2
      style={{
        fontFamily: "'Zen Maru Gothic'",
        fontWeight: 700,
        fontSize: 16,
        color: palette.ink,
        margin: "22px 0 10px",
      }}
    >
      {children}
    </h2>
  );
}

function Empty({ text }) {
  return (
    <div
      style={{
        textAlign: "center",
        color: "#b3a48a",
        fontSize: 14,
        padding: "16px 0",
        border: `2px dashed ${palette.line}`,
        borderRadius: 14,
      }}
    >
      {text}
    </div>
  );
}

const primaryBtn = (color, big) => ({
  border: `2.5px solid ${palette.ink}`,
  background: color,
  color: "#fff",
  borderRadius: 12,
  padding: big ? "10px 18px" : "10px 14px",
  fontFamily: "'Zen Maru Gothic'",
  fontWeight: 700,
  fontSize: big ? 16 : 15,
  cursor: "pointer",
  boxShadow: `0 3px 0 ${palette.ink}`,
  whiteSpace: "nowrap",
  width: big ? "auto" : "100%",
});

const ghostBtn = {
  border: `2px solid ${palette.line}`,
  background: palette.paper,
  color: "#8a7c66",
  borderRadius: 10,
  padding: "8px 14px",
  fontFamily: "'Klee One'",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

function fmtDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
