# shellcheck shell=bash
# WatermelonOS: ambiente de desenvolvimento para shells bash interativos.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) PATH="$HOME/.local/bin:$PATH" ;; esac
export PATH

if [ -n "${BASH_VERSION:-}" ] && [[ $- == *i* ]]; then
  command -v mise     >/dev/null && eval "$(mise activate bash)"
  command -v zoxide   >/dev/null && eval "$(zoxide init bash)"
  command -v direnv   >/dev/null && eval "$(direnv hook bash)"
  command -v starship >/dev/null && eval "$(starship init bash)"
  command -v eza      >/dev/null && alias ls='eza --icons=auto' ll='eza -l --git --icons=auto'
  command -v bat      >/dev/null && alias cat='bat --paging=never --style=plain'
fi
