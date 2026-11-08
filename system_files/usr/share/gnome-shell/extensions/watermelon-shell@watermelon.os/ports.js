// Portas abertas na barra: seus servidores de desenvolvimento rodando (localhost:3000, 5173...).
// Clique numa porta para abrir no navegador; no × para encerrar o processo.
// Só aparece quando tem alguma porta sua aberta.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const INTERVAL = 5;   // segundos entre verificações

function readText(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        return '';
    }
}

// Nome amigável do processo: "next dev", "vite", "python manage.py runserver"...
function describe(pid, fallback) {
    const cmd = readText(`/proc/${pid}/cmdline`).split('\0').filter(Boolean);
    if (!cmd.length)
        return fallback;
    const base = s => s.split('/').pop();
    const known = cmd.map(base).find(a => /^(next|vite|nuxt|astro|remix|webpack|nodemon|tsx|ts-node|uvicorn|gunicorn|flask|rails|php|deno|bun|hugo|jekyll|storybook|expo|ng|svelte-kit)$/.test(a));
    if (known) {
        const i = cmd.map(base).indexOf(known);
        return [known, cmd[i + 1]].filter(a => a && !a.startsWith('-')).join(' ');
    }
    const script = cmd.slice(1).map(base).find(a => !a.startsWith('-'));
    return script ? `${base(cmd[0])} ${script}` : base(cmd[0]);
}

export function listPorts() {
    return new Promise(resolve => {
        let proc;
        try {
            proc = Gio.Subprocess.new(['ss', '-ltnpH'], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            resolve([]);
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            let out = '';
            try {
                [, out] = p.communicate_utf8_finish(res);
            } catch (e) {
                resolve([]);
                return;
            }
            const seen = new Map();
            for (const line of out.split('\n')) {
                const cols = line.trim().split(/\s+/);
                if (cols.length < 6)
                    continue;
                const port = Number(cols[3].split(':').pop());
                const m = cols[5].match(/\("([^"]+)",pid=(\d+)/);
                if (!m || port < 1024 || seen.has(port))   // só processos seus (o ss mostra o pid) e portas de dev
                    continue;
                const pid = Number(m[2]);
                seen.set(port, {port, pid, name: describe(pid, m[1]), local: /^(127\.|\[::1\]|localhost)/.test(cols[3])});
            }
            resolve([...seen.values()].sort((a, b) => a.port - b.port));
        });
    });
}

export function openPort(port) {
    Gio.AppInfo.launch_default_for_uri(`http://localhost:${port}`, global.create_app_launch_context(0, -1));
}

export function killPid(pid) {
    try {
        GLib.spawn_command_line_async(`kill ${Number(pid)}`);
    } catch (e) {
        logError(e);
    }
}

export const PortsIndicator = GObject.registerClass(
class PortsIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Portas abertas');
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({icon_name: 'network-server-symbolic', style_class: 'system-status-icon'}));
        this._count = new St.Label({style_class: 'wm-ports-count', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._count);
        this.add_child(box);
        this.visible = false;

        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Servidores rodando', {reactive: false}));
        this._list = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._list);

        this.menu.connect('open-state-changed', (_m, open) => open && this._refresh());
        this._refresh();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, INTERVAL, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _refresh() {
        const ports = await listPorts();
        if (this._destroyed)
            return;
        this.visible = ports.length > 0;
        this._count.text = String(ports.length);
        const key = ports.map(p => `${p.port}:${p.pid}`).join(',');
        if (key === this._key)
            return;
        this._key = key;
        this._list.removeAll();
        for (const p of ports) {
            const item = new PopupMenu.PopupMenuItem(`:${p.port}   ${p.name}${p.local ? '' : '  ·  visível na rede'}`);
            const kill = new St.Button({style_class: 'wm-port-kill', child: new St.Icon({icon_name: 'window-close-symbolic', icon_size: 14}),
                x_expand: true, x_align: Clutter.ActorAlign.END});
            kill.connect('clicked', () => {
                killPid(p.pid);
                this.menu.close();
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                    this._refresh();
                    return GLib.SOURCE_REMOVE;
                });
            });
            item.add_child(kill);
            item.connect('activate', () => openPort(p.port));
            this._list.addMenuItem(item);
        }
    }

    destroy() {
        this._destroyed = true;
        GLib.source_remove(this._timer);
        super.destroy();
    }
});
