#!/usr/bin/env bash
# vpscli: user-local VPS installer
#
# Installs the vpscli session manager and supporting files for the current
# account. This script does not create users or groups; it assumes the current
# account is the shared account for this VPS.

set -euo pipefail

CURRENT_USER="$(id -un)"
CURRENT_HOME="$HOME"
VPSCLI_DIR="$CURRENT_HOME/.vpscli"
INSTALL_DIR="$CURRENT_HOME/.local/bin"

SCRIPT_DIR=""
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ ! -f "$SCRIPT_DIR/../machines.yaml" ]]; then
    SCRIPT_DIR=""
  fi
fi
REPO_ROOT="${SCRIPT_DIR:+$(dirname "$SCRIPT_DIR")}"

info() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

install_file() {
  local src_rel="$1" dest="$2" fallback_url="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/$src_rel" ]]; then
    cp "$REPO_ROOT/$src_rel" "$dest"
    ok "Installed $dest (from repo)"
    return
  fi
  curl -fsSL "$fallback_url" -o "$dest"
  ok "Installed $dest (from GitHub)"
}

ensure_command() {
  local cmd="$1"
  local apt_pkg="${2:-$1}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    warn "$cmd is missing and sudo is not available; install $apt_pkg manually."
    return
  fi

  info "Installing $apt_pkg"
  sudo apt-get update -qq
  sudo apt-get install -y -qq "$apt_pkg"
  command -v "$cmd" >/dev/null 2>&1 || fail "Failed to install $cmd"
  ok "$cmd"
}

default_host() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

write_machine_registry() {
  local machine_file="$VPSCLI_DIR/machines.yaml"
  if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/machines.yaml" ]]; then
    cp "$REPO_ROOT/machines.yaml" "$machine_file"
    ok "Installed machines.yaml from repo"
    return
  fi

  cat > "$machine_file" <<EOF
machines:
  - name: $(hostname)
    host: $(default_host)
    user: $CURRENT_USER
    description: "Primary VPS"
EOF
  ok "Generated machines.yaml for this VPS"
}

info "Preparing local vpscli runtime for $CURRENT_USER"
mkdir -p "$VPSCLI_DIR" "$VPSCLI_DIR/developers" "$VPSCLI_DIR/hooks" "$INSTALL_DIR"

ensure_command tmux tmux
ensure_command curl curl
ensure_command git git

install_file "server/tmux.conf" "$VPSCLI_DIR/tmux.conf" "https://raw.githubusercontent.com/donmasakayan/vpscli/main/server/tmux.conf"
install_file "server/session.sh" "$VPSCLI_DIR/session.sh" "https://raw.githubusercontent.com/donmasakayan/vpscli/main/server/session.sh"
install_file "server/hooks/notify-attach.sh" "$VPSCLI_DIR/hooks/notify-attach.sh" "https://raw.githubusercontent.com/donmasakayan/vpscli/main/server/hooks/notify-attach.sh"
chmod +x "$VPSCLI_DIR/session.sh" "$VPSCLI_DIR/hooks/notify-attach.sh"

cat > "$VPSCLI_DIR/git-credential-token" <<'EOF'
#!/usr/bin/env bash
if [[ -n "${GH_TOKEN:-}" ]]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=${GH_TOKEN}"
fi
EOF
chmod +x "$VPSCLI_DIR/git-credential-token"
git config --global credential.helper "!bash ~/.vpscli/git-credential-token"
ok "Configured git credential helper"

write_machine_registry

if [[ -n "$REPO_ROOT" ]]; then
  info "Installing local vpscli client"
  bash "$REPO_ROOT/client/setup.sh"
else
  warn "Repo checkout not detected; install the client separately with client/setup.sh once the repo is cloned."
fi

if [[ -d "$CURRENT_HOME/.claude" ]]; then
  install_file "server/claude/install-hooks.sh" "$VPSCLI_DIR/install-claude-hooks.sh" "https://raw.githubusercontent.com/donmasakayan/vpscli/main/server/claude/install-hooks.sh"
  chmod +x "$VPSCLI_DIR/install-claude-hooks.sh"
  warn "Claude hooks installer copied to $VPSCLI_DIR/install-claude-hooks.sh; run it manually if needed."
fi

cat <<EOF

vpscli server setup complete.

Files installed:
  $VPSCLI_DIR/session.sh
  $VPSCLI_DIR/tmux.conf
  $VPSCLI_DIR/machines.yaml
  $VPSCLI_DIR/git-credential-token

Next steps:
  1. Run: vpscli setup
  2. Start a session: vpscli my-session
  3. Detach with Ctrl+B, D
EOF
