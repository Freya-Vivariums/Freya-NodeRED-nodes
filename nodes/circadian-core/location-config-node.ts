/*
 * Freya Vivarium Control System - Location Configuration Node
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

import { NodeAPI, NodeInitializer, NodeDef } from 'node-red';

interface LocationConfigNodeDef extends NodeDef {
  latitude: number;
  longitude: number;
  timezone: string;
  axialTilt: number;
  orbitalPeriod: number;
  rotationalPeriod: number;
  timeScale: number;
}

const locationConfig: NodeInitializer = (RED: NodeAPI) => {
  function LocationConfigNode(this: Node & { latitude?: number; longitude?: number; timezone?: string; axialTilt?: number; orbitalPeriod?: number; rotationalPeriod?: number; timeScale?: number }, config: LocationConfigNodeDef) {
    RED.nodes.createNode(this, config);
    
    // Store configuration properties - parse numeric values from strings
    this.latitude = parseFloat(config.latitude as any) || 50.98;
    this.longitude = parseFloat(config.longitude as any) || 4.32;
    this.timezone = config.timezone || 'UTC+1';
    this.axialTilt = parseFloat(config.axialTilt as any) || 23.44;
    this.orbitalPeriod = parseFloat(config.orbitalPeriod as any) || 365.25;
    this.rotationalPeriod = parseFloat(config.rotationalPeriod as any) || 24;
    this.timeScale = parseFloat(config.timeScale as any) || 1.0;
  }

  RED.nodes.registerType('location-config', LocationConfigNode);
};

export = locationConfig;
