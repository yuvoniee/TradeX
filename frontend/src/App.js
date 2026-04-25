import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { SCENARIOS, REFERENCE_TRADES } from "./data";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

// ── Screens ──────────────────────────────────────────────────────────────────
const SCREEN = { HOME: "home", SIM: "sim", RESULTS: "results" };

// ── Speed map ─────────────────────────────────────────────────────────────────
const SPEED = { "3M": 350, "6M": 650, "1Y": 950 };

// ── Ticker data ───────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  { sym: "RELIANCE", price: "2,847.30", chg: "+1.2%" , up: true },
  { sym: "HDFCBANK", price: "1,642.50", chg: "-0.4%", up: false },
  { sym: "INFY",     price: "1,521.80", chg: "+2.1%", up: true },
  { sym: "TCS",      price: "3,908.45", chg: "+0.7%", up: true },
  { sym: "WIPRO",    price: "467.20",   chg: "-1.1%", up: false },
  { sym: "HDFC",     price: "2,710.60", chg: "+0.9%", up: true },
  { sym: "BAJFINANCE", price: "6,834.90", chg: "-0.6%", up: false },
  { sym: "NIFTY50", price: "22,147.00", chg: "+0.5%", up: true },
  { sym: "SENSEX",  price: "73,201.00", chg: "+0.4%", up: true },
];

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ passed, total }) {
  const r = 50, circ = 2 * Math.PI * r;
  const pct = total > 0 ? passed / total : 0;
  const offset = circ * (1 - pct);
  const cls = pct >= 0.67 ? "high" : pct >= 0.34 ? "mid" : "low";

  return (
    <div className="score-ring">
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r={r} className="ring-bg" />
        <circle
          cx="60" cy="60" r={r}
          className={`ring-fill ${cls}`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-center">
        <div className="score-num">{passed}</div>
        <div className="score-den">of {total}</div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState(SCREEN.HOME);
  const [scenario, setScenario] = useState(null);
  const [timeframe, setTimeframe] = useState("6M");
  const [priceIdx, setPriceIdx] = useState(0);
  const [drawnPrices, setDrawnPrices] = useState([]);
  const [inTrade, setInTrade] = useState(false);
  const [entryIdx, setEntryIdx] = useState(null);
  const [entryReason, setEntryReason] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [logs, setLogs] = useState([]);
  const [flashClass, setFlashClass] = useState("");
  const [result, setResult] = useState(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const timerRef = useRef(null);
  const prevPriceRef = useRef(null);

  const addLog = useCallback((msg, type = "") => {
    setLogs((prev) => [...prev.slice(-19), { msg, type, id: Date.now() + Math.random() }]);
  }, []);

  // ── Start scenario ──────────────────────────────────────────────────────────
  const startScenario = (s) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setScenario(s);
    setPriceIdx(0);
    setDrawnPrices([s.data[0]]);
    setInTrade(false);
    setEntryIdx(null);
    setEntryReason("");
    setExitReason("");
    setLogs([{ msg: "Market open. Watching price action…", type: "", id: 1 }]);
    prevPriceRef.current = s.data[0];
    setScreen(SCREEN.SIM);
  };

  // ── Price tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== SCREEN.SIM || !scenario) return;
    const speed = SPEED[timeframe] || 650;

    timerRef.current = setInterval(() => {
      setPriceIdx((idx) => {
        if (idx >= scenario.data.length - 1) {
          clearInterval(timerRef.current);
          if (inTrade) {
            // auto-exit at end
            evaluateTrade(idx, true);
          }
          return idx;
        }
        const next = idx + 1;
        const p = scenario.data[next];
        const prev = scenario.data[idx];
        setDrawnPrices((dp) => [...dp, p]);
        setFlashClass(p > prev ? "flash-green" : "flash-red");
        setTimeout(() => setFlashClass(""), 400);
        prevPriceRef.current = prev;
        return next;
      });
    }, speed);

    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line
  }, [screen, scenario, timeframe]);

  // ── Watch for live behavior warnings ───────────────────────────────────────
  useEffect(() => {
    if (!inTrade || !scenario || entryIdx === null) return;
    const p = scenario.data[priceIdx];
    const peak = Math.max(...scenario.data.slice(0, priceIdx + 1));
    const ep = scenario.data[entryIdx];
    if (ep >= peak * 0.96 && priceIdx - entryIdx === 2) {
      addLog("⚠ Possible FOMO entry — you entered near peak", "warn");
    }
    const pnl = ((p - ep) / ep) * 100;
    if (pnl < -8 && priceIdx - entryIdx > 3) {
      addLog("⚠ Trade is -8%+ — consider your stop loss plan", "warn");
    }
  }, [priceIdx, inTrade, entryIdx, scenario, addLog]);

  // ── Enter trade ─────────────────────────────────────────────────────────────
  const enterTrade = () => {
    if (inTrade) return;
    if (!entryReason.trim()) {
      alert("You must explain your reasoning before entering a trade.");
      return;
    }
    setInTrade(true);
    setEntryIdx(priceIdx);
    const ep = scenario.data[priceIdx];
    addLog(`Entered at $${ep.toFixed(2)}`, "good");
    addLog(`Reason: ${entryReason.slice(0, 70)}${entryReason.length > 70 ? "…" : ""}`, "");
  };

  // ── Exit trade ──────────────────────────────────────────────────────────────
  const exitTrade = () => {
    if (!inTrade) { alert("You are not in a trade."); return; }
    clearInterval(timerRef.current);
    evaluateTrade(priceIdx, false);
  };

  // ── Evaluate ────────────────────────────────────────────────────────────────
  const evaluateTrade = useCallback((exitPriceIdx, auto) => {
    const prices = scenario.data;
    const ep = prices[entryIdx];
    const xp = prices[exitPriceIdx];
    const peak = Math.max(...prices);
    const kw = scenario.keywords;

    const hasGood = kw.good.some((k) => entryReason.toLowerCase().includes(k));
    const hasRisk = kw.risk.some((k) => entryReason.toLowerCase().includes(k));
    const earlyExit = !auto && exitPriceIdx < prices.length - 3;
    const fomoEntry = ep >= peak * 0.96;
    const pnlPct = ((xp - ep) / ep) * 100;
    const inconsistent = fomoEntry && entryReason.toLowerCase().includes("support");

    const behaviors = [];
    if (fomoEntry)            behaviors.push({ label: "FOMO entry", cls: "bad" });
    if (earlyExit)            behaviors.push({ label: "Early exit", cls: "warn" });
    if (!hasRisk)             behaviors.push({ label: "No risk plan", cls: "bad" });
    if (hasGood && !fomoEntry) behaviors.push({ label: "Technical reasoning", cls: "good" });
    if (hasRisk)              behaviors.push({ label: "Risk-aware", cls: "good" });
    if (!earlyExit)           behaviors.push({ label: "Position held", cls: "good" });
    if (inconsistent)         behaviors.push({ label: "Inconsistent reasoning", cls: "bad" });

    const passed = [];
    const failed = [];

    scenario.tests.forEach((t) => {
      const tl = t.toLowerCase();
      let pass = false;
      if (tl.includes("support") || tl.includes("reversal") || tl.includes("consolidat") || tl.includes("identify") || tl.includes("entry")) {
        pass = hasGood && !fomoEntry;
      } else if (tl.includes("stop") || tl.includes("risk") || tl.includes("manage") || tl.includes("protect")) {
        pass = hasRisk;
      } else if (tl.includes("hold") || tl.includes("patience") || tl.includes("volatil") || tl.includes("conviction") || tl.includes("recovery")) {
        pass = !earlyExit;
      } else if (tl.includes("mention") || tl.includes("reason") || tl.includes("acknowledge") || tl.includes("trend")) {
        pass = hasGood;
      } else if (tl.includes("avoid") || tl.includes("wait") || tl.includes("confirm")) {
        pass = !fomoEntry && hasGood;
      } else {
        pass = hasGood;
      }
      if (pass) passed.push(t);
      else failed.push(t);
    });

    setResult({ passed, failed, behaviors, pnlPct, ep, xp: prices[exitPriceIdx], inconsistent, fomoEntry, earlyExit, hasRisk, hasGood });
    setInTrade(false);
    setScreen(SCREEN.RESULTS);

    // Fetch AI insight
    setAiLoading(true);
    setAiText("");
    fetchAI({ passed, failed, behaviors, pnlPct, inconsistent, fomoEntry, earlyExit, hasRisk });
  // eslint-disable-next-line
  }, [scenario, entryIdx, entryReason, exitReason]);

  // ── AI fetch ────────────────────────────────────────────────────────────────
  const fetchAI = async ({ passed, failed, behaviors, pnlPct, inconsistent, fomoEntry, earlyExit, hasRisk }) => {
    try {
      const res = await fetch("http://localhost:5000/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: scenario.title,
          entryReason,
          exitReason,
          behaviors: behaviors.map((b) => b.label),
          pnlPct,
          score: passed.length,
          total: scenario.tests.length,
          inconsistent,
          fomoEntry,
          earlyExit,
          hasRisk,
        }),
      });
      if (!res.ok) throw new Error(`Backend responded with ${res.status}`);
      const data = await res.json();
      setAiText(data.insight || "No insight returned.");
    } catch (err) {
      console.error("AI fetch error:", err.message);
      setAiText("AI coaching unavailable. Make sure the backend is running: open a terminal in the /backend folder and run `node server.js`. Also ensure Ollama is running in the background.");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Back ────────────────────────────────────────────────────────────────────
  const goHome = () => {
    clearInterval(timerRef.current);
    setScreen(SCREEN.HOME);
    setScenario(null);
    setInTrade(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const currentPrice = scenario ? scenario.data[priceIdx] : 100;
  const prevPrice = prevPriceRef.current || currentPrice;
  const priceDir = currentPrice > prevPrice ? "up" : currentPrice < prevPrice ? "down" : "";
  const progress = scenario ? Math.round((priceIdx / (scenario.data.length - 1)) * 100) : 0;
  const pnl = inTrade && entryIdx !== null
    ? (((currentPrice - scenario.data[entryIdx]) / scenario.data[entryIdx]) * 100).toFixed(2)
    : null;

  // ── Chart config ────────────────────────────────────────────────────────────
  const chartData = {
    labels: drawnPrices.map((_, i) => i),
    datasets: [
      {
        data: drawnPrices,
        borderColor: "#c8f135",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 240);
          gradient.addColorStop(0, "rgba(200,241,53,0.15)");
          gradient.addColorStop(1, "rgba(200,241,53,0)");
          return gradient;
        },
      },
      inTrade && entryIdx !== null
        ? {
            data: drawnPrices.map((_, i) => (i === entryIdx ? scenario.data[entryIdx] : null)),
            pointRadius: drawnPrices.map((_, i) => (i === entryIdx ? 6 : 0)),
            pointBackgroundColor: "#4ade80",
            borderWidth: 0,
            tension: 0,
          }
        : null,
    ].filter(Boolean),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: { legend: { display: false }, tooltip: {
      callbacks: { label: (ctx) => `$${ctx.parsed.y.toFixed(2)}` },
      backgroundColor: "#18181f",
      borderColor: "#2e2e3a",
      borderWidth: 1,
      titleColor: "#9090a8",
      bodyColor: "#f0f0f8",
      padding: 10,
    }},
    scales: {
      x: { display: false },
      y: {
        ticks: {
          font: { family: "'DM Mono', monospace", size: 11 },
          color: "#5a5a70",
          callback: (v) => "$" + v.toFixed(0),
        },
        grid: { color: "rgba(255,255,255,0.03)" },
        border: { display: false },
      },
    },
  };

  // ── HINT CHIPS ──────────────────────────────────────────────────────────────
  const HINTS = ["support level", "RSI oversold", "trend reversal", "breakout confirmed", "stop loss at -8%", "6-month hold plan"];
  const appendHint = (h) => setEntryReason((r) => (r ? r + ". " + h : h));

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap">
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="nav-logo">
          <div className="logo-dot" />
          TRADEX
        </div>
        <div className="nav-tag">Long-term trading trainer</div>
      </nav>

      {/* ── HOME SCREEN ── */}
      {screen === SCREEN.HOME && (
        <div className="screen active">
          <div className="container">
            {/* Hero */}
            <div className="hero">
              <div className="hero-eyebrow">Behavioural trading education</div>
              <h1>Train your<br /><em>trading mind</em></h1>
              <p className="hero-sub">
                Most traders lose not from bad strategies, but from bad decisions under pressure.
                TRADEX trains your reasoning, discipline, and long-term conviction — not just your clicks.
              </p>
              <div className="hero-stats">
                <div className="hero-stat"><span className="n">5</span><span className="l">Scenarios</span></div>
                <div className="hero-stat"><span className="n">6</span><span className="l">Reference trades</span></div>
                <div className="hero-stat"><span className="n">AI</span><span className="l">Coaching</span></div>
                <div className="hero-stat"><span className="n">0</span><span className="l">Real money at risk</span></div>
              </div>
            </div>

            {/* Ticker */}
            <div className="ticker-wrap">
              <div className="ticker-inner">
                {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                  <div key={i} className="ticker-item">
                    <strong>{item.sym}</strong>
                    <span>{item.price}</span>
                    <span className={item.up ? "up" : "down"}>{item.chg}</span>
                    <span style={{ color: "#2a2a35", marginLeft: 12 }}>|</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reference trades */}
            <div className="section-head">
              <h2>Reference trades</h2>
              <span className="tag">Study before you play</span>
            </div>
            <div className="ref-grid">
              {REFERENCE_TRADES.map((r, i) => (
                <div key={i} className={`ref-card ${r.type}`}>
                  <span className="ref-type">{r.type === "good" ? "✓ Good trade" : "✗ Bad trade"}</span>
                  <h4>{r.label}</h4>
                  <div className="ref-title">{r.title}</div>
                  <p>{r.why}</p>
                  <span className="ref-signal">{r.signal}</span>
                </div>
              ))}
            </div>

            <div className="divider" />

            {/* Scenarios */}
            <div className="section-head">
              <h2>Choose a scenario</h2>
              <span className="tag">Your reasoning will be evaluated</span>
            </div>
            <div className="scenario-grid">
              {SCENARIOS.map((s) => (
                <div key={s.id} className="scenario-card" onClick={() => startScenario(s)}>
                  <div className={`sc-icon ${s.iconColor}`}>{s.icon}</div>
                  <h3>{s.title}</h3>
                  <p className="sc-desc">{s.desc}</p>
                  <ul className="sc-tests">
                    {s.tests.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                  <div className="sc-footer">
                    <span className="sc-duration">⏱ {s.duration}</span>
                    <div className="sc-arrow">→</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SIMULATOR SCREEN ── */}
      {screen === SCREEN.SIM && scenario && (
        <div className="screen active">
          <div className="container">
            <div className="sim-layout">
              {/* Main panel */}
              <div className="sim-main">
                <div className="sim-topbar">
                  <div className="sim-title">
                    <h2>{scenario.title}</h2>
                    <p>{scenario.desc}</p>
                  </div>
                  <button className="btn-back" onClick={goHome}>← Back</button>
                </div>

                {/* Timeframe */}
                <div className="tf-row">
                  <span className="tf-label">Speed:</span>
                  {["3M", "6M", "1Y"].map((tf) => (
                    <button
                      key={tf}
                      className={`tf-btn${timeframe === tf ? " active" : ""}`}
                      onClick={() => setTimeframe(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Progress */}
                <div className="progress-wrap">
                  <div className="progress-labels">
                    <span>Start</span>
                    <span>{progress}% of {scenario.duration}</span>
                    <span>End</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Price board */}
                <div className={`price-board ${flashClass} ${inTrade ? "in-trade-glow" : ""}`}>
                  <div className="price-top">
                    <div className="price-label">{scenario.title}</div>
                    <div className={`price-change ${priceDir}`}>
                      {priceDir === "up" ? "▲" : priceDir === "down" ? "▼" : "—"}{" "}
                      {Math.abs(currentPrice - prevPrice).toFixed(2)}{" "}
                      ({prevPrice > 0 ? (((currentPrice - prevPrice) / prevPrice) * 100).toFixed(2) : "0.00"}%)
                    </div>
                  </div>
                  <div className={`price-number ${priceDir}`}>${currentPrice.toFixed(2)}</div>
                </div>

                {/* Chart */}
                <div className="chart-container">
                  <Line data={chartData} options={chartOptions} />
                </div>

                {/* Stats */}
                <div className="stat-row">
                  <div className="stat-box">
                    <div className="s-label">Status</div>
                    <div className="s-value">{inTrade ? "In trade" : "Watching"}</div>
                  </div>
                  <div className="stat-box">
                    <div className="s-label">Entry</div>
                    <div className="s-value">
                      {entryIdx !== null ? "$" + scenario.data[entryIdx].toFixed(2) : "—"}
                    </div>
                  </div>
                  <div className="stat-box">
                    <div className="s-label">P&L</div>
                    <div className={`s-value${pnl !== null ? (pnl > 0 ? " up" : " down") : ""}`}>
                      {pnl !== null ? (pnl > 0 ? "+" : "") + pnl + "%" : "—"}
                    </div>
                  </div>
                  <div className="stat-box">
                    <div className="s-label">Progress</div>
                    <div className="s-value">{progress}%</div>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="sim-sidebar">
                {/* Entry reasoning */}
                {!inTrade && (
                  <div className="sidebar-card">
                    <div className="sidebar-title">
                      <div className="dot" />
                      Why are you entering?
                    </div>
                    <textarea
                      className="reason-textarea"
                      rows={5}
                      placeholder="e.g. I see a support bounce forming. RSI oversold. My plan is to hold for 6 months with a 10% stop loss…"
                      value={entryReason}
                      onChange={(e) => setEntryReason(e.target.value)}
                    />
                    <div className="reason-hints">
                      {HINTS.map((h) => (
                        <button key={h} className="hint-chip" onClick={() => appendHint(h)}>{h}</button>
                      ))}
                    </div>
                    <button className="btn-enter" onClick={enterTrade} disabled={priceIdx >= scenario.data.length - 1}>
                      Enter trade →
                    </button>
                  </div>
                )}

                {/* Exit reasoning */}
                {inTrade && (
                  <div className="sidebar-card in-trade-glow">
                    <div className="sidebar-title">
                      <div className="dot red" />
                      Position active
                    </div>
                    <div style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)" }}>
                      Entered @ ${scenario.data[entryIdx]?.toFixed(2)} · {pnl !== null ? (pnl > 0 ? "+" : "") + pnl + "%" : "—"}
                    </div>
                    <textarea
                      className="reason-textarea"
                      rows={3}
                      placeholder="Why are you exiting now? Target hit? Thesis broken? Stop triggered?"
                      value={exitReason}
                      onChange={(e) => setExitReason(e.target.value)}
                    />
                    <button className="btn-exit" onClick={exitTrade}>Exit trade</button>
                  </div>
                )}

                {/* Tests for this scenario */}
                <div className="sidebar-card">
                  <div className="sidebar-title">
                    <div className="dot" style={{ background: "var(--blue)" }} />
                    What's being evaluated
                  </div>
                  <ul className="sc-tests">
                    {scenario.tests.map((t) => (
                      <li key={t} style={{ color: "var(--text2)", marginBottom: 8 }}>{t}</li>
                    ))}
                  </ul>
                </div>

                {/* Live log */}
                <div className="sidebar-card">
                  <div className="sidebar-title" style={{ marginBottom: 8 }}>
                    <div className="dot" style={{ background: "var(--amber)" }} />
                    Live log
                  </div>
                  <div className="log-scroll" id="log-scroll">
                    {logs.map((l) => (
                      <div key={l.id} className={`log-item ${l.type}`}>{l.msg}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS SCREEN ── */}
      {screen === SCREEN.RESULTS && result && (
        <div className="screen active">
          <div className="container">
            <div className="results-wrap">
              {/* Score hero */}
              <div className="results-hero">
                <ScoreRing passed={result.passed.length} total={scenario.tests.length} />
                <h2>
                  {result.passed.length === scenario.tests.length
                    ? "Excellent discipline"
                    : result.passed.length >= scenario.tests.length * 0.67
                    ? "Good trader mindset"
                    : result.passed.length >= scenario.tests.length * 0.34
                    ? "Needs improvement"
                    : "Significant gaps found"}
                </h2>
                <div className={`pnl ${result.pnlPct > 0 ? "up" : "down"}`}>
                  {result.pnlPct > 0 ? "+" : ""}{result.pnlPct.toFixed(2)}% P&L
                  {" "}·{" "}
                  Entry ${result.ep.toFixed(2)} → Exit ${result.xp.toFixed(2)}
                </div>
              </div>

              {/* Behavior tags */}
              <div className="behavior-row">
                {result.behaviors.map((b, i) => (
                  <span key={i} className={`btag ${b.cls}`} style={{ animationDelay: `${i * 0.06}s` }}>
                    {b.cls === "good" ? "✓" : b.cls === "bad" ? "✗" : "!"} {b.label}
                  </span>
                ))}
              </div>

              {/* Inconsistency warning */}
              {result.inconsistent && (
                <div className="inconsistency-alert">
                  ⚠ Inconsistency detected — you claimed "support entry" but entered near the price peak
                </div>
              )}

              {/* Pass/Fail grid */}
              <div className="results-grid">
                <div className="result-panel">
                  <h3>Passed ({result.passed.length})</h3>
                  {result.passed.length === 0
                    ? <div className="result-item" style={{ color: "var(--text3)" }}>None passed</div>
                    : result.passed.map((p, i) => (
                        <div key={i} className="result-item pass" style={{ animationDelay: `${i * 0.08}s` }}>
                          <span className="result-icon">✓</span>{p}
                        </div>
                      ))}
                </div>
                <div className="result-panel">
                  <h3>Failed ({result.failed.length})</h3>
                  {result.failed.length === 0
                    ? <div className="result-item" style={{ color: "var(--text3)" }}>Nothing failed — clean trade!</div>
                    : result.failed.map((f, i) => (
                        <div key={i} className="result-item fail" style={{ animationDelay: `${i * 0.08}s` }}>
                          <span className="result-icon">✗</span>{f}
                        </div>
                      ))}
                </div>
              </div>

              {/* AI coaching */}
              <div className="ai-panel">
                <div className="ai-header">
                  <span className="ai-badge">AI trading coach</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)" }}>
                    Powered by Claude
                  </span>
                </div>
                {aiLoading ? (
                  <div className="ai-loading">
                    <div className="ai-dots">
                      <span /><span /><span />
                    </div>
                    Analysing your trade…
                  </div>
                ) : (
                  <div className="ai-text">{aiText}</div>
                )}
              </div>

              {/* CTA */}
              <div className="results-cta">
                <button className="btn-retry" onClick={goHome}>← Try another scenario</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
