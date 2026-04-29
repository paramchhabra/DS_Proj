// App.jsx
// Install deps: npm install axios

import { useState, useCallback } from "react";
import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL;

// ─── Helpers ────────────────────────────────────────────────────────────────

const typeColor = {
  numeric:     { text: "#6ee7b7", bg: "#052e16", border: "#6ee7b722" },
  categorical: { text: "#a5b4fc", bg: "#1e1b4b", border: "#a5b4fc22" },
  datetime:    { text: "#fcd34d", bg: "#451a03", border: "#fcd34d22" },
  text:        { text: "#f9a8d4", bg: "#4a044e", border: "#f9a8d422" },
  empty:       { text: "#e5e7eb", bg: "#1f2937", border: "#e5e7eb22" },
};

const missingColor = (pct) => {
  if (pct === 0)   return "#6ee7b7";
  if (pct < 10)    return "#fcd34d";
  return "#f87171";
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Badge({ type }) {
  const c = typeColor[type] || typeColor.empty;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: "2px 10px", fontSize: 11,
      fontWeight: 700, letterSpacing: 0.5,
    }}>{type}</span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: "#1e2130", borderRadius: 12, padding: "18px 24px",
      flex: 1, minWidth: 130, border: "1px solid #2e3347",
    }}>
      <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: "#f1f5f9", fontSize: 28, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MissingBar({ pct }) {
  const color = missingColor(pct);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 6, background: "#2e3347", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 13 }}>{pct}%</span>
    </div>
  );
}

function SectionHeader({ emoji, title, sub }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid #2e3347", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{emoji} {title}</h2>
      {sub && <span style={{ color: "#64748b", fontSize: 13 }}>{sub}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EDAExplorer() {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError]     = useState("");

  const uploadFile = async (file) => {
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await axios.post(`${API_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (err) {
      // const msg = err.response?.data?.detail || "Upload failed. Is the backend running?";
      const msg = err.response?.data?.detail;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, []);

  const onInputChange = (e) => { if (e.target.files[0]) uploadFile(e.target.files[0]); };

  const colHeaders = ["#", "Column Name", "Pandas dtype", "Semantic Type", "Unique", "Missing", "Missing %"];

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#f1f5f9", fontFamily: "'Inter', sans-serif", padding: "32px 20px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔬</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, background: "linear-gradient(90deg,#a5b4fc,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              EDA Explorer
            </h1>
            <span style={{ background: "#1e2130", color: "#6366f1", border: "1px solid #312e81", borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>v1 · API-backed</span>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Upload a CSV or Excel file. All analysis runs on the <strong style={{ color: "#818cf8" }}>FastAPI backend</strong> — zero front-end processing.
          </p>
        </div>

        {/* ── Upload Zone ── */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => document.getElementById("fileInput").click()}
          style={{
            border: `2px dashed ${dragging ? "#6366f1" : "#2e3347"}`,
            borderRadius: 16, padding: "44px 24px", textAlign: "center",
            background: dragging ? "#1a1d2e" : "#13151f", cursor: "pointer",
            transition: "all 0.2s", marginBottom: 28,
            boxShadow: dragging ? "0 0 0 4px #6366f122" : "none",
          }}>
          <input id="fileInput" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={onInputChange} />
          <div style={{ fontSize: 38, marginBottom: 10 }}>{loading ? "⏳" : "📂"}</div>
          {loading
            ? <p style={{ color: "#94a3b8", margin: 0, fontWeight: 600 }}>Sending to backend for analysis…</p>
            : <>
                <p style={{ color: "#cbd5e1", margin: "0 0 6px", fontWeight: 600 }}>
                  {result ? `✅ Loaded: ${result.filename}` : "Drop your file here or click to browse"}
                </p>
                <p style={{ color: "#475569", margin: 0, fontSize: 13 }}>Supports .csv · .xlsx · .xls</p>
              </>
          }
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div style={{ background: "#2d0f0f", border: "1px solid #f87171", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", marginBottom: 24, fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}

        {result && (
          <>
            {/* ── Stat Cards ── */}
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <StatCard label="Rows"             value={result.shape.rows.toLocaleString()} sub="observations" />
              <StatCard label="Columns"          value={result.shape.cols}                  sub="features" />
              <StatCard label="Total Missing"    value={result.total_missing.toLocaleString()} sub={`${result.total_missing_pct}% of all cells`} />
              <StatCard label="Complete Columns" value={result.complete_columns}            sub="no missing values" />
            </div>

            {/* ── Column Overview ── */}
            <div style={{ background: "#1e2130", borderRadius: 16, border: "1px solid #2e3347", overflow: "hidden", marginBottom: 28 }}>
              <SectionHeader emoji="📋" title="Column Overview" sub={`${result.shape.cols} columns`} />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#161822" }}>
                      {colHeaders.map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2e3347", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.columns.map((c, i) => (
                      <tr key={c.name}
                        style={{ borderBottom: "1px solid #1a1d2e" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#252838"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "10px 16px", color: "#475569" }}>{i + 1}</td>
                        <td style={{ padding: "10px 16px", color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace" }}>{c.name}</td>
                        <td style={{ padding: "10px 16px", color: "#64748b", fontFamily: "monospace", fontSize: 12 }}>{c.pandas_dtype}</td>
                        <td style={{ padding: "10px 16px" }}><Badge type={c.semantic_type} /></td>
                        <td style={{ padding: "10px 16px", color: "#94a3b8" }}>{c.unique_count.toLocaleString()}</td>
                        <td style={{ padding: "10px 16px", color: c.missing_count > 0 ? "#f87171" : "#6ee7b7" }}>{c.missing_count}</td>
                        <td style={{ padding: "10px 16px" }}><MissingBar pct={c.missing_pct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Numeric Stats ── */}
            {result.columns.some(c => c.stats) && (
              <div style={{ background: "#1e2130", borderRadius: 16, border: "1px solid #2e3347", overflow: "hidden", marginBottom: 28 }}>
                <SectionHeader emoji="📊" title="Numeric Summary" sub="mean · median · std · min · max · IQR" />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#161822" }}>
                        {["Column", "Mean", "Median", "Std Dev", "Min", "Max", "Q25", "Q75"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #2e3347", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.columns.filter(c => c.stats).map(c => (
                        <tr key={c.name}
                          style={{ borderBottom: "1px solid #1a1d2e" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#252838"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "10px 16px", color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace" }}>{c.name}</td>
                          {["mean","median","std","min","max","q25","q75"].map(k => (
                            <td key={k} style={{ padding: "10px 16px", color: "#94a3b8", fontFamily: "monospace" }}>{c.stats[k]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Data Preview ── */}
            <div style={{ background: "#1e2130", borderRadius: 16, border: "1px solid #2e3347", overflow: "hidden", marginBottom: 24 }}>
              <SectionHeader emoji="👁️" title="Data Preview" sub="First 5 rows" />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#161822" }}>
                      {result.columns.map(c => (
                        <th key={c.name} style={{ padding: "10px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid #2e3347", whiteSpace: "nowrap", fontFamily: "monospace" }}>{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row, i) => (
                      <tr key={i}
                        style={{ borderBottom: "1px solid #1a1d2e" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#252838"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        {result.columns.map(c => (
                          <td key={c.name} style={{ padding: "9px 14px", color: row[c.name] == null ? "#475569" : "#cbd5e1", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row[c.name] == null ? <em style={{ color: "#475569" }}>null</em> : String(row[c.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Legend ── */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 16px", background: "#1e2130", borderRadius: 10, border: "1px solid #2e3347" }}>
              <span style={{ color: "#64748b", fontSize: 12, fontWeight: 700, marginRight: 4 }}>TYPE LEGEND:</span>
              {Object.entries(typeColor).filter(([t]) => t !== "empty").map(([type, c]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c.text }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{type}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}