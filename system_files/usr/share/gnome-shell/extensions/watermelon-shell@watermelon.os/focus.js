// Modo foco + Pomodoro: uma pílula 🍅 com contagem regressiva ao lado do relógio.
// Durante o foco, as notificações ficam em silêncio (não perturbe). No fim, toca um som,
// avisa e começa a pausa ☕. Liga/desliga pela chave `focus-active` (Super+K, menu 🍉 ou `melon foco`).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class Focus {
    constructor(settings) {
        this._settings = settings;
        this._notif = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});

        this.actor = new St.Button({style_class: 'wm-focus', visible: false, reactive: true, can_focus: true,
            y_align: Clutter.ActorAlign.CENTER});
        const box = new St.BoxLayout({y_align: Clutter.ActorAlign.CENTER});
        this._label = new St.Label({style_class: 'wm-focus-label', y_align: Clutter.ActorAlign.CENTER});
        const track = new St.Widget({style_class: 'wm-focus-track', y_align: Clutter.ActorAlign.CENTER});
        this._bar = new St.Widget({style_class: 'wm-focus-fill'});
        track.add_child(this._bar);
        box.add_child(this._label);
        box.add_child(track);
        this.actor.set_child(box);
        this.actor.connect('clicked', () => this._settings.set_boolean('focus-active', false));
        Main.panel._centerBox.add_child(this.actor);

        this._settings.connectObject('changed::focus-active', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const want = this._settings.get_boolean('focus-active');
        if (want && this._phase !== 'focus')
            this._start('focus', this._settings.get_int('focus-minutes'));
        else if (!want && this._phase === 'focus')
            this._stop(true);
    }

    _start(phase, minutes) {
        this._clearTimer();
        this._phase = phase;
        this._total = minutes * 60;
        this._left = this._total;
        if (phase === 'focus' && this._savedBanners === undefined) {
            this._savedBanners = this._notif.get_boolean('show-banners');
            this._notif.set_boolean('show-banners', false);   // não perturbe
        }
        this.actor.style_class = `wm-focus ${phase}`;
        this.actor.show();
        this.actor.opacity = 0;
        this.actor.ease({opacity: 255, duration: 200});
        this._tick();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => this._tick());
    }

    _tick() {
        this._label.text = `${this._phase === 'focus' ? '🍅' : '☕'} ${fmt(this._left)}`;
        this._bar.width = Math.round(46 * (1 - this._left / this._total));
        if (this._left <= 0) {
            this._timer = 0;
            this._finished();
            return GLib.SOURCE_REMOVE;
        }
        this._left--;
        return GLib.SOURCE_CONTINUE;
    }

    _sound() {
        try {
            global.display.get_sound_player().play_from_theme('complete', 'Pomodoro', null);
        } catch (e) {
            // sem som: tudo bem
        }
    }

    _finished() {
        this._sound();
        if (this._phase === 'focus') {
            this._restoreBanners();
            Main.notify('🍅 Foco concluído!', `Hora de uma pausa de ${this._settings.get_int('break-minutes')} minutos. Levante, beba água.`);
            this._phase = 'break';   // antes de desligar a chave: o _sync não pode achar que é um "parar"
            this._settings.set_boolean('focus-active', false);
            this._start('break', this._settings.get_int('break-minutes'));
        } else {
            Main.notify('☕ Pausa terminada', 'Bora voltar? Super+K → "foco" para mais 25 minutos.');
            this._stop(false);
        }
    }

    _stop(fromUser) {
        this._clearTimer();
        this._restoreBanners();
        this._phase = null;
        this.actor.ease({opacity: 0, duration: 200, onComplete: () => this.actor.hide()});
        if (fromUser)
            this._settings.set_boolean('focus-active', false);
    }

    _restoreBanners() {
        if (this._savedBanners !== undefined) {
            this._notif.set_boolean('show-banners', this._savedBanners);
            this._savedBanners = undefined;
        }
    }

    _clearTimer() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._clearTimer();
        this._restoreBanners();
        this.actor.destroy();
    }
}
