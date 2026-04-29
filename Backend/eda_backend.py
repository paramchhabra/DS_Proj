# main.py
# Run with: uvicorn main:app --reload --port 8000
# Install deps: pip install fastapi uvicorn pandas openpyxl python-multipart

import io
import pandas as pd
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="EDA Explorer API", version="1.0.0")

# Allow requests from the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ds-proj-gamma.vercel.app"],  # allow all (for now)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def safe_float(x):
    if pd.isna(x) or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), 4)

def infer_semantic_type(series: pd.Series) -> str:
    """Infer a human-friendly data type beyond pandas dtype."""
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    # Try to detect datetime strings
    non_null = series.dropna()
    if non_null.empty:
        return "empty"
    try:
        pd.to_datetime(non_null.head(100), infer_datetime_format=True)
        return "datetime"
    except Exception:
        pass
    # Categorical heuristic: fewer than 10 unique values or < 20% of total
    unique_ratio = series.nunique() / max(len(series), 1)
    if series.nunique() <= 10 or unique_ratio < 0.2:
        return "categorical"
    return "text"


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Accept a CSV or Excel file and return EDA summary:
    - shape
    - column metadata (type, missing count/%, unique count)
    - first 5 rows as preview
    - basic numeric summary stats
    """
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext not in {"csv", "xlsx", "xls"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Please upload a .csv, .xlsx, or .xls file."
        )

    content = await file.read()

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {str(e)}")

    if df.empty:
        raise HTTPException(status_code=422, detail="The uploaded file contains no data.")

    total_rows, total_cols = df.shape
    total_cells = total_rows * total_cols
    total_missing = int(df.isnull().sum().sum())

    # --- Column-level metadata ---
    columns = []
    for col in df.columns:
        series = df[col]
        missing_count = int(series.isnull().sum())
        missing_pct = round((missing_count / total_rows) * 100, 1) if total_rows > 0 else 0.0
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

        # Numeric summary stats
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

    # --- Data preview (first 5 rows) ---
    # Replace NaN with None so JSON serialises cleanly
    preview_df = df.head(5).where(pd.notnull(df.head(5)), other=None)
    preview = preview_df.to_dict(orient="records")

    return {
        "filename": filename,
        "shape": {
            "rows": total_rows,
            "cols": total_cols,
        },
        "total_missing": total_missing,
        "total_missing_pct": round((total_missing / total_cells) * 100, 1) if total_cells > 0 else 0.0,
        "complete_columns": sum(1 for c in columns if c["missing_count"] == 0),
        "columns": columns,
        "preview": preview,
    }


@app.get("/health")
def health():
    return {"status": "ok"}
