/*
 * Freya Vivarium Control System - Precipitation Controller Node
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

interface PrecipitationControllerNodeDef extends NodeDef {
  interval: number;
  duration: number;
  tickInterval: number;
}

interface PrecipitationState {
  lastPrecipitation: number | null;
  pumpActive: boolean;
  offTimer?: NodeJS.Timeout;
  tickTimerId?: any;
  intervalMs: number;
  durationMs: number;
  night: boolean;
}

// Format a millisecond duration to a human-readable string
const formatDuration = (ms: number): string => {
  if (ms >= 3600000) {
    return (ms / 3600000).toFixed(1) + 'h';
  } else if (ms >= 60000) {
    return (ms / 60000).toFixed(1) + 'm';
  } else {
    return (ms / 1000).toFixed(0) + 's';
  }
};

const precipitationController: NodeInitializer = (RED: NodeAPI) => {
  function PrecipitationControllerNode(this: Node & { interval?: number; duration?: number; tickInterval?: number }, config: PrecipitationControllerNodeDef) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Store configuration - parse numeric values from strings
    this.interval = parseFloat(config.interval as any) || 60;
    this.duration = parseFloat(config.duration as any) || 30;
    this.tickInterval = parseInt(config.tickInterval as any) || 60;

    // Node state (in-memory only, resets on deploy/restart)
    const state: PrecipitationState = {
      lastPrecipitation: null,
      pumpActive: false,
      intervalMs: (node.interval || 60) * 60000,
      durationMs: (node.duration || 30) * 1000,
      night: false
    };

    // Evaluate whether precipitation is due and act accordingly
    const evaluatePrecipitation = () => {
      // If the pump is already active, skip
      if (state.pumpActive) {
        return;
      }

      // If nighttime is signalled, skip
      if (state.night) {
        node.status({ fill: 'grey', shape: 'ring', text: 'paused (night)' });
        return;
      }

      const now = Date.now();

      // Check if it's time to precipitate
      if (state.lastPrecipitation === null || (now - state.lastPrecipitation) >= state.intervalMs) {
        // Turn pump on
        state.pumpActive = true;
        state.lastPrecipitation = now;
        node.send({ payload: { pump: 'on' }, topic: 'actuators' });

        node.status({ fill: 'blue', shape: 'dot', text: `pump on (${formatDuration(state.durationMs)})` });

        // Schedule pump off
        state.offTimer = setTimeout(() => {
          state.pumpActive = false;
          state.offTimer = undefined;
          node.send({ payload: { pump: 'off' }, topic: 'actuators' });

          const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
          node.status({ fill: 'grey', shape: 'ring', text: `last: ${timeStr}` });
        }, state.durationMs);
      } else {
        // Not yet due — show time remaining
        const elapsed = now - state.lastPrecipitation;
        const remaining = state.intervalMs - elapsed;
        node.status({ fill: 'green', shape: 'ring', text: `next in ${formatDuration(remaining)}` });
      }
    };

    // Start tick interval timer
    const startTickInterval = () => {
      if (state.tickTimerId) {
        clearInterval(state.tickTimerId);
      }

      // Use configured tick interval in real-time seconds
      const intervalMs = (node.tickInterval || 60) * 1000;

      state.tickTimerId = setInterval(() => {
        evaluatePrecipitation();
      }, intervalMs);
    };

    // Handle input messages (topic-based parameter updates)
    node.on('input', (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
      if (msg.topic === 'interval' && typeof msg.payload === 'number' && isFinite(msg.payload as number)) {
        state.intervalMs = (msg.payload as number) * 60000;
        node.log(`Interval updated: ${msg.payload} minutes`);
      } else if (msg.topic === 'duration' && typeof msg.payload === 'number' && isFinite(msg.payload as number)) {
        state.durationMs = (msg.payload as number) * 1000;
        node.log(`Duration updated: ${msg.payload} seconds`);
      } else if (msg.topic === 'night' && typeof msg.payload === 'boolean') {
        state.night = msg.payload;
        node.log(`Night state updated: ${msg.payload}`);
      }

      done?.();
    });

    // Safe cleanup on close (redeploy / shutdown)
    node.on('close', (done: () => void) => {
      if (state.tickTimerId) {
        clearInterval(state.tickTimerId);
        state.tickTimerId = undefined;
      }
      if (state.offTimer) {
        clearTimeout(state.offTimer);
        state.offTimer = undefined;
      }
      if (state.pumpActive) {
        state.pumpActive = false;
        node.send({ payload: { pump: 'off' }, topic: 'actuators' });
      }
      done();
    });

    // Initial status
    node.status({ fill: 'grey', shape: 'ring', text: 'idle' });

    // Start the tick timer
    startTickInterval();
  }

  RED.nodes.registerType( 'precipitation controller', PrecipitationControllerNode );
};

export = precipitationController;