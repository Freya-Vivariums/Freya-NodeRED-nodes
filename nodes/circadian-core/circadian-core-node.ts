/*
 * Freya Vivarium Control System - Circadian Core Node
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

interface CircadianCoreNodeDef extends NodeDef {
  locationConfig: string;
  phaseShift: number;
  diurnalSwing: number;
  seasonalSwing: number;
  tickInterval: number;
  decimals: number;
}



interface CircadianState {
  absoluteMin?: number;
  absoluteMax?: number;
  lastCalculation?: number;
  intervalId?: any;
}

// Astronomical calculation utilities
class AstronomicalCalculator {
  static degreesToRadians(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  static radiansToDegrees(radians: number): number {
    return radians * 180 / Math.PI;
  }

  // Calculate day of year (1-365/366)
  static getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // Calculate solar declination angle based on day of year and orbital parameters
  static getSolarDeclination(dayOfYear: number, orbitalPeriod: number, axialTilt: number): number {
    const dayAngle = 2 * Math.PI * (dayOfYear - 81) / orbitalPeriod; // 81 = spring equinox offset
    return this.degreesToRadians(axialTilt) * Math.sin(dayAngle);
  }

  // Calculate solar noon offset based on longitude and timezone
  static getSolarNoonOffset(longitude: number, timezone: string): number {
    // Parse timezone (simplified - assumes UTC±N format)
    const tzMatch = timezone.match(/UTC([+-]?\d+(?:\.\d+)?)/i);
    const tzOffset = tzMatch ? parseFloat(tzMatch[1]) : 0;

    // Solar noon occurs when sun is at longitude 0°
    // Each 15° of longitude = 1 hour time difference
    const longitudeOffset = longitude / 15;
    return longitudeOffset - tzOffset;
  }
}

const circadianCore: NodeInitializer = (RED: NodeAPI) => {
  function CircadianCoreNode(this: Node & { locationConfig?: any; phaseShift?: number; diurnalSwing?: number; seasonalSwing?: number; tickInterval?: number; decimals?: number }, config: CircadianCoreNodeDef) {
    RED.nodes.createNode(this, config);
    const node = this;
    const state: CircadianState = {};

    // Get location configuration
    const locationConfigNode = RED.nodes.getNode(config.locationConfig);

    if (!locationConfigNode) {
      node.status({ fill: 'red', shape: 'dot', text: 'no location config' });
      node.error('Location configuration node not found');
    }
    // Store configuration - parse numeric values from strings
    this.phaseShift = parseFloat(config.phaseShift as any) || 0.0;
    this.diurnalSwing = parseFloat(config.diurnalSwing as any) || 1.0;
    this.seasonalSwing = parseFloat(config.seasonalSwing as any) || 1.0;
    this.tickInterval = parseInt(config.tickInterval as any) || 60;
    this.decimals = parseInt(config.decimals as any) !== undefined ? parseInt(config.decimals as any) : 1;
    this.locationConfig = locationConfigNode;

    // Calculate simulated time
    const getSimulatedTime = (): Date => {
      const now = Date.now();
      const epoch = new Date('2000-01-01T00:00:00Z').getTime();
      const realElapsed = now - epoch;
      const simulatedElapsed = realElapsed * this.locationConfig.timeScale;
      return new Date(epoch + simulatedElapsed);
    };

    // Calculate seasonal cycle factor (-1.0 to +1.0)
    // Clean sine: +1 at summer solstice, -1 at winter solstice
    // Amplitude modulated by latitude and axial tilt
    const getSeasonalFactor = (simulatedTime: Date): number => {
      const dayOfYear = AstronomicalCalculator.getDayOfYear(simulatedTime);
      const seasonalAngle = 2 * Math.PI * (dayOfYear - 172) / this.locationConfig.orbitalPeriod;
      return Math.cos(seasonalAngle);
  };

    // Calculate diurnal cycle factor (-1.0 to +1.0)
    // Clean sine: +1 at solar noon (+ phase shift), -1 at solar midnight (+ phase shift)
    // No clamping, no rectification — continuous oscillation
    const getDiurnalFactor = (simulatedTime: Date): number => {
      const solarNoonOffset = AstronomicalCalculator.getSolarNoonOffset(this.locationConfig.longitude, this.locationConfig.timezone);

      // Current time in hours since midnight
      const hoursFromMidnight = simulatedTime.getUTCHours() + simulatedTime.getUTCMinutes() / 60 + simulatedTime.getUTCSeconds() / 3600;

      // Solar noon time in local hours
      const solarNoon = 12 + solarNoonOffset;

      // Hours from solar noon
      let hoursFromSolarNoon = hoursFromMidnight - solarNoon;
      if (hoursFromSolarNoon > 12) hoursFromSolarNoon -= 24;
      if (hoursFromSolarNoon < -12) hoursFromSolarNoon += 24;

      // Diurnal angle with phase shift — continuous cosine, no clamping
      const phaseShiftRad = AstronomicalCalculator.degreesToRadians(this.phaseShift || 0);
      const diurnalAngle = (2 * Math.PI * hoursFromSolarNoon / this.locationConfig.rotationalPeriod) + phaseShiftRad;

      return Math.cos(diurnalAngle);
    };

    // Calculate target value
    //
    // Two clean sines combined: seasonal (slow, yearly) and diurnal (fast, daily).
    // The swing settings control the relative weight of each cycle.
    // The combined result is normalised so that at the combined extremes
    // (summer solstice + solar noon / winter solstice + solar midnight),
    // the target exactly hits absoluteMax / absoluteMin.
    //
    // Downstream controllers handle any clamping or shaping:
    // - Temperature/humidity controllers use the full range naturally
    // - The lighting controller clips negative values to 0 (rectification)
    //
    const calculateTarget = (): number | null => {
      if (state.absoluteMin === undefined || state.absoluteMax === undefined) {
        return null; // Can't calculate without both setpoints
      }

      const simulatedTime = getSimulatedTime();
      const seasonalFactor = getSeasonalFactor(simulatedTime);   // -1 to +1
      const diurnalFactor = getDiurnalFactor(simulatedTime);     // -1 to +1

      const sSwing = this.seasonalSwing || 1.0;
      const dSwing = this.diurnalSwing || 1.0;
      const totalSwing = sSwing + dSwing;

      // Handle edge case: if both swings are 0, default to midpoint
      if (totalSwing === 0) {
        return state.absoluteMin + (state.absoluteMax - state.absoluteMin) * 0.5;
      }

      // Weighted combination of both sines (-1 to +1 range)
      const combined = (seasonalFactor * sSwing + diurnalFactor * dSwing) / totalSwing;

      // Normalise from [-1, +1] to [0, 1]
      const factor = (combined + 1) / 2;

      // Linear interpolation between absolute min and max
      return state.absoluteMin + (state.absoluteMax - state.absoluteMin) * factor;
    };

    // Emit target value and status - extracted for reuse by both input handler and tick timer
    const emitTarget = () => {
      const target = calculateTarget();
      if (target === null) {
        node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting setpoints' });
        return;
      }

      // Round target to configured decimal places
      const roundedTarget = Number(target.toFixed(this.decimals));
      const simulatedTime = getSimulatedTime();

      node.send([
        { payload: roundedTarget, topic: 'target' },
        { payload: { target: roundedTarget, simulatedTime: simulatedTime.toISOString(), timeScale: this.locationConfig.timeScale }, topic: 'status' }
      ]);

      // Update status with current values
      const statusText = `Target: ${roundedTarget.toFixed(this.decimals)} | Time: ${simulatedTime.toLocaleTimeString()}`;
      node.status({ fill: 'green', shape: 'dot', text: statusText });

      state.lastCalculation = Date.now();
    };

    // Start tick interval timer
    const startTickInterval = () => {
      if (state.intervalId) {
        clearInterval(state.intervalId);
      }

      // Use configured tick interval in real-time seconds
      const intervalMs = (this.tickInterval || 60) * 1000;

      state.intervalId = setInterval(() => {
        // Only emit if we have both setpoints
        if (state.absoluteMin !== undefined && state.absoluteMax !== undefined) {
          emitTarget();
        }
      }, intervalMs);

      // Emit immediately if we have setpoints
      if (state.absoluteMin !== undefined && state.absoluteMax !== undefined) {
        emitTarget();
      }
    };

    // Handle input messages
    node.on('input', (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
      // Handle topic-based setpoint messages
      if (msg.topic === 'absoluteMin' && typeof msg.payload === 'number') {
        state.absoluteMin = msg.payload;
        node.log(`Absolute minimum updated: ${msg.payload}`);

        // Emit if we have both values
        if (state.absoluteMin !== undefined && state.absoluteMax !== undefined) {
          emitTarget();
          startTickInterval();
        }
      } else if (msg.topic === 'absoluteMax' && typeof msg.payload === 'number') {
        state.absoluteMax = msg.payload;
        node.log(`Absolute maximum updated: ${msg.payload}`);

        // Emit if we have both values
        if (state.absoluteMin !== undefined && state.absoluteMax !== undefined) {
          emitTarget();
          startTickInterval();
        }
      } else if (typeof msg.payload === 'object' && msg.payload !== null) {
        // Handle object-based setpoint messages (legacy support)
        const payload = msg.payload as any;

        if (typeof payload.min === 'number' && typeof payload.max === 'number') {
          state.absoluteMin = payload.min;
          state.absoluteMax = payload.max;
          node.log(`Setpoints updated: min=${payload.min}, max=${payload.max}`);

          // Emit immediately when setpoints are updated
          emitTarget();

          // Start the tick interval when we have both setpoints
          startTickInterval();
        }
      }

      done?.();
    });

    // Cleanup on close
    node.on('close', () => {
      if (state.intervalId) {
        clearInterval(state.intervalId);
        state.intervalId = undefined;
      }
    });

    // Initial status
    node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting setpoints' });

    // Start the tick timer
    startTickInterval();
  }

  RED.nodes.registerType( 'circadian core', CircadianCoreNode );
};

export = circadianCore;