// Acompanha os players de música (MPRIS: Spotify, Firefox, Chrome, VLC...).
// Escolhe o player "ativo" (tocando > pausado mais recente) e avisa quem estiver
// ouvindo com callback(state), em que state é null (nada tocando) ou
// {title, artist, art (arquivo local ou null), playing, canNext, canPrev}.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const ART_DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'watermelon', 'art']);

export class MediaWatcher {
    constructor() {
        this._players = new Map();   // nome no barramento -> {proxy, sigId, stamp}
        this._listeners = new Set();
        this._state = null;
        this._bus = Gio.DBus.session;
        this._ownerSub = this._bus.signal_subscribe('org.freedesktop.DBus', 'org.freedesktop.DBus',
            'NameOwnerChanged', '/org/freedesktop/DBus', null, Gio.DBusSignalFlags.NONE,
            (_c, _s, _p, _i, _sig, params) => {
                const [name, , newOwner] = params.deepUnpack();
                if (!name.startsWith(PREFIX))
                    return;
                if (newOwner)
                    this._add(name);
                else
                    this._remove(name);
            });
        this._bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames',
            null, null, Gio.DBusCallFlags.NONE, -1, null, (bus, res) => {
                try {
                    const [names] = bus.call_finish(res).deepUnpack();
                    names.filter(n => n.startsWith(PREFIX)).forEach(n => this._add(n));
                } catch (e) {
                    logError(e);
                }
            });
    }

    get state() {
        return this._state;
    }

    connect(fn) {
        this._listeners.add(fn);
        fn(this._state);
        return fn;
    }

    disconnect(fn) {
        this._listeners.delete(fn);
    }

    _add(name) {
        if (this._players.has(name))
            return;
        const entry = {proxy: null, sigId: 0, stamp: GLib.get_monotonic_time()};
        this._players.set(name, entry);
        Gio.DBusProxy.new(this._bus, Gio.DBusProxyFlags.NONE, null, name, '/org/mpris/MediaPlayer2',
            PLAYER_IFACE, null, (_o, res) => {
                try {
                    entry.proxy = Gio.DBusProxy.new_finish(res);
                } catch (e) {
                    this._players.delete(name);
                    return;
                }
                if (!this._players.has(name))
                    return;
                entry.sigId = entry.proxy.connect('g-properties-changed', () => {
                    entry.stamp = GLib.get_monotonic_time();
                    this._update();
                });
                this._update();
            });
    }

    _remove(name) {
        const e = this._players.get(name);
        if (e?.proxy && e.sigId)
            e.proxy.disconnect(e.sigId);
        this._players.delete(name);
        this._update();
    }

    _prop(proxy, key) {
        const v = proxy.get_cached_property(key);
        return v ? v.deepUnpack() : null;
    }

    _active() {
        let best = null;
        for (const [name, e] of this._players) {
            if (!e.proxy)
                continue;
            const status = this._prop(e.proxy, 'PlaybackStatus');
            if (status !== 'Playing' && status !== 'Paused')
                continue;
            const rank = (status === 'Playing' ? 1e15 : 0) + e.stamp;
            if (!best || rank > best.rank)
                best = {name, e, rank, status};
        }
        return best;
    }

    _update() {
        const a = this._active();
        this._current = a;
        if (!a) {
            this._emit(null);
            return;
        }
        const meta = this._prop(a.e.proxy, 'Metadata') ?? {};
        const val = k => (meta[k] ? meta[k].deepUnpack() : null);
        const title = val('xesam:title');
        if (!title) {
            this._emit(null);
            return;
        }
        const artists = val('xesam:artist');
        const state = {
            title,
            artist: Array.isArray(artists) ? artists.join(', ') : (artists ?? ''),
            art: null,
            playing: a.status === 'Playing',
            canNext: this._prop(a.e.proxy, 'CanGoNext') !== false,
            canPrev: this._prop(a.e.proxy, 'CanGoPrevious') !== false,
        };
        const artUrl = val('mpris:artUrl');
        if (artUrl) {
            this._art(artUrl, path => {
                if (this._state && this._state.title === state.title) {
                    this._state = {...this._state, art: path};
                    this._emit(this._state);
                }
            });
            if (artUrl.startsWith('file://'))
                state.art = Gio.File.new_for_uri(artUrl).get_path();
        }
        this._emit(state);
    }

    // capa: http(s) é baixada para o cache (o St só desenha arquivos locais)
    _art(url, done) {
        if (!url.startsWith('http'))
            return;
        const name = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
        const path = GLib.build_filenamev([ART_DIR, name]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            done(path);
            return;
        }
        GLib.mkdir_with_parents(ART_DIR, 0o755);
        Gio.File.new_for_uri(url).copy_async(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE,
            GLib.PRIORITY_LOW, null, null, (src, res) => {
                try {
                    src.copy_finish(res);
                    done(path);
                } catch (e) {
                    // sem capa: tudo bem
                }
            });
    }

    _emit(state) {
        this._state = state;
        for (const fn of this._listeners)
            fn(state);
    }

    _call(method) {
        this._current?.e.proxy?.call(method, null, Gio.DBusCallFlags.NONE, -1, null, null);
    }

    playPause() {
        this._call('PlayPause');
    }

    next() {
        this._call('Next');
    }

    previous() {
        this._call('Previous');
    }

    raise() {
        const name = this._current?.name;
        if (name) {
            this._bus.call(name, '/org/mpris/MediaPlayer2', 'org.mpris.MediaPlayer2', 'Raise',
                null, null, Gio.DBusCallFlags.NONE, -1, null, null);
        }
    }

    destroy() {
        this._bus.signal_unsubscribe(this._ownerSub);
        for (const name of [...this._players.keys()])
            this._remove(name);
        this._listeners.clear();
    }
}
