import { NodeAPI, NodeInitializer, Node, NodeDef } from 'node-red';

interface LocationConfigNodeDef extends NodeDef {
  latitude: number;
  longitude: number;
  timezone: string;
  axialTilt: number;
  orbitalPeriod: number;
  rotationalPeriod: number;
  timeScale: number;
}

const locationConfig: NodeInitializer = (RED: NodeAPI) => {
  function LocationConfigNode(this: Node & { latitude?: number; longitude?: number; timezone?: string; axialTilt?: number; orbitalPeriod?: number; rotationalPeriod?: number; timeScale?: number }, config: LocationConfigNodeDef) {
    RED.nodes.createNode(this, config);
    
    // Store configuration properties - parse numeric values from strings
    this.latitude = parseFloat(config.latitude as any) || 50.98;
    this.longitude = parseFloat(config.longitude as any) || 4.32;
    this.timezone = config.timezone || 'UTC+1';
    this.axialTilt = parseFloat(config.axialTilt as any) || 23.44;
    this.orbitalPeriod = parseFloat(config.orbitalPeriod as any) || 365.25;
    this.rotationalPeriod = parseFloat(config.rotationalPeriod as any) || 24;
    this.timeScale = parseFloat(config.timeScale as any) || 1.0;
  }

  RED.nodes.registerType('location-config', LocationConfigNode);
};

export = locationConfig;
