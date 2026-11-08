// Status do GitHub Actions na barra: uma bolinha verde (passou), amarela
// (rodando) ou vermelha (falhou) com o último run de cada repositório.
// Usa o `gh` já logado (melon setup git). Avisa quando um build termina.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const IDLE_INTERVAL = 120;    // s entre consultas quando nada está rodando
const BUSY_INTERVAL = 25;     // s quando tem build rodando

function run(argv) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            reject(e);
            return;
        }
        proc.communicate_utf8_async(null, null, (p, res) => {
            try {
                const [, out, err] = p.communicate_utf8_finish(res);
                if (p.get_successful())
                    resolve(out);
                else
                    reject(new Error(err.trim() || 'gh falhou'));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function kind(r) {
    if (!r)
        return 'unknown';
    if (r.status !== 'completed')
        return 'running';
    return r.conclusion === 'success' ? 'success' : (r.conclusion === 'skipped' ? 'unknown' : 'failure');
}

function ago(iso) {
    const t = GLib.DateTime.new_from_iso8601(iso, null);
    if (!t)
        return '';
    const min = Math.round(GLib.DateTime.new_now_utc().difference(t) / 60e6);
    if (min < 1)
        return 'agora';
    if (min < 60)
        return `há ${min} min`;
    if (min < 60 * 24)
        return `há ${Math.round(min / 60)} h`;
    return `há ${Math.round(min / 1440)} d`;
}

const EMOJI = {success: '✅', failure: '❌', running: '🟡', unknown: '⚪'};

export const GitHubStatus = GObject.registerClass(
class GitHubStatus extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, 'GitHub Actions');
        this._settings = settings;
        this._runs = new Map();   // repo -> run
        this._gh = GLib.find_program_in_path('gh');

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box', y_align: Clutter.ActorAlign.CENTER});
        this._dot = new St.Widget({style_class: 'wm-ci-dot', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._dot);
        box.add_child(new St.Label({text: ' CI', style_class: 'wm-ci-label', y_align: Clutter.ActorAlign.CENTER}));
        this.add_child(box);

        this._header = new PopupMenu.PopupMenuItem('GitHub Actions', {reactive: false});
        this.menu.addMenuItem(this._header);
        this._list = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._list);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refresh = new PopupMenu.PopupMenuItem('Atualizar agora');
        refresh.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refresh);
        const actions = new PopupMenu.PopupMenuItem('Abrir no GitHub');
        actions.connect('activate', () => this._open('https://github.com/'));
        this.menu.addMenuItem(actions);

        this._settingsId = settings.connect('changed::github-repos', () => this._refresh());
        if (!this._gh) {
            this._setHeader('Instale e entre no GitHub: melon setup git');
            return;
        }
        this._refresh();
    }

    _setHeader(text) {
        this._header.label.text = text;
    }

    _open(url) {
        Gio.AppInfo.launch_default_for_uri(url, global.create_app_launch_context(0, -1));
    }

    async _repos() {
        const fixed = this._settings.get_strv('github-repos');
        if (fixed.length)
            return fixed;
        const out = await run([this._gh, 'api', 'user/repos?sort=pushed&per_page=4', '--jq', '.[].full_name']);
        return out.split('\n').filter(Boolean);
    }

    async _refresh() {
        this._schedule(IDLE_INTERVAL);
        if (!this._gh)
            return;
        let repos;
        try {
            repos = await this._repos();
        } catch (e) {
            this._setHeader('Sem acesso ao GitHub: rode melon setup git');
            this._paint();
            return;
        }
        const results = await Promise.all(repos.map(async repo => {
            try {
                const out = await run([this._gh, 'run', 'list', '-R', repo, '-L', '1', '--json',
                    'status,conclusion,displayTitle,url,workflowName,headBranch,updatedAt']);
                return [repo, JSON.parse(out)[0] ?? null];
            } catch (e) {
                return [repo, null];
            }
        }));
        if (this._destroyed)
            return;

        // avisa quando um build que estava rodando termina
        for (const [repo, r] of results) {
            const before = this._runs.get(repo);
            if (before && kind(before) === 'running' && r && kind(r) !== 'running' && before.url === r.url) {
                const ok = kind(r) === 'success';
                Main.notify(`${ok ? '✅' : '❌'} ${repo.split('/')[1]}: ${r.workflowName} ${ok ? 'passou' : 'falhou'}`,
                    r.displayTitle);
            }
        }
        this._runs = new Map(results);
        this._setHeader('GitHub Actions · último run');
        this._paint();
        if ([...this._runs.values()].some(r => kind(r) === 'running'))
            this._schedule(BUSY_INTERVAL);
    }

    _paint() {
        const kinds = [...this._runs.values()].map(kind);
        const overall = kinds.includes('failure') ? 'failure'
            : kinds.includes('running') ? 'running'
                : kinds.includes('success') ? 'success' : 'unknown';
        this._dot.style_class = `wm-ci-dot ${overall}`;

        this._list.removeAll();
        for (const [repo, r] of this._runs) {
            const k = kind(r);
            const text = r
                ? `${EMOJI[k]}  ${repo.split('/')[1]} — ${r.workflowName} (${r.headBranch}) · ${ago(r.updatedAt)}`
                : `${EMOJI.unknown}  ${repo.split('/')[1]} — sem Actions`;
            const item = new PopupMenu.PopupMenuItem(text);
            item.connect('activate', () => this._open(r ? r.url : `https://github.com/${repo}`));
            this._list.addMenuItem(item);
        }
    }

    _schedule(seconds) {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._timer = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._destroyed = true;
        if (this._timer)
            GLib.source_remove(this._timer);
        this._settings.disconnect(this._settingsId);
        super.destroy();
    }
});
