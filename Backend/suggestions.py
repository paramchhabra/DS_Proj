"""
Rule-based suggestion engine for missing value analysis.
Provides actionable next-steps for columns with missing data.
"""

def generate_missing_value_suggestions(columns, total_rows):
    """
    Generate suggestions for columns with missing values.

    Each rule checks:
    - Missing percentage
    - Column type
    - Context (e.g., target column)

    Returns: list of suggestion objects sorted by priority
    """
    suggestions = []

    for col in columns:
        missing_pct = col["missing_pct"]
        missing_count = col["missing_count"]
        name = col["name"]
        semantic_type = col["semantic_type"]
        unique_count = col["unique_count"]

        if missing_count == 0:
            continue

        # --- Rule 1: Critical missing (>50%) ---
        if missing_pct > 50:
            suggestions.append({
                "column": name,
                "severity": "high",
                "title": "Critical missing data",
                "message": (
                    f"Column '{name}' has {missing_pct}% missing values "
                    f"({missing_count:,} out of {total_rows:,}). "
                    f"Consider dropping this column unless it provides critical value."
                ),
                "actions": [
                    "Evaluate if this column is essential to your analysis",
                    "If not critical, drop it: df.drop(columns=['" + name + "'], inplace=True)",
                    "If critical, consider advanced imputation or external data sources"
                ]
            })
            continue

        # --- Rule 2: High missing (20-50%) ---
        if missing_pct >= 20:
            if semantic_type == "numeric":
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values in numeric column",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing values. "
                        f"Median imputation or KNN imputation recommended."
                    ),
                    "actions": [
                        f"Median impute: df['{name}'].fillna(df['{name}'].median(), inplace=True)",
                        f"Or use sklearn: from sklearn.impute import KNNImputer",
                        "Consider if missingness is informative (create indicator column)"
                    ]
                })
            elif semantic_type == "categorical":
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values in categorical column",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing values. "
                        f"Mode imputation or 'Unknown' category recommended."
                    ),
                    "actions": [
                        f"Mode impute: df['{name}'].fillna(df['{name}'].mode()[0], inplace=True)",
                        f"Or add 'Unknown' category: df['{name}'].fillna('Unknown', inplace=True)",
                        "Check if missingness correlates with target variable"
                    ]
                })
            else:
                suggestions.append({
                    "column": name,
                    "severity": "high",
                    "title": "High missing values",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing values. "
                        f"Strongly consider imputation or removal."
                    ),
                    "actions": [
                        "Impute with appropriate strategy based on semantic type",
                        "Analyze pattern of missingness (MCAR, MAR, MNAR)"
                    ]
                })
            continue

        # --- Rule 3: Moderate missing (5-20%) ---
        if missing_pct >= 5:
            if semantic_type == "numeric":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Moderate missing values in numeric column",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing values. "
                        f"Mean or median imputation is safe, or use interpolation."
                    ),
                    "actions": [
                        f"Mean impute: df['{name}'].fillna(df['{name}'].mean(), inplace=True)",
                        f"Median impute: df['{name}'].fillna(df['{name}'].median(), inplace=True)",
                        "For time series, consider interpolation instead"
                    ]
                })
            elif semantic_type == "categorical":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Moderate missing in categorical column",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing values. "
                        f"Mode imputation or separate category is fine."
                    ),
                    "actions": [
                        f"Mode impute: df['{name}'].fillna(df['{name}'].mode()[0], inplace=True)",
                        "Or create 'Missing' category to preserve information"
                    ]
                })
            elif semantic_type == "datetime":
                suggestions.append({
                    "column": name,
                    "severity": "medium",
                    "title": "Missing datetime values",
                    "message": (
                        f"Column '{name}' has {missing_pct}% missing datetime values. "
                        f"Forward/backward fill or interpolation works well."
                    ),
                    "actions": [
                        f"Forward fill: df['{name}'].fillna(method='ffill', inplace=True)",
                        f"Backward fill: df['{name}'].fillna(method='bfill', inplace=True)",
                        "Consider dropping if datetime is not critical"
                    ]
                })
            continue

        # --- Rule 4: Low missing (<5%) ---
        if missing_pct > 0:
            suggestions.append({
                "column": name,
                "severity": "low",
                "title": "Minor missing values",
                "message": (
                    f"Column '{name}' has {missing_pct}% missing ({missing_count:,} rows). "
                    f"Can safely drop rows or impute."
                ),
                "actions": [
                    f"Drop rows: df.dropna(subset=['{name}'], inplace=True)",
                    f"Or simple impute: df['{name}'].fillna(appropriate_value, inplace=True)",
                    f"Only {missing_count:,} rows affected out of {total_rows:,}"
                ]
            })

    # Sort by severity priority: high > medium > low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: severity_order[x["severity"]])

    return suggestions


def generate_target_imbalance_suggestions(columns):
    """
    Check if any column looks like a classification target and is imbalanced.
    """
    suggestions = []

    for col in columns:
        if col["semantic_type"] == "categorical" and col["unique_count"] > 1 and col["unique_count"] <= 10:
            suggestions.append({
                "column": col["name"],
                "severity": "medium",
                "title": "Potential classification target detected",
                "message": (
                    f"Column '{col['name']}' appears to be a categorical variable with {col['unique_count']} unique values. "
                    f"Check for class imbalance if this is your target variable."
                ),
                "actions": [
                    f"Check value counts: df['{col['name']}'].value_counts()",
                    f"Visualize distribution: df['{col['name']}'].value_counts().plot(kind='bar')",
                    "Consider using stratified sampling if imbalanced",
                    "Use appropriate metrics (F1-score, AUC-ROC) for imbalanced classes"
                ]
            })

    return suggestions


def generate_correlation_suggestions(columns):
    """
    Provide general correlation suggestions based on column types.
    """
    suggestions = []

    # Count numeric columns
    numeric_cols = [c for c in columns if c["semantic_type"] == "numeric"]

    if len(numeric_cols) >= 2:
        suggestions.append({
            "severity": "low",
            "title": "Multiple numeric columns detected",
            "message": f"Found {len(numeric_cols)} numeric columns. Consider analyzing correlations.",
            "actions": [
                "Calculate correlation matrix: df.corr()",
                "Visualize with heatmap: sns.heatmap(df.corr(), annot=True, cmap='coolwarm')",
                "Check for multicollinearity in regression models",
                "Remove highly correlated features if needed"
            ]
        })

    return suggestions


# Convenience: one-stop function to generate all suggestions for an upload response
def generate_all_suggestions(response_data):
    """
    Generate all suggestions given a full /upload response.
    Returns dict with categorized suggestions.
    """
    missing_suggestions = generate_missing_value_suggestions(
        response_data["columns"],
        response_data["shape"]["rows"]
    )

    return {
        "missing_value": missing_suggestions,
        "target_imbalance": [],  # placeholder
        "correlation": [],        # placeholder
        "priority_summary": {
            "high": len([s for s in missing_suggestions if s["severity"] == "high"]),
            "medium": len([s for s in missing_suggestions if s["severity"] == "medium"]),
            "low": len([s for s in missing_suggestions if s["severity"] == "low"]),
        }
    }