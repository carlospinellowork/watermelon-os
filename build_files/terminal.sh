#!/usr/bin/env bash
# Terminal do WatermelonOS: Ghostty + zsh turbinado + ferramentas de terminal.
# O que não existir nos repositórios do Fedora vem do release oficial no GitHub.
set -euxo pipefail

FV=$(rpm -E %fedora)

# ---------------------------------------------------------------- Ghostty
if ! rpm -q ghostty >/dev/null 2>&1; then
  if curl -fsSL "https://copr.fedorainfracloud.org/coprs/scottames/ghostty/repo/fedora-${FV}/scottames-ghostty-fedora-${FV}.repo" \
       -o /etc/yum.repos.d/ghostty.repo && dnf -y install ghostty; then
    sed -i 's/^enabled=1/enabled=0/' /etc/yum.repos.d/ghostty.repo
  else
    rm -f /etc/yum.repos.d/ghostty.repo
    echo "AVISO: ghostty indisponível; o terminal padrão continua sendo o Ptyxis"
  fi
fi

# Ghostty vira o terminal do dock (no lugar do Ptyxis)
if rpm -q ghostty >/dev/null 2>&1; then
  sed -i "s/'org.gnome.Ptyxis.desktop'/'com.mitchellh.ghostty.desktop'/" /etc/dconf/db/local.d/00-watermelon
fi

# ---------------------------------------------------------------- binários de releases do GitHub
# uso: from_release <binário> <repo> <regex do asset> [binários extras...]
from_release() {
  local bin=$1 repo=$2 re=$3; shift 3
  command -v "$bin" >/dev/null 2>&1 && return 0
  local url tmp
  url=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" \
        | jq -r --arg re "$re" '.assets[]? | select(.name | test($re; "i")) | .browser_download_url' | head -1) || true
  if [ -z "$url" ]; then echo "AVISO: release de $bin não encontrado"; return 0; fi
  tmp=$(mktemp -d)
  mkdir -p "$tmp/x"
  if ! curl -fsSL "$url" -o "$tmp/pkg"; then echo "AVISO: download de $bin falhou"; rm -rf "$tmp"; return 0; fi
  case "$url" in
    *.zip)                    unzip -q "$tmp/pkg" -d "$tmp/x" ;;
    *.tar.gz|*.tgz|*.tar.xz)  tar -xf "$tmp/pkg" -C "$tmp/x" ;;
    *)                        cp "$tmp/pkg" "$tmp/x/$bin" ;;   # binário solto
  esac
  for b in "$bin" "$@"; do
    find "$tmp/x" -type f -name "$b" -exec install -m 0755 {} "/usr/bin/$b" \; -quit
  done
  rm -rf "$tmp"
}
from_release lazygit    jesseduffield/lazygit    'Linux_x86_64\.tar\.gz$'
from_release lazydocker jesseduffield/lazydocker 'Linux_x86_64\.tar\.gz$'
from_release yazi       sxyazi/yazi              '^yazi-x86_64-unknown-linux-gnu\.zip$' ya
from_release atuin      atuinsh/atuin            '^atuin-x86_64-unknown-linux-gnu\.tar\.gz$'
from_release delta      dandavison/delta         'x86_64-unknown-linux-gnu\.tar\.gz$'
from_release gum        charmbracelet/gum        'Linux_x86_64\.tar\.gz$'
from_release tldr       tealdeer-rs/tealdeer     '^tealdeer-linux-x86_64-musl$'

# mkcert publica o binário solto (sem tar)
if [ ! -x /usr/bin/mkcert ]; then
  url=$(curl -fsSL https://api.github.com/repos/FiloSottile/mkcert/releases/latest \
        | jq -r '.assets[]? | select(.name | test("linux-amd64$")) | .browser_download_url' | head -1) || true
  { [ -n "$url" ] && curl -fsSL "$url" -o /usr/bin/mkcert && chmod 0755 /usr/bin/mkcert; } || echo "AVISO: mkcert não instalado"
fi

# ---------------------------------------------------------------- plugin fzf-tab (Tab com busca difusa)
git clone --depth 1 https://github.com/Aloxaf/fzf-tab /usr/share/zsh/plugins/fzf-tab
rm -rf /usr/share/zsh/plugins/fzf-tab/.git

# ---------------------------------------------------------------- Nerd Font (ícones no terminal)
mkdir -p /usr/share/fonts/jetbrains-mono-nerd
curl -fsSL https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.tar.xz \
  | tar -xJ -C /usr/share/fonts/jetbrains-mono-nerd --wildcards '*.ttf'
fc-cache -f /usr/share/fonts/jetbrains-mono-nerd

# ---------------------------------------------------------------- zsh como shell padrão
sed -i 's|^SHELL=.*|SHELL=/usr/bin/zsh|' /etc/default/useradd
grep -q watermelon.zsh /etc/zshrc \
  || printf '\n# WatermelonOS\n[[ -r /etc/zsh/watermelon.zsh ]] && source /etc/zsh/watermelon.zsh\n' >> /etc/zshrc

# Lista final do que entrou (vai para o log do build)
for b in ghostty zsh lazygit lazydocker yazi atuin delta gum mkcert tldr fastfetch starship; do
  command -v "$b" >/dev/null 2>&1 && echo "OK: $b" || echo "AVISO: faltando $b"
done
