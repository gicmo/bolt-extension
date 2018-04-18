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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Signals = imports.signals;

/* Keep in sync with data/org.freedesktop.bolt.xml */

const BoltClientInterface = '<node> \
  <interface name="org.freedesktop.bolt1.Manager"> \
    <property name="Version" type="u" access="read"></property> \
    <property name="Probing" type="b" access="read"></property> \
    <property name="AuthMode" type="s" access="readwrite"></property> \
    <method name="ListDevices"> \
      <arg name="devices" direction="out" type="ao"> </arg> \
    </method> \
    <method name="DeviceByUid"> \
      <arg type="s" name="uid" direction="in"> </arg> \
      <arg name="device" direction="out" type="o"> </arg> \
    </method> \
    <method name="EnrollDevice"> \
      <arg type="s" name="uid" direction="in"> </arg> \
      <arg type="s" name="policy" direction="in"> </arg> \
      <arg type="s" name="flags" direction="in"> </arg> \
      <arg name="device" direction="out" type="o"> </arg> \
    </method> \
    <method name="ForgetDevice">  \
      <arg type="s" name="uid" direction="in"> </arg> \
    </method> \
    <signal name="DeviceAdded"> \
      <arg name="device" type="o"> </arg> \
    </signal> \
    <signal name="DeviceRemoved"> \
      <arg name="device" type="o"> </arg> \
    </signal> \
  </interface> \
</node>';

const BoltDeviceInterface = '<node> \
  <interface name="org.freedesktop.bolt1.Device"> \
    <property name="Uid" type="s" access="read"></property> \
    <property name="Name" type="s" access="read"></property> \
    <property name="Vendor" type="s" access="read"></property> \
    <property name="Type" type="s" access="read"></property> \
    <property name="Status" type="s" access="read"></property> \
    <property name="Parent" type="s" access="read"></property> \
    <property name="SysfsPath" type="s" access="read"></property> \
    <property name="Stored" type="b" access="read"></property> \
    <property name="Policy" type="s" access="read"></property> \
    <property name="Key" type="s" access="read"></property> \
    <property name="Label" type="s" access="read"></property> \
    <property name="ConnectTime" type="t" access="read"></property> \
    <property name="AuthorizeTime" type="t" access="read"></property> \
    <property name="StoreTime" type="t" access="read"></property> \
    <method name="Authorize"> \
      <arg type="s" name="flags" direction="in"> </arg> \
    </method> \
  </interface> \
</node>';

const BoltClientProxy = Gio.DBusProxy.makeProxyWrapper(BoltClientInterface);
const BoltDeviceProxy = Gio.DBusProxy.makeProxyWrapper(BoltDeviceInterface);

/*  */

var Status = {
    DISCONNECTED: 'disconnected',
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    AUTHORIZING: 'authorizing',
    AUTH_ERROR: 'auth-error',
    AUTHORIZED: 'authorized',
    AUTHORIZED_SECURE: 'authorized-secure',
    AUTHORIZED_NEWKEY: 'authorized-newkey'
};

var Policy = {
    DEFAULT: 'default',
    MANUAL: 'manual',
    AUTO: 'auto'
};


var AuthFlags = {
    NONE: 0,
};

var AuthCtrl = {
    NONE: 'none',
};

var AuthMode = {
    DISABLED: 'disabled',
    ENABLED: 'enabled'
};

const BOLT_DBUS_NAME = 'org.freedesktop.bolt';
const BOLT_DBUS_PATH = '/org/freedesktop/bolt';

var Client = new Lang.Class({
    Name: 'BoltClient',

    _init() {

	this._proxy = null;
        new BoltClientProxy(
	    Gio.DBus.system,
	    BOLT_DBUS_NAME,
	    BOLT_DBUS_PATH,
	    this._onProxyReady.bind(this)
	);

	this.probing = false;
    },

    _onProxyReady(proxy, error) {
	if (error !== null) {
	    log('error creating bolt proxy: %s'.format(error.message));
	    return;
	}
	this._proxy = proxy;
	this._propsChangedId = this._proxy.connect('g-properties-changed', this._onPropertiesChanged.bind(this));
	this._deviceAddedId = this._proxy.connectSignal('DeviceAdded', this._onDeviceAdded.bind(this));

	this.probing = this._proxy.Probing;
	if (this.probing)
	    this.emit('probing-changed', this.probing);

    },

    _onPropertiesChanged(proxy, properties) {
        let unpacked = properties.deep_unpack();
        if (!('Probing' in unpacked))
	    return;

	this.probing = this._proxy.Probing;
	this.emit('probing-changed', this.probing);
    },

    _onDeviceAdded(proxy, emitter, params) {
	let [path] = params;
	let device = new BoltDeviceProxy(Gio.DBus.system,
					 BOLT_DBUS_NAME,
					 path);
	this.emit('device-added', device);
    },

    /* public methods */
    close() {
	this.disconnectAll();

        if (!this._proxy)
            return;

	this._proxy.disconnectSignal(this._deviceAddedId);
	this._proxy.disconnect(this._propsChangedId);
	this._proxy = null;
    },

    enrollDevice(id, policy, callback) {
	this._proxy.EnrollDeviceRemote(id, policy, AuthCtrl.NONE,
                                       (res, error) => {
	    if (error) {
		Gio.DBusError.strip_remote_error(error);
		callback(null, error);
		return;
	    }

	    let [path] = res;
	    let device = new BoltDeviceProxy(Gio.DBus.system,
					     BOLT_DBUS_NAME,
					     path);
	    callback(device, null);
	});
    },

    get authMode () {
        return this._proxy.AuthMode;
    }

});

Signals.addSignalMethods(Client.prototype);

/* helper class to automatically authorize new devices */
var AuthRobot = new Lang.Class({
    Name: 'BoltAuthRobot',

    _init(client) {

	this._client = client;

	this._devicesToEnroll = [];
	this._enrolling = false;

	this._client.connect('device-added', this._onDeviceAdded.bind(this));
    },

    close() {
	this.disconnectAll();
	this._client.disconnectAll();
	this._client = null;
    },

    /* the "device-added" signal will be emitted by boltd for every
     * device that is not currently stored in the database. We are
     * only interested in those devices, because all known devices
     * will be handled by the user himself */
    _onDeviceAdded(cli, dev) {
	if (dev.Status !== Status.CONNECTED)
	    return;

        /* check if authorization is enabled in the daemon. if not
         * we won't even bother authorizing, because we will only
         * get an error back. The exact contents of AuthMode might
         * change in the future, but must contain AuthMode.ENABLED
         * if it is enabled. */
        if (!cli.authMode.split('|').includes(AuthMode.ENABLED))
            return;

	/* check if we should enroll the device */
	let res = [false];
	this.emit('enroll-device', dev, res);
	if (res[0] !== true)
	    return;

	/* ok, we should authorize the device, add it to the back
	 * of the list  */
	this._devicesToEnroll.push(dev);
	this._enrollDevices();
    },

    /* The enrollment queue:
     *   - new devices will be added to the end of the array.
     *   - an idle callback will be scheduled that will keep
     *     calling itself as long as there a devices to be
     *     enrolled.
     */
    _enrollDevices() {
	if (this._enrolling)
	    return;

	this.enrolling = true;
	GLib.idle_add(GLib.PRIORITY_DEFAULT,
		      this._enrollDevicesIdle.bind(this));
    },

    _onEnrollDone(device, error) {
	if (error)
	    this.emit('enroll-failed', device, error);

	/* TODO: scan the list of devices to be authorized for children
	 *  of this device and remove them (and their children and
	 *  their children and ....) from the device queue
	 */
	this._enrolling = this._devicesToEnroll.length > 0;

	if (this._enrolling)
	    GLib.idle_add(GLib.PRIORITY_DEFAULT,
			  this._enrollDevicesIdle.bind(this));
    },

    _enrollDevicesIdle() {
	let devices = this._devicesToEnroll;

	let dev = devices.shift();
	if (dev === undefined)
	    return GLib.SOURCE_REMOVE;

	this._client.enrollDevice(dev.Uid,
				  Policy.DEFAULT,
				  this._onEnrollDone.bind(this));
	return GLib.SOURCE_REMOVE;
    }

});

Signals.addSignalMethods(AuthRobot.prototype);
