import io
import math
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from suggestions import generate_all_suggestions

app = FastAPI(title="EDA Explorer API", version="1.0.0")

# ✅ CORS (production-safe)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ds-proj-gamma.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def safe_float(x):
    """Convert NaN/inf to None and round floats"""
    try:
        if pd.isna(x) or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
            return None
        return round(float(x), 4)
    except:
        return None


def clean_nan(obj):
    """Recursively replace NaN with None (JSON-safe)"""
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

    # Optional file size limit (5MB)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    try:
        if ext == "csv":
            df = pd.read_csv(
                io.BytesIO(content),
                encoding="utf-8",
                on_bad_lines="skip",
                engine="python"
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

    # ─── Column Analysis ───
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
            }
        else:
            col_info["stats"] = None

        columns.append(col_info)

    # ─── Preview (FIXED PROPERLY) ───
    preview_df = df.head(5).copy()
    preview_df = preview_df.astype(object).where(pd.notnull(preview_df), None)
    preview = preview_df.to_dict(orient="records")

    # ─── Suggestions ───
    suggestions_output = generate_all_suggestions({
        "filename": filename,
        "shape": {"rows": total_rows, "cols": total_cols},
        "total_missing": total_missing,
        "total_missing_pct": round((total_missing / total_cells) * 100, 1) if total_cells else 0,
        "complete_columns": sum(1 for c in columns if c["missing_count"] == 0),
        "columns": columns,
        "preview": preview,
    })

    # ─── Final Response ───
    response = {
        "filename": filename,
        "shape": {
            "rows": total_rows,
            "cols": total_cols,
        },
        "total_missing": total_missing,
        "total_missing_pct": round((total_missing / total_cells) * 100, 1) if total_cells else 0,
        "complete_columns": sum(1 for c in columns if c["missing_count"] == 0),
        "columns": columns,
        "preview": preview,
        "suggestions": suggestions_output,
    }

    # 🔥 FINAL SAFETY PASS
    return clean_nan(response)


# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}