// Dock em Arco — WatermelonOS
//
// Uma faixa invisível de 2px fica na borda da tela. Ao encostar o mouse, os
// apps favoritos (e os abertos) saem da borda e se abrem num arco ")" — ou
// "(" do lado direito — sobre uma faixa de vidro fosco.
//
//   borda │      ◜ 🦊
//         │    ◜   💻
//         │   (    ⌨      ← ícones num arco de círculo cujo centro fica fora da tela
//         │    ◟   📁
//         │      ◟ ▦      ← último item: todos os aplicativos

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SHOW_DELAY = 90;      // ms com o mouse na borda até abrir (evita abrir sem querer)
const HIDE_DELAY = 350;     // ms fora do arco até fechar
const LABEL_SPACE = 240;    // espaço ao lado do arco para o nome do app
const EDGE_WIDTH = 2;

class ArcDock {
    constructor(settings) {
        this._settings = settings;
        this._timeouts = new Set();
        this._signals = [];
        this._items = [];

        // faixa invisível na borda
        this._edge = new St.Widget({reactive: true, track_hover: true, name: 'wmArcEdge'});
        Main.layoutManager.addChrome(this._edge, {affectsInputRegion: true, trackFullscreen: true});
        this._edge.connect('enter-event', () => {
            this._later('show', SHOW_DELAY, () => this.show());
        });
        this._edge.connect('leave-event', () => this._cancel('show'));

        // o arco
        this._box = new St.Widget({reactive: true, track_hover: true, visible: false, name: 'wmArcDock'});
        Main.layoutManager.addTopChrome(this._box, {affectsInputRegion: true, trackFullscreen: true});
        this._box.connect('enter-event', () => this._cancel('hide'));
        this._box.connect('leave-event', () => this._later('hide', HIDE_DELAY, () => this.hide()));
        this._box.connect('button-press-event', (_a, event) => {
            if (event.get_source() === this._box || event.get_source() === this._band)
                this.hide();
            return Clutter.EVENT_PROPAGATE;
        });

        this._band = new St.DrawingArea();
        this._band.connect('repaint', area => this._paintBand(area));
        this._box.add_child(this._band);

        this._label = new St.Label({style_class: 'wm-arc-label', visible: false});
        this._box.add_child(this._label);

        const rebuild = () => {
            if (!this._open)
                this._layoutEdge();
        };
        this._connect(Main.layoutManager, 'monitors-changed', () => {
            this.hide(true);
            this._layoutEdge();
        });
        this._connect(Main.overview, 'showing', () => this.hide(true));
        this._connect(this._settings, 'changed', () => {
            this.hide(true);
            this._layoutEdge();
        });
        this._connect(AppFavorites.getAppFavorites(), 'changed', rebuild);

        this._layoutEdge();
    }

    // ------------------------------------------------------------ utilidades
    _connect(obj, signal, fn) {
        this._signals.push([obj, obj.connect(signal, fn)]);
    }

    _later(name, ms, fn) {
        this._cancel(name);
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeouts.delete(this[`_${name}Id`]);
            this[`_${name}Id`] = 0;
            fn();
            return GLib.SOURCE_REMOVE;
        });
        this[`_${name}Id`] = id;
        this._timeouts.add(id);
    }

    _cancel(name) {
        const id = this[`_${name}Id`];
        if (id) {
            GLib.source_remove(id);
            this._timeouts.delete(id);
            this[`_${name}Id`] = 0;
        }
    }

    get _left() {
        return this._settings.get_string('side') !== 'right';
    }

    get _monitor() {
        return Main.layoutManager.primaryMonitor;
    }

    _layoutEdge() {
        const m = this._monitor;
        if (!m)
            return;
        const h = Math.round(m.height * 0.7);
        this._edge.set_position(this._left ? m.x : m.x + m.width - EDGE_WIDTH, m.y + Math.round((m.height - h) / 2));
        this._edge.set_size(EDGE_WIDTH, h);
    }

    // ------------------------------------------------------------ apps
    _apps() {
        const favs = AppFavorites.getAppFavorites().getFavorites();
        const apps = [...favs];
        if (this._settings.get_boolean('show-running')) {
            for (const app of Shell.AppSystem.get_default().get_running()) {
                if (!apps.includes(app))
                    apps.push(app);
            }
        }
        return apps;
    }

    // ------------------------------------------------------------ geometria do arco
    _geometry(n) {
        const m = this._monitor;
        const size = this._settings.get_int('icon-size');
        let step = size + 24;                               // distância entre ícones ao longo do arco
        if ((n - 1) * step > m.height * 0.86)
            step = (m.height * 0.86) / Math.max(1, n - 1);
        const depth = size * 1.5 + 36;                      // quanto o meio do arco entra na tela
        const minEnd = size / 2 + 16;                       // pontas do arco: distância mínima da borda
        const half = ((n - 1) * step) / 2;                  // meio comprimento do arco
        let R = 160;
        while (R < 6000 && R * (1 - Math.cos(half / R)) > depth - minEnd)
            R += 8;
        const angle = half / R;                             // meio ângulo do arco
        const height = Math.ceil(2 * R * Math.sin(angle) + size + 48);
        const width = Math.ceil(depth + size / 2 + 24 + LABEL_SPACE);
        return {m, size, step, depth, R, angle, width, height};
    }

    _point(g, theta) {
        // centro do círculo fica fora da tela; x medido a partir da borda
        const fromEdge = g.depth - g.R + g.R * Math.cos(theta);
        const x = this._left ? fromEdge : g.width - fromEdge;
        return [x, g.height / 2 + g.R * Math.sin(theta)];
    }

    _paintBand(area) {
        const g = this._geo;
        if (!g)
            return;
        const cr = area.get_context();
        const cx = this._left ? g.depth - g.R : g.width - g.depth + g.R;
        const cy = g.height / 2;
        const a0 = this._left ? -g.angle : Math.PI - g.angle;
        const a1 = this._left ? g.angle : Math.PI + g.angle;
        cr.setLineCap(Cairo.LineCap.ROUND);
        // borda clara fininha
        cr.setLineWidth(g.size + 30);
        cr.setSourceRGBA(1, 1, 1, 0.16);
        cr.arc(cx, cy, g.R, a0, a1);
        cr.stroke();
        // vidro
        cr.setLineWidth(g.size + 28);
        cr.setSourceRGBA(28 / 255, 28 / 255, 30 / 255, 0.70);
        cr.arc(cx, cy, g.R, a0, a1);
        cr.stroke();
        cr.$dispose();
    }

    // ------------------------------------------------------------ abrir / fechar
    show() {
        if (this._open || Main.overview.visible)
            return;
        this._open = true;
        this._cancel('hide');

        for (const it of this._items)
            it.actor.destroy();
        this._items = [];

        const apps = this._apps();
        const n = apps.length + 1;   // + "todos os aplicativos"
        const g = this._geo = this._geometry(n);
        this._box.set_size(g.width, g.height);
        this._box.set_position(this._left ? g.m.x : g.m.x + g.m.width - g.width,
            g.m.y + Math.round((g.m.height - g.height) / 2));
        this._band.set_size(g.width, g.height);
        this._band.queue_repaint();

        const btn = g.size + 12;
        const startX = this._left ? 0 : g.width - btn;
        const make = (child, onClick, name, app) => {
            const b = new St.Button({style_class: 'wm-arc-icon', child, reactive: true, track_hover: true});
            b.set_size(btn, btn);
            b.set_pivot_point(0.5, 0.5);
            b.connect('clicked', () => {
                this.hide();
                onClick();
            });
            b.connect('notify::hover', () => this._hover(b, name));
            this._box.add_child(b);
            let dot = null;
            if (app && app.get_state() === Shell.AppState.RUNNING) {
                dot = new St.Widget({style_class: 'wm-arc-dot', width: 6, height: 6});
                this._box.add_child(dot);
            }
            return {actor: b, dot};
        };

        apps.forEach(app => {
            this._items.push(make(app.create_icon_texture(g.size), () => app.activate(), app.get_name(), app));
        });
        const grid = new St.Icon({icon_name: 'view-app-grid-symbolic', icon_size: Math.round(g.size * 0.6)});
        this._items.push(make(grid, () => Main.overview.showApps(), 'Todos os aplicativos', null));

        // posiciona e anima, do meio para as pontas
        const mid = (n - 1) / 2;
        this._items.forEach((it, i) => {
            const theta = (i - mid) * (g.step / g.R);
            const [x, y] = this._point(g, theta);
            it.cx = x;
            it.cy = y;
            it.actor.set_position(startX, y - btn / 2);
            it.actor.opacity = 0;
            it.actor.set_scale(0.4, 0.4);
            it.actor.ease({
                x: x - btn / 2,
                y: y - btn / 2,
                opacity: 255,
                scale_x: 1,
                scale_y: 1,
                duration: 260,
                delay: Math.round(Math.abs(i - mid) * 18),
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
            if (it.dot) {
                const off = btn / 2 + 5;
                const [dx, dy] = [x + (this._left ? -off : off), y];
                it.dot.set_position(dx - 3, dy - 3);
                it.dot.opacity = 0;
                it.dot.ease({opacity: 255, duration: 200, delay: 200});
            }
        });

        this._band.opacity = 0;
        this._band.ease({opacity: 255, duration: 180, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        this._label.hide();
        this._box.show();
    }

    _hover(button, name) {
        const it = this._items.find(i => i.actor === button);
        if (!it)
            return;
        const s = button.hover ? 1.22 : 1;
        button.ease({scale_x: s, scale_y: s, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        if (!button.hover) {
            this._label.hide();
            return;
        }
        this._label.text = name;
        this._label.show();
        const [, natW] = this._label.get_preferred_width(-1);
        const [, natH] = this._label.get_preferred_height(-1);
        const gap = this._geo.size / 2 + 22;
        const x = this._left ? it.cx + gap : it.cx - gap - natW;
        this._label.set_position(Math.round(x), Math.round(it.cy - natH / 2));
        this._box.set_child_above_sibling(this._label, null);
    }

    hide(immediate = false) {
        this._cancel('show');
        this._cancel('hide');
        if (!this._open)
            return;
        this._open = false;
        this._label.hide();
        if (immediate) {
            this._box.hide();
            return;
        }
        const g = this._geo;
        const btn = g.size + 12;
        const endX = this._left ? 0 : g.width - btn;
        for (const it of this._items) {
            it.dot?.hide();
            it.actor.ease({x: endX, opacity: 0, scale_x: 0.4, scale_y: 0.4, duration: 160,
                mode: Clutter.AnimationMode.EASE_IN_QUAD});
        }
        this._band.ease({
            opacity: 0, duration: 180, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (!this._open)
                    this._box.hide();
            },
        });
    }

    destroy() {
        for (const id of this._timeouts)
            GLib.source_remove(id);
        this._timeouts.clear();
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];
        this._edge.destroy();
        this._box.destroy();
    }
}

export default class ArcDockExtension extends Extension {
    enable() {
        this._dock = new ArcDock(this.getSettings());
    }

    disable() {
        this._dock?.destroy();
        this._dock = null;
    }
}
