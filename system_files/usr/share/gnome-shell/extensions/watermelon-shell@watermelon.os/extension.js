// WatermelonOS Shell — recursos do WatermelonOS dentro do GNOME Shell.
// Cada parte liga/desliga sozinha pela chave correspondente (app Personalizar):
//   island         ilha dinâmica com a música tocando     (island.js)
//   github-status  status do GitHub Actions na barra       (github.js)
//   melon-menu     menu 🍉 no canto esquerdo               (melonMenu.js)
//   widgets        relógio, sistema e música no desktop    (widgets.js)

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MediaWatcher} from './media.js';
import {Island} from './island.js';
import {GitHubStatus} from './github.js';
import {MelonMenu} from './melonMenu.js';
import {DesktopWidgets} from './widgets.js';

export default class WatermelonShell extends Extension {
    enable() {
        this._settings = this.getSettings();
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
