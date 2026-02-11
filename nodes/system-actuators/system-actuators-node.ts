/**
 * @file system-actuators-node.ts
 * @module system-actuators-node
 * @description
 * Node-RED node that uses the `system actuators` library to communicate
 * with Freya's System Actuators Driver over D-Bus.
 *
 * @copyright 2025 Sanne “SpuQ” Santens
 * @license MIT
 */

import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';
import { ActuatorsDriver } from './system-actuators';

interface NodeConfig extends NodeDef {
  name: string;
  actuator: string;
  channel: string;
  mode: string;
}

const systemActuators: NodeInitializer = (RED: NodeAPI) => {
  function SystemActuatorsNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

    const actuator = config.actuator;
    const channel = parseInt(config.channel as any) || 0;
    const mode = config.mode;

    const actuatorsDriver = new ActuatorsDriver();

    // On status events from the driver
    actuatorsDriver.on('status',(status:any)=>{
        switch (status.level){
            case 'ok':      node.status({ fill: 'green', shape: 'dot', text: status.message });
                            break;
            case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: status.message });
                            break;
            default:        node.status({ fill: 'red', shape: 'dot', text: status.message });
                            break;
        }
        
    })


  node.on('input', async (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
    try {
      // First check if there's a payload that's an object
      if ( msg.payload != null && typeof msg.payload === 'object') {
        // Get the value of the object out that has the name of this actuator
        const rawValue = (msg.payload as any)[actuator];
        // If our raw value is not undefined, it's for us to process
        if (typeof rawValue !== 'undefined') {
          // When the operation mode is digital (on/off), treat everything
          // that looks like 'true' as true. It's Node-RED, right!
          if(mode === 'digital'){
            const state = (rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1" || rawValue === 'on')?true:false;
            // Set the actual digital output
            actuatorsDriver.setDigitalOutput(channel, state)
              .then((res)=>{
                // The response from this method is a boolean: true for success, false for failed
                if(res) node.status({ fill: 'green', shape: 'dot', text: `D${channel} turned ${state ? 'on' : 'off'}` });
                else node.status({ fill: 'yellow', shape: 'dot', text: 'Invalid request' });
              })
              .catch((err)=>{
                  node.status({ fill: 'yellow', shape: 'dot', text: err });
              });
            }
            else if( mode === 'pwm'){
              // TODO: implement other modes!
            }
        }
      }
    } catch (err) {
      node.status({ fill: 'red', shape: 'dot', text: "Failed to set output" });
      done(err as Error);
      return;
    }
    done();
    });
  }

  RED.nodes.registerType( 'system actuators', SystemActuatorsNode );
};

export = systemActuators;