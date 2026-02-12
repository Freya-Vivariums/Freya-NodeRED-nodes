/*
 * Freya Vivarium Control System - Lighting Controller Node
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
 */
import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface LightingControllerNodeDef extends NodeDef {
  name: string;
  gain: number;
  bottomCutOff: number;
  mode: 'analog' | 'digital';
  scheduleTime1: string;
  scheduleTime2: string;
  scheduleMode: 'allowed' | 'guaranteed';
}

const lightingController: NodeInitializer = (RED: NodeAPI) => {
  function LightingControllerNode(this: Node & { 
    gain?: number; 
    bottomCutOff?: number;
    mode?: 'analog' | 'digital'; 
    scheduleTime1?: string; 
    scheduleTime2?: string; 
    scheduleMode?: 'allowed' | 'guaranteed' 
  }, config: LightingControllerNodeDef) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store configuration - parse numeric values from strings
    this.gain = parseFloat(config.gain as any) || 1.0;
    this.bottomCutOff = parseFloat(config.bottomCutOff as any) || 50.0;
    this.mode = config.mode || 'analog';
    this.scheduleTime1 = config.scheduleTime1 || '';
    this.scheduleTime2 = config.scheduleTime2 || '';
    this.scheduleMode = config.scheduleMode || 'allowed';

    // Helper function to check if current time is within schedule
    const isWithinSchedule = (): boolean => {
      // If either time is not set, schedule is inactive
      if (!this.scheduleTime1 || !this.scheduleTime2) {
        return true;
      }

      try {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Parse schedule times
        const [hours1, minutes1] = this.scheduleTime1.split(':').map(Number);
        const [hours2, minutes2] = this.scheduleTime2.split(':').map(Number);
        
        const time1 = hours1 * 60 + minutes1;
        const time2 = hours2 * 60 + minutes2;
        
        // Handle case where schedule crosses midnight
        if (time1 <= time2) {
          return currentTime >= time1 && currentTime <= time2;
        } else {
          // Schedule crosses midnight (e.g., 22:00 to 06:00)
          return currentTime >= time1 || currentTime <= time2;
        }
      } catch (error) {
        node.warn('Error parsing schedule times: ' + error);
        return true; // Default to allowing if there's an error
      }
    };

    // Helper function to format time for display
    const formatTime = (timeStr: string): string => {
      if (!timeStr) return '';
      return timeStr;
    };

    node.on('input', (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
      // Validate input
      if (typeof msg.payload !== 'number') {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid input' });
        done?.(new Error('Input payload must be a number'));
        return;
      }

      let value = msg.payload;

      // Apply bottom cut-off ("single diode rectifier + schotkey")
      // Everything below bottomCutOff is now 0%
      // Values at or above bottomCutOff are remapped so that bottomCutOff becomes the new 0%
      if (value < (this.bottomCutOff || 50.0)) {
        value = 0;
      } else {
        // Remap the value so that bottomCutOff becomes 0% and 100% stays 100%
        value = ((value - (this.bottomCutOff || 50.0)) / (100 - (this.bottomCutOff || 50.0))) * 100;
      }

      // Apply gain (multiply input by gain)
      value = value * (this.gain || 1.0);

      // Clamp to 0-100 range (everything above 100% is cut off to 100%)
      value = Math.max(0, Math.min(100, value));

      // Apply schedule gate if both times are set
      let scheduleActive = false;
      let scheduleStatus = '';
      
      if (this.scheduleTime1 && this.scheduleTime2) {
        const withinSchedule = isWithinSchedule();
        
        if (this.scheduleMode === 'allowed') {
          // Allowed mode: force 0 outside Time1-Time2 window
          if (!withinSchedule) {
            value = 0;
            scheduleActive = true;
            scheduleStatus = ' (outside schedule)';
          }
        } else if (this.scheduleMode === 'guaranteed') {
          // Guaranteed mode: force 100 inside Time1-Time2 window
          if (withinSchedule) {
            value = 100;
            scheduleActive = true;
            scheduleStatus = ' (guaranteed)';
          }
        }
      }

      // Format output based on mode
      let outputPayload: any;
      let statusText: string;
      
      // Calculate the final processed value for status display
      const finalValue = Math.round(value * 10) / 10; // Round to 1 decimal
      
      if (this.mode === 'digital') {
        // Digital mode: { lighting: "on" } if value > 0, else { lighting: "off" }
        outputPayload = { lighting: value > 0 ? 'on' : 'off' };
        
        // Update node status - show digital state and final processed percentage
        if (value > 0) {
          statusText = 'ON (' + finalValue.toFixed(1) + '%)' + scheduleStatus;
          node.status({ fill: 'green', shape: 'dot', text: statusText });
        } else {
          statusText = 'OFF (0%)' + scheduleStatus;
          node.status({ fill: 'grey', shape: 'dot', text: statusText });
        }
      } else {
        // Analog mode: { lighting: <float 0.0-100.0> } (1 decimal)
        outputPayload = { lighting: finalValue };
        
        // Update node status with final processed percentage
        if (finalValue > 0) {
          statusText = finalValue.toFixed(1) + '%' + scheduleStatus;
          node.status({ fill: 'green', shape: 'dot', text: statusText });
        } else {
          statusText = '0%' + scheduleStatus;
          node.status({ fill: 'grey', shape: 'dot', text: statusText });
        }
      }

      // Send output messages
      send([
        { payload: outputPayload, topic: 'actuators' }, // Output 1: actuator command
        { payload: { ...outputPayload, scheduleActive, gain: this.gain, bottomCutOff: this.bottomCutOff, mode: this.mode }, topic: 'status' } // Output 2: status for status aggregator
      ]);

      done?.();
    });
  }

  RED.nodes.registerType('lighting controller', LightingControllerNode);
};

export = lightingController;