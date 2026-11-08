// Ilha do Claude: o que o Claude Code está fazendo, sem precisar olhar o terminal.
//
//   [✳]                      parado
//   [✳ trabalhando…]         gira enquanto o Claude trabalha
//   [✳ precisa de você]      pedindo permissão ou esperando resposta (+ notificação)
//   [✳ pronto ✓]             terminou (some depois de 3 min)
//
// Os estados vêm dos hooks do Claude Code (/usr/libexec/watermelon/claude-hook), gravados em
// ~/.local/state/watermelon/claude/<sessão>.json. O menu mostra as sessões e o uso
// (estimativa local; os limites do plano o próprio Claude mostra com /usage).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {currentProject, run, terminalIn} from './git.js';

const STATE_DIR = GLib.build_filenamev([GLib.get_user_state_dir(), 'watermelon', 'claude']);
const DONE_FOR = 180;          // s mostrando "pronto"
const STALE = 6 * 3600;        // s: sessão sem notícia há tanto tempo é ignorada
const LABELS = {working: 'trabalhando…', waiting: 'precisa de você', done: 'pronto ✓'};
const EMOJI = {working: '⚙️', waiting: '✋', done: '✅'};

function human(n) {
    if (n >= 1e6)
        return `${(n / 1e6).toFixed(1)} M`;
    if (n >= 1e3)
        return `${Math.round(n / 1e3)} mil`;
    return String(n);
}

function ago(ts) {
    const m = Math.round((Date.now() / 1000 - ts) / 60);
    return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
}

export const ClaudeIsland = GObject.registerClass(
class ClaudeIsland extends PanelMenu.Button {
    _init(extPath, usageBin) {
        super._init(0.0, 'Claude');
        this._usageBin = usageBin;
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box wm-chip', y_align: Clutter.ActorAlign.CENTER});
        this._icon = new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${extPath}/icons/wm-claude.svg`)),
            style_class: 'system-status-icon wm-chip-icon'});
        this._icon.set_pivot_point(0.5, 0.5);
        this._label = new St.Label({style_class: 'wm-chip-label', y_align: Clutter.ActorAlign.CENTER, visible: false});
        box.add_child(this._icon);
        box.add_child(this._label);
        this.add_child(box);
        this._box = box;

        GLib.mkdir_with_parents(STATE_DIR, 0o755);
        this._monitor = Gio.File.new_for_path(STATE_DIR).monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', () => this._reload());
        // menu vazio não abre no GNOME: começa com um item e é remontado a cada abertura
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Carregando…', {reactive: false}));
        this.menu.connect('open-state-changed', (_m, open) => open && this._buildMenu());
        this._reload();
        // reavalia de tempos em tempos ("pronto" expira, sessões antigas somem)
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 30, () => {
            this._reload();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _sessions() {
        const out = [];
        const now = Date.now() / 1000;
        let en;
        try {
            en = Gio.File.new_for_path(STATE_DIR).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            return out;
        }
        let info;
        while ((info = en.next_file(null))) {
            const name = info.get_name();
            if (!name.endsWith('.json'))
                continue;
            try {
                const [, bytes] = GLib.file_get_contents(`${STATE_DIR}/${name}`);
                const s = JSON.parse(new TextDecoder().decode(bytes));
                if (now - s.ts < STALE)
                    out.push({...s, id: name});
            } catch (e) {
                // arquivo sendo escrito: ignora nesta rodada
            }
        }
        return out.sort((a, b) => b.ts - a.ts);
    }

    _reload() {
        const sessions = this._sessions();
        const now = Date.now() / 1000;
        let state = 'idle';
        let who = null;
        for (const st of ['waiting', 'working', 'done']) {
            const s = sessions.find(x => x.state === st && (st !== 'done' || now - x.ts < DONE_FOR));
            if (s) {
                state = st;
                who = s;
                break;
            }
        }
        // notifica quando o Claude passa a precisar de você
        if (state === 'waiting' && (this._state !== 'waiting' || this._whoTs !== who.ts))
            Main.notify(`✋ Claude precisa de você · ${who.project}`, who.message || 'Ele está esperando sua resposta no terminal.');
        if (state === 'done' && this._state === 'working')
            Main.notify(`✅ Claude terminou · ${who.project}`, 'Pode conferir o resultado.');
        this._whoTs = who?.ts;
        this._setState(state, who);
    }

    _setState(state, who) {
        if (state === this._state && who?.project === this._who?.project)
            return;
        this._state = state;
        this._who = who;
        this._box.style_class = `panel-status-menu-box wm-chip wm-claude-${state}`;
        this._label.visible = state !== 'idle';
        this._label.text = state === 'idle' ? '' : LABELS[state];
        this._icon.remove_all_transitions();
        this._icon.rotation_angle_z = 0;
        if (state === 'working')
            this._spin();
    }

    _spin() {
        this._icon.ease({
            rotation_angle_z: this._icon.rotation_angle_z + 360,
            duration: 2400,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                if (this._state === 'working' && !this._destroyed) {
                    this._icon.rotation_angle_z = 0;
                    this._spin();
                }
            },
        });
    }

    async _buildMenu() {
        this.menu.removeAll();
        const add = (label, fn = null, cls = null) => {
            const item = new PopupMenu.PopupMenuItem(label, {reactive: !!fn});
            if (fn)
                item.connect('activate', fn);
            if (cls)
                item.label.add_style_class_name(cls);
            this.menu.addMenuItem(item);
            return item;
        };
        add('Claude Code', null, 'wm-menu-title');
        const sessions = this._sessions();
        if (sessions.length) {
            for (const s of sessions.slice(0, 6)) {
                add(`${EMOJI[s.state] ?? '•'}  ${s.project} — ${LABELS[s.state] ?? s.state} · ${ago(s.ts)}`,
                    () => terminalIn(s.cwd));
            }
        } else {
            add('Nenhuma sessão recente');
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const loading = add('Uso: calculando…');
        const r = await run([this._usageBin]);
        loading.destroy();
        try {
            const u = JSON.parse(r.out);
            const line = (title, b) => add(`${title}: ${b.messages} respostas · ${human(b.output)} tokens gerados`);
            line('Últimas 5 h', u.h5);
            line('Últimos 7 dias', u.d7);
            if (u.d7.projects.length)
                add(`Mais usado: ${u.d7.projects.map(([p, n]) => `${p} (${n})`).join(', ')}`, null, 'wm-dim');
            add('Estimativa local · limites do plano: /usage', null, 'wm-dim');
        } catch (e) {
            add('Uso indisponível', null, 'wm-dim');
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const proj = currentProject() ?? GLib.get_home_dir();
        add(`Abrir o Claude em ${GLib.path_get_basename(proj)}`, () => terminalIn(proj, ['claude']));
        add('Ver limites do plano (/usage)', () => terminalIn(proj, ['claude', '/usage']));
        add('Continuar a última conversa', () => terminalIn(proj, ['claude', '--continue']));
    }

    destroy() {
        this._destroyed = true;
        GLib.source_remove(this._timer);
        this._monitor.cancel();
        super.destroy();
    }
});
