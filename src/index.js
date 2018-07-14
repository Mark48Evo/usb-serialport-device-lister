import Debug from 'debug';
import SerialPort from 'serialport';
import Events from 'events';
import Usb from 'usb';

const debug = Debug('usb-serialport-device-lister');

export default class UsbSerialPortDeviceLister extends Events {
  constructor(options = {}) {
    super();
    this.filters = options.filters || [];
    this.knownDevices = new Map();

    this.boundReenumerate = this.reenumerateFromUsb.bind(this);
  }

  async start() {
    debug('Attaching event listeners for USB attach/detach');

    Usb.on('attach', this.boundReenumerate);
    Usb.on('detach', this.boundReenumerate);

    await this.reenumerate();
  }

  stop() {
    debug('Removing event listeners for USB attach/detach');

    Usb.removeListener('attach', this.boundReenumerate);
    Usb.removeListener('detach', this.boundReenumerate);
  }

  async reenumerate() {
    let deviceList = await SerialPort.list();

    debug(`Found "${deviceList.length}" devices before running filter`);

    deviceList = this.filters.reduce(
      (acc, filter) => acc.filter(device => Object.keys(filter).map((field) => {
        if (device[field] !== filter[field]) return field;
        return undefined;
      }).filter(val => val).length === 0),
      deviceList,
    );

    debug(`Found "${deviceList.length}" devices after running filter`);

    const notAvailableDevices = deviceList.reduce((acc, device) => acc.filter(
      knownDevice => knownDevice !== device.comName,
    ), [...this.knownDevices.keys()]);

    deviceList = [...this.knownDevices.keys()].reduce((acc, comName) => acc.filter(
      device => device.comName !== comName,
    ), deviceList);

    debug(`Found "${deviceList.length}" devices after clearing already known`);
    debug(`Found "${notAvailableDevices.length}" devices after clearing disconnected`);

    notAvailableDevices.forEach((device) => {
      debug(`Removing "${device}" from know devices as it was detached`);
      this.emit('detach', this.knownDevices.get(device));
      this.knownDevices.delete(device);
    });

    deviceList.forEach((device) => {
      debug(`New device "${device.comName}" added`);
      this.knownDevices.set(device.comName, device);
      this.emit('attach', device);
    });
  }

  async reenumerateFromUsb() {
    debug('Received attach/detach even from USB let\'s wait for ~2000ms');
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.reenumerate();
  }
}
