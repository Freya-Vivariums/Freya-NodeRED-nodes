/**
 * @file environment-sensor-node.ts
 * @module environment-sensor-node
 * @description
 * Node-RED node that uses the `environment-sensor` library to communicate
 * with the Freya Environment Sensor Driver over D-Bus.
 *
 * @copyright 2025 Sanne “SpuQ” Santens
 * @license MIT
 */

import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';
import { SensorDriver } from './environment-sensor';

interface NodeConfig extends NodeDef {
  name: string;
  variable: string;
  sampleinterval: string;
}

const environmentSensor: NodeInitializer = (RED: NodeAPI) => {
  function EnvironmentSensorNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

    const variable = config.variable;
    const sampleinterval = parseFloat(config.sampleinterval);

    const sensorDriver = new SensorDriver();

    // On status events from the driver
    sensorDriver.on('status',(status:any)=>{
        switch (status.level){
            case 'ok':      node.status({ fill: 'green', shape: 'dot', text: status.message });
                            break;
            case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: status.message });
                            break;
            default:        node.status({ fill: 'red', shape: 'dot', text: status.message });
                            break;
        }
    })

    /* Handler for 'measurement' data received from the driver */
    sensorDriver.on('measurement', (measurement:any)=>{
      // If this is a measurement the user has set with 'variable,
      // then emit it. Otherwise just skip.
      if( Object.prototype.hasOwnProperty.call(measurement, variable) || variable === 'all'){
        const msg:NodeMessageInFlow = {
          _msgid: '',
          topic: "measurement",
          payload: measurement
        }
        this.send(msg);
      }
    });
  }

  RED.nodes.registerType('environment sensor', EnvironmentSensorNode);
};

export = environmentSensor;