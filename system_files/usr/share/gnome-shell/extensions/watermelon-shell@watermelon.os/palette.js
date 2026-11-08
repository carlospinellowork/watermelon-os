// Paleta de comandos (Super+K): digite o que quer fazer.
//
//   "escuro" → modo escuro     "3000" → abrir/encerrar o servidor da porta 3000
//   "foco"   → Pomodoro        "2*(3+4)" → calculadora (Enter copia)
//   "meu-app" → abrir o repositório no VS Code ou no terminal
//   qualquer outra coisa → pesquisar na web
//
// ↑/↓ escolhe, Enter executa, Esc fecha.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {listPorts, openPort, killPid} from './ports.js';
import {currentProject, run, terminalIn} from './git.js';

const MAX_RESULTS = 8;
const REPO_DIRS = ['Documentos', 'Documents', 'Projetos', 'projetos', 'Projects', 'dev', 'code', 'src', 'repos'];

const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function launchApp(ids, fallback = null) {
    const sys = Shell.AppSystem.get_default();
    for (const id of ids) {
        const app = sys.lookup_app(id);
        if (app) {
            app.activate();
            return;
        }
    }
    if (fallback)
        Util.spawn(fallback);
}

function melon(args) {
    Util.spawn(['ghostty', '-e', 'bash', '-c', `melon ${args}; echo; read -n1 -rsp "Pressione uma tecla para fechar"`]);
}

export class Palette {
    constructor(settings) {
        this._settings = settings;
        this._iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._notif = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._actions = SystemActions.getDefault();
        this._repos = [];
        this._ports = [];

        Main.wm.addKeybinding('palette-shortcut', settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this.toggle());
    }

    // ------------------------------------------------------------ comandos fixos
    _static() {
        const dark = this._iface.get_string('color-scheme') === 'prefer-dark';
        const dnd = !this._notif.get_boolean('show-banners');
        const focus = this._settings.get_boolean('focus-active');
        const proj = currentProject();
        const projName = proj ? GLib.path_get_basename(proj) : null;
        const cmds = [
            {title: dark ? 'Modo claro' : 'Modo escuro', icon: 'weather-clear-night-symbolic', keys: 'tema dark light escuro claro aparencia',
                run: () => this._iface.set_string('color-scheme', dark ? 'default' : 'prefer-dark')},
            {title: focus ? 'Parar o foco' : 'Modo foco (25 min)', icon: 'alarm-symbolic', keys: 'foco pomodoro concentrar timer focus',
                run: () => this._settings.set_boolean('focus-active', !focus)},
            {title: dnd ? 'Desligar o não perturbe' : 'Não perturbe', icon: 'notifications-disabled-symbolic', keys: 'silencio notificacoes dnd',
                run: () => this._notif.set_boolean('show-banners', dnd)},
            {title: 'Wi-Fi: ligar/desligar', icon: 'network-wireless-symbolic', keys: 'wifi internet rede',
                run: async () => {
                    const r = await run(['nmcli', 'radio', 'wifi']);
                    Util.spawn(['nmcli', 'radio', 'wifi', r.out.trim() === 'enabled' ? 'off' : 'on']);
                }},
            {title: 'Print de uma área', icon: 'screenshot-recorded-symbolic', keys: 'captura screenshot tela imagem',
                run: () => Main.screenshotUI.open().catch(logError)},
            {title: 'Gravar a tela (vídeo ou GIF)', icon: 'media-record-symbolic', keys: 'gravar video gif kooha screencast',
                run: () => launchApp(['io.github.seadve.Kooha.desktop'], ['flatpak', 'run', 'io.github.seadve.Kooha'])},
            {title: 'Conta-gotas (pegar cor)', icon: 'color-select-symbolic', keys: 'cor hex rgb eyedropper',
                run: () => launchApp(['com.github.finefindus.eyedropper.desktop'])},
            {title: 'Personalizar', icon: 'preferences-desktop-appearance-symbolic', keys: 'tema cursor icones papel parede dock',
                run: () => launchApp(['os.watermelon.Customize.desktop'], ['/usr/libexec/watermelon/customize'])},
            {title: 'Configurações', icon: 'emblem-system-symbolic', keys: 'settings ajustes',
                run: () => launchApp(['org.gnome.Settings.desktop'])},
            {title: 'Monitor do sistema', icon: 'utilities-system-monitor-symbolic', keys: 'processos cpu memoria task',
                run: () => launchApp(['org.gnome.SystemMonitor.desktop'], ['gnome-system-monitor'])},
            {title: 'Terminal', icon: 'utilities-terminal-symbolic', keys: 'console shell ghostty',
                run: () => Util.spawn(['ghostty'])},
            {title: 'Limpar o sistema', icon: 'user-trash-symbolic', keys: 'lixo cache espaco disco melon limpar',
                run: () => melon('limpar')},
            {title: 'Verificar segurança', icon: 'security-high-symbolic', keys: 'seguranca firewall melon',
                run: () => melon('seguranca')},
            {title: 'Saúde do sistema (doctor)', icon: 'emblem-ok-symbolic', keys: 'doctor diagnostico problemas melon',
                run: () => melon('doctor')},
            {title: 'Atualizações do sistema', icon: 'software-update-available-symbolic', keys: 'update atualizar versao',
                run: () => melon('status')},
            {title: 'Bloquear a tela', icon: 'system-lock-screen-symbolic', keys: 'lock sair',
                run: () => this._actions.activateLockScreen()},
            {title: 'Suspender', icon: 'weather-clear-night-symbolic', keys: 'dormir sleep',
                run: () => this._actions.activateSuspend()},
            {title: 'Reiniciar…', icon: 'system-reboot-symbolic', keys: 'restart reboot',
                run: () => this._actions.activateRestart()},
            {title: 'Desligar…', icon: 'system-shutdown-symbolic', keys: 'shutdown power off',
                run: () => this._actions.activatePowerOff()},
        ];
        if (proj) {
            cmds.push(
                {title: `Claude em ${projName}`, icon: 'starred-symbolic', keys: 'claude ia ai assistente',
                    run: () => terminalIn(proj, ['claude'])},
                {title: `Git: lazygit em ${projName}`, icon: 'emblem-shared-symbolic', keys: 'git commit lazygit',
                    run: () => terminalIn(proj, ['lazygit'])},
                {title: `Cofre de envs de ${projName}`, icon: 'dialog-password-symbolic', keys: 'env cofre variaveis vault segredos',
                    run: () => terminalIn(proj, ['bash', '-c', 'melon env; exec $SHELL'])});
        }
        return cmds;
    }

    // ------------------------------------------------------------ resultados
    _results(q) {
        const text = q.trim();
        const nq = norm(text);
        const out = [];

        // calculadora
        if (/^[\d\s+\-*/().,%^]+$/.test(text) && /\d/.test(text) && /[+\-*/%^]/.test(text)) {
            try {
                const value = Function(`"use strict"; return (${text.replace(/,/g, '.').replace(/\^/g, '**')});`)();
                if (Number.isFinite(value)) {
                    const shown = Number(value.toPrecision(12)).toLocaleString('pt-BR', {maximumFractionDigits: 10});
                    out.push({title: `= ${shown}`, icon: 'accessories-calculator-symbolic', hint: 'Enter copia',
                        run: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, String(value))});
                }
            } catch (e) {
                // expressão incompleta
            }
        }

        // portas: "3000", "porta 3000", "matar 3000"
        const pm = nq.match(/(\d{3,5})/);
        if (pm) {
            for (const p of this._ports.filter(x => String(x.port).startsWith(pm[1]))) {
                out.push({title: `Abrir localhost:${p.port}`, hint: p.name, icon: 'web-browser-symbolic', run: () => openPort(p.port)});
                out.push({title: `Encerrar :${p.port}`, hint: p.name, icon: 'process-stop-symbolic', run: () => killPid(p.pid)});
            }
        }

        const words = nq.split(/\s+/).filter(Boolean);
        const score = c => {
            const hay = norm(`${c.title} ${c.keys ?? ''}`);
            if (!words.every(w => hay.includes(w)))
                return -1;
            return norm(c.title).startsWith(words[0] ?? '') ? 2 : 1;
        };
        const ranked = [...this._static(), ...this._repoCommands()]
            .map(c => [score(c), c]).filter(([s]) => s >= 0)
            .sort((a, b) => b[0] - a[0]).map(([, c]) => c);
        out.push(...(words.length ? ranked : ranked.slice(0, MAX_RESULTS)));

        if (text && !out.some(c => !c.web)) {
            out.push({title: `Pesquisar “${text}” na web`, icon: 'system-search-symbolic', web: true,
                run: () => Gio.AppInfo.launch_default_for_uri(`https://www.google.com/search?q=${encodeURIComponent(text)}`,
                    global.create_app_launch_context(0, -1))});
        }
        return out.slice(0, MAX_RESULTS);
    }

    _repoCommands() {
        const out = [];
        for (const r of this._repos) {
            const name = GLib.path_get_basename(r);
            out.push({title: `${name}: abrir no VS Code`, icon: 'folder-symbolic', keys: `repo projeto codigo ${r}`,
                run: () => Util.spawn(['code', r])});
            out.push({title: `${name}: terminal`, icon: 'utilities-terminal-symbolic', keys: `repo projeto shell ${r}`,
                run: () => terminalIn(r)});
        }
        return out;
    }

    async _loadDynamic() {
        this._ports = await listPorts();
        const home = GLib.get_home_dir();
        const dirs = REPO_DIRS.map(d => `${home}/${d}`).filter(d => GLib.file_test(d, GLib.FileTest.IS_DIR));
        if (!dirs.length)
            return;
        const r = await run(['find', ...dirs, '-maxdepth', '4', '-name', '.git', '-not', '-path', '*/node_modules/*', '-prune']);
        this._repos = r.out.split('\n').filter(Boolean).map(p => p.replace(/\/\.git$/, '')).sort();
        if (this._entry)
            this._refresh();
    }

    // ------------------------------------------------------------ janela
    toggle() {
        if (this._backdrop)
            this.close();
        else
            this.open();
    }

    open() {
        const m = Main.layoutManager.primaryMonitor;
        // fundo escuro: é um botão atrás da caixa, que fecha a paleta ao clicar fora dela
        // (no GNOME 51 os cliques são gestos: parar o evento no fundo cancelaria os cliques nos itens)
        this._backdrop = new St.Widget({reactive: true, x: m.x, y: m.y, width: m.width, height: m.height});
        const shield = new St.Button({style_class: 'wm-palette-backdrop', width: m.width, height: m.height,
            can_focus: false});
        shield.connect('clicked', () => this.close());
        this._backdrop.add_child(shield);
        this._box = new St.BoxLayout({style_class: 'wm-palette', orientation: Clutter.Orientation.VERTICAL, width: 640});
        this._entry = new St.Entry({style_class: 'wm-palette-entry', hint_text: 'O que você quer fazer?', can_focus: true});
        this._entry.set_primary_icon(new St.Icon({icon_name: 'system-search-symbolic', style_class: 'wm-palette-search-icon'}));
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'wm-palette-list'});
        this._box.add_child(this._entry);
        this._box.add_child(this._list);
        this._backdrop.add_child(this._box);
        this._box.set_position(Math.round((m.width - 640) / 2), Math.round(m.height * 0.18));
        Main.uiGroup.add_child(this._backdrop);

        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.SYSTEM_MODAL});
        this._entry.clutter_text.connect('text-changed', () => {
            this._sel = 0;
            this._refresh();
        });
        // teclado: ↑/↓/Esc/Enter (GNOME 51 usa controladores de eventos, não o sinal key-press-event)
        const keys = new Clutter.KeyController();
        keys.connect('key-press', () => {
            const [, symbol] = keys.get_key();
            return this._key(symbol);
        });
        this._entry.clutter_text.add_action(keys);
        this._entry.clutter_text.connect('activate', () => this._activate(this._items[this._sel]));
        this._entry.grab_key_focus();
        this._sel = 0;
        this._refresh();
        this._box.opacity = 0;
        this._box.scale_x = this._box.scale_y = 0.96;
        this._box.set_pivot_point(0.5, 0);
        this._box.ease({opacity: 255, scale_x: 1, scale_y: 1, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._loadDynamic();
    }

    close() {
        if (!this._backdrop)
            return;
        if (this._grab)
            Main.popModal(this._grab);
        this._grab = null;
        this._backdrop.destroy();
        this._backdrop = this._entry = this._list = this._box = null;
    }

    _key(sym) {
        if (sym === Clutter.KEY_Escape) {
            this.close();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Down || sym === Clutter.KEY_Up) {
            const n = this._items.length;
            if (n)
                this._sel = (this._sel + (sym === Clutter.KEY_Down ? 1 : n - 1)) % n;
            this._paintSelection();
            return Clutter.EVENT_STOP;
        }
        if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter || sym === Clutter.KEY_ISO_Enter) {
            this._activate(this._items[this._sel]);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _activate(cmd) {
        if (!cmd || !this._backdrop)
            return;
        this.close();
        try {
            cmd.run();
        } catch (e) {
            logError(e, 'WatermelonOS: paleta');
        }
    }

    _refresh() {
        this._items = this._results(this._entry.get_text());
        this._list.destroy_all_children();
        this._rows = this._items.map((c, i) => {
            const row = new St.Button({style_class: 'wm-palette-row', can_focus: false, x_expand: true});
            const box = new St.BoxLayout({x_expand: true});
            box.add_child(new St.Icon({icon_name: c.icon ?? 'system-run-symbolic', style_class: 'wm-palette-icon'}));
            box.add_child(new St.Label({text: c.title, style_class: 'wm-palette-title', y_align: Clutter.ActorAlign.CENTER, x_expand: true}));
            if (c.hint)
                box.add_child(new St.Label({text: c.hint, style_class: 'wm-palette-hint', y_align: Clutter.ActorAlign.CENTER}));
            row.set_child(box);
            row.connect('clicked', () => this._activate(c));
            row.connect('notify::hover', () => {
                if (row.hover) {
                    this._sel = i;
                    this._paintSelection();
                }
            });
            this._list.add_child(row);
            return row;
        });
        this._paintSelection();
    }

    _paintSelection() {
        this._rows?.forEach((r, i) => {
            if (i === this._sel)
                r.add_style_pseudo_class('selected');
            else
                r.remove_style_pseudo_class('selected');
        });
    }

    destroy() {
        this.close();
        Main.wm.removeKeybinding('palette-shortcut');
    }
}
