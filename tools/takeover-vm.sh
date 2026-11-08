#!/usr/bin/env bash
# Sobe uma VM Ubuntu 24.04 (UEFI, ext4: mesmo cenário de um notebook com Mint)
# para testar a instalação sem pendrive (install/from-linux.sh).
#   tools/takeover-vm.sh        -> cria (se preciso) e liga a VM sem janela; SSH na porta 2223
set -euo pipefail
cd "$(dirname "$0")/.."
D=.vm/ubuntu
mkdir -p "$D"
BASE="$D/noble-base.img"

[ -f "$BASE" ] || curl -fL --progress-bar -o "$BASE" \
  https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

if [ ! -f "$D/disk.qcow2" ]; then
  qemu-img create -q -f qcow2 -b "$(realpath "$BASE")" -F qcow2 "$D/disk.qcow2" 60G
  cp /usr/share/OVMF/OVMF_VARS_4M.fd "$D/vars.fd"
  cat > "$D/user-data" <<EOF
#cloud-config
hostname: notebook-mint
users:
  - name: cadu
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: cadu
    ssh_authorized_keys:
      - $(cat .vm/id_ed25519.pub)
package_update: true
packages: [podman]
runcmd:
  - [sh, -c, "mkdir -p /home/cadu/projetos/loja && echo 'meu projeto' > /home/cadu/projetos/loja/README.md && chown -R cadu:cadu /home/cadu/projetos"]
EOF
  printf 'instance-id: notebook-mint\nlocal-hostname: notebook-mint\n' > "$D/meta-data"
  genisoimage -quiet -output "$D/seed.iso" -volid cidata -joliet -rock "$D/user-data" "$D/meta-data"
fi

exec qemu-system-x86_64 -enable-kvm -cpu host -smp 4 -m 3072 \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd \
  -drive if=pflash,format=raw,file="$D/vars.fd" \
  -drive file="$D/disk.qcow2",if=virtio,format=qcow2 \
  -drive file="$D/seed.iso",media=cdrom,readonly=on \
  -nic user,model=virtio-net-pci,hostfwd=tcp:127.0.0.1:2223-:22 \
  -device virtio-vga -display none \
  -monitor unix:"$D/monitor.sock",server,nowait \
  -serial file:"$D/serial.log"
