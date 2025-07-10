/**
 * @file environment-sensor.ts
 * @module environment-sensor
 * @description
 * Node.js/TypeScript client for the io.freya.EnvironmentSensorDriver D-Bus service
 *
 * @copyright 2025 Sanne “SpuQ” Santens
 * @license MIT
 */

const dbus =  require('dbus-native');
import { EventEmitter } from 'events';

export class SensorDriver extends EventEmitter{
  private iface: any;                   // The interface of the Environment Sensor Driver
  private bus = dbus.systemBus();       // The DBus interface

  constructor(){
    super();
    this.init();
  }

  async init(){
        try{
            await this.initDriverConnection();
            console.log('Connected to sensor driver');
            this.emit('status', {level:"ok", message:"Connected to sensor driver"});
        }
        catch(err){
            console.error('Error connecting to sensor driver:', err);
            this.emit('status', {level:"error", message:"No connection to driver"});
            setTimeout(()=>{this.init()}, 5*1000);
        }

        /*
         *  Signal handlers
         */
        this.iface.on('measurement', (type:string, value:string) => {
            const parsedValue = isNaN(Number(value)) ? value : Number(value);
            this.emit('measurement', { [type]: parsedValue });
        });
  }

  /**
   * Initialize D-Bus connection and proxy interface
   */
  async initDriverConnection(): Promise<void> {
    const service = this.bus.getService('io.freya.EnvironmentSensorDriver');
    this.iface = await new Promise((resolve, reject) => {
      service.getInterface( '/io/freya/EnvironmentSensorDriver', 'io.freya.EnvironmentSensorDriver', (err: Error | null, iface: any) => {
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
   * Set the Sample Interval.
   * @param interval - integer interval in seconds
   * @returns boolean indicating success
   */
  async setSampleInterval(interval: number): Promise<boolean> {
    if (!this.iface) {
      throw new Error('Driver not initialized. Call init() first.');
    }
    return new Promise((resolve, reject) => {
      this.iface.setDigitalOutput(
        interval,
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
