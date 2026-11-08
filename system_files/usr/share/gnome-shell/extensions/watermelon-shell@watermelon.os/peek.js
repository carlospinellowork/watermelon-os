// Notificações na ilha: quando chega uma notificação, a ilha do relógio "espia" por
// alguns segundos com o ícone e o título do app (estilo Dynamic Island).
// Respeita o não perturbe e o modo foco.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_FOR = 4000;   // ms

export class NotificationPeek {
    constructor() {
        this._notif = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this.actor = new St.BoxLayout({style_class: 'wm-peek', visible: false, y_align: Clutter.ActorAlign.CENTER});
        this._icon = new St.Icon({style_class: 'wm-peek-icon', icon_size: 16});
        this._text = new St.Label({style_class: 'wm-peek-text', y_align: Clutter.ActorAlign.CENTER});
        this._text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.actor.add_child(this._icon);
        this.actor.add_child(this._text);
        Main.panel._centerBox.add_child(this.actor);

        this._sources = new Map();
        Main.messageTray.connectObject('source-added', (_t, source) => this._watch(source), this);
        for (const source of Main.messageTray.getSources?.() ?? [])
            this._watch(source);
    }

    _watch(source) {
        if (this._sources.has(source))
            return;
        source.connectObject(
            'notification-added', (_s, n) => this._show(source, n),
            'destroy', () => this._sources.delete(source), this);
        this._sources.set(source, true);
    }

    _show(source, n) {
        if (!this._notif.get_boolean('show-banners'))
            return;   // não perturbe / foco
        this._icon.gicon = n.gicon ?? source.gicon ?? source.icon ?? Gio.ThemedIcon.new('preferences-system-notifications-symbolic');
        const title = n.title || source.title || 'Notificação';
        this._text.text = n.body ? `${title} · ${n.body.split('\n')[0]}` : title;
        if (this._hideId)
            GLib.source_remove(this._hideId);
        if (!this.actor.visible) {
            this.actor.show();
            this.actor.opacity = 0;
            this.actor.set_pivot_point(0.5, 0.5);
            this.actor.scale_x = 0.6;
            this.actor.ease({opacity: 255, scale_x: 1, duration: 260, mode: Clutter.AnimationMode.EASE_OUT_BACK});
        }
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_FOR, () => {
            this._hideId = 0;
            this.actor.ease({opacity: 0, scale_x: 0.6, duration: 200, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => this.actor.hide()});
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._hideId)
            GLib.source_remove(this._hideId);
        Main.messageTray.disconnectObject(this);
        for (const source of this._sources.keys())
            source.disconnectObject(this);
        this.actor.destroy();
    }
}
