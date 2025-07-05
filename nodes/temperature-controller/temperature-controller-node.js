/*
 * Node-RED node for TemperatureController (P-Controller)
 * Wraps the TemperatureController class to integrate with Node-RED flows
 *
 * Copyright (c) 2025 Sanne 'SpuQ' Santens.
 * Licensed under the MIT License. See the project's LICENSE file for details.
 */

const TemperatureController = require('./temperature-controller').TemperatureController;

module.exports = function(RED) {
  function TemperatureControllerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // instantiate controller
    const controller = new TemperatureController();

    // Configure initial setpoint and gain if provided
    if (config.setpoint !== undefined) {
      const kp = config.kp !== undefined ? parseFloat(config.kp) : undefined;
      controller.configure(parseFloat(config.setpoint), kp);
      node.status({ fill: 'green', shape: 'dot', text: `set to ${config.setpoint}°, Kp=${kp||controller.proportionalGain}` });
    }

    // Relay status events to Node-RED
    controller.on('status', status => {
      node.status({ fill: status.level === 'error' ? 'red' : 'green', shape: 'ring', text: status.message });
      node.send({ topic: 'status', payload: status });
    });

    // Relay controlOutput events
    controller.on('controlOutput', effort => {
      node.send({ topic: 'control', payload: { effort } });
    });

    // Handle incoming messages
    node.on('input', msg => {
      // Expect msg.topic to be 'temp' or 'config'
      if (msg.topic === 'temp' && typeof msg.payload === 'number') {
        controller.updateTemperature(msg.payload);
      }
      else if (msg.topic === 'config' && typeof msg.payload === 'object') {
        const { setpoint, kp } = msg.payload;
        controller.configure(parseFloat(setpoint), parseFloat(kp));
      }
      else {
        node.warn('Unsupported message topic or payload');
      }
    });

    // Clean up
    node.on('close', done => {
      controller.clear();
      done();
    });
  }

  RED.nodes.registerType('temperature controller', TemperatureControllerNode);
};
