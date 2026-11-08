// Ilha dinâmica: a música tocando aparece dentro da ilha do relógio.
//
//   ( 8 de nov 18:11 )                         nada tocando
//   ( 8 de nov 18:11  ▣ ▂▅▃ Song name )        tocando
//   ( 8 de nov 18:11  ▣ ▂▅▃ Song name ⏮ ⏸ ⏭ ) mouse em cima: controles
//
// Quando a música muda, a ilha dá um "pulo" (como a Dynamic Island).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class Island {
    constructor(media) {
        this._media = media;
        this._lastTitle = null;

        this.actor = new St.BoxLayout({style_class: 'wm-island', reactive: true, track_hover: true,
            y_align: Clutter.ActorAlign.CENTER, visible: false, opacity: 0});

        this._art = new St.Widget({style_class: 'wm-island-art', y_align: Clutter.ActorAlign.CENTER});
        this.actor.add_child(this._art);

        // equalizador: 3 barrinhas que pulsam enquanto toca
        this._bars = new St.BoxLayout({style_class: 'wm-island-bars', y_align: Clutter.ActorAlign.CENTER});
        this._barActors = [0, 1, 2].map(() => {
            const b = new St.Widget({style_class: 'wm-island-bar', height: 12,
                y_align: Clutter.ActorAlign.CENTER});
            b.set_pivot_point(0.5, 0.5);
            this._bars.add_child(b);
            return b;
        });
        this.actor.add_child(this._bars);

        const titleBtn = new St.Button({reactive: true, can_focus: true});
        this._title = new St.Label({style_class: 'wm-island-title', y_align: Clutter.ActorAlign.CENTER});
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        titleBtn.set_child(this._title);
        titleBtn.connect('clicked', () => this._media.raise());
        this.actor.add_child(titleBtn);

        this._controls = new St.BoxLayout({style_class: 'wm-island-controls', visible: false, opacity: 0});
        const btn = (icon, fn) => {
            const b = new St.Button({style_class: 'wm-island-btn', child: new St.Icon({icon_name: icon})});
            b.connect('clicked', fn);
            this._controls.add_child(b);
            return b;
        };
        this._prev = btn('media-skip-backward-symbolic', () => this._media.previous());
        this._play = btn('media-playback-pause-symbolic', () => this._media.playPause());
        this._next = btn('media-skip-forward-symbolic', () => this._media.next());
        this.actor.add_child(this._controls);

        this.actor.connect('notify::hover', () => this._showControls(this.actor.hover));

        // fica logo depois do relógio, dentro da mesma ilha
        const center = Main.panel._centerBox;
        center.add_child(this.actor);

        this._listener = this._media.connect(s => this._update(s));
    }

    _showControls(show) {
        if (show) {
            this._controls.show();
            this._controls.ease({opacity: 255, duration: 160, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        } else {
            this._controls.ease({opacity: 0, duration: 120, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (!this.actor.hover)
                        this._controls.hide();
                }});
        }
    }

    _update(state) {
        if (!state) {
            this._stopBars();
            this.actor.ease({opacity: 0, duration: 200, onComplete: () => this.actor.hide()});
            this._lastTitle = null;
            return;
        }
        this._title.text = state.artist ? `${state.title} · ${state.artist}` : state.title;
        this._art.style = state.art ? `background-image: url("file://${state.art}");` : null;
        this._play.child.icon_name = state.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._prev.visible = state.canPrev;
        this._next.visible = state.canNext;

        if (!this.actor.visible) {
            this.actor.show();
            this.actor.ease({opacity: 255, duration: 220});
        }
        if (state.playing)
            this._startBars();
        else
            this._stopBars();

        if (this._lastTitle !== null && this._lastTitle !== state.title)
            this._bounce();
        this._lastTitle = state.title;
    }

    _bounce() {
        const panelBox = Main.panel._centerBox;
        panelBox.set_pivot_point(0.5, 0.5);
        panelBox.ease({scale_x: 1.08, scale_y: 1.08, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => panelBox.ease({scale_x: 1, scale_y: 1, duration: 260,
                mode: Clutter.AnimationMode.EASE_OUT_BACK})});
    }

    _startBars() {
        if (this._barsId)
            return;
        const tick = () => {
            this._barActors.forEach(b => {
                b.ease({scale_y: 0.25 + Math.random() * 0.75, duration: 180,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD});
            });
            return GLib.SOURCE_CONTINUE;
        };
        tick();
        this._barsId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, tick);
    }

    _stopBars() {
        if (this._barsId) {
            GLib.source_remove(this._barsId);
            this._barsId = 0;
        }
        this._barActors.forEach(b => b.ease({scale_y: 0.25, duration: 200}));
    }

    destroy() {
        this._stopBars();
        this._media.disconnect(this._listener);
        Main.panel._centerBox.set_scale(1, 1);
        this.actor.destroy();
    }
}
