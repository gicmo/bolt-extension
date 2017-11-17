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

        box.add_child(icon);
        this.actor.add_child(box);

	this._signals = [];
	this.connectSignal(Main.sessionMode, 'updated', this._onSessionUpdated);

	this._client = new Bolt.Client(Lang.bind(this, this._onClientReady));
	this.connectSignal(this._client, 'device-added', this._onDeviceAdded);

	this._devicesToAuthorize = [];
	this._authorizing = false;

	this.actor.connect('destroy', Lang.bind(this, this._onDestroy));
    },

    connectSignal: function(obj, name, callback) {
	let signal_id = obj.connect(name, Lang.bind(this, callback));
	this._signals.push([obj, signal_id]);
	log('connecting sid: ' + signal_id + 'obj: ' + obj);
    },

    _onDestroy: function() {
	log('Destorying bolt');
	while (this._signals.length) {
	    let [obj, sid] = this._signals.shift();
	    log('disconnecting: sid: ' + sid + 'obj: ' + obj);
	    obj.disconnect(sid);
	}
	this._client.close();
    },

    _onClientReady: function() {
	log('Bolt client ready');

    },

    _onSessionUpdated: function() {
        let active = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;
        //this.menu.setSensitive(sensitive);
	log('session updated: ' + active);
    },

    _onDeviceAdded: function(cli, dev) {
	log('[%s] device added: %s '.format(dev.Uid, dev.Name));

	if (dev.Status !== Bolt.Status.CONNECTED) {
	    log('[%s] invalid state: %d'.format(dev.Uid, dev.Status));
	    return;
	}

	let active = !Main.sessionMode.isLocked && !Main.sessionMode.isGreeter;

	if (active) {
	    this._devicesToAuthorize.push(dev);
	    this._authorizeDevices();
	} else {
	    const title = '%s Thunderbolt device'.format(dev.Name);
	    const body = 'New thunderbolt device has been detected while you were away. Please disconnect and reconnect the device to start using it.';
	    let source = new MessageTray.Source("Bolt", 'thunderbolt-symbolic');
	    let notification = new MessageTray.Notification(source, title, body);
	    Main.messageTray.add(source);
	    source.notify(notification);
	}

    },

    _onAuthorizeDone: function(result, error) {
	let keepGoing = this._devicesToAuthorize.length > 0;
	log('authorization done; keep going: ' + keepGoing);
	if (error) {
	    log("Error: ");
	    const title = 'Thunderbolt authorization error';
	    const body = 'Could not authorize the thunderbolt device: %s'.format(error.message);
	    let source = new MessageTray.Source("Bolt", 'thunderbolt-symbolic');
	    let notification = new MessageTray.Notification(source, title, body);
	    Main.messageTray.add(source);
	    source.notify(notification);
	    //Todo: check children
	}

	if (keepGoing) {
	    GLib.idle_add(GLib.PRIORITY_DEFAULT,
			  Lang.bind(this, this._authorizeDevicesIdle));
	} else {
	    this._authorizing = false;
	}
    },

    _authorizeDevicesIdle: function() {
	let devices = this._devicesToAuthorize;

	let dev = devices.shift();
	if (dev === undefined) {
	    return GLib.SOURCE_REMOVE;
	}

	log('[%s] enrolling device: %s'.format(dev.Uid, dev.Name));
	this._client.enrollDevice(dev.Uid,
				  Bolt.Policy.DEFAULT,
				  Lang.bind(this, this._onAuthorizeDone));
	return GLib.SOURCE_REMOVE;
    },

    _authorizeDevices: function() {
	if (this._authorizing) {
	    return;
	}

	GLib.idle_add(GLib.PRIORITY_DEFAULT,
		      Lang.bind(this, this._authorizeDevicesIdle));
	this.authorizing = true;
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
