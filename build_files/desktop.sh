#!/usr/bin/env bash
# Pacote "o melhor de cada sistema": recursos de Mac, Windows e Linux no WatermelonOS.
set -euxo pipefail

# ---------------------------------------------------------------- dos repositórios
dnf -y install --skip-unavailable \
  sushi \
  gnome-system-monitor \
  gnome-shell-extension-gsconnect \
  gnome-shell-extension-caffeine \
  gnome-shell-extension-ddterm \
  gnome-shell-extension-tiling-assistant \
  gnome-shell-extension-just-perfection \
  gnome-shell-extension-dash-to-panel \
  tesseract tesseract-langpack-por qrencode \
  libnotify

# ---------------------------------------------------------------- do extensions.gnome.org
# Baixa a versão compatível com o GNOME Shell desta imagem.
SHELL_VER=$(gnome-shell --version | grep -oE '[0-9]+' | head -1)
ego_install() {  # ego_install <uuid>
  local uuid=$1 info url dir tmp
  info=$(curl -fsSL "https://extensions.gnome.org/extension-info/?uuid=${uuid}&shell_version=${SHELL_VER}" || true)
  url=$(jq -r '.download_url // empty' <<<"$info" 2>/dev/null || true)
  if [ -z "$url" ]; then echo "AVISO: extensão $uuid sem versão para GNOME $SHELL_VER"; return 0; fi
  dir="/usr/share/gnome-shell/extensions/$uuid"
  tmp=$(mktemp -d)
  curl -fsSL "https://extensions.gnome.org${url}" -o "$tmp/ext.zip"
  rm -rf "$dir" && mkdir -p "$dir"
  unzip -q "$tmp/ext.zip" -d "$dir"
  if [ -d "$dir/schemas" ]; then glib-compile-schemas "$dir/schemas"; fi
  chmod -R a+rX "$dir"
  rm -rf "$tmp"
  echo "OK: extensão $uuid"
}
ego_install clipboard-indicator@tudmotu.com   # Super+V: histórico da área de transferência
ego_install emoji-copy@felipeftn               # Super+.: seletor de emoji
ego_install Vitals@CoreCoding.com              # CPU, RAM e temperatura na barra

# ---------------------------------------------------------------- cursor padrão: macOS (apple_cursor, GPL-3.0)
# O app Personalizar baixa outros sob demanda; o Watermelon-Cursor já vem em system_files.
APPLE_CURSOR_VER=v2.0.1
tmp=$(mktemp -d)
curl -fsSL "https://github.com/ful1e5/apple_cursor/releases/download/${APPLE_CURSOR_VER}/macOS.tar.xz" -o "$tmp/macOS.tar.xz"
tar -xf "$tmp/macOS.tar.xz" -C "$tmp"
rm -rf /usr/share/icons/macOS /usr/share/icons/macOS-White
cp -r "$tmp/macOS" "$tmp/macOS-White" /usr/share/icons/
chmod -R a+rX /usr/share/icons/macOS /usr/share/icons/macOS-White
rm -rf "$tmp"

# ---------------------------------------------------------------- AirDrop com o celular (GSConnect)
firewall-offline-cmd --add-service=kdeconnect 2>/dev/null \
  || firewall-offline-cmd --add-port=1714-1764/tcp --add-port=1714-1764/udp || true

# Lista final (vai para o log do build)
for e in /usr/share/gnome-shell/extensions/*/; do echo "extensão instalada: $(basename "$e")"; done
