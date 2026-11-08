// Menu 🍉 no canto esquerdo da barra (como o menu  do Mac).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const LOGO = '/usr/share/watermelon/logo.svg';

function launch(desktopIds, fallbackArgv = null) {
    const sys = Shell.AppSystem.get_default();
    for (const id of desktopIds) {
        const app = sys.lookup_app(id);
        if (app) {
            app.activate();
            return;
        }
    }
    if (fallbackArgv)
        Util.spawn(fallbackArgv);
}

function terminal(command) {
    // abre o Ghostty rodando um comando e deixa a janela aberta no final
    Util.spawn(['ghostty', '-e', 'bash', '-c', `${command}; echo; read -n1 -rsp "Pressione uma tecla para fechar"`]);
}

export const MelonMenu = GObject.registerClass(
class MelonMenu extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'WatermelonOS');
        const gicon = GLib.file_test(LOGO, GLib.FileTest.EXISTS)
            ? Gio.FileIcon.new(Gio.File.new_for_path(LOGO))
            : Gio.ThemedIcon.new('start-here-symbolic');
        this.add_child(new St.Icon({gicon, style_class: 'system-status-icon'}));

        const actions = SystemActions.getDefault();
        const add = (label, fn) => {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', fn);
            this.menu.addMenuItem(item);
            return item;
        };
        const sep = () => this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        add('Sobre este computador', () => Util.spawn(['gnome-control-center', 'system', 'about']));
        add('Atualizações do sistema', () => terminal('melon status'));
        sep();
        add('Personalizar…', () => launch(['os.watermelon.Customize.desktop'], ['/usr/libexec/watermelon/customize']));
        add('Configurações', () => launch(['org.gnome.Settings.desktop']));
        add('Central de Apps', () => launch(['org.gnome.Software.desktop']));
        sep();
        add('Terminal', () => Util.spawn(['ghostty']));
        add('Monitor do sistema', () => launch(['org.gnome.SystemMonitor.desktop'], ['gnome-system-monitor']));
        sep();
        add('Suspender', () => actions.activateSuspend());
        add('Bloquear tela', () => actions.activateLockScreen());
        add('Encerrar sessão…', () => actions.activateLogout());
        sep();
        add('Reiniciar…', () => actions.activateRestart());
        add('Desligar…', () => actions.activatePowerOff());
    }
});
