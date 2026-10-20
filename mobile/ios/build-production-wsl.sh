#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
config_path="$repo_root/mobile/Production.xcconfig"
plist_path="$script_dir/Sonivo-xtool-Info.plist"
backup_path="$(mktemp)"

cp "$plist_path" "$backup_path"
restore_plist() {
  cp "$backup_path" "$plist_path"
  rm -f "$backup_path"
}
trap restore_plist EXIT

python3 - "$config_path" "$plist_path" <<'PY'
from pathlib import Path
import plistlib
import sys

config_path = Path(sys.argv[1])
plist_path = Path(sys.argv[2])
settings = {}
for line in config_path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("//"):
        continue
    key, separator, value = stripped.partition("=")
    if separator:
        settings[key.strip()] = value.strip()

keys = {
    "API_BASE_URL": "API_BASE_URL",
    "OIDC_ISSUER": "OIDC_ISSUER",
    "WEB_BASE_URL": "WEB_BASE_URL",
}
for setting_key in keys:
    value = settings.get(setting_key, "")
    if not value.startswith("https://"):
        raise SystemExit(f"{setting_key} must be configured with HTTPS in Production.xcconfig")

with plist_path.open("rb") as source:
    plist = plistlib.load(source)
for plist_key, setting_key in keys.items():
    plist[plist_key] = settings[setting_key]
with plist_path.open("wb") as destination:
    plistlib.dump(plist, destination, fmt=plistlib.FMT_XML, sort_keys=False)
PY

cd "$script_dir"
APPIMAGE_EXTRACT_AND_RUN=1 xtool dev build --configuration release
