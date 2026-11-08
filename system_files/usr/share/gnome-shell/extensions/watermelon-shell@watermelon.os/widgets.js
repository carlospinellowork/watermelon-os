// Widgets na área de trabalho (ficam por baixo das janelas, no canto direito):
//   ┌──────────────┐  relógio grande + data
//   │ 18:42        │
//   │ sábado, 8 nov│
//   ├──────────────┤  uso do sistema (CPU e memória, barras)
//   ├──────────────┤  música tocando (só aparece quando tem)
//   └──────────────┘

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MARGIN_X = 32;
const MARGIN_Y = 72;
const TRACK = 206;   // largura das barras

function readFile(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes);
    } catch (e) {
        return '';
    }
}

export class DesktopWidgets {
    constructor(media) {
        this._media = media;
        this._prevCpu = null;

        this.actor = new St.BoxLayout({style_class: 'wm-widgets', orientation: Clutter.Orientation.VERTICAL,
            reactive: false});

        // relógio
        const clock = new St.BoxLayout({style_class: 'wm-card', orientation: Clutter.Orientation.VERTICAL});
        this._time = new St.Label({style_class: 'wm-clock-time'});
        this._date = new St.Label({style_class: 'wm-clock-date'});
        clock.add_child(this._time);
        clock.add_child(this._date);
        this.actor.add_child(clock);

        // sistema
        const sys = new St.BoxLayout({style_class: 'wm-card', orientation: Clutter.Orientation.VERTICAL});
        sys.add_child(new St.Label({text: 'SISTEMA', style_class: 'wm-card-title'}));
        this._cpu = this._stat(sys, 'Processador');
        this._mem = this._stat(sys, 'Memória');
        this.actor.add_child(sys);

        // música
        this._music = new St.BoxLayout({style_class: 'wm-card wm-music', visible: false, reactive: true});
        this._art = new St.Widget({style_class: 'wm-music-art', y_align: Clutter.ActorAlign.CENTER});
        this._music.add_child(this._art);
        const info = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER});
        this._songTitle = new St.Label({style_class: 'wm-music-title'});
        this._songArtist = new St.Label({style_class: 'wm-music-artist'});
        for (const l of [this._songTitle, this._songArtist]) {
            l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            info.add_child(l);
        }
        const controls = new St.BoxLayout({style_class: 'wm-music-controls'});
        const btn = (icon, fn) => {
            const b = new St.Button({style_class: 'wm-music-btn', child: new St.Icon({icon_name: icon})});
            b.connect('clicked', fn);
            controls.add_child(b);
            return b;
        };
        btn('media-skip-backward-symbolic', () => this._media.previous());
        this._playBtn = btn('media-playback-pause-symbolic', () => this._media.playPause());
        btn('media-skip-forward-symbolic', () => this._media.next());
        info.add_child(controls);
        this._music.add_child(info);
        this.actor.add_child(this._music);

        // fica na camada do papel de parede, abaixo das janelas
        Main.layoutManager._backgroundGroup.add_child(this.actor);
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._place());
        this._sizeId = this.actor.connect('notify::width', () => this._place());

        this._listener = this._media.connect(s => this._updateMusic(s));
        this._tick();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
        this._place();
    }

    _stat(parent, label) {
        const row = new St.BoxLayout({style_class: 'wm-stat', orientation: Clutter.Orientation.VERTICAL});
        const text = new St.Label({style_class: 'wm-stat-label', text: label});
        const track = new St.Widget({style_class: 'wm-stat-track', width: TRACK});
        const fill = new St.Widget({style_class: 'wm-stat-fill', width: 0});
        track.add_child(fill);
        row.add_child(text);
        row.add_child(track);
        parent.add_child(row);
        return {text, fill, label};
    }

    _setStat(stat, pct, extra) {
        const p = Math.max(0, Math.min(100, pct));
        stat.text.text = `${stat.label}  ${Math.round(p)}%${extra ? `  ·  ${extra}` : ''}`;
        stat.fill.ease({width: Math.round(TRACK * p / 100), duration: 600,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    _tick() {
        const now = GLib.DateTime.new_now_local();
        this._time.text = now.format('%H:%M');
        const date = now.format('%A, %e de %B').replace(/\s+/g, ' ');
        this._date.text = date.charAt(0).toUpperCase() + date.slice(1);

        // CPU: diferença entre duas leituras de /proc/stat
        const line = readFile('/proc/stat').split('\n')[0];
        const nums = line.trim().split(/\s+/).slice(1).map(Number);
        if (nums.length >= 4) {
            const idle = nums[3] + (nums[4] || 0);
            const total = nums.reduce((a, b) => a + b, 0);
            if (this._prevCpu) {
                const dt = total - this._prevCpu.total;
                const di = idle - this._prevCpu.idle;
                if (dt > 0)
                    this._setStat(this._cpu, 100 * (1 - di / dt));
            }
            this._prevCpu = {idle, total};
        }

        // memória
        const mem = {};
        for (const l of readFile('/proc/meminfo').split('\n')) {
            const m = l.match(/^(\w+):\s+(\d+)/);
            if (m)
                mem[m[1]] = Number(m[2]);
        }
        if (mem.MemTotal) {
            const used = mem.MemTotal - (mem.MemAvailable ?? mem.MemFree);
            this._setStat(this._mem, 100 * used / mem.MemTotal,
                `${(used / 1048576).toFixed(1)} de ${(mem.MemTotal / 1048576).toFixed(0)} GB`);
        }
    }

    _updateMusic(s) {
        this._music.visible = !!s;
        if (!s)
            return;
        this._songTitle.text = s.title;
        this._songArtist.text = s.artist;
        this._art.style = s.art ? `background-image: url("file://${s.art}");` : null;
        this._playBtn.child.icon_name = s.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
    }

    _place() {
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        const [, w] = this.actor.get_preferred_width(-1);
        this.actor.set_position(m.x + m.width - w - MARGIN_X, m.y + MARGIN_Y);
    }

    destroy() {
        GLib.source_remove(this._timer);
        Main.layoutManager.disconnect(this._monitorsId);
        this._media.disconnect(this._listener);
        this.actor.destroy();
    }
}
