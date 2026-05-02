"""
Rule-based suggestion engine.
Covers: missing values, distribution shape, outliers,
        feature engineering, and dimensionality.

Each generator receives the processed column list from the backend.
Skewness, kurtosis, outlier_count, and outlier_pct are written onto
col["stats"] by compute_visualizations() before suggestions are called,
so they are available here.
"""


# ─────────────────────────────────────────────────────────────
# 1. Missing Value Suggestions (unchanged)
# ─────────────────────────────────────────────────────────────

def generate_missing_value_suggestions(columns, total_rows):
    suggestions = []

    for col in columns:
        missing_pct  = col["missing_pct"]
        missing_count = col["missing_count"]
        name          = col["name"]
        semantic_type = col["semantic_type"]

        if missing_count == 0:
            continue

        # Rule 1: Critical (>50%)
        if missing_pct > 50:
            suggestions.append({
                "column": name,
                "severity": "high",
                "title": "Critical missing data",
                "message": (
                    f"'{name}' has {missing_pct}% missing ({missing_count:,}/{total_rows:,} rows). "
                    "Consider dropping unless critical."
                ),
                "actions": [
                    "Evaluate if this column is essential to your analysis",
                    f"Drop it: df.drop(columns=['{name}'], inplace=True)",
                    "If critical, explore advanced imputation or external data",
                ],
            })
            continue

        # Rule 2: High (20–50%)
        if missing_pct >= 20:
            if semantic_type == "numeric":
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values in numeric column",
                    "message": f"'{name}' has {missing_pct}% missing. Median or KNN imputation recommended.",
                    "actions": [
                        f"Median: df['{name}'].fillna(df['{name}'].median(), inplace=True)",
                        "KNN: from sklearn.impute import KNNImputer",
                        "Consider creating a missingness indicator column",
                    ],
                })
            elif semantic_type == "categorical":
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values in categorical column",
                    "message": f"'{name}' has {missing_pct}% missing. Mode or 'Unknown' category.",
                    "actions": [
                        f"Mode: df['{name}'].fillna(df['{name}'].mode()[0], inplace=True)",
                        f"Unknown: df['{name}'].fillna('Unknown', inplace=True)",
                    ],
                })
            else:
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values",
                    "message": f"'{name}' has {missing_pct}% missing — impute or remove.",
                    "actions": ["Impute with type-appropriate strategy or drop the column"],
                })
            continue

        # Rule 3: Moderate (5–20%)
        if missing_pct >= 5:
            if semantic_type == "numeric":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Moderate missing values in numeric column",
                    "message": f"'{name}' has {missing_pct}% missing. Mean/median imputation is safe.",
                    "actions": [
                        f"Mean: df['{name}'].fillna(df['{name}'].mean(), inplace=True)",
                        f"Median: df['{name}'].fillna(df['{name}'].median(), inplace=True)",
                        "For time series, consider .interpolate()",
                    ],
                })
            elif semantic_type == "categorical":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Moderate missing in categorical column",
                    "message": f"'{name}' has {missing_pct}% missing. Mode or 'Missing' category.",
                    "actions": [
                        f"Mode: df['{name}'].fillna(df['{name}'].mode()[0], inplace=True)",
                        "Or create 'Missing' category to preserve information",
                    ],
                })
            elif semantic_type == "datetime":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Missing datetime values",
                    "message": f"'{name}' has {missing_pct}% missing datetimes. Forward/back fill recommended.",
                    "actions": [
                        f"Forward fill: df['{name}'].ffill(inplace=True)",
                        f"Backward fill: df['{name}'].bfill(inplace=True)",
                    ],
                })
            continue

        # Rule 4: Low (<5%)
        if missing_pct > 0:
            suggestions.append({
                "column": name,
                "severity": "low",
                "title": "Minor missing values",
                "message": (
                    f"'{name}' has {missing_pct}% missing ({missing_count:,} rows). "
                    "Safe to drop rows or impute."
                ),
                "actions": [
                    f"Drop rows: df.dropna(subset=['{name}'], inplace=True)",
                    f"Or impute: df['{name}'].fillna(appropriate_value, inplace=True)",
                ],
            })

    severity_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: severity_order[x["severity"]])
    return suggestions


# ─────────────────────────────────────────────────────────────
# 2. Distribution Suggestions (new)
# ─────────────────────────────────────────────────────────────

def generate_distribution_suggestions(columns):
    """
    Recommend transformations for skewed numeric columns.
    Uses skewness written by compute_visualizations onto col['stats'].
    """
    suggestions = []

    for col in columns:
        if col["semantic_type"] != "numeric" or not col["stats"]:
            continue

        skewness = col["stats"].get("skewness")
        if skewness is None:
            continue

        name = col["name"]
        direction = "right" if skewness > 0 else "left"

        # Extreme skew (|skew| > 2.0)
        if abs(skewness) > 2.0:
            suggestions.append({
                "column": name,
                "severity": "high",
                "title": f"Extreme {direction}-skew in '{name}' (skew={skewness:.2f})",
                "message": (
                    f"'{name}' is strongly non-normal. This will distort linear models, "
                    "distance-based algorithms, and parametric tests."
                ),
                "actions": [
                    f"Log transform (right-skew): df['{name}'] = np.log1p(df['{name}'])",
                    f"Sqrt transform: df['{name}'] = np.sqrt(df['{name}'].clip(0))",
                    "Box-Cox (all positive): from scipy.stats import boxcox",
                    "Power transform: sklearn.preprocessing.PowerTransformer",
                ],
            })

        # Notable skew (1.0 < |skew| ≤ 2.0)
        elif abs(skewness) > 1.0:
            suggestions.append({
                "column": name,
                "severity": "medium",
                "title": f"Notable {direction}-skew in '{name}' (skew={skewness:.2f})",
                "message": (
                    f"'{name}' is noticeably non-normal. May affect model performance."
                ),
                "actions": [
                    f"Log transform: df['{name}'] = np.log1p(df['{name}'])",
                    f"Inspect: df['{name}'].hist(bins=30)",
                    "Tree-based models (XGBoost, RandomForest) are invariant to this",
                ],
            })

    return suggestions


# ─────────────────────────────────────────────────────────────
# 3. Outlier Suggestions (new)
# ─────────────────────────────────────────────────────────────

def generate_outlier_suggestions(columns):
    """
    Suggest handling strategies for columns with detected outliers.
    Uses outlier_count / outlier_pct from col['stats'].
    """
    suggestions = []

    for col in columns:
        if col["semantic_type"] != "numeric" or not col["stats"]:
            continue

        outlier_count = col["stats"].get("outlier_count", 0)
        outlier_pct   = col["stats"].get("outlier_pct", 0.0)
        name          = col["name"]

        if not outlier_count:
            continue

        # Very high outlier rate (>10%)
        if outlier_pct > 10:
            suggestions.append({
                "column": name,
                "severity": "high",
                "title": f"Very high outlier rate in '{name}' ({outlier_pct}%)",
                "message": (
                    f"{outlier_pct}% of '{name}' values are outside 1.5×IQR fences. "
                    "This may indicate data errors or a naturally heavy-tailed distribution."
                ),
                "actions": [
                    "Inspect raw data for entry errors",
                    f"Winsorize: from scipy.stats.mstats import winsorize; "
                    f"winsorize(df['{name}'], limits=[0.05, 0.05])",
                    "Use RobustScaler: sklearn.preprocessing.RobustScaler",
                    "Consider log transform to compress extreme values",
                ],
            })

        # Moderate outliers (count > 5 OR pct > 0.5%)
        elif outlier_count > 5 or outlier_pct > 0.5:
            suggestions.append({
                "column": name,
                "severity": "medium",
                "title": f"Outliers detected in '{name}' ({outlier_count} values)",
                "message": (
                    f"{outlier_count} outlier(s) ({outlier_pct}%) in '{name}' "
                    "using the IQR method."
                ),
                "actions": [
                    f"Inspect: df[df['{name}'] > df['{name}'].quantile(0.75) + "
                    f"1.5*(df['{name}'].quantile(0.75)-df['{name}'].quantile(0.25))]",
                    "Cap/remove based on domain knowledge",
                    "Use RobustScaler instead of StandardScaler in your pipeline",
                ],
            })

    return suggestions


# ─────────────────────────────────────────────────────────────
# 4. Feature Engineering Suggestions (new)
# ─────────────────────────────────────────────────────────────

def generate_feature_engineering_suggestions(columns):
    """
    Datetime decomposition, categorical encoding, and high-cardinality handling.
    """
    suggestions = []

    for col in columns:
        name          = col["name"]
        semantic_type = col["semantic_type"]
        unique_count  = col["unique_count"]

        # Datetime decomposition
        if semantic_type == "datetime":
            suggestions.append({
                "column": name,
                "severity": "low",
                "title": f"Datetime decomposition for '{name}'",
                "message": (
                    f"'{name}' is a datetime — extracting components typically adds "
                    "more predictive signal than using the raw timestamp."
                ),
                "actions": [
                    f"df['{name}'] = pd.to_datetime(df['{name}'])",
                    f"df['year'] = df['{name}'].dt.year",
                    f"df['month'] = df['{name}'].dt.month",
                    f"df['dayofweek'] = df['{name}'].dt.dayofweek",
                    f"df['is_weekend'] = df['{name}'].dt.dayofweek >= 5",
                ],
            })

        elif semantic_type == "categorical":
            # High-cardinality (>10 unique values)
            if unique_count > 10:
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": f"High-cardinality categorical: '{name}' ({unique_count} values)",
                    "message": (
                        f"One-hot encoding '{name}' will create {unique_count} new columns. "
                        "Consider grouping rare categories or using target/frequency encoding."
                    ),
                    "actions": [
                        "Keep top-N, label rest as 'Other'",
                        "Target encoding: from category_encoders import TargetEncoder",
                        f"Frequency encoding: df['{name}_freq'] = "
                        f"df.groupby('{name}')['{name}'].transform('count')",
                    ],
                })

            # Low-cardinality (2–10 unique) — one-hot is fine
            elif unique_count >= 2:
                suggestions.append({
                    "column": name,
                    "severity": "low",
                    "title": f"Encode categorical: '{name}' ({unique_count} categories)",
                    "message": (
                        f"'{name}' has {unique_count} categories — suitable for one-hot encoding."
                    ),
                    "actions": [
                        f"One-hot: pd.get_dummies(df, columns=['{name}'], drop_first=True)",
                        "Or label encode: from sklearn.preprocessing import LabelEncoder",
                    ],
                })

    return suggestions


# ─────────────────────────────────────────────────────────────
# 5. Dimensionality Suggestions (new)
# ─────────────────────────────────────────────────────────────

def generate_dimensionality_suggestions(columns):
    """
    Flag near-zero-variance columns and suggest PCA/feature selection
    when there are many numeric features.
    """
    suggestions = []
    numeric_cols = [c for c in columns if c["semantic_type"] == "numeric" and c["stats"]]

    # Near-zero variance: std < 0.001 AND CV < 0.01
    low_var_names = []
    for col in numeric_cols:
        std  = col["stats"].get("std")
        mean = col["stats"].get("mean")
        if std is not None and mean is not None and std < 0.001:
            cv = abs(std / mean) if mean != 0 else 0
            if cv < 0.01:
                low_var_names.append(col["name"])

    if low_var_names:
        suggestions.append({
            "severity": "medium",
            "title": "Near-zero variance columns detected",
            "message": (
                f"Columns {low_var_names} have extremely low variance — "
                "they contribute almost no signal to models."
            ),
            "actions": [
                "Drop these before modeling",
                "from sklearn.feature_selection import VarianceThreshold",
                "selector = VarianceThreshold(threshold=0.01)",
                "X_reduced = selector.fit_transform(X)",
            ],
        })

    # Many numeric features → suggest dimensionality reduction
    if len(numeric_cols) > 10:
        suggestions.append({
            "severity": "low",
            "title": f"Many numeric features ({len(numeric_cols)}) — consider dimensionality reduction",
            "message": (
                f"With {len(numeric_cols)} numeric columns, dimensionality reduction "
                "can reduce noise and speed up training."
            ),
            "actions": [
                "PCA: from sklearn.decomposition import PCA",
                "Check explained variance: pca.explained_variance_ratio_",
                "Feature selection: SelectKBest or RFE",
                "Drop one column from each highly correlated pair (check heatmap)",
            ],
        })

    return suggestions


# ─────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────

def generate_all_suggestions(response_data):
    """
    Generates all suggestion categories from the processed upload data.
    Returns a dict with categorized suggestions and a priority summary.
    """
    columns    = response_data["columns"]
    total_rows = response_data["shape"]["rows"]

    missing       = generate_missing_value_suggestions(columns, total_rows)
    distribution  = generate_distribution_suggestions(columns)
    outliers      = generate_outlier_suggestions(columns)
    feature_eng   = generate_feature_engineering_suggestions(columns)
    dimensionality = generate_dimensionality_suggestions(columns)

    all_s = missing + distribution + outliers + feature_eng + dimensionality

    return {
        "missing_value":      missing,
        "distribution":       distribution,
        "outliers":           outliers,
        "feature_engineering": feature_eng,
        "dimensionality":     dimensionality,
        "priority_summary": {
            "high":   len([s for s in all_s if s["severity"] == "high"]),
            "medium": len([s for s in all_s if s["severity"] == "medium"]),
            "low":    len([s for s in all_s if s["severity"] == "low"]),
        },
    }