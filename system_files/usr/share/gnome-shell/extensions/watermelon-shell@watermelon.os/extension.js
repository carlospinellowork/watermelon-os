// WatermelonOS Shell — recursos do WatermelonOS dentro do GNOME Shell.
// Cada parte liga/desliga sozinha pela chave correspondente (app Personalizar):
//   island         ilha dinâmica com a música tocando     (island.js)
//   github-status  status do GitHub Actions na barra       (github.js)
//   melon-menu     menu 🍉 no canto esquerdo               (melonMenu.js)
//   widgets        relógio, sistema e música no desktop    (widgets.js)
//   ports          servidores de dev rodando               (ports.js)
//   git-island     branch e mudanças do projeto atual      (git.js)
//   claude-island  o que o Claude Code está fazendo + uso  (claude.js)
//   island-notifications  notificação espia na ilha        (peek.js)
//   palette        paleta de comandos Super+K              (palette.js)
//   focus          modo foco + Pomodoro                    (focus.js)

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MediaWatcher} from './media.js';
import {Island} from './island.js';
import {GitHubStatus} from './github.js';
import {MelonMenu} from './melonMenu.js';
import {DesktopWidgets} from './widgets.js';
import {PortsIndicator} from './ports.js';
import {GitIsland} from './git.js';
import {ClaudeIsland} from './claude.js';
import {NotificationPeek} from './peek.js';
import {Palette} from './palette.js';
import {Focus} from './focus.js';

// Programas auxiliares: os do sistema, ou os do repositório quando a extensão roda direto dele (desenvolvimento)
function libexec(extPath, name) {
    const sys = `/usr/libexec/watermelon/${name}`;
    if (GLib.file_test(sys, GLib.FileTest.IS_EXECUTABLE))
        return sys;
    const real = GLib.canonicalize_filename(`${extPath}/../../../../libexec/watermelon/${name}`, null);
    return real;
}

export default class WatermelonShell extends Extension {
    enable() {
        this._settings = this.getSettings();
        // pasta real (a extensão pode ser um link simbólico para o repositório durante o desenvolvimento)
        this._realPath = GLib.file_test(this.path, GLib.FileTest.IS_SYMLINK)
            ? GLib.canonicalize_filename(GLib.file_read_link(this.path), GLib.path_get_dirname(this.path))
            : this.path;
        this._media = new MediaWatcher();
        this._parts = {};
        this._features = {
            'island': () => new Island(this._media),
            'widgets': () => new DesktopWidgets(this._media),
            'melon-menu': () => {
                const m = new MelonMenu();
                Main.panel.addToStatusArea('watermelon-menu', m, 0, 'left');
                return m;
            },
            'github-status': () => {
                const g = new GitHubStatus(this._settings);
                Main.panel.addToStatusArea('watermelon-github', g, 0, 'right');
                return g;
            },
            'ports': () => {
                const p = new PortsIndicator();
                Main.panel.addToStatusArea('watermelon-ports', p, 0, 'right');
                return p;
            },
            'git-island': () => {
                const g = new GitIsland(this._realPath, libexec(this._realPath, 'git-ai'));
                Main.panel.addToStatusArea('watermelon-git', g, 2, 'left');
                return g;
            },
            'claude-island': () => {
                const c = new ClaudeIsland(this._realPath, libexec(this._realPath, 'claude-usage'));
                Main.panel.addToStatusArea('watermelon-claude', c, 3, 'left');
                return c;
            },
            'island-notifications': () => new NotificationPeek(),
            'palette': () => new Palette(this._settings, libexec(this._realPath, 'git-ai')),
            'focus': () => new Focus(this._settings),
        };
        for (const key of Object.keys(this._features)) {
            this._sync(key);
            this._settings.connectObject(`changed::${key}`, () => this._sync(key), this);
        }
    }

    _sync(key) {
        const want = this._settings.get_boolean(key);
        if (want && !this._parts[key]) {
            try {
                this._parts[key] = this._features[key]();
            } catch (e) {
                logError(e, `WatermelonOS: falha ao ligar ${key}`);
            }
        } else if (!want && this._parts[key]) {
            this._parts[key].destroy();
            delete this._parts[key];
        }
    }

    disable() {
        this._settings.disconnectObject(this);
        for (const part of Object.values(this._parts))
            part.destroy();
        this._parts = {};
        this._media.destroy();
        this._media = null;
        this._settings = null;
    }
}
