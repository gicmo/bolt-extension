/*
 * Copyright © 2017 Red Hat, Inc
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 *
 * Authors:
 *       Christian J. Kellner <christian@kellner.me>
 */

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const PanelMenu = imports.ui.panelMenu;
const Signals = imports.signals;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Bolt = Extension.imports.client;


/* ui */
const BoltButton = new Lang.Class({
    Name: 'Button',
    Extends: PanelMenu.Button,

    _init() {
        this.parent(0.0, "Bolt");

        let box = new St.BoxLayout({
            style_class: 'panel-status-menu-box'
        });

        let icon = new St.Icon({
            icon_name: 'thunderbolt-symbolic',
            style_class: 'system-status-icon'
        });

	this._icon = icon;
        box.add_child(icon);
        this.actor.add_child(box);

	this._signals = [];

	this._client = new Bolt.Client();
	this._client.connect('probing-changed', this._onProbing.bind(this));

	this._robot =  new Bolt.AuthRobot(this._client);

	this._robot.connect('enroll-device', this._onEnrollDevice.bind(this));
	this._robot.connect('enroll-failed', this._onEnrollFailed.bind(this));

	Main.sessionMode.connect('updated', this._sync.bind(this));
        this._sync();

	this._source = null;
	this.actor.connect('destroy', this._onDestroy.bind(this));
	log('Bolt extension initialized');
    },

    _onDestroy() {
	log('Destorying bolt extension');
	this._robot.close();
	this._client.close();
    },

    _ensureSource() {
        if (!this._source) {
            this._source = new MessageTray.Source(_("Thunderbolt"),
                                                  'thunderbolt-symbolic');
            this._source.connect('destroy', () => { this._source = null; });

            Main.messageTray.add(this._source);
        }

        return this._source;
    },

    _notify(title, body) {
        if (this._notification)
            this._notification.destroy();

        let source = this._ensureSource();

	this._notification = new MessageTray.Notification(source, title, body);
	this._notification.setUrgency(MessageTray.Urgency.HIGH);
        this._notification.connect('destroy', () => {
            this._notification = null;
        });
        this._notification.connect('activated', () => {
            let app = Shell.AppSystem.get_default().lookup_app('gnome-thunderbolt-panel.desktop');
            if (app)
                app.activate();
        });
        this._source.notify(this._notification);
    },

    /* Session callbacks */
    _sync() {
        let active = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
	this._icon.visible = active && this._client.probing;
    },

    /* Bolt.Client callbacks */
    _onProbing(cli, probing) {
	if (probing)
	    this._icon.icon_name = 'thunderbolt-acquiring-symbolic';
	else
	    this._icon.icon_name = 'thunderbolt-symbolic';

        this._sync();
    },

    /* AuthRobot callbacks */
    _onEnrollDevice(obj, device, policy) {
	let auth = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
	policy[0] = auth;

	log("thunderbolt: [%s] auto enrollment: %s".format(device.Name, auth ? 'yes' : 'no'));
	if (auth)
	    return; /* we are done */

	const title = _('Unknown Thunderbolt device');
	const body = _('New device has been detected while you were away. Please disconnect and reconnect the device to start using it.');
	this._notify(title, body);
    },

    _onEnrollFailed(obj, device, error) {
	const title = _('Thunderbolt authorization error');
	const body = _('Could not authorize the Thunderbolt device: %s'.format(error.message));
	this._notify(title, body);
    }

});

/* entry points */

let button = null;

function init() { }


function enable() {
    if (button)
	return;

    button = new BoltButton();
    Main.panel.addToStatusArea('bolt', button);
}

function disable() {
    if (!button)
	return;

    button.destroy();
    button = null;
}
