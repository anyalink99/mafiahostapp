from __future__ import annotations

import json
import os
import sqlite3
import urllib.parse
from pathlib import Path


def folder_uri_to_path(uri: str) -> str | None:
    if not uri.startswith("file:///"):
        return None
    raw = uri[len("file:///") :]
    path = urllib.parse.unquote(raw)
    if len(path) >= 2 and path[1] == ":":
        return path.replace("/", "\\")
    if path.startswith("/"):
        return path
    return path


def path_to_folder_uri(p: str) -> str:
    p = Path(p).resolve()
    s = p.as_posix()
    if len(s) >= 2 and s[1] == ":":
        drive, rest = s[0], s[2:]
        enc = urllib.parse.quote(f"{drive}:{rest}", safe="/:@")
        return "file:///" + enc.replace(":", "%3A")
    return "file:///" + urllib.parse.quote(s, safe="/:@")

PREFIXES = (
    "workbench.panel.composerChatViewPane.",
    "workbench.panel.aichat.",
)


def merge_composer_data(old_s: str, new_s: str) -> str:
    old = json.loads(old_s)
    new = json.loads(new_s)
    old_list = old.get("allComposers") or []
    new_list = new.get("allComposers") or []
    seen = {c.get("composerId") for c in new_list if isinstance(c, dict)}
    merged = list(new_list)
    for c in old_list:
        if not isinstance(c, dict):
            continue
        cid = c.get("composerId")
        if cid and cid not in seen:
            merged.append(c)
            seen.add(cid)
    new["allComposers"] = merged
    return json.dumps(new, ensure_ascii=False, separators=(",", ":"))


def merge_workspace_dbs(old_hash: str, new_hash: str, dry_run: bool = False) -> dict:
    base = Path(os.environ["USERPROFILE"]) / "AppData/Roaming/Cursor/User/workspaceStorage"
    old_db = base / old_hash / "state.vscdb"
    new_db = base / new_hash / "state.vscdb"
    if not old_db.is_file() or not new_db.is_file():
        return {"error": "missing db", "old": str(old_db), "new": str(new_db)}

    old_conn = sqlite3.connect(str(old_db))
    new_conn = sqlite3.connect(str(new_db))

    old_keys = {r[0] for r in old_conn.execute("SELECT key FROM ItemTable")}
    new_keys = {r[0] for r in new_conn.execute("SELECT key FROM ItemTable")}

    stats = {"copied": 0, "merged_composer": False, "skipped": 0}

    row_old = old_conn.execute(
        "SELECT value FROM ItemTable WHERE key = ?", ("composer.composerData",)
    ).fetchone()
    row_new = new_conn.execute(
        "SELECT value FROM ItemTable WHERE key = ?", ("composer.composerData",)
    ).fetchone()
    if row_old and row_new:
        merged = merge_composer_data(row_old[0], row_new[0])
        if not dry_run:
            new_conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                ("composer.composerData", merged),
            )
        stats["merged_composer"] = True
        stats["old_composers"] = len(json.loads(row_old[0]).get("allComposers") or [])
        stats["new_composers_before"] = len(json.loads(row_new[0]).get("allComposers") or [])
        stats["new_composers_after"] = len(json.loads(merged).get("allComposers") or [])

    to_copy = []
    for k in old_keys:
        if any(k.startswith(p) for p in PREFIXES) and k not in new_keys:
            to_copy.append(k)
    stats["panel_keys_to_copy"] = len(to_copy)
    if not dry_run:
        for k in to_copy:
            v = old_conn.execute(
                "SELECT value FROM ItemTable WHERE key = ?", (k,)
            ).fetchone()[0]
            new_conn.execute(
                "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", (k, v)
            )
            stats["copied"] += 1

    if not dry_run:
        new_conn.commit()
    old_conn.close()
    new_conn.close()
    return stats


def discover_workspaces() -> dict[str, str]:
    base = Path(os.environ["USERPROFILE"]) / "AppData/Roaming/Cursor/User/workspaceStorage"
    out: dict[str, str] = {}
    for d in base.iterdir():
        if not d.is_dir():
            continue
        wj = d / "workspace.json"
        if not wj.is_file():
            continue
        try:
            data = json.loads(wj.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        folder = data.get("folder")
        if not folder:
            continue
        path = folder_uri_to_path(folder)
        if path:
            out[path.lower()] = d.name
    return out


def main() -> None:
    projects = Path(r"C:\projects")
    by_path = discover_workspaces()
    pairs: list[tuple[str, str, str, str]] = []

    for cat in projects.iterdir():
        if not cat.is_dir() or cat.name.lower() == "other":
            continue
        for proj in cat.iterdir():
            if not proj.is_dir():
                continue
            new_path = str(proj.resolve())
            old_path = str((projects / proj.name).resolve())
            if old_path.lower() == new_path.lower():
                continue
            nk = new_path.lower()
            ok = old_path.lower()
            if nk in by_path and ok in by_path:
                pairs.append((ok, nk, by_path[ok], by_path[nk]))

    print("Found", len(pairs), "path pairs with both workspaces")
    for ok, nk, oh, nh in pairs:
        print(f"  {nk}")
        print(f"    old ws {oh} <- {ok}")
        print(f"    new ws {nh}")

    dry = os.environ.get("CURSOR_MERGE_DRY") == "1"
    if dry:
        print("\nDRY RUN (set CURSOR_MERGE_DRY=0 or unset to apply)")

    for _ok, nk, oh, nh in pairs:
        r = merge_workspace_dbs(oh, nh, dry_run=dry)
        print("\nMerge", nk, r)


if __name__ == "__main__":
    main()
