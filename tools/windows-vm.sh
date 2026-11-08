#!/usr/bin/env bash
# VM de teste do instalador para Windows: Windows 11 (disco 0) + disco vazio (disco 1),
# UEFI com Secure Boot (chaves da Microsoft), igual a um PC real com dois discos.
#   tools/windows-vm.sh          -> liga sem janela (prints: tools/vm-shot.py ... .vm/windows/monitor.sock)
#   GUI=1 tools/windows-vm.sh    -> liga numa janela
# O instalador é servido para a VM por HTTP em http://10.0.2.2:8765 (pasta .vm/windows/www).
set -euo pipefail
cd "$(dirname "$0")/.."
D=.vm/windows
ISO="$D/win11-ptbr.iso"
[ -f "$ISO" ] || { echo "baixe o ISO do Windows 11 em $ISO"; exit 1; }

if [ ! -f "$D/win.qcow2" ]; then
  qemu-img create -q -f qcow2 "$D/win.qcow2" 64G
  qemu-img create -q -f qcow2 "$D/second.qcow2" 80G
  cp /usr/share/OVMF/OVMF_VARS_4M.ms.fd "$D/vars.fd"
  mkdir -p "$D/unattend"
  cp tools/windows/autounattend.xml "$D/unattend/"
  genisoimage -quiet -J -r -o "$D/unattend.iso" "$D/unattend"
fi

# arquivos servidos para a VM: instalador + disco pronto
mkdir -p "$D/www"
cp install/windows/WatermelonOS-Installer.ps1 "$D/www/"
shopt -s nullglob   # o disco pronto pode ainda não existir: rode de novo "make raw" e este link é refeito
for f in output/release/*; do ln -sf "$(realpath "$f")" "$D/www/$(basename "$f")"; done
shopt -u nullglob
pkill -f "http.server 8765" 2>/dev/null || true
(cd "$D/www" && nohup python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &)

DISPLAY_OPTS=(-device VGA -display none)
[ "${GUI:-0}" = 1 ] && DISPLAY_OPTS=(-device VGA -display gtk)

exec qemu-system-x86_64 -enable-kvm -machine q35,smm=on -cpu host -smp 4 -m 4096 \
  -global driver=cfi.pflash01,property=secure,value=on \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.ms.fd \
  -drive if=pflash,format=raw,file="$D/vars.fd" \
  -drive id=d0,file="$D/win.qcow2",if=none,format=qcow2 -device ide-hd,drive=d0,bus=ide.0 \
  -drive id=d1,file="$D/second.qcow2",if=none,format=qcow2 -device ide-hd,drive=d1,bus=ide.1 \
  -drive id=cd0,file="$ISO",if=none,media=cdrom,readonly=on -device ide-cd,drive=cd0,bus=ide.2,bootindex=1 \
  -drive id=cd1,file="$D/unattend.iso",if=none,media=cdrom,readonly=on -device ide-cd,drive=cd1,bus=ide.3 \
  -nic user,model=e1000e \
  -device qemu-xhci -device usb-tablet \
  "${DISPLAY_OPTS[@]}" \
  -monitor unix:"$D/monitor.sock",server,nowait
