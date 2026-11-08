# WatermelonOS — configuração do zsh para todos os usuários.
# Carregado por /etc/zshrc ANTES do seu ~/.zshrc: personalize lá à vontade.

# ------------------------------------------------------------ histórico
HISTFILE=${HISTFILE:-$HOME/.zsh_history}
HISTSIZE=100000
SAVEHIST=100000
setopt SHARE_HISTORY HIST_IGNORE_ALL_DUPS HIST_IGNORE_SPACE HIST_REDUCE_BLANKS
setopt AUTO_CD INTERACTIVE_COMMENTS NO_BEEP
bindkey -e
bindkey '^[[1;5C' forward-word    # Ctrl+→
bindkey '^[[1;5D' backward-word   # Ctrl+←
bindkey '^[[3~'   delete-char     # Delete

# ------------------------------------------------------------ PATH
typeset -U path
path=("$HOME/.local/bin" $path)

# ------------------------------------------------------------ autocomplete
mkdir -p "$HOME/.cache/zsh"
autoload -Uz compinit && compinit -d "$HOME/.cache/zsh/zcompdump"
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}' 'r:|[._-]=* r:|=*'   # ignora maiúsculas
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no                                                  # o fzf-tab assume o menu
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*:git-checkout:*' sort false
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -1 --color=always --icons=always $realpath'
zstyle ':fzf-tab:complete:(nvim|vim|bat|cat|code):*' fzf-preview 'bat --color=always --style=numbers --line-range=:200 $realpath 2>/dev/null || eza -1 --color=always --icons=always $realpath'
zstyle ':fzf-tab:*' switch-group '<' '>'
[[ -r /usr/share/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh ]] && source /usr/share/zsh/plugins/fzf-tab/fzf-tab.plugin.zsh

# ------------------------------------------------------------ ferramentas
(( $+commands[mise] ))   && eval "$(mise activate zsh)"
(( $+commands[direnv] )) && eval "$(direnv hook zsh)"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
(( $+commands[fzf] ))    && source <(fzf --zsh)                    # Ctrl+T arquivos, Alt+C pastas
(( $+commands[atuin] ))  && eval "$(atuin init zsh --disable-up-arrow)"   # Ctrl+R histórico

[[ -f $HOME/.config/starship.toml ]] || export STARSHIP_CONFIG=/etc/starship.toml
(( $+commands[starship] )) && eval "$(starship init zsh)"

export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'
export FZF_DEFAULT_OPTS='--height 50% --layout reverse --border rounded --info inline
  --color=fg+:#f5f5f7,bg+:#2a1f22,hl:#ff5468,hl+:#ff5468,pointer:#ff5468,marker:#7dd3a0,prompt:#7dd3a0,border:#3a3a3c'
export BAT_THEME_DARK='Monokai Extended' BAT_THEME_LIGHT='GitHub'
export MANPAGER="sh -c 'col -bx | bat -l man -p'"
export EDITOR=${EDITOR:-nvim}

# ------------------------------------------------------------ atalhos
alias ls='eza --icons=auto --group-directories-first'
alias ll='eza -l --git --icons=auto --group-directories-first --time-style=relative'
alias la='ll -a'
alias lt='eza --tree --level=2 --icons=auto --git-ignore'
alias cat='bat --paging=never --style=plain'
alias grep='grep --color=auto'
alias ..='cd ..' ...='cd ../..'
alias g='git' gs='git status -sb' gl='git log --oneline --graph --decorate -20' gp='git push' gpl='git pull'
alias lg='lazygit' ld='lazydocker'
alias dc='docker compose' dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
alias k='kubectl'
alias c='claude'
alias ports='ss -tulpn'
alias myip='curl -s https://ifconfig.me; echo'

# yazi: ao sair, o terminal fica na pasta em que você estava navegando
y() {
  local tmp cwd
  tmp=$(mktemp -t yazi-cwd.XXXXXX)
  yazi "$@" --cwd-file="$tmp"
  cwd=$(<"$tmp")
  [[ -n $cwd && $cwd != "$PWD" ]] && builtin cd -- "$cwd"
  rm -f -- "$tmp"
}

# mkcd: cria a pasta e entra nela
mkcd() { mkdir -p -- "$1" && cd -- "$1"; }

# ------------------------------------------------------------ aviso de comando longo
# Comando que levou 30s+ (ajuste com WATERMELON_NOTIFY_AFTER) gera notificação ✅/❌.
zmodload zsh/datetime
autoload -Uz add-zsh-hook
_wm_cmd_start() { _wm_cmd=$1; _wm_t0=$EPOCHSECONDS; }
_wm_cmd_done() {
  local rc=$?
  [[ -n ${_wm_t0:-} ]] || return 0
  local dt=$(( EPOCHSECONDS - _wm_t0 )); unset _wm_t0
  (( dt >= ${WATERMELON_NOTIFY_AFTER:-30} )) || return 0
  # programas interativos não contam (você estava neles)
  [[ $_wm_cmd == (vim|nvim|ssh|less|man|lazygit|lg|lazydocker|ld|htop|btop|yazi|y|claude|c|tmux)(| *) ]] && return 0
  local title="✅ Terminou em ${dt}s"
  (( rc )) && title="❌ Falhou em ${dt}s (código $rc)"
  notify-send -a "Terminal" -i utilities-terminal "$title" "${_wm_cmd[1,90]}" 2>/dev/null
  return 0
}
add-zsh-hook preexec _wm_cmd_start
precmd_functions=(_wm_cmd_done ${precmd_functions:#_wm_cmd_done})   # primeiro, para ler o $? certo

# ------------------------------------------------------------ plugins visuais (sempre por último)
ZSH_AUTOSUGGEST_STRATEGY=(history completion)
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=#6e6e73'
[[ -r /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]] \
  && source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
[[ -r /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] \
  && source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ------------------------------------------------------------ dica de primeiro uso
if [[ -o login || -n $GHOSTTY_RESOURCES_DIR ]] && ! git config --global user.email >/dev/null 2>&1; then
  print -P "%F{#ff5468}🍉%f Git ainda não configurado. Rode %B%F{#7dd3a0}melon setup git%f%b para conectar ao GitHub em 1 minuto."
fi
