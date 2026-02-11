import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface CircadianCoreNodeDef extends NodeDef {
  locationConfig: string;
  phaseShift: number;
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

  // Calculate sunrise/sunset times and day length
  static getDayLength(latitude: number, solarDeclination: number): number {
    const latRad = this.degreesToRadians(latitude);
    const cosHourAngle = -Math.tan(latRad) * Math.tan(solarDeclination);
    
    // Handle polar day/night
    if (cosHourAngle > 1) return 0; // Polar night
    if (cosHourAngle < -1) return 24; // Polar day
    
    const hourAngle = Math.acos(cosHourAngle);
    return 2 * this.radiansToDegrees(hourAngle) / 15; // Convert to hours
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
  function CircadianCoreNode(this: Node & { locationConfig?: any; phaseShift?: number; tickInterval?: number; decimals?: number }, config: CircadianCoreNodeDef) {
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
    this.locationConfig = RED.nodes.getNode(config.locationConfig) as any;
    this.phaseShift = parseFloat(config.phaseShift as any) || 0.0;
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

    // Calculate seasonal cycle factor (0.0 to 1.0)
    const getSeasonalFactor = (simulatedTime: Date): number => {
      const dayOfYear = AstronomicalCalculator.getDayOfYear(simulatedTime);
      const solarDeclination = AstronomicalCalculator.getSolarDeclination(
        dayOfYear, 
        this.locationConfig.orbitalPeriod, 
        this.locationConfig.axialTilt
      );
      
      // Seasonal strength based on latitude and axial tilt
      const latRad = AstronomicalCalculator.degreesToRadians(this.locationConfig.latitude);
      const seasonalAmplitude = Math.abs(Math.sin(latRad)) * Math.sin(AstronomicalCalculator.degreesToRadians(this.locationConfig.axialTilt));
      
      // Peak at summer solstice for northern hemisphere (day ~172)
      const seasonalAngle = 2 * Math.PI * (dayOfYear - 172) / this.locationConfig.orbitalPeriod;
      const seasonalValue = Math.cos(seasonalAngle) * seasonalAmplitude;
      
      // Normalize to 0.0-1.0 range
      return 0.5 + seasonalValue * 0.5;
    };

    // Calculate diurnal cycle factor (0.0 to 1.0)
    const getDiurnalFactor = (simulatedTime: Date): number => {
      const dayOfYear = AstronomicalCalculator.getDayOfYear(simulatedTime);
      const solarDeclination = AstronomicalCalculator.getSolarDeclination(
        dayOfYear,
        this.locationConfig.orbitalPeriod,
        this.locationConfig.axialTilt
      );
      
      const dayLength = AstronomicalCalculator.getDayLength(this.locationConfig.latitude, solarDeclination);
      const solarNoonOffset = AstronomicalCalculator.getSolarNoonOffset(this.locationConfig.longitude, this.locationConfig.timezone);
      
      // Current time in hours since midnight
      const hoursFromMidnight = simulatedTime.getUTCHours() + simulatedTime.getUTCMinutes() / 60;
      
      // Solar noon time in local hours
      const solarNoon = 12 + solarNoonOffset;
      
      // Hours from solar noon
      let hoursFromSolarNoon = hoursFromMidnight - solarNoon;
      if (hoursFromSolarNoon > 12) hoursFromSolarNoon -= 24;
      if (hoursFromSolarNoon < -12) hoursFromSolarNoon += 24;
      
      // Diurnal angle with phase shift
      const phaseShiftRad = AstronomicalCalculator.degreesToRadians(this.phaseShift || 0);
      const diurnalAngle = (2 * Math.PI * hoursFromSolarNoon / this.locationConfig.rotationalPeriod) + phaseShiftRad;
      
      // Only positive during daylight hours, scaled by day length
      const dayFraction = dayLength / 24;
      const maxDiurnalHours = dayLength / 2;
      
      if (Math.abs(hoursFromSolarNoon) > maxDiurnalHours) {
        return 0; // Night time
      }
      
      // Cosine curve during daylight hours
      const diurnalValue = Math.cos(diurnalAngle);
      return Math.max(0, diurnalValue) * dayFraction;
    };

    // Calculate target value
    const calculateTarget = (): number | null => {
      if (state.absoluteMin === undefined || state.absoluteMax === undefined) {
        return null; // Can't calculate without both setpoints
      }

      const simulatedTime = getSimulatedTime();
      const seasonalFactor = getSeasonalFactor(simulatedTime);
      const diurnalFactor = getDiurnalFactor(simulatedTime);
      
      // Combine cycles: seasonal determines envelope, diurnal interpolates within it
      const combinedFactor = seasonalFactor * 0.7 + diurnalFactor * 0.3; // Weighted combination
      
      // Linear interpolation between absolute min and max
      return state.absoluteMin + (state.absoluteMax - state.absoluteMin) * combinedFactor;
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
        }
      } else if (msg.topic === 'absoluteMax' && typeof msg.payload === 'number') {
        state.absoluteMax = msg.payload;
        node.log(`Absolute maximum updated: ${msg.payload}`);
        
        // Emit if we have both values
        if (state.absoluteMin !== undefined && state.absoluteMax !== undefined) {
          emitTarget();
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
  }

  RED.nodes.registerType( 'circadian core', CircadianCoreNode );
};

export = circadianCore;