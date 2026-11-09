// Ilha do Git: o repositório em que você está trabalhando no terminal.
//
//   [⎇ main ●3 ↑1]   branch · arquivos alterados · commits para enviar/receber
//
// O terminal (zsh) grava a pasta do projeto atual em ~/.local/state/watermelon/current-project.
// Menu: arquivos alterados, PR da branch com status dos checks, commit (lazygit), push, pull,
// trocar de branch, criar PR, abrir no GitHub e no VS Code.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const STATE_FILE = GLib.build_filenamev([GLib.get_user_state_dir(), 'watermelon', 'current-project']);
const STATUS_INTERVAL = 4;    // s
const PR_INTERVAL = 90;       // s

export function run(argv, cwd = null) {
    return new Promise(resolve => {
        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            if (cwd)
                launcher.set_cwd(cwd);
            launcher.setenv('GIT_TERMINAL_PROMPT', '0', true);
            const proc = launcher.spawnv(argv);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, out, err] = p.communicate_utf8_finish(res);
                    resolve({ok: p.get_successful(), out: out ?? '', err: err ?? ''});
                } catch (e) {
                    resolve({ok: false, out: '', err: String(e)});
                }
            });
        } catch (e) {
            resolve({ok: false, out: '', err: String(e)});
        }
    });
}

export function currentProject() {
    try {
        const [, bytes] = GLib.file_get_contents(STATE_FILE);
        const p = new TextDecoder().decode(bytes).trim();
        return p && GLib.file_test(`${p}/.git`, GLib.FileTest.EXISTS) ? p : null;
    } catch (e) {
        return null;
    }
}

export function terminalIn(dir, argv = null) {
    Util.spawn(['ghostty', `--working-directory=${dir}`, ...(argv ? ['-e', ...argv] : [])]);
}

// roda um comando no terminal e mantém a janela aberta no fim (para ler o resultado)
export function terminalHold(dir, argv) {
    const cmd = argv.map(a => GLib.shell_quote(a)).join(' ');
    terminalIn(dir, ['bash', '-c', `${cmd}; echo; read -n1 -rsp "Pressione uma tecla para fechar"`]);
}

const CHECK = {SUCCESS: '✅', FAILURE: '❌', ERROR: '❌', PENDING: '🟡', IN_PROGRESS: '🟡', QUEUED: '🟡'};

export const GitIsland = GObject.registerClass(
class GitIsland extends PanelMenu.Button {
    _init(extPath, gitAi) {
        super._init(0.0, 'Git');
        this._gitAi = gitAi;   // /usr/libexec/watermelon/git-ai (melon commit, pr, revisar…)
        this._reviews = [];
        const box = new St.BoxLayout({style_class: 'panel-status-menu-box wm-chip', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(new St.Icon({gicon: Gio.FileIcon.new(Gio.File.new_for_path(`${extPath}/icons/wm-git.svg`)),
            style_class: 'system-status-icon wm-chip-icon'}));
        this._label = new St.Label({style_class: 'wm-chip-label', y_align: Clutter.ActorAlign.CENTER});
        box.add_child(this._label);
        this.add_child(box);
        this.visible = false;

        this._monitor = Gio.File.new_for_path(STATE_FILE).monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._monitor.connect('changed', () => this._load());
        // menu vazio não abre no GNOME: começa com um item e é remontado a cada abertura
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Carregando…', {reactive: false}));
        this.menu.connect('open-state-changed', (_m, open) => open && this._buildMenu());
        this._load();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, STATUS_INTERVAL, () => {
            this._status();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _load() {
        const root = currentProject();
        if (root !== this._root) {
            this._root = root;
            this._pr = null;
            this._prAt = 0;
        }
        this._status();
    }

    async _status() {
        if (!this._root) {
            this.visible = false;
            return;
        }
        const r = await run(['git', 'status', '--porcelain=v2', '--branch'], this._root);
        if (this._destroyed || !r.ok)
            return;
        const s = {branch: '?', ahead: 0, behind: 0, files: [], conflicts: 0};
        for (const line of r.out.split('\n')) {
            if (line.startsWith('# branch.head '))
                s.branch = line.slice(14);
            else if (line.startsWith('# branch.ab ')) {
                const [a, b] = line.slice(12).split(' ');
                s.ahead = Math.abs(Number(a));
                s.behind = Math.abs(Number(b));
            } else if (/^[12u?] /.test(line)) {
                const parts = line.split(' ');
                const code = line[0] === '?' ? '??' : parts[1].replace(/\./g, '');
                s.files.push(`${code.padEnd(2)} ${parts[parts.length - 1]}`);
                if (line[0] === 'u')
                    s.conflicts++;
            }
        }
        if (s.branch !== this._s?.branch)
            this._prAt = 0;
        this._s = s;
        let text = s.branch;
        if (s.conflicts)
            text += ` ⚠${s.conflicts}`;
        if (s.files.length)
            text += ` ●${s.files.length}`;
        if (s.ahead)
            text += ` ↑${s.ahead}`;
        if (s.behind)
            text += ` ↓${s.behind}`;
        if (this._reviews.length)
            text = `👀${this._reviews.length}  ${text}`;
        this._label.text = text;
        this.visible = true;

        if (Date.now() - this._prAt > PR_INTERVAL * 1000) {
            this._prAt = Date.now();
            const pr = await run(['gh', 'pr', 'view', '--json', 'number,title,url,state,isDraft,statusCheckRollup'], this._root);
            try {
                this._pr = pr.ok ? JSON.parse(pr.out) : null;
            } catch (e) {
                this._pr = null;
            }
            // PRs (de qualquer repositório) em que pediram sua revisão
            const rv = await run(['gh', 'search', 'prs', '--review-requested=@me', '--state=open',
                '--json', 'number,title,url,repository', '--limit', '10']);
            try {
                const list = rv.ok ? JSON.parse(rv.out) : [];
                if (list.length > this._reviews.length && this._reviewsLoaded)
                    Main.notify('👀 Pediram sua revisão', list[0].title);
                this._reviews = list;
                this._reviewsLoaded = true;
            } catch (e) {
                // sem rede ou sem gh: mantém a lista anterior
            }
        }
    }

    _prSummary() {
        const pr = this._pr;
        if (!pr)
            return null;
        const checks = pr.statusCheckRollup ?? [];
        const states = checks.map(c => c.conclusion || c.state || c.status);
        let icon = '⚪';
        if (states.some(x => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(x)))
            icon = CHECK.FAILURE;
        else if (states.some(x => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED'].includes(x)))
            icon = CHECK.PENDING;
        else if (states.length)
            icon = CHECK.SUCCESS;
        return `${icon} PR #${pr.number}${pr.isDraft ? ' (rascunho)' : ''}: ${pr.title}`;
    }

    async _gitAction(label, argv) {
        Main.notify(`Git: ${label}…`, GLib.path_get_basename(this._root));
        const r = await run(argv, this._root);
        const tail = (r.ok ? r.out || r.err : r.err || r.out).trim().split('\n').slice(-3).join('\n');
        Main.notify(`${r.ok ? '✅' : '❌'} Git: ${label}`, tail || (r.ok ? 'pronto' : 'falhou'));
        this._prAt = 0;
        this._status();
    }

    async _buildMenu() {
        this.menu.removeAll();
        const root = this._root;
        if (!root || !this._s)
            return;
        const s = this._s;
        const add = (label, fn, reactive = true) => {
            const item = new PopupMenu.PopupMenuItem(label, {reactive});
            if (fn)
                item.connect('activate', fn);
            this.menu.addMenuItem(item);
            return item;
        };
        add(`${GLib.path_get_basename(root)}  ·  ${s.branch}`, null, false).label.add_style_class_name('wm-menu-title');
        if (s.files.length) {
            for (const f of s.files.slice(0, 8))
                add(`   ${f}`, null, false).label.add_style_class_name('wm-mono');
            if (s.files.length > 8)
                add(`   … e mais ${s.files.length - 8}`, null, false);
        } else {
            add('   Nada para commitar ✨', null, false);
        }
        const pr = this._prSummary();
        if (pr)
            add(pr, () => Gio.AppInfo.launch_default_for_uri(this._pr.url, global.create_app_launch_context(0, -1)));

        if (this._reviews.length) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Pedem sua revisão'));
            for (const p of this._reviews.slice(0, 5)) {
                add(`👀 ${p.repository?.name ?? ''} #${p.number}: ${p.title}`,
                    () => Gio.AppInfo.launch_default_for_uri(p.url, global.create_app_launch_context(0, -1)));
            }
        }

        // ---- com IA (Claude)
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Com o Claude'));
        if (s.conflicts)
            add(`⚠ Resolver ${s.conflicts} conflito(s) com o Claude`, () => terminalIn(root, [this._gitAi, 'conflitos']));
        if (s.files.length)
            add('✳ Commit com IA', () => terminalHold(root, [this._gitAi, 'commit']));
        add(this._pr ? '✳ Atualizar PR (push)' : '✳ Abrir PR com IA', () => (this._pr
            ? this._gitAction('push', ['git', 'push'])
            : terminalHold(root, [this._gitAi, 'pr'])));
        add('✳ Revisar com o Claude', () => terminalHold(root, [this._gitAi, 'revisar']));
        add('✳ Nova tarefa em paralelo…', () => terminalHold(root, [this._gitAi, 'tarefa']));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Git'));
        add('Commit… (lazygit)', () => terminalIn(root, ['lazygit']));
        add(`Enviar (push)${s.ahead ? ` ↑${s.ahead}` : ''}`, () => this._gitAction('push', ['git', 'push']));
        add(`Receber (pull)${s.behind ? ` ↓${s.behind}` : ''}`, () => this._gitAction('pull', ['git', 'pull', '--ff-only']));

        const branches = new PopupMenu.PopupSubMenuMenuItem('Trocar de branch');
        const refs = await run(['git', 'for-each-ref', '--sort=-committerdate', '--count=10',
            '--format=%(refname:short)', 'refs/heads'], root);
        for (const b of refs.out.split('\n').filter(x => x && x !== s.branch)) {
            const it = new PopupMenu.PopupMenuItem(b);
            it.connect('activate', () => this._gitAction(`trocar para ${b}`, ['git', 'switch', b]));
            branches.menu.addMenuItem(it);
        }
        this.menu.addMenuItem(branches);

        add(this._pr ? 'Abrir o PR' : 'Criar PR…', () => (this._pr
            ? Gio.AppInfo.launch_default_for_uri(this._pr.url, global.create_app_launch_context(0, -1))
            : Util.spawn(['sh', '-c', `cd ${GLib.shell_quote(root)} && gh pr create --web`])));
        add('Abrir no GitHub', () => Util.spawn(['sh', '-c', `cd ${GLib.shell_quote(root)} && gh browse`]));
        add('Abrir no VS Code', () => Util.spawn(['code', root]));
        add('Terminal aqui', () => terminalIn(root));
        add('Copiar nome da branch', () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, s.branch));
    }

    destroy() {
        this._destroyed = true;
        GLib.source_remove(this._timer);
        this._monitor.cancel();
        super.destroy();
    }
});
