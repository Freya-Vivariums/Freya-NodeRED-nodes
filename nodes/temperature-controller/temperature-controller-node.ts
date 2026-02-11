/*
 * Freya Vivarium Control System - Temperature Controller Node
 * Copyright (C) 2025 Sanne 'SpuQ' Santens
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Node-RED node for Temperature Controller (Dual Deadband)
 * Implements dual deadband control with safety overrides for temperature regulation
 */
import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface TemperatureControllerNodeDef extends NodeDef {
  deadband: number;
  minimumTemperature: number;
  maximumTemperature: number;
  watchdogTimeout: number;
  watchdogSeverity: 'warning' | 'error';
}

interface ControllerState {
  targetTemperature?: number;
  currentTemperature?: number;
  currentState: 'heating' | 'cooling' | 'idle';
  safetyOverride?: 'min' | 'max' | null;
  watchdogTimer?: NodeJS.Timeout;
  openLoopMode: boolean;
}

const temperatureController: NodeInitializer = (RED: NodeAPI) => {
  function TemperatureControllerNode(this: Node & { deadband?: number; minimumTemperature?: number; maximumTemperature?: number; watchdogTimeout?: number; watchdogSeverity?: string }, config: TemperatureControllerNodeDef) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Store configuration - parse numeric values from strings
    this.deadband = parseFloat(config.deadband as any) || 1.0;
    this.minimumTemperature = parseFloat(config.minimumTemperature as any) || 10.0;
    this.maximumTemperature = parseFloat(config.maximumTemperature as any) || 50.0;
    this.watchdogTimeout = parseInt(config.watchdogTimeout as any) || 60;
    this.watchdogSeverity = config.watchdogSeverity || 'warning';
    
    // Controller state
    const state: ControllerState = {
      currentState: 'idle',
      safetyOverride: null,
      openLoopMode: false
    };

    // Watchdog functions
    const startWatchdog = () => {
      if (state.watchdogTimer) {
        clearTimeout(state.watchdogTimer);
      }
      
      state.watchdogTimer = setTimeout(() => {
        // Watchdog triggered - enter open-loop mode
        state.openLoopMode = true;
        
        // Send safe state (all actuators off) and status
        node.send([
          {
            payload: {
              heater: 'off',
              cooler: 'off'
            },
            topic: 'actuators'
          },
          {
            payload: {
              severity: node.watchdogSeverity,
              message: `No sensor feedback for ${node.watchdogTimeout}s`,
              state: 'open-loop',
              timestamp: new Date().toISOString()
            },
            topic: 'status'
          }
        ]);
        
        node.status({ fill: 'red', shape: 'dot', text: `No sensor for ${node.watchdogTimeout}s` });
      }, (node.watchdogTimeout || 60) * 1000);
    };
    
    const stopWatchdog = () => {
      if (state.watchdogTimer) {
        clearTimeout(state.watchdogTimer);
        state.watchdogTimer = undefined;
      }
    };

    // Dual deadband control logic - heating operates below target, cooling above target
    const calculateControl = (): { heater: string; cooler: string; state: string; override?: string } => {
      // In open-loop mode, return safe state
      if (state.openLoopMode) {
        return { heater: 'off', cooler: 'off', state: 'open-loop' };
      }
      
      if (state.currentTemperature === undefined || state.targetTemperature === undefined) {
        return { heater: 'off', cooler: 'off', state: 'idle' };
      }

      const temp = state.currentTemperature;
      const target = state.targetTemperature;
      const deadband = this.deadband;
      
      // Safety overrides take precedence
      if (temp < (this.minimumTemperature || 10.0)) {
        state.safetyOverride = 'min';
        state.currentState = 'heating';
        return { heater: 'on', cooler: 'off', state: 'heating', override: 'minimum temperature' };
      }
      
      if (temp > (this.maximumTemperature || 50.0)) {
        state.safetyOverride = 'max';
        state.currentState = 'cooling';
        return { heater: 'off', cooler: 'on', state: 'cooling', override: 'maximum temperature' };
      }
      
      // Clear safety override if we're back in normal range
      state.safetyOverride = null;
      
      // Dual deadband control with target as dividing line
      if (temp < target - (deadband || 1.0)) {
        // Below heating threshold - start heating
        state.currentState = 'heating';
        return { heater: 'on', cooler: 'off', state: 'heating' };
      } else if (temp > target + (deadband || 1.0)) {
        // Above cooling threshold - start cooling
        state.currentState = 'cooling';
        return { heater: 'off', cooler: 'on', state: 'cooling' };
      } else if (state.currentState === 'heating' && temp < target) {
        // Continue heating until we reach target
        return { heater: 'on', cooler: 'off', state: 'heating' };
      } else if (state.currentState === 'cooling' && temp > target) {
        // Continue cooling until we reach target
        return { heater: 'off', cooler: 'on', state: 'cooling' };
      } else {
        // At target or within deadband with no prior state - idle
        state.currentState = 'idle';
        return { heater: 'off', cooler: 'off', state: 'idle' };
      }
    };

    // Update node status display
    const updateStatus = (control: any) => {
      if (state.openLoopMode) {
        return; // Status already set by watchdog
      }
      
      if (state.currentTemperature === undefined || state.targetTemperature === undefined) {
        node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
        return;
      }

      const temp = state.currentTemperature.toFixed(1);
      const target = state.targetTemperature.toFixed(1);
      
      if (control.override) {
        node.status({ fill: 'red', shape: 'dot', text: `SAFETY: ${control.override} (${temp}°C)` });
      } else if (control.state === 'heating') {
        const deadband = node.deadband || 1.0;
        node.status({ fill: 'green', shape: 'dot', text: `Heating: ${temp}°C → ${target}°C (±${deadband}°C)` });
      } else if (control.state === 'cooling') {
        const deadband = node.deadband || 1.0;
        node.status({ fill: 'blue', shape: 'dot', text: `Cooling: ${temp}°C → ${target}°C (±${deadband}°C)` });
      } else {
        const deadband = node.deadband || 1.0;
        node.status({ fill: 'grey', shape: 'dot', text: `Idle: ${temp}°C (target ${target}°C ±${deadband}°C)` });
      }
    };

    // Execute control loop - called on every sensor update
    const _executeControlLoop = () => {
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
            deadband: this.deadband,
            openLoopMode: state.openLoopMode
          },
          topic: 'status'
        }
      ]);
      
      updateStatus(control);
    };
    
    // Update temperature from sensor
    const updateTemperature = (temperature: number) => {
      state.currentTemperature = temperature;
      
      // Exit open-loop mode if we were in it
      if (state.openLoopMode) {
        state.openLoopMode = false;
        node.log('Exiting open-loop mode - sensor feedback restored');
      }
      
      // Restart watchdog
      startWatchdog();
      
      // Execute control loop immediately
      _executeControlLoop();
    };

    // Handle input messages
    node.on('input', (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
      // Check if this is a sensor reading based on topic
      if (msg.topic === 'sensor') {
        // Sensor reading from environment sensor
        if (typeof msg.payload === 'number') {
          updateTemperature(msg.payload);
          node.log(`Current temperature updated: ${msg.payload}°C`);
        }
      } else {
        // Target temperature from circadian core (no specific topic or other topics)
        if (typeof msg.payload === 'number') {
          state.targetTemperature = msg.payload;
          node.log(`Target temperature updated: ${msg.payload}°C`);
          
          // Execute control loop if we have sensor data and not in open-loop mode
          if (state.currentTemperature !== undefined && !state.openLoopMode) {
            _executeControlLoop();
          }
        }
      }
      
      if (done) done();
    });
    
    // Clean up on node removal
    node.on('close', () => {
      stopWatchdog();
    });

    // Initial status
    node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
  }

  RED.nodes.registerType('temperature controller', TemperatureControllerNode);
};

export = temperatureController;