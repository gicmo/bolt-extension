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

const Bolt = Extension.imports.client;


/* ui */

const BoltButton = new Lang.Class({
    Name: 'Button',
    Extends: PanelMenu.Button,

    _init: function () {
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

	this._client = new Bolt.Client(Lang.bind(this, this._onClientReady));
	this._client.connect('probing-changed', Lang.bind(this, this._onProbing));

	this._robot =  new Bolt.AuthRobot(this._client);

	this._robot.connect('enroll-device', Lang.bind(this, this._onEnrollDevice));
	this._robot.connect('enroll-failed', Lang.bind(this, this._onEnrollFailed));

	this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
    },

    _onDestroy: function() {
	log('Destorying bolt');
	this._client.close();
	this._robot.close();
    },

    /* Bolt.Client callbacks */
    _onClientReady: function() {
	log('Bolt client ready');
    },

    _onProbing: function(cli, probing) {
	if (probing)
	    this._icon.icon_name = 'thunderbolt-acquiring-symbolic';
	else
	    this._icon.icon_name = 'thunderbolt-symbolic';
    },

    /* AuthRobot callbacks */
    _onEnrollDevice: function(obj, device, policy) {
	let auth = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
	policy[0] = auth;

	log("[%s] auto enrollment: %s".format(device.Uid, auth ? 'yes' : 'no'));
	if (auth) {
	    /* we are done */
	    return;
	}

	const title = '%s Thunderbolt device'.format(device.Name);
	const body = 'New thunderbolt devices have been detected while you were away. Please disconnect and reconnect the device to start using it.';
	let source = new MessageTray.Source("Bolt", 'thunderbolt-symbolic');
	let notification = new MessageTray.Notification(source, title, body);
	Main.messageTray.add(source);
	source.notify(notification);
    },

    _onEnrollFailed: function (obj, device, error) {
	const title = 'Thunderbolt authorization error';
	const body = 'Could not authorize the thunderbolt device: %s'.format(error.message);
	let source = new MessageTray.Source("Bolt", 'thunderbolt-symbolic');
	let notification = new MessageTray.Notification(source, title, body);
	Main.messageTray.add(source);
	source.notify(notification);
    },

});

/* entry points */

let button;

function init() { }


function enable() {
    button = new BoltButton();
    Main.panel.addToStatusArea('bolt', button);
}

function disable() {
    button.destroy();
    button = null;
}
