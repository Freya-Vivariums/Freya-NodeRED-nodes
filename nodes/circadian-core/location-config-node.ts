import { NodeAPI, NodeInitializer, Node, NodeDef } from 'node-red';

interface LocationConfigDef extends NodeDef {
  latitude: number;
  longitude: number;
  timezone: string;
  axialTilt: number;
  orbitalPeriod: number;
  rotationalPeriod: number;
  timeScale: number;
}

const locationConfig: NodeInitializer = (RED: NodeAPI) => {
  function LocationConfigNode(this: Node, config: LocationConfigDef) {
    RED.nodes.createNode(this, config);
    
    // Store configuration properties
    this.latitude = config.latitude || 50.98;
    this.longitude = config.longitude || 4.32;
    this.timezone = config.timezone || 'UTC+1';
    this.axialTilt = config.axialTilt || 23.44;
    this.orbitalPeriod = config.orbitalPeriod || 365.25;
    this.rotationalPeriod = config.rotationalPeriod || 24;
    this.timeScale = config.timeScale || 1.0;
  }

  RED.nodes.registerType('location-config', LocationConfigNode);
};

export = locationConfig;
