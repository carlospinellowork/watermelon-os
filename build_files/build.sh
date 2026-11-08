#!/usr/bin/env bash
# Roda dentro do build da imagem. Instala pacotes e configura o sistema.
set -euxo pipefail

CTX=/ctx

# ---------------------------------------------------------------- repositórios
cat > /etc/yum.repos.d/vscode.repo <<'EOF'
[code]
name=Visual Studio Code
baseurl=https://packages.microsoft.com/yumrepos/vscode
enabled=1
gpgcheck=1
gpgkey=https://packages.microsoft.com/keys/microsoft.asc
EOF

curl -fsSL https://mise.jdx.dev/rpm/mise.repo -o /etc/yum.repos.d/mise.repo

# ---------------------------------------------------------------- pacotes
mapfile -t PKGS < <(grep -vE '^\s*(#|$)' "$CTX/packages.txt")
dnf -y install --skip-unavailable "${PKGS[@]}" mise

# Relata pacotes que não existem nesta versão do Fedora (o build não quebra por isso)
for p in "${PKGS[@]}"; do
  rpm -q --whatprovides "$p" >/dev/null 2>&1 || echo "AVISO: pacote indisponível: $p"
done

# Repositórios de terceiros ficam desativados na imagem final:
# os updates chegam pela imagem nova, não por dnf.
sed -i 's/^enabled=1/enabled=0/' /etc/yum.repos.d/vscode.repo /etc/yum.repos.d/mise.repo

# ---------------------------------------------------------------- starship (prompt)
STARSHIP_TMP=$(mktemp -d)
curl -fsSL https://github.com/starship/starship/releases/latest/download/starship-x86_64-unknown-linux-musl.tar.gz \
  | tar -xz -C "$STARSHIP_TMP"
install -m 0755 "$STARSHIP_TMP/starship" /usr/bin/starship
rm -rf "$STARSHIP_TMP"

# ---------------------------------------------------------------- terminal
"$CTX/terminal.sh"

# ---------------------------------------------------------------- desktop: o melhor de Mac, Windows e Linux
"$CTX/desktop.sh"

# ---------------------------------------------------------------- flathub
mkdir -p /etc/flatpak/remotes.d
curl -fsSL https://dl.flathub.org/repo/flathub.flatpakrepo -o /etc/flatpak/remotes.d/flathub.flatpakrepo

# ---------------------------------------------------------------- identidade (logos, boot, nome)
sed -i \
  -e 's/^VARIANT=.*/VARIANT="Developer Edition"/' \
  -e 's/^VARIANT_ID=.*/VARIANT_ID=watermelonos/' \
  /usr/lib/os-release
"$CTX/branding.sh"

# ---------------------------------------------------------------- updates automáticos
# Baixa e prepara o update em segundo plano; ele entra no próximo boot.
# Nunca reinicia sozinho.
sed -i 's/^#\?AutomaticUpdatePolicy=.*/AutomaticUpdatePolicy=stage/' /etc/rpm-ostreed.conf
grep -q '^AutomaticUpdatePolicy=stage' /etc/rpm-ostreed.conf \
  || printf '\n[Daemon]\nAutomaticUpdatePolicy=stage\n' >> /etc/rpm-ostreed.conf
systemctl enable rpm-ostreed-automatic.timer
systemctl disable bootc-fetch-apply-updates.timer 2>/dev/null || true   # este reinicia sozinho: não queremos
systemctl enable watermelon-flatpak-update.timer

# ---------------------------------------------------------------- serviços
systemctl mask flatpak-add-fedora-repos.service   # não recria a fonte "Fedora Flatpaks"
systemctl enable docker.socket
systemctl disable waydroid-container.service 2>/dev/null || true   # Android só liga quando usado
systemctl enable watermelon-groups.service
systemctl --global enable watermelon-user-setup.service

# ---------------------------------------------------------------- GNOME (padrões do sistema)
dconf update

# ---------------------------------------------------------------- limpeza
dnf clean all
rm -rf /tmp/* /run/dnf /var/log/* /var/cache/* /var/lib/dnf || true
