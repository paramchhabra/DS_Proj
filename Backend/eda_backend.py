import io
import math
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from suggestions import generate_all_suggestions

app = FastAPI(title="EDA Explorer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ds-proj-gamma.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_float(x):
    """Convert NaN/inf to None and round floats."""
    try:
        if pd.isna(x) or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
            return None
        return round(float(x), 4)
    except:
        return None


def clean_nan(obj):
    """Recursively replace NaN/inf with None (JSON-safe)."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    return obj


def infer_semantic_type(series: pd.Series) -> str:
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    non_null = series.dropna()
    if non_null.empty:
        return "empty"

    try:
        pd.to_datetime(non_null.head(100))
        return "datetime"
    except:
        pass

    unique_ratio = series.nunique() / max(len(series), 1)
    if series.nunique() <= 10 or unique_ratio < 0.2:
        return "categorical"

    return "text"


# ─────────────────────────────────────────────────────────────
# Visualization Engine
# ─────────────────────────────────────────────────────────────

def compute_visualizations(df: pd.DataFrame, col_info_list: list, total_rows: int) -> dict:
    """
    Rule-based visualization selector.
    Each visualization is only generated when its statistical thresholds are met.
    Thresholds are documented inline so the logic is auditable.
    """
    numeric_names = [c["name"] for c in col_info_list if c["semantic_type"] == "numeric"]

    result = {
        "histograms": [],
        "outliers": [],
        "correlation_heatmap": None,
        "scatter_plots": [],
        "box_plots": [],
    }

    # ── Step 1: Compute per-column distribution statistics ─────────────────
    col_dist = {}
    for name in numeric_names:
        series = df[name].dropna()
        if len(series) < 3:
            continue  # too few values to compute meaningful stats

        try:
            skew = float(scipy_stats.skew(series))
            kurt = float(scipy_stats.kurtosis(series))  # excess kurtosis (Fisher)
        except Exception:
            skew, kurt = 0.0, 0.0

        mean = float(series.mean())
        std = float(series.std())
        # CV = std/mean — measures spread relative to scale; >1 = very wide range
        cv = abs(std / mean) if mean != 0 else float("inf")

        # IQR outlier fences (Tukey method)
        q25 = float(series.quantile(0.25))
        q75 = float(series.quantile(0.75))
        iqr = q75 - q25
        lower_fence = q25 - 1.5 * iqr
        upper_fence = q75 + 1.5 * iqr

        outlier_mask = (series < lower_fence) | (series > upper_fence)
        outlier_count = int(outlier_mask.sum())
        outlier_pct = round((outlier_count / len(series)) * 100, 2)

        col_dist[name] = {
            "skew": skew,
            "kurt": kurt,
            "cv": cv,
            "q25": q25,
            "q75": q75,
            "iqr": iqr,
            "lower_fence": lower_fence,
            "upper_fence": upper_fence,
            "outlier_count": outlier_count,
            "outlier_pct": outlier_pct,
            "outlier_values": series[outlier_mask].head(10).tolist(),
            "series": series,
        }

    # ── Step 2: Histograms ─────────────────────────────────────────────────
    # Rule: show if dataset is small (<1000), OR skew>1, OR kurtosis>1, OR CV>1
    for name, d in col_dist.items():
        reasons = []

        if total_rows < 1000:
            reasons.append(f"small dataset ({total_rows} rows) — always show distribution")

        if abs(d["skew"]) > 1.0:
            severity = "extreme" if abs(d["skew"]) > 2.0 else "notable"
            direction = "right" if d["skew"] > 0 else "left"
            reasons.append(f"{severity} {direction}-skew ({d['skew']:.2f})")

        if abs(d["kurt"]) > 1.0:
            reasons.append(f"excess kurtosis = {d['kurt']:.2f} (heavy tails)")

        if d["cv"] != float("inf") and d["cv"] > 1.0:
            reasons.append(f"coefficient of variation = {d['cv']:.2f} (wide spread)")

        if not reasons:
            continue

        # Build histogram bins with numpy
        n_bins = min(30, max(5, len(d["series"]) // 10))
        hist, edges = np.histogram(d["series"], bins=n_bins)
        hist_data = [
            {"bin": f"{edges[i]:.3g}–{edges[i+1]:.3g}", "count": int(hist[i])}
            for i in range(len(hist))
        ]

        insights = []
        if abs(d["skew"]) > 2.0:
            insights.append(
                f"Strongly {'right' if d['skew']>0 else 'left'}-skewed — "
                f"log or sqrt transform strongly recommended before modeling"
            )
        elif abs(d["skew"]) > 1.0:
            insights.append(
                f"{'Right' if d['skew']>0 else 'Left'}-skewed — "
                f"consider transformation for linear/distance-based models"
            )
        if d["outlier_count"] > 0:
            insights.append(f"{d['outlier_count']} outlier(s) present in this column")

        result["histograms"].append({
            "column": name,
            "should_show": True,
            "reason": "; ".join(reasons),
            "insights": insights,
            "config": {
                "data": hist_data,
                "skewness": round(d["skew"], 4),
                "kurtosis": round(d["kurt"], 4),
                "cv": round(d["cv"], 4) if d["cv"] != float("inf") else None,
            },
        })

    # ── Step 3: Outlier Detection + Box Plots ──────────────────────────────
    # Rule: show if outlier count > 5 OR outlier_pct > 0.5%
    for name, d in col_dist.items():
        if d["outlier_count"] <= 5 and d["outlier_pct"] <= 0.5:
            continue

        series = d["series"]
        insights = [
            f"{d['outlier_count']} outlier(s) — {d['outlier_pct']}% of non-null values",
            f"IQR fences: [{d['lower_fence']:.4g}, {d['upper_fence']:.4g}]",
        ]
        if d["outlier_pct"] > 10:
            insights.append("Very high rate — check for data errors or use robust scaling")
        elif d["outlier_pct"] > 5:
            insights.append("Consider Winsorization or RobustScaler in sklearn")

        outlier_entry = {
            "column": name,
            "should_show": True,
            "reason": (
                f"IQR method: {d['outlier_count']} values ({d['outlier_pct']}%) "
                f"lie beyond Tukey fences (Q1-1.5×IQR, Q3+1.5×IQR)"
            ),
            "insights": insights,
            "config": {
                "outlier_count": d["outlier_count"],
                "outlier_pct": d["outlier_pct"],
                "lower_bound": round(d["lower_fence"], 4),
                "upper_bound": round(d["upper_fence"], 4),
                "sample_outliers": [round(float(v), 4) for v in d["outlier_values"]],
                "q25": round(d["q25"], 4),
                "q75": round(d["q75"], 4),
                "iqr": round(d["iqr"], 4),
                "median": round(float(series.median()), 4),
                "min": round(float(series.min()), 4),
                "max": round(float(series.max()), 4),
            },
        }
        result["outliers"].append(outlier_entry)

        # Box plot: one per column with detected outliers
        result["box_plots"].append({
            "column": name,
            "should_show": True,
            "reason": f"Showing distribution shape for '{name}' which has {d['outlier_count']} outliers",
            "insights": insights,
            "config": {
                "min": round(float(series.min()), 4),
                "q25": round(d["q25"], 4),
                "median": round(float(series.median()), 4),
                "q75": round(d["q75"], 4),
                "max": round(float(series.max()), 4),
                # whiskers extend to the last non-outlier value within fences
                "lower_whisker": round(float(max(series.min(), d["lower_fence"])), 4),
                "upper_whisker": round(float(min(series.max(), d["upper_fence"])), 4),
            },
        })

    # ── Step 4: Correlation Heatmap + Scatter Plots ────────────────────────
    # Rule: heatmap only if >= 3 numeric cols AND max|r| > 0.5
    if len(numeric_names) >= 3:
        # Trim to top-10 columns by variance if there are more than 15
        working = numeric_names
        if len(numeric_names) > 15:
            variances = {n: float(df[n].var()) for n in numeric_names}
            working = sorted(variances, key=lambda x: -variances[x])[:10]

        try:
            corr_df = df[working].corr()
        except Exception:
            corr_df = None

        if corr_df is not None:
            matrix = []
            max_abs = 0.0
            strong_pairs = []
            seen_pairs: set = set()

            for r in working:
                row = []
                for c in working:
                    val = corr_df.loc[r, c]
                    v = (
                        None
                        if (pd.isna(val) or np.isinf(val))
                        else round(float(val), 3)
                    )
                    row.append(v)
                    if r != c and v is not None:
                        if abs(v) > max_abs:
                            max_abs = abs(v)
                        # Collect strongly correlated pairs (|r| > 0.7)
                        if abs(v) > 0.7:
                            key = tuple(sorted([r, c]))
                            if key not in seen_pairs:
                                seen_pairs.add(key)
                                strong_pairs.append({"col1": r, "col2": c, "r": v})
                matrix.append(row)

            # Only show heatmap if max |r| > 0.5
            if max_abs > 0.5:
                insights = [f"Strongest absolute correlation: {max_abs:.2f}"]
                if strong_pairs:
                    insights.append(f"{len(strong_pairs)} pair(s) with |r| > 0.7 (strong)")
                    for p in strong_pairs[:3]:
                        insights.append(f"  {p['col1']} ↔ {p['col2']} → r = {p['r']:.2f}")

                result["correlation_heatmap"] = {
                    "should_show": True,
                    "reason": (
                        f"Max |r| = {max_abs:.2f} > 0.5 — meaningful linear "
                        f"relationships exist among numeric columns"
                    ),
                    "insights": insights,
                    "config": {
                        "columns": working,
                        "matrix": matrix,
                        "strong_pairs": strong_pairs,
                        "max_abs_corr": round(max_abs, 3),
                    },
                }

            # Scatter plots: top-3 pairs with |r| > 0.6, dataset < 10k rows
            if total_rows < 10_000:
                scatter_candidates = []
                seen_scatter: set = set()

                for r in working:
                    for c in working:
                        if r == c:
                            continue
                        key = tuple(sorted([r, c]))
                        if key in seen_scatter:
                            continue
                        seen_scatter.add(key)
                        val = corr_df.loc[r, c]
                        if pd.isna(val) or np.isinf(val):
                            continue
                        if abs(float(val)) > 0.6:
                            scatter_candidates.append((abs(float(val)), r, c, float(val)))

                scatter_candidates.sort(reverse=True)

                for _, col1, col2, r_val in scatter_candidates[:3]:
                    raw = df[[col1, col2]].dropna().head(500).to_dict(orient="records")
                    pts = [
                        {"x": safe_float(row[col1]), "y": safe_float(row[col2])}
                        for row in raw
                    ]
                    pts = [p for p in pts if p["x"] is not None and p["y"] is not None]

                    result["scatter_plots"].append({
                        "col1": col1,
                        "col2": col2,
                        "should_show": True,
                        "reason": (
                            f"|r| = {abs(r_val):.2f} > 0.6 and dataset < 10k rows — "
                            f"strong enough to warrant direct inspection"
                        ),
                        "insights": [
                            f"Pearson r = {r_val:.3f} "
                            f"({'positive' if r_val > 0 else 'negative'} correlation)",
                            f"{'Strong' if abs(r_val) > 0.8 else 'Moderate'} linear relationship",
                        ],
                        "config": {
                            "r": round(r_val, 3),
                            "data": pts,
                            "x_label": col1,
                            "y_label": col2,
                        },
                    })

    # ── Step 5: Write extended stats back onto column objects ──────────────
    # These are used by suggestions.py for distribution/outlier recommendations
    for c in col_info_list:
        if c["name"] in col_dist and c["stats"] is not None:
            d = col_dist[c["name"]]
            c["stats"]["skewness"] = round(d["skew"], 4)
            c["stats"]["kurtosis"] = round(d["kurt"], 4)
            c["stats"]["outlier_count"] = d["outlier_count"]
            c["stats"]["outlier_pct"] = d["outlier_pct"]

    return result


# ─────────────────────────────────────────────────────────────
# Main Endpoint
# ─────────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext not in {"csv", "xlsx", "xls"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'"
        )

    content = await file.read()

    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    try:
        if ext == "csv":
            df = pd.read_csv(
                io.BytesIO(content),
                encoding="utf-8",
                on_bad_lines="skip",
                engine="python",
            )
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=422, detail="File contains no data")

    total_rows, total_cols = df.shape
    total_cells = total_rows * total_cols
    total_missing = int(df.isnull().sum().sum())

    # ─── Column Analysis ───────────────────────────────────────────────────
    columns = []

    for col in df.columns:
        series = df[col]

        missing_count = int(series.isnull().sum())
        missing_pct = round((missing_count / total_rows) * 100, 1) if total_rows else 0

        semantic_type = infer_semantic_type(series)
        unique_count = int(series.nunique(dropna=True))

        col_info = {
            "name": col,
            "pandas_dtype": str(series.dtype),
            "semantic_type": semantic_type,
            "missing_count": missing_count,
            "missing_pct": missing_pct,
            "unique_count": unique_count,
        }

        if semantic_type == "numeric":
            desc = series.describe()
            col_info["stats"] = {
                "mean":   safe_float(desc.get("mean")),
                "median": safe_float(series.median()),
                "std":    safe_float(desc.get("std")),
                "min":    safe_float(desc.get("min")),
                "max":    safe_float(desc.get("max")),
                "q25":    safe_float(desc.get("25%")),
                "q75":    safe_float(desc.get("75%")),
                # skewness, kurtosis, outlier_count, outlier_pct added by compute_visualizations
            }
        else:
            col_info["stats"] = None

        columns.append(col_info)

    # ─── Visualizations (rule-based) ───────────────────────────────────────
    visualizations = compute_visualizations(df, columns, total_rows)

    # ─── Preview ───────────────────────────────────────────────────────────
    preview_df = df.head(5).copy()
    preview_df = preview_df.astype(object).where(pd.notnull(preview_df), None)
    preview = preview_df.to_dict(orient="records")

    # ─── Suggestions ───────────────────────────────────────────────────────
    suggestions_output = generate_all_suggestions({
        "filename": filename,
        "shape": {"rows": total_rows, "cols": total_cols},
        "total_missing": total_missing,
        "total_missing_pct": round((total_missing / total_cells) * 100, 1) if total_cells else 0,
        "complete_columns": sum(1 for c in columns if c["missing_count"] == 0),
        "columns": columns,
        "preview": preview,
    })

    # ─── Final Response ────────────────────────────────────────────────────
    response = {
        "filename": filename,
        "shape": {"rows": total_rows, "cols": total_cols},
        "total_missing": total_missing,
        "total_missing_pct": round((total_missing / total_cells) * 100, 1) if total_cells else 0,
        "complete_columns": sum(1 for c in columns if c["missing_count"] == 0),
        "columns": columns,
        "preview": preview,
        "suggestions": suggestions_output,
        "visualizations": visualizations,   # ← new
    }

    return clean_nan(response)


# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}