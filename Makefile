# WatermelonOS — comandos de build e teste
#   make build       -> constrói a imagem do sistema
#   make iso         -> gera a ISO instalável
#
#   Testes em VM:
#   make qcow2       -> gera o disco de VM (imagem de teste: igual à real + SSH)
#   make vm          -> liga a VM numa janela (com aceleração de vídeo)
#   make vm-headless -> liga a VM sem janela (testes automáticos)
#   make vm-ssh      -> terminal dentro da VM
#   make vm-shot     -> print da tela da VM em .vm/shot.png

IMAGE          ?= localhost/watermelon-os
TAG            ?= latest
FEDORA_VERSION ?= 45
BIB            ?= quay.io/centos-bootc/bootc-image-builder:latest
VM_MEM         ?= 3584
VM_CPUS        ?= 4
VM_DIR         := .vm
SSH            := ssh -p 2222 -i $(VM_DIR)/id_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR melon@localhost

QEMU_BASE = qemu-system-x86_64 -enable-kvm -cpu host -smp $(VM_CPUS) -m $(VM_MEM) \
	  -drive file=output/qcow2/disk.qcow2,if=virtio,format=qcow2 \
	  -nic user,model=virtio-net-pci,hostfwd=tcp:127.0.0.1:2222-:22 \
	  -device qemu-xhci -device usb-tablet \
	  -monitor unix:$(VM_DIR)/monitor.sock,server,nowait

.PHONY: build build-test qcow2 iso vm vm-headless vm-ssh vm-shot clean

build:
	sudo podman build --build-arg FEDORA_VERSION=$(FEDORA_VERSION) -t $(IMAGE):$(TAG) .

build-test: build
	sudo podman build -f Containerfile.test -t $(IMAGE):test .

$(VM_DIR)/id_ed25519:
	mkdir -p $(VM_DIR)
	ssh-keygen -t ed25519 -N "" -C watermelon-vm-test -f $(VM_DIR)/id_ed25519 -q

$(VM_DIR)/config.toml: disk-config.toml $(VM_DIR)/id_ed25519
	sed '/^groups = /a key = "'"$$(cat $(VM_DIR)/id_ed25519.pub)"'"' disk-config.toml > $@

define bib
	mkdir -p output
	sudo podman run --rm --privileged --pull=newer \
	  --security-opt label=type:unconfined_t \
	  -v ./$(2):/config.toml:ro \
	  -v ./output:/output \
	  -v /var/lib/containers/storage:/var/lib/containers/storage \
	  $(BIB) --type $(1) --rootfs btrfs $(3)
	sudo chown -R $$(id -u):$$(id -g) output
endef

qcow2: $(VM_DIR)/config.toml
	rm -rf output/qcow2
	$(call bib,qcow2,$(VM_DIR)/config.toml,$(IMAGE):test)

iso:
	$(call bib,anaconda-iso,disk-config.toml,$(IMAGE):$(TAG))

vm:
	$(QEMU_BASE) -device virtio-vga-gl -display gtk,gl=on,show-cursor=on

vm-headless:
	$(QEMU_BASE) -device virtio-vga -display none

vm-ssh:
	$(SSH)

vm-shot:
	python3 tools/vm-shot.py $(VM_DIR)/shot.png $(VM_DIR)/monitor.sock

clean:
	rm -rf output $(VM_DIR)
