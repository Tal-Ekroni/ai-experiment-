#!/usr/bin/env bash
# NOTE: on a box managed by fleet (github.com/Tal-Ekroni/fleet), do NOT run this —
# fleet owns units/timers and deploys from fleet.app.json at the repo root.
# This script is the standalone (non-fleet) LAN path only.
# One-command setup on a home Linux box:
#   git clone https://github.com/Tal-Ekroni/ai-experiment-.git && cd ai-experiment- \
#     && git checkout claude/new-experiment-repo-kozgq8 && bash jolt/deploy/setup.sh
# Installs user-level systemd units: a static server on :8080 and a 5-minute
# auto-update timer that pulls + rebuilds whenever the branch moves on GitHub.
set -euo pipefail
command -v node >/dev/null || { echo "need node >= 18 (apt install nodejs / dnf install nodejs)"; exit 1; }
command -v git  >/dev/null || { echo "need git"; exit 1; }

REPO_DIR=$(cd "$(dirname "$0")/../.." && pwd)
echo "repo: $REPO_DIR"
cd "$REPO_DIR/jolt"
npm ci --silent
npx vite build --base=./ >/dev/null
echo "built."

UNITS="$HOME/.config/systemd/user"
mkdir -p "$UNITS"
for u in jolt.service jolt-update.service jolt-update.timer; do
  sed "s|__JOLT_DIR__|$REPO_DIR|g" "$REPO_DIR/jolt/deploy/$u" > "$UNITS/$u"
done
systemctl --user daemon-reload
systemctl --user enable --now jolt.service jolt-update.timer
# Keep user services alive after logout/reboot without anyone logged in:
loginctl enable-linger "$USER" 2>/dev/null || echo "note: run 'sudo loginctl enable-linger $USER' so it survives reboots"

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "== Jolt is up =="
echo "   http://${IP:-localhost}:8080   (from any device on your LAN)"
echo "   status:  systemctl --user status jolt jolt-update.timer"
echo "   logs:    journalctl --user -u jolt -f"
echo "   updates: automatic — the timer pulls + rebuilds within 5 min of any push"
