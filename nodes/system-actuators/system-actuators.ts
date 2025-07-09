/*
 * Node.js/TypeScript client for the io.freya.SystemActuatorsDriver D-Bus service
 * Requires: npm install dbus-native @types/dbus-native
 */

const dbus =  require('dbus-native');
import { EventEmitter } from 'events';

export class ActuatorsDriver extends EventEmitter{
  private iface: any;                   // The interface of the System's actuator driver
  private bus = dbus.systemBus();       // The DBus interface

  constructor(){
    super();
    this.init();
  }

  async init(){
        try{
            await this.initDriverConnection();
            console.log('Connected to actuators driver');
            this.emit('status', {level:"ok", message:"Connected to actuators driver"});
        }
        catch(err){
            console.error('Error connecting to actuators driver:', err);
            this.emit('status', {level:"error", message:"No connection to driver"});
            setTimeout(()=>{this.init()}, 5*1000);
        }
  }

  /**
   * Initialize D-Bus connection and proxy interface
   */
  async initDriverConnection(): Promise<void> {
    const service = this.bus.getService('io.freya.SystemActuatorsDriver');
    this.iface = await new Promise((resolve, reject) => {
      service.getInterface( '/io/freya/SystemActuatorsDriver', 'io.freya.SystemActuatorsDriver', (err: Error | null, iface: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(iface);
          }
        }
      );
    });
  }

  /**
   * Set a digital output channel on or off.
   * @param channel - integer channel number
   * @param state - true to turn on, false to turn off
   * @returns boolean indicating success
   */
  async setDigitalOutput(channel: number, state: boolean): Promise<boolean> {
    if (!this.iface) {
      throw new Error('Driver not initialized. Call init() first.');
    }
    return new Promise((resolve, reject) => {
      this.iface.setDigitalOutput(
        channel,
        state,
        (err: Error | null, result: boolean) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });
  }
}
