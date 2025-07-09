/*
 * Node-RED node for TemperatureController (P-Controller)
 * Wraps the TemperatureController class to integrate with Node-RED flows
 *
 * Copyright (c) 2025 Sanne 'SpuQ' Santens.
 * Licensed under the MIT License. See the project's LICENSE file for details.
 */
import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';
import { TemperatureController } from './temperature-controller';

interface NodeConfig extends NodeDef {
  kp?: string;
  minimumTemperature?: string;
  maximumTemperature?: string;
}

const temperatureController: NodeInitializer = (RED: NodeAPI) => {
  function TemperatureControllerNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

    // instantiate controller
    const controller = new TemperatureController();

    // Relay status events to Node-RED
    controller.on('status', (status:any) => {
      node.status({ fill: status.level === 'error' ? 'red' : 'green', shape: 'ring', text: status.message });
      node.send({ topic: 'status', payload: status });
    });

    // Relay controlOutput events
    controller.on('controlOutput', (effort:any) => {
      node.send({ topic: 'control', payload: { effort } });
    });

    // indicate running status in the editor
    node.status({ fill: 'green', shape: 'dot', text: 'running' });

    node.on( 'input', async ( msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void ) => {
      // Expect msg.topic to be 'temp' or 'config'
      if (msg.topic === 'temp' && typeof msg.payload === 'number') {
        controller.updateTemperature(msg.payload);
      }
      else if (msg.topic === 'config' && typeof msg.payload === 'object') {
        const { setpoint, kp } = <any>msg.payload;
        controller.configure(parseFloat(setpoint), parseFloat(kp));
      }
      else {
        node.warn('Unsupported message topic or payload');
      }
    });

    // Clean up
    node.on('close', (done:any) => {
      controller.clear();
      done();
    });
  }

  RED.nodes.registerType( 'temperature controller', TemperatureControllerNode );
};

export = temperatureController;