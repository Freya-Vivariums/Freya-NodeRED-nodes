/*
 * Node-RED node for Temperature Controller (Bang-Bang with Deadband)
 * Implements bang-bang control with safety overrides for temperature regulation
 *
 * Copyright (c) 2025 Sanne 'SpuQ' Santens.
 * Licensed under the MIT License. See the project's LICENSE file for details.
 */
import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface NodeConfig extends NodeDef {
  deadband: number;
  minimumTemperature: number;
  maximumTemperature: number;
}

interface ControllerState {
  targetTemperature?: number;
  currentTemperature?: number;
  currentState: 'heating' | 'cooling' | 'idle';
  safetyOverride?: 'min' | 'max' | null;
}

const temperatureController: NodeInitializer = (RED: NodeAPI) => {
  function TemperatureControllerNode(this: Node, config: NodeConfig) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Store configuration
    this.deadband = config.deadband || 1.0;
    this.minimumTemperature = config.minimumTemperature || 10.0;
    this.maximumTemperature = config.maximumTemperature || 50.0;
    
    // Controller state
    const state: ControllerState = {
      currentState: 'idle',
      safetyOverride: null
    };

    // Bang-bang control logic with deadband
    const calculateControl = (): { heater: string; cooler: string; state: string; override?: string } => {
      if (state.currentTemperature === undefined || state.targetTemperature === undefined) {
        return { heater: 'off', cooler: 'off', state: 'idle' };
      }

      const temp = state.currentTemperature;
      const target = state.targetTemperature;
      const deadband = this.deadband;
      
      // Safety overrides take precedence
      if (temp < this.minimumTemperature) {
        state.safetyOverride = 'min';
        state.currentState = 'heating';
        return { heater: 'on', cooler: 'off', state: 'heating', override: 'minimum temperature' };
      }
      
      if (temp > this.maximumTemperature) {
        state.safetyOverride = 'max';
        state.currentState = 'cooling';
        return { heater: 'off', cooler: 'on', state: 'cooling', override: 'maximum temperature' };
      }
      
      // Clear safety override if we're back in normal range
      state.safetyOverride = null;
      
      // Bang-bang control with deadband
      if (temp < target - deadband) {
        state.currentState = 'heating';
        return { heater: 'on', cooler: 'off', state: 'heating' };
      } else if (temp > target + deadband) {
        state.currentState = 'cooling';
        return { heater: 'off', cooler: 'on', state: 'cooling' };
      } else {
        // Within deadband - maintain current state
        const heater = state.currentState === 'heating' ? 'on' : 'off';
        const cooler = state.currentState === 'cooling' ? 'on' : 'off';
        return { heater, cooler, state: state.currentState };
      }
    };

    // Update node status display
    const updateStatus = (control: any) => {
      if (state.currentTemperature === undefined || state.targetTemperature === undefined) {
        node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
        return;
      }

      const temp = state.currentTemperature.toFixed(1);
      const target = state.targetTemperature.toFixed(1);
      
      if (control.override) {
        node.status({ fill: 'red', shape: 'dot', text: `SAFETY: ${control.override} (${temp}°C)` });
      } else if (control.state === 'heating') {
        node.status({ fill: 'green', shape: 'dot', text: `Heating: ${temp}°C → ${target}°C` });
      } else if (control.state === 'cooling') {
        node.status({ fill: 'blue', shape: 'dot', text: `Cooling: ${temp}°C → ${target}°C` });
      } else {
        node.status({ fill: 'grey', shape: 'dot', text: `Idle: ${temp}°C (${target}°C)` });
      }
    };

    // Process control calculation and emit outputs
    const processControl = () => {
      const control = calculateControl();
      
      // Send actuator commands
      node.send([
        {
          payload: {
            heater: control.heater,
            cooler: control.cooler
          },
          topic: 'actuators'
        },
        {
          payload: {
            state: control.state,
            target: state.targetTemperature,
            reading: state.currentTemperature,
            safetyOverride: control.override || null,
            deadband: this.deadband
          },
          topic: 'status'
        }
      ]);
      
      updateStatus(control);
    };

    // Handle input messages
    node.on('input', (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
      // Check if this is a sensor reading based on topic
      if (msg.topic === 'sensor') {
        // Sensor reading from environment sensor
        if (typeof msg.payload === 'number') {
          state.currentTemperature = msg.payload;
          node.log(`Current temperature updated: ${msg.payload}°C`);
        }
      } else {
        // Target temperature from circadian core (no specific topic or other topics)
        if (typeof msg.payload === 'number') {
          state.targetTemperature = msg.payload;
          node.log(`Target temperature updated: ${msg.payload}°C`);
        }
      }
      
      // Process control if we have both values
      if (state.targetTemperature !== undefined && state.currentTemperature !== undefined) {
        processControl();
      }
      
      if (done) done();
    });

    // Initial status
    node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
  }

  RED.nodes.registerType('temperature controller', TemperatureControllerNode);
};

export = temperatureController;