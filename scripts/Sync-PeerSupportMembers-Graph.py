"""
Create/sync PeerSupportMembers SharePoint list via Microsoft Graph using `az` access token.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SITE_HOST = "slcounty.sharepoint.com"
SITE_PATH = "/sites/SH-PSB"
LIST_NAME = "PeerSupportMembers"
REPO = Path(__file__).resolve().parents[1]
MEMBERS_JSON = REPO / "data" / "peer-support-members.json"


def az_token(resource: str = "https://graph.microsoft.com") -> str:
    az = r"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    out = subprocess.check_output(
        [az, "account", "get-access-token", "--resource", resource, "--query", "accessToken", "-o", "tsv"],
        text=True,
        shell=False,
    ).strip()
    if not out:
        raise RuntimeError("Empty Azure access token")
    return out


def graph(method: str, url: str, token: str, body: dict | None = None) -> dict | list | None:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} -> {e.code}: {err}") from e


def ensure_list(token: str, site_id: str) -> str:
    lists = graph("GET", f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists?$select=id,displayName,name", token)
    assert isinstance(lists, dict)
    for item in lists.get("value", []):
        if item.get("displayName") == LIST_NAME or item.get("name") == LIST_NAME:
            print(f"List exists: {LIST_NAME} ({item['id']})")
            return item["id"]
    created = graph(
        "POST",
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists",
        token,
        {
            "displayName": LIST_NAME,
            "list": {"template": "genericList"},
            "description": "Peer Support Team roster and ACL (no passwords).",
        },
    )
    assert isinstance(created, dict)
    print(f"Created list: {LIST_NAME} ({created['id']})")
    return created["id"]


def existing_columns(token: str, site_id: str, list_id: str) -> set[str]:
    cols = graph(
        "GET",
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/columns?$select=name,displayName",
        token,
    )
    assert isinstance(cols, dict)
    names = set()
    for c in cols.get("value", []):
        if c.get("name"):
            names.add(c["name"])
        if c.get("displayName"):
            names.add(c["displayName"])
    return names


def ensure_columns(token: str, site_id: str, list_id: str) -> None:
    have = existing_columns(token, site_id, list_id)
    specs: list[dict] = [
        {"name": "FirstName", "text": {}},
        {"name": "LastName", "text": {}},
        {"name": "Username", "text": {}},
        {"name": "Area", "text": {}},
        {"name": "WorkPhone", "text": {}},
        {"name": "CellPhone", "text": {}},
        {"name": "Email", "text": {}},
        {"name": "Shift", "text": {}},
        {"name": "JobTitle", "text": {}},
        {
            "name": "AppRole",
            "choice": {"allowTextEntry": False, "choices": ["staff", "admin"]},
        },
        {"name": "IsPeerSupportLeader", "boolean": {}},
        {"name": "Active", "boolean": {}},
        {"name": "AclGroup", "text": {}},
        # Person column via Graph needs more setup; skip EntraUser for Graph path
    ]
    for spec in specs:
        name = spec["name"]
        if name in have:
            continue
        body = {"enforceUniqueValues": False, "required": False, **spec}
        graph("POST", f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/columns", token, body)
        print(f"  + column {name}")
        have.add(name)


def list_existing_items(token: str, site_id: str, list_id: str) -> dict[str, str]:
    """Map email/username -> item id."""
    mapping: dict[str, str] = {}
    url = (
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/items"
        f"?$expand=fields($select=id,Email,Username,Title)&$top=200"
    )
    while url:
        page = graph("GET", url, token)
        assert isinstance(page, dict)
        for item in page.get("value", []):
            fields = item.get("fields") or {}
            item_id = item["id"]
            email = str(fields.get("Email") or "").strip().lower()
            username = str(fields.get("Username") or "").strip().lower()
            if email:
                mapping[f"e:{email}"] = item_id
            if username:
                mapping[f"u:{username}"] = item_id
        url = page.get("@odata.nextLink")
    return mapping


def upsert_members(token: str, site_id: str, list_id: str) -> tuple[int, int]:
    payload = json.loads(MEMBERS_JSON.read_text(encoding="utf-8"))
    members = payload["members"]
    mapping = list_existing_items(token, site_id, list_id)
    created = updated = 0
    for m in members:
        fields = {
            "Title": m["title"],
            "FirstName": m["firstName"],
            "LastName": m["lastName"],
            "Username": m["username"],
            "Area": m.get("area") or "",
            "WorkPhone": m.get("workPhone") or "",
            "CellPhone": m.get("cellPhone") or "",
            "Email": m["email"],
            "Shift": m.get("shift") or "",
            "JobTitle": m.get("jobTitle") or "",
            "AppRole": m.get("appRole") or "staff",
            "IsPeerSupportLeader": bool(m.get("isPeerSupportLeader")),
            "Active": bool(m.get("active", True)),
            "AclGroup": m.get("aclGroup") or "PeerSupport_PeerSupporters",
        }
        email_key = f"e:{m['email'].strip().lower()}"
        user_key = f"u:{m['username'].strip().lower()}"
        item_id = mapping.get(email_key) or mapping.get(user_key)
        if item_id:
            graph(
                "PATCH",
                f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/items/{item_id}/fields",
                token,
                fields,
            )
            updated += 1
        else:
            created_item = graph(
                "POST",
                f"https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/items",
                token,
                {"fields": fields},
            )
            assert isinstance(created_item, dict)
            new_id = created_item["id"]
            mapping[email_key] = new_id
            mapping[user_key] = new_id
            created += 1
            print(f"  created {m['title']}")
    return created, updated


def main() -> int:
    print("Getting Graph token via az...")
    token = az_token()
    site_url = f"https://graph.microsoft.com/v1.0/sites/{SITE_HOST}:{urllib.parse.quote(SITE_PATH)}"
    print(f"Resolving site {SITE_HOST}{SITE_PATH} ...")
    site = graph("GET", site_url, token)
    assert isinstance(site, dict)
    site_id = site["id"]
    print(f"Site id: {site_id}")
    list_id = ensure_list(token, site_id)
    print("Ensuring columns...")
    ensure_columns(token, site_id, list_id)
    print("Upserting members...")
    created, updated = upsert_members(token, site_id, list_id)
    print(f"Done. created={created} updated={updated}")
    print(f"Open: https://{SITE_HOST}{SITE_PATH}/Lists/{LIST_NAME}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
