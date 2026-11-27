"""
Daha BI notebook runner. Executes one user cell against a dataset and writes a JSON result.

    python -I runner.py <data.json> <code.py> <out.json> [extra-site-packages]

Inside the cell:  df (pandas DataFrame of the dataset), pd, np, plt are ready to use.
Assign the value you want to show to `result`; print() output and matplotlib figures are
captured too. In production this runs inside a bubblewrap sandbox (no network, read-only
system, resource limits) — see app/Services/PythonExecutionService.php.
"""
import base64
import contextlib
import io
import json
import math
import sys
import time
import traceback

MAX_TABLE_ROWS = 500
MAX_STDOUT = 20_000
MAX_FIGURES = 4


def jsonable(v):
    """Make a single cell value safe for JSON (NaN, numpy scalars, timestamps...)."""
    try:
        import numpy as np
        import pandas as pd

        if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
            return None
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        if isinstance(v, (np.bool_,)):
            return bool(v)
        if isinstance(v, (pd.Timestamp,)):
            return v.isoformat()
        if v is pd.NaT:
            return None
    except Exception:
        pass
    if isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


def table(frame):
    import pandas as pd

    if isinstance(frame, pd.Series):
        frame = frame.to_frame(name=frame.name if frame.name is not None else "value")
    total = len(frame)
    # Keep a meaningful index (e.g. after groupby) as a visible column.
    if not isinstance(frame.index, pd.RangeIndex):
        frame = frame.reset_index()
    frame = frame.head(MAX_TABLE_ROWS)
    columns = [str(c) for c in frame.columns]
    rows = [{columns[i]: jsonable(v) for i, v in enumerate(rec)} for rec in frame.itertuples(index=False, name=None)]
    return {"type": "table", "columns": columns, "rows": rows, "total_rows": total, "truncated": total > MAX_TABLE_ROWS}


def describe_result(value):
    import pandas as pd

    if isinstance(value, (pd.DataFrame, pd.Series)):
        return table(value)
    if isinstance(value, (list, tuple)) and value and all(isinstance(r, dict) for r in value):
        return table(pd.DataFrame(list(value)))
    if isinstance(value, dict):
        try:
            return {"type": "json", "value": json.loads(json.dumps(value, default=str))}
        except Exception:
            pass
    text = repr(value) if not isinstance(value, str) else value
    return {"type": "text", "value": text[:MAX_STDOUT]}


def main():
    data_path, code_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    if len(sys.argv) > 4:  # local dev: an extra folder holding pandas etc.
        sys.path.insert(0, sys.argv[4])
    out = {"ok": True, "stdout": "", "result": None, "figures": [], "error": None, "duration_ms": 0, "rows_loaded": 0}
    started = time.time()

    import numpy as np
    import pandas as pd

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:  # matplotlib is optional
        plt = None

    with open(data_path, "r", encoding="utf-8") as f:
        df = pd.DataFrame(json.load(f))
    # Numbers stored as text (common in CSVs) become real numbers, so df.sum() etc. just work.
    for col in df.columns:
        if df[col].dtype == object:
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() >= max(1, int(0.95 * df[col].notna().sum())):
                df[col] = converted
    out["rows_loaded"] = len(df)

    with open(code_path, "r", encoding="utf-8") as f:
        code = f.read()

    namespace = {"df": df, "pd": pd, "np": np, "plt": plt, "__name__": "__main__"}
    buf = io.StringIO()
    try:
        compiled = compile(code, "<cell>", "exec")
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            exec(compiled, namespace)
        if "result" in namespace:
            out["result"] = describe_result(namespace["result"])
    except Exception:
        out["ok"] = False
        # Only the user's own frames — not this runner's internals.
        etype, evalue, tb = sys.exc_info()
        frames = [fr for fr in traceback.extract_tb(tb) if fr.filename == "<cell>"]
        source = code.splitlines()
        lines = [
            f"Line {fr.lineno}: " + (source[fr.lineno - 1].strip() if fr.lineno and fr.lineno <= len(source) else "")
            for fr in frames[-3:]
        ]
        if isinstance(evalue, SyntaxError) and evalue.lineno:
            lines = [f"Line {evalue.lineno}: {(evalue.text or '').strip()}"]
        out["error"] = {"type": etype.__name__, "message": str(evalue), "where": lines}

    # A failed cell's half-drawn figures are just noise (e.g. an empty axis).
    if plt is not None and out["ok"]:
        for num in plt.get_fignums()[:MAX_FIGURES]:
            fig = plt.figure(num)
            png = io.BytesIO()
            fig.savefig(png, format="png", dpi=110, bbox_inches="tight")
            out["figures"].append(base64.b64encode(png.getvalue()).decode("ascii"))
    if plt is not None:
        plt.close("all")

    text = buf.getvalue()
    out["stdout"] = text[:MAX_STDOUT] + ("\n… output truncated" if len(text) > MAX_STDOUT else "")
    out["duration_ms"] = int((time.time() - started) * 1000)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
