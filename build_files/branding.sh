#!/usr/bin/env bash
# Identidade do WatermelonOS: troca toda a marca Fedora visível pela nossa.
# (É também o que a Fedora pede para remixes: substituir o fedora-logos.)
set -euxo pipefail

B=/branding                 # pasta branding/ do repositório (montada no build)
SHARE=/usr/share/watermelon
mkdir -p "$SHARE"
cp "$B"/logo.svg "$B"/icon.svg "$B"/wordmark-light.svg "$B"/wordmark-dark.svg "$SHARE"/

dnf -y install librsvg2-tools   # rsvg-convert: gera os PNGs no tamanho que cada lugar pede
svg2png() { rsvg-convert -w "$2" -h "$3" -a "$1" -o "$4"; }   # arquivo largura altura destino
svg2png "$B/logo.svg"          256 256 "$SHARE/logo-256.png"
svg2png "$B/wordmark-dark.svg" 620 150 "$SHARE/wordmark-dark.png"
svg2png "$B/wordmark-light.svg" 620 150 "$SHARE/wordmark-light.png"

# ---------------------------------------------------------------- ícone do sistema
for s in 16 22 24 32 48 64 96 128 256 512; do
  d=/usr/share/icons/hicolor/${s}x${s}/apps
  mkdir -p "$d" && svg2png "$B/logo.svg" "$s" "$s" "$d/watermelon-logo.png"
done
install -Dm644 "$B/logo.svg" /usr/share/icons/hicolor/scalable/apps/watermelon-logo.svg
install -Dm644 "$B/icon.svg" /usr/share/icons/hicolor/scalable/apps/watermelon-icon.svg

# ---------------------------------------------------------------- substitui os logos da Fedora
# Cada arquivo do pacote fedora-logos vira a nossa marca no mesmo tamanho/formato.
BG_SVG=$(mktemp --suffix=.svg)
cat > "$BG_SVG" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#241d4a"/><stop offset=".6" stop-color="#8c3060"/><stop offset="1" stop-color="#e8304a"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>
EOF
rpm -ql fedora-logos | while read -r f; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  # fundos do instalador: degradê da marca em vez de logo
  if [[ $f == *-bg.png || $f == *splash* ]]; then
    read -r w h < <(file -b "$f" | sed -n 's/.* \([0-9]\+\) x \([0-9]\+\).*/\1 \2/p') || continue
    rsvg-convert -w "$w" -h "$h" -o "$f" "$BG_SVG"
    continue
  fi
  case "$f" in
    *.svg)
      if [[ $f == *white* || $f == *gdm* || $f == *darkbackground* ]]; then cp "$B/wordmark-dark.svg" "$f"
      elif [[ $f == *logo* && $f != *icon* ]]; then cp "$B/wordmark-light.svg" "$f"
      else cp "$B/logo.svg" "$f"; fi ;;
    *.png)
      read -r w h < <(file -b "$f" | sed -n 's/.* \([0-9]\+\) x \([0-9]\+\).*/\1 \2/p') || continue
      [ -n "${w:-}" ] || continue
      if (( w * 10 > h * 16 )); then   # largo => logo com nome
        if [[ $f == *white* || $f == *gdm* ]]; then src="$B/wordmark-dark.svg"; else src="$B/wordmark-light.svg"; fi
      else
        src="$B/logo.svg"
      fi
      svg2png "$src" "$w" "$h" "$f" ;;
  esac
done
gtk-update-icon-cache -f /usr/share/icons/hicolor || true

# ---------------------------------------------------------------- identidade do sistema
# os-release reescrito do zero. Só ficam os campos técnicos que as ferramentas
# de build/update precisam (VERSION_ID, PLATFORM_ID, OSTREE_VERSION): não aparecem na interface.
BASE_VER=$(sed -n 's/^VERSION_ID=//p' /usr/lib/os-release)
PLATFORM=$(sed -n 's/^PLATFORM_ID=//p' /usr/lib/os-release)
OSTREE_VER=$(sed -n 's/^OSTREE_VERSION=//p' /usr/lib/os-release)
cat > /usr/lib/os-release <<EOF
NAME="WatermelonOS"
VERSION="1.0 (Golden Hour)"
ID=watermelonos
ID_LIKE=fedora
VERSION_ID=${BASE_VER}
VERSION_CODENAME="golden-hour"
PLATFORM_ID=${PLATFORM}
PRETTY_NAME="WatermelonOS 1.0"
ANSI_COLOR="1;38;2;255;84;104"
LOGO=watermelon-logo
DEFAULT_HOSTNAME="watermelon"
HOME_URL="https://github.com/watermelon-os"
DOCUMENTATION_URL="https://github.com/watermelon-os"
SUPPORT_URL="https://github.com/watermelon-os"
BUG_REPORT_URL="https://github.com/watermelon-os/issues"
VARIANT="Developer Edition"
VARIANT_ID=developer
OSTREE_VERSION=${OSTREE_VER}
EOF
echo "WatermelonOS release 1.0 (Golden Hour)" > /usr/lib/watermelon-release

# ---------------------------------------------------------------- remove o que ainda é da Fedora
# Pacotes só de marca/conteúdo (sem código que o sistema use): saem sem levar dependências.
for p in desktop-backgrounds-gnome fedora-workstation-backgrounds fedora-bookmarks \
         fedora-chromium-config fedora-chromium-config-gnome fedora-flathub-remote \
         fedora-third-party fedora-workstation-repositories gnome-tour fedora-logos-httpd \
         gnome-shell-extension-background-logo \
         $(rpm -qa --qf '%{NAME}\n' | grep -E '^f[0-9]+-backgrounds'); do
  if rpm -q "$p" >/dev/null 2>&1; then rpm -e --nodeps "$p" && echo "removido: $p"; fi
done
rm -f /usr/share/gnome-background-properties/f[0-9]*.xml /usr/share/gnome-background-properties/fedora*.xml
rm -rf /usr/share/backgrounds/f[0-9]* /usr/share/backgrounds/fedora-workstation
rm -f /etc/yum.repos.d/_copr* /etc/yum.repos.d/fedora-cisco-openh264.repo.rpmsave 2>/dev/null || true

# ---------------------------------------------------------------- tela de boot (Plymouth)
T=/usr/share/plymouth/themes/watermelon
mkdir -p "$T"
cp -a /usr/share/plymouth/themes/spinner/. "$T/"
rm -f "$T/spinner.plymouth" "$T/watermark.png"
svg2png "$B/logo.svg" 180 180 "$T/watermark.png"
cat > "$T/watermelon.plymouth" <<'EOF'
[Plymouth Theme]
Name=WatermelonOS
Description=Tela de boot do WatermelonOS
ModuleName=two-step

[two-step]
Font=Cantarell 12
TitleFont=Cantarell Light 30
ImageDir=/usr/share/plymouth/themes/watermelon
DialogHorizontalAlignment=.5
DialogVerticalAlignment=.382
TitleHorizontalAlignment=.5
TitleVerticalAlignment=.382
HorizontalAlignment=.5
VerticalAlignment=.72
WatermarkHorizontalAlignment=.5
WatermarkVerticalAlignment=.45
Transition=none
TransitionDuration=0.0
BackgroundStartColor=0x0d1511
BackgroundEndColor=0x0d1511
MessageBelowAnimation=true

[boot-up]
UseEndAnimation=false

[shutdown]
UseEndAnimation=false

[reboot]
UseEndAnimation=false

[updates]
SuppressMessages=true
ProgressBarShowPercentComplete=true
UseProgressBar=true
Title=Instalando atualizações...
SubTitle=Não desligue o computador
EOF
plymouth-set-default-theme watermelon

# O tema de boot fica dentro do initramfs: precisa gerar de novo
KVER=$(find /usr/lib/modules -mindepth 1 -maxdepth 1 -printf '%f\n' | sort -V | tail -1)
dracut --no-hostonly --kver "$KVER" --reproducible --zstd --add ostree -f "/usr/lib/modules/$KVER/initramfs.img"
chmod 0644 "/usr/lib/modules/$KVER/initramfs.img"

# ---------------------------------------------------------------- GNOME: sem tour da Fedora e sem setup duplicado
rm -f /etc/xdg/autostart/gnome-initial-setup-first-login.desktop   # o nosso assistente substitui
# GNOME Software não fica rodando em segundo plano (updates já são automáticos)
if [ -f /etc/xdg/autostart/org.gnome.Software.desktop ]; then
  echo 'Hidden=true' >> /etc/xdg/autostart/org.gnome.Software.desktop
fi

dnf -y remove librsvg2-tools || true
