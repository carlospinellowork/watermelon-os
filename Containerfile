# WatermelonOS — imagem do sistema.
# O sistema inteiro nasce deste arquivo: cada build gera uma imagem bootc
# que vira ISO/VM e também é a fonte dos updates automáticos.
ARG FEDORA_VERSION=45
FROM quay.io/fedora/fedora-silverblue:${FEDORA_VERSION}

# Arquivos de configuração que vão direto para a raiz do sistema
COPY system_files/ /

# Scripts de build (montados só durante o build, não ficam na imagem)
RUN --mount=type=bind,source=build_files,target=/ctx \
    --mount=type=bind,source=branding,target=/branding \
    --mount=type=cache,target=/var/cache/libdnf5 \
    /ctx/build.sh

RUN bootc container lint
