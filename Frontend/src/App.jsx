import { useState, useCallback } from "react";
import axios from "axios";


const API_URL = "https://ds-proj-xmrc.onrender.com";

// ─── Design tokens ──────────────────────────────────────────────────────────

const typeColor = {
  numeric:     { text: "#6ee7b7", bg: "#052e16", border: "#6ee7b722" },
  categorical: { text: "#a5b4fc", bg: "#1e1b4b", border: "#a5b4fc22" },
  datetime:    { text: "#fcd34d", bg: "#451a03", border: "#fcd34d22" },
  text:        { text: "#f9a8d4", bg: "#4a044e", border: "#f9a8d422" },
  empty:       { text: "#e5e7eb", bg: "#1f2937", border: "#e5e7eb22" },
};

const missingColor = (pct) => {
  if (pct === 0) return "#6ee7b7";
  if (pct < 10)  return "#fcd34d";
  return "#f87171";
};

// Correlation value → RGB colour (blue=positive, red=negative, white=0)
const corrColor = (r) => {
  if (r === null || r === undefined) return "#2e3347";
  const t = Math.abs(Math.max(-1, Math.min(1, r)));
  if (r >= 0) {
    const g = Math.round(241 + (59  - 241) * t);
    const b = Math.round(245 + (130 - 245) * t);
    const c = Math.round(249 + (246 - 249) * t);
    return `rgb(${g},${b},${c})`;
  }
  const g = Math.round(241 + (239 - 241) * t);
  const b = Math.round(245 + (68  - 245) * t);
  const c = Math.round(249 + (68  - 249) * t);
  return `rgb(${g},${b},${c})`;
};

// ─── Shared UI primitives ────────────────────────────────────────────────────

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

function SeverityBadge({ severity }) {
  const colors = {
    high:   { bg: "#991b1b", text: "#fecaca", border: "#ef4444" },
    medium: { bg: "#7c2d12", text: "#fed7aa", border: "#f97316" },
    low:    { bg: "#14532d", text: "#bbf7d0", border: "#22c55e" },
  };
  const c = colors[severity] || colors.low;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{severity}</span>
  );
}

function SuggestionItem({ suggestion }) {
  return (
    <div style={{ background: "#1a1d2e", borderRadius: 8, padding: 16, border: "1px solid #2e3347", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <SeverityBadge severity={suggestion.severity} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{suggestion.title}</h3>
      </div>
      <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: 13 }}>{suggestion.message}</p>
      <div>
        <h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Actions:</h4>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1", fontSize: 12 }}>
          {(suggestion.actions || []).map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
        </ul>
      </div>
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

// ─── Insight chip row ───────────────────────────────────────────────────────

function InsightList({ insights }) {
  if (!insights?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {insights.map((ins, i) => (
        <span key={i} style={{
          background: "#1e2130", border: "1px solid #2e3347",
          borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#94a3b8",
        }}>💡 {ins}</span>
      ))}
    </div>
  );
}

// ─── Expandable visualization card ──────────────────────────────────────────

function VizCard({ title, reason, insights, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#13151f", border: "1px solid #2e3347", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
      {/* Header row — always visible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: "14px 16px", cursor: "pointer",
          background: open ? "#1a1d2e" : "transparent",
          transition: "background 0.15s" }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0", marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            <span style={{ color: "#6366f1", fontWeight: 600 }}>Why shown: </span>{reason}
          </div>
          {!open && <InsightList insights={insights} />}
        </div>
        <span style={{ color: "#475569", fontSize: 18, marginLeft: 12, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </div>

      {/* Expandable chart area */}
      {open && (
        <div style={{ borderTop: "1px solid #2e3347", padding: "16px" }}>
          <InsightList insights={insights} />
          <div style={{ marginTop: 16 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

// ─── Chart components ────────────────────────────────────────────────────────

// Pure SVG histogram — no recharts needed
function HistogramChart({ config }) {
  const data = config.data || [];
  if (!data.length) return null;

  const W = 540, H = 200, PL = 44, PR = 12, PT = 8, PB = 48;
  const innerW = W - PL - PR, innerH = H - PT - PB;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barW = innerW / data.length;
  // Show every Nth label so they don't overlap
  const step = Math.ceil(data.length / 8);
  const [tooltip, setTooltip] = useState(null);

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = PT + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={PL} y1={y} x2={PL + innerW} y2={y} stroke="#2e3347" strokeWidth={1} />
              <text x={PL - 4} y={y + 4} textAnchor="end" fill="#64748b" fontSize={10}>
                {Math.round(maxCount * t)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const bh = (d.count / maxCount) * innerH;
          const x = PL + i * barW;
          const y = PT + innerH - bh;
          return (
            <g key={i}
              onMouseEnter={() => setTooltip({ i, x: x + barW / 2, y, d })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}>
              <rect x={x + 1} y={y} width={barW - 2} height={bh}
                fill={tooltip?.i === i ? "#818cf8" : "#6366f1"} rx={2} />
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => i % step === 0 && (
          <text key={i} x={PL + i * barW + barW / 2} y={H - PB + 14}
            textAnchor="middle" fill="#64748b" fontSize={9}
            transform={`rotate(-30, ${PL + i * barW + barW / 2}, ${H - PB + 14})`}>
            {d.bin.split("–")[0]}
          </text>
        ))}

        {/* Axes */}
        <line x1={PL} y1={PT} x2={PL} y2={PT + innerH} stroke="#475569" strokeWidth={1} />
        <line x1={PL} y1={PT + innerH} x2={PL + innerW} y2={PT + innerH} stroke="#475569" strokeWidth={1} />
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", pointerEvents: "none",
          left: `calc(${(tooltip.x / W) * 100}% - 60px)`, top: 0,
          background: "#1e2130", border: "1px solid #2e3347", borderRadius: 6,
          padding: "6px 10px", fontSize: 12, color: "#e2e8f0", whiteSpace: "nowrap",
        }}>
          <div style={{ color: "#64748b", fontSize: 11 }}>{tooltip.d.bin}</div>
          <div><strong style={{ color: "#a5b4fc" }}>{tooltip.d.count}</strong> values</div>
        </div>
      )}
    </div>
  );
}

// Pure SVG scatter plot — no recharts needed
function ScatterPlotChart({ config }) {
  const { data = [], x_label, y_label, r } = config;
  if (!data.length) return null;

  const W = 540, H = 240, PL = 48, PR = 16, PT = 12, PB = 40;
  const innerW = W - PL - PR, innerH = H - PT - PB;

  const xs = data.map(p => p.x).filter(v => v != null);
  const ys = data.map(p => p.y).filter(v => v != null);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;

  const px = v => PL + ((v - xMin) / xRange) * innerW;
  const py = v => PT + innerH - ((v - yMin) / yRange) * innerH;

  const [tooltip, setTooltip] = useState(null);

  // Axis tick helpers
  const ticks = (min, max, n = 5) => {
    const step = (max - min) / (n - 1);
    return Array.from({ length: n }, (_, i) => min + i * step);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 6 }}>
        {x_label} vs {y_label} · Pearson r = <strong style={{ color: "#a5b4fc" }}>{r}</strong>
        <span style={{ color: "#475569", fontSize: 11, marginLeft: 8 }}>({data.length} pts shown)</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* Grid */}
        {ticks(yMin, yMax).map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={py(v)} x2={PL + innerW} y2={py(v)} stroke="#2e3347" strokeWidth={1} strokeDasharray="3 3" />
            <text x={PL - 4} y={py(v) + 4} textAnchor="end" fill="#64748b" fontSize={9}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {ticks(xMin, xMax).map((v, i) => (
          <text key={i} x={px(v)} y={PT + innerH + 14} textAnchor="middle" fill="#64748b" fontSize={9}>
            {v.toFixed(1)}
          </text>
        ))}

        {/* Points */}
        {data.map((p, i) => p.x != null && p.y != null && (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3}
            fill="#6366f1" fillOpacity={0.5} stroke="#818cf8" strokeWidth={0.5}
            onMouseEnter={() => setTooltip({ p, cx: px(p.x), cy: py(p.y) })}
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: "crosshair" }} />
        ))}

        {/* Axes */}
        <line x1={PL} y1={PT} x2={PL} y2={PT + innerH} stroke="#475569" strokeWidth={1} />
        <line x1={PL} y1={PT + innerH} x2={PL + innerW} y2={PT + innerH} stroke="#475569" strokeWidth={1} />

        {/* Axis labels */}
        <text x={PL + innerW / 2} y={H - 4} textAnchor="middle" fill="#64748b" fontSize={11}>{x_label}</text>
        <text x={12} y={PT + innerH / 2} textAnchor="middle" fill="#64748b" fontSize={11}
          transform={`rotate(-90, 12, ${PT + innerH / 2})`}>{y_label}</text>
      </svg>

      {tooltip && (
        <div style={{
          position: "absolute", pointerEvents: "none",
          left: tooltip.cx, top: tooltip.cy - 48,
          background: "#1e2130", border: "1px solid #2e3347", borderRadius: 6,
          padding: "5px 10px", fontSize: 11, color: "#e2e8f0", transform: "translateX(-50%)",
        }}>
          <div>{x_label}: <strong style={{ color: "#a5b4fc" }}>{tooltip.p.x}</strong></div>
          <div>{y_label}: <strong style={{ color: "#a5b4fc" }}>{tooltip.p.y}</strong></div>
        </div>
      )}
    </div>
  );
}

function CorrelationHeatmap({ config }) {
  const { columns, matrix } = config;
  const cellSize = Math.max(36, Math.min(60, Math.floor(520 / columns.length)));

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "inline-grid", gridTemplateColumns: `80px repeat(${columns.length}, ${cellSize}px)`, gap: 2 }}>
        {/* Top-left corner blank */}
        <div />
        {/* Column headers */}
        {columns.map(c => (
          <div key={c} style={{ color: "#64748b", fontSize: 10, fontWeight: 600,
            textAlign: "center", padding: "2px 2px 6px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={c}>{c}</div>
        ))}

        {/* Rows */}
        {matrix.map((row, ri) => [
          // Row label
          <div key={`lbl-${ri}`} style={{
            color: "#64748b", fontSize: 10, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            paddingRight: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={columns[ri]}>{columns[ri]}</div>,

          // Cells
          ...row.map((val, ci) => (
            <div key={`${ri}-${ci}`}
              title={`${columns[ri]} × ${columns[ci]}: ${val ?? "—"}`}
              style={{
                width: cellSize, height: cellSize,
                background: corrColor(val),
                borderRadius: 4,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700,
                color: val !== null && Math.abs(val) > 0.5 ? "#0f1117" : "#475569",
              }}>
              {val !== null ? val.toFixed(2) : ""}
            </div>
          )),
        ])}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: "#64748b" }}>
        <span style={{ background: "rgb(239,68,68)", width: 14, height: 14, borderRadius: 3, display: "inline-block" }} />
        <span>−1</span>
        <div style={{ width: 80, height: 10, borderRadius: 4, background: "linear-gradient(to right, rgb(239,68,68), rgb(241,245,249), rgb(59,130,246))" }} />
        <span>+1</span>
        <span style={{ background: "rgb(59,130,246)", width: 14, height: 14, borderRadius: 3, display: "inline-block" }} />
      </div>
    </div>
  );
}

// SVG box plot — renders the 5-number summary as a horizontal box
function BoxPlotSVG({ config }) {
  const { min, q25, median, q75, max, lower_whisker, upper_whisker } = config;
  const W = 460, H = 80, PAD = 40;
  const range = max - min || 1;
  const px = v => PAD + ((v - min) / range) * (W - PAD * 2);

  return (
    <div>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        {/* Whisker lines */}
        <line x1={px(lower_whisker)} y1={H / 2} x2={px(q25)} y2={H / 2} stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2" />
        <line x1={px(q75)} y1={H / 2} x2={px(upper_whisker)} y2={H / 2} stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2" />
        {/* End caps */}
        {[lower_whisker, upper_whisker].map((v, i) => (
          <line key={i} x1={px(v)} y1={H / 2 - 8} x2={px(v)} y2={H / 2 + 8} stroke="#475569" strokeWidth={1.5} />
        ))}
        {/* IQR box */}
        <rect x={px(q25)} y={H / 2 - 14} width={px(q75) - px(q25)} height={28}
          fill="#6366f133" stroke="#6366f1" strokeWidth={1.5} rx={3} />
        {/* Median line */}
        <line x1={px(median)} y1={H / 2 - 14} x2={px(median)} y2={H / 2 + 14}
          stroke="#a5b4fc" strokeWidth={2.5} />

        {/* Axis labels */}
        {[
          [lower_whisker, "min fence"],
          [q25, "Q1"],
          [median, "Median"],
          [q75, "Q3"],
          [upper_whisker, "max fence"],
        ].map(([v, lbl]) => (
          <text key={lbl} x={px(v)} y={H - 4} textAnchor="middle" fill="#64748b" fontSize={9}>{lbl}</text>
        ))}
      </svg>

      {/* Five-number summary */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {[["Min", min], ["Q1", q25], ["Median", median], ["Q3", q75], ["Max", max]].map(([lbl, val]) => (
          <div key={lbl} style={{ textAlign: "center" }}>
            <div style={{ color: "#64748b", fontSize: 10, fontWeight: 700 }}>{lbl}</div>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "monospace" }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Visualization panel ─────────────────────────────────────────────────────

function VisualizationsPanel({ viz }) {
  if (!viz) return null;

  const hasDistribution = viz.histograms?.length > 0;
  const hasOutliers     = viz.outliers?.length > 0 || viz.box_plots?.length > 0;
  const hasRelations    = viz.correlation_heatmap?.should_show || viz.scatter_plots?.length > 0;

  if (!hasDistribution && !hasOutliers && !hasRelations) return null;

  const panelStyle = {
    background: "#1e2130", borderRadius: 16, border: "1px solid #2e3347",
    overflow: "hidden", marginBottom: 28,
  };

  return (
    <>
      {/* ── Distribution Issues ── */}
      {hasDistribution && (
        <div style={panelStyle}>
          <SectionHeader emoji="📈" title="Distribution Issues" sub={`${viz.histograms.length} column(s)`} />
          <div style={{ padding: 16 }}>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>
              Histograms are shown only for columns that have notable skewness, heavy tails,
              wide spread, or are in a small dataset. Expand a card to see the chart.
            </p>
            {viz.histograms.map((h, i) => (
              <VizCard key={h.column} title={`Histogram — ${h.column}`} reason={h.reason} insights={h.insights} defaultOpen={i === 0}>
                <HistogramChart config={h.config} />
                <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {[["Skewness", h.config.skewness], ["Kurtosis", h.config.kurtosis], ["CV", h.config.cv]].map(([lbl, val]) => (
                    val !== null && (
                      <span key={lbl} style={{ background: "#252838", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#94a3b8" }}>
                        <strong style={{ color: "#a5b4fc" }}>{lbl}:</strong> {val}
                      </span>
                    )
                  ))}
                </div>
              </VizCard>
            ))}
          </div>
        </div>
      )}

      {/* ── Outlier Detection ── */}
      {hasOutliers && (
        <div style={panelStyle}>
          <SectionHeader emoji="🔍" title="Outlier Detection" sub={`${viz.outliers.length} column(s)`} />
          <div style={{ padding: 16 }}>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>
              Outliers detected using Tukey's IQR method (1.5×IQR fence).
              Columns are shown only if outlier count &gt; 5 OR &gt; 0.5% of values.
            </p>
            {viz.box_plots.map(bp => {
              const outlierEntry = viz.outliers.find(o => o.column === bp.column);
              return (
                <VizCard key={bp.column} title={`Outliers — ${bp.column}`} reason={bp.reason} insights={bp.insights} defaultOpen={i === 0}>
                  <BoxPlotSVG config={bp.config} />
                  {outlierEntry && (
                    <div style={{ marginTop: 14, background: "#0f1117", borderRadius: 8, padding: 12, border: "1px solid #2e3347" }}>
                      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                        Sample Outlier Values
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {outlierEntry.config.sample_outliers.map((v, i) => (
                          <span key={i} style={{ background: "#991b1b33", border: "1px solid #ef444444", borderRadius: 4, padding: "2px 8px", fontFamily: "monospace", fontSize: 12, color: "#fca5a5" }}>{v}</span>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                        Fences: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>[{outlierEntry.config.lower_bound}, {outlierEntry.config.upper_bound}]</span>
                        &nbsp;·&nbsp; IQR: <span style={{ color: "#94a3b8", fontFamily: "monospace" }}>{outlierEntry.config.iqr}</span>
                      </div>
                    </div>
                  )}
                </VizCard>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Relationships & Correlations ── */}
      {hasRelations && (
        <div style={panelStyle}>
          <SectionHeader emoji="🔗" title="Relationships & Correlations" />
          <div style={{ padding: 16 }}>
            <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: 13 }}>
              Correlation heatmap shown only if max |r| &gt; 0.5.
              Scatter plots shown for the top 3 pairs with |r| &gt; 0.6 and dataset &lt; 10k rows.
            </p>

            {viz.correlation_heatmap?.should_show && (
              <VizCard
                title="Correlation Heatmap"
                reason={viz.correlation_heatmap.reason}
                insights={viz.correlation_heatmap.insights}
              >
                <CorrelationHeatmap config={viz.correlation_heatmap.config} />
                {viz.correlation_heatmap.config.strong_pairs?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Strong pairs (|r| &gt; 0.7)</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {viz.correlation_heatmap.config.strong_pairs.map(p => (
                        <span key={`${p.col1}-${p.col2}`} style={{
                          background: "#1a1d2e", border: "1px solid #2e3347",
                          borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#a5b4fc",
                        }}>
                          {p.col1} ↔ {p.col2} <strong>r={p.r}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </VizCard>
            )}

            {(viz.scatter_plots || []).map(sp => (
              <VizCard
                key={`${sp.col1}-${sp.col2}`}
                title={`Scatter — ${sp.col1} vs ${sp.col2}`}
                reason={sp.reason}
                insights={sp.insights}
              >
                <ScatterPlotChart config={sp.config} />
              </VizCard>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EDAExplorer() {
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState("");

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
      const msg = err.response?.data;
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
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
            <span style={{ background: "#1e2130", color: "#6366f1", border: "1px solid #312e81", borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>v2 · with Visualizations</span>
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
                    {(result.columns || []).map((c, i) => (
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
                <SectionHeader emoji="📊" title="Numeric Summary" sub="mean · median · std · min · max · IQR · skewness" />
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#161822" }}>
                        {["Column", "Mean", "Median", "Std Dev", "Min", "Max", "Q25", "Q75", "Skewness", "Kurtosis"].map(h => (
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
                          <td style={{ padding: "10px 16px", fontFamily: "monospace",
                            color: Math.abs(c.stats.skewness ?? 0) > 2 ? "#f87171" : Math.abs(c.stats.skewness ?? 0) > 1 ? "#fcd34d" : "#6ee7b7" }}>
                            {c.stats.skewness ?? "—"}
                          </td>
                          <td style={{ padding: "10px 16px", color: "#94a3b8", fontFamily: "monospace" }}>
                            {c.stats.kurtosis ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Visualizations ── */}
            <VisualizationsPanel viz={result.visualizations} />

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
                    {(result.preview || []).map((row, i) => (
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
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 16px", background: "#1e2130", borderRadius: 10, border: "1px solid #2e3347", marginBottom: 24 }}>
              <span style={{ color: "#64748b", fontSize: 12, fontWeight: 700, marginRight: 4 }}>TYPE LEGEND:</span>
              {Object.entries(typeColor).filter(([t]) => t !== "empty").map(([type, c]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c.text }} />
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{type}</span>
                </div>
              ))}
            </div>

            {/* ── Suggestions ── */}
            {result?.suggestions && typeof result.suggestions === "object" && (
              <div style={{ marginTop: 4 }}>
                {/* Priority summary */}
                {result.suggestions.priority_summary && (
                  <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                    {[["high","#f87171","#991b1b"],["medium","#fb923c","#7c2d12"],["low","#4ade80","#14532d"]].map(([sev, text, bg]) => (
                      <div key={sev} style={{ background: bg, border: `1px solid ${text}44`, borderRadius: 8, padding: "8px 16px", display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ color: text, fontWeight: 800, fontSize: 20 }}>{result.suggestions.priority_summary[sev]}</span>
                        <span style={{ color: text, fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>{sev}</span>
                      </div>
                    ))}
                  </div>
                )}

                {Object.entries(result.suggestions)
                  .filter(([k, items]) => Array.isArray(items) && items.length > 0)
                  .map(([category, items]) => (
                    <div key={category} style={{ marginBottom: 24 }}>
                      <h3 style={{ color: "#64748b", fontSize: 13, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                        {category.replace(/_/g, " ")} <span style={{ color: "#475569", fontWeight: 400 }}>({items.length})</span>
                      </h3>
                      {items.map((item, i) => <SuggestionItem key={i} suggestion={item} />)}
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}