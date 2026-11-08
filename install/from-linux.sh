#!/usr/bin/env bash
# WatermelonOS — instalação SEM PENDRIVE, a partir do Linux que já está no computador
# (Ubuntu, Linux Mint, Debian, Pop!_OS, Fedora...).
#
#   curl -fsSL https://raw.githubusercontent.com/<usuario>/watermelon-os/main/install/from-linux.sh | bash
#
# O que acontece:
#   1. o WatermelonOS é instalado no MESMO disco/partição do sistema atual;
#   2. no próximo boot, o computador já entra no WatermelonOS;
#   3. os arquivos do sistema antigo NÃO são apagados: ficam guardados e o assistente
#      de boas-vindas oferece trazer a sua pasta pessoal (projetos, documentos, chaves SSH).
#   O sistema antigo deixa de dar boot. Faça backup do que for importante.
set -euo pipefail

IMAGE=${WATERMELON_IMAGE:-ghcr.io/carlospinellowork/watermelon-os:latest}
MIN_FREE_GB=30

RED=$'\e[38;2;255;84;104m' GRN=$'\e[38;2;125;211;160m' YEL=$'\e[38;2;242;197;107m' B=$'\e[1m' OFF=$'\e[0m'
step() { printf '\n%s🍉 %s%s\n' "$RED" "$*" "$OFF"; }
ok()   { printf '   %s✔%s %s\n' "$GRN" "$OFF" "$*"; }
warn() { printf '   %s!%s %s\n' "$YEL" "$OFF" "$*"; }
die()  { printf '\n   %s✘ %s%s\n\n' "$RED" "$*" "$OFF" >&2; exit 1; }

# Lê do terminal mesmo quando o script vem por "curl | bash"
ask() { local v; read -r -p "$1" v </dev/tty; printf '%s' "$v"; }

printf '\n%s%swatermelon%sOS%s · instalação sem pendrive\n' "$B" "$RED" "$OFF$B" "$OFF"

# ------------------------------------------------------------------ verificações
step "Verificando o computador"
[ "$(uname -m)" = "x86_64" ] || die "o WatermelonOS precisa de um processador 64 bits (x86_64)"
ok "processador 64 bits"
[ -d /sys/firmware/efi ] || die "o computador precisa estar em modo UEFI (computadores dos últimos ~10 anos)"
ok "modo UEFI"
if grep -q '^ID=watermelonos' /etc/os-release 2>/dev/null; then die "este computador já roda o WatermelonOS 🍉"; fi
FS=$(findmnt -no FSTYPE /)
case "$FS" in ext4|xfs|btrfs) ok "partição do sistema: $FS" ;; *) die "tipo de partição não suportado: $FS" ;; esac
FREE=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
(( FREE >= MIN_FREE_GB )) || die "precisa de ${MIN_FREE_GB} GB livres (tem ${FREE} GB)"
ok "${FREE} GB livres"
RAM=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
(( RAM >= 4 )) || warn "pouca memória (${RAM} GB): o WatermelonOS funciona melhor com 8 GB"
# shellcheck disable=SC1091
OLD_OS=$(. /etc/os-release && echo "${PRETTY_NAME:-Linux}")

# ------------------------------------------------------------------ confirmação
cat <<EOF

   ${B}Isto vai instalar o WatermelonOS no lugar de: ${YEL}${OLD_OS}${OFF}

   ${GRN}✔${OFF} Seus arquivos NÃO são apagados: ficam guardados e o WatermelonOS
     oferece importar sua pasta pessoal no primeiro login.
   ${RED}✘${OFF} O ${OLD_OS} deixa de iniciar. Programas instalados nele não vêm junto.
   ${YEL}!${OFF} Recomendado: backup dos arquivos importantes antes de continuar.

EOF
[[ $(ask "   Digite ${B}INSTALAR${OFF} para continuar: ") == "INSTALAR" ]] || die "cancelado, nada foi alterado"

# ------------------------------------------------------------------ podman (roda o instalador)
step "Preparando o instalador"
if ! command -v podman >/dev/null 2>&1; then
  if command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq podman
  elif command -v dnf >/dev/null; then sudo dnf install -y podman
  else die "instale o podman e rode de novo"; fi
fi
ok "podman $(podman --version | awk '{print $3}')"

# ------------------------------------------------------------------ download + instalação
step "Baixando o WatermelonOS (alguns GB; pode demorar)"
if [[ $IMAGE == localhost/* ]]; then
  sudo podman image exists "$IMAGE" || die "imagem local $IMAGE não encontrada"
else
  sudo podman pull "$IMAGE"
fi
ok "imagem pronta"

step "Instalando"
# Guarda quem era o usuário principal, para o assistente oferecer a importação dos arquivos
sudo mkdir -p /.watermelon-migration
printf 'OLD_OS=%q\nOLD_USER=%q\nOLD_HOME=%q\n' "$OLD_OS" "${SUDO_USER:-$USER}" "$HOME" | sudo tee /.watermelon-migration/info >/dev/null

sudo podman run --rm --privileged --pid=host \
  --security-opt label=type:unconfined_t \
  -v /:/target -v /dev:/dev -v /var/lib/containers:/var/lib/containers \
  "$IMAGE" \
  bootc install to-existing-root --acknowledge-destructive --target-imgref "${WATERMELON_TARGET_IMAGE:-$IMAGE}"

cat <<EOF

${GRN}${B}🍉 WatermelonOS instalado!${OFF}

   Reinicie o computador: ${B}sudo reboot${OFF}
   No primeiro boot você cria seu usuário e o assistente de boas-vindas
   oferece trazer os arquivos do ${OLD_OS}.

EOF
