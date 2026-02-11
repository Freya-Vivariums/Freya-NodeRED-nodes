import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface HumidityControllerNodeDef extends NodeDef {
  deadband: number;
  minimumHumidity: number;
  maximumHumidity: number;
  watchdogTimeout: number;
  watchdogSeverity: 'warning' | 'error';
}

interface ControllerState {
  currentHumidity?: number;
  targetHumidity?: number;
  currentState: 'idle' | 'humidifying' | 'dehumidifying';
  safetyOverride: null | 'min' | 'max';
  watchdogTimer?: NodeJS.Timeout;
  openLoopMode: boolean;
}

const humidityController: NodeInitializer = (RED: NodeAPI) => {
  function HumidityControllerNode(this: Node & { deadband?: number; minimumHumidity?: number; maximumHumidity?: number; watchdogTimeout?: number; watchdogSeverity?: string }, config: HumidityControllerNodeDef) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Store configuration - parse numeric values from strings
    this.deadband = parseFloat(config.deadband as any) || 2.0;
    this.minimumHumidity = parseFloat(config.minimumHumidity as any) || 0.0;
    this.maximumHumidity = parseFloat(config.maximumHumidity as any) || 100.0;
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
              humidifier: 'off',
              dehumidifier: 'off'
            },
            topic: 'actuators'
          },
          {
            payload: {
              severity: this.watchdogSeverity,
              message: `No sensor feedback for ${this.watchdogTimeout}s`,
              state: 'open-loop',
              timestamp: new Date().toISOString()
            },
            topic: 'status'
          }
        ]);
        
        node.status({ fill: 'red', shape: 'dot', text: `No sensor for ${this.watchdogTimeout}s` });
      }, (this.watchdogTimeout || 60) * 1000);
    };
    
    const stopWatchdog = () => {
      if (state.watchdogTimer) {
        clearTimeout(state.watchdogTimer);
        state.watchdogTimer = undefined;
      }
    };

    // Bang-bang control logic with deadband
    const calculateControl = (): { humidifier: string; dehumidifier: string; state: string; override?: string } => {
      // In open-loop mode, return safe state
      if (state.openLoopMode) {
        return { humidifier: 'off', dehumidifier: 'off', state: 'open-loop' };
      }
      
      if (state.currentHumidity === undefined || state.targetHumidity === undefined) {
        return { humidifier: 'off', dehumidifier: 'off', state: 'idle' };
      }

      const humidity = state.currentHumidity;
      const target = state.targetHumidity;
      const deadband = this.deadband;
      
      // Safety overrides take precedence
      if (humidity < (this.minimumHumidity || 0.0)) {
        state.safetyOverride = 'min';
        state.currentState = 'humidifying';
        return { humidifier: 'on', dehumidifier: 'off', state: 'humidifying', override: 'minimum humidity' };
      }
      
      if (humidity > (this.maximumHumidity || 100.0)) {
        state.safetyOverride = 'max';
        state.currentState = 'dehumidifying';
        return { humidifier: 'off', dehumidifier: 'on', state: 'dehumidifying', override: 'maximum humidity' };
      }
      
      // Clear safety override if we're back in normal range
      state.safetyOverride = null;
      
      // Bang-bang control with deadband
      if (humidity < target - (deadband || 2.0)) {
        state.currentState = 'humidifying';
        return { humidifier: 'on', dehumidifier: 'off', state: 'humidifying' };
      } else if (humidity > target + (deadband || 2.0)) {
        state.currentState = 'dehumidifying';
        return { humidifier: 'off', dehumidifier: 'on', state: 'dehumidifying' };
      } else {
        // Within deadband - maintain current state
        const humidifier = state.currentState === 'humidifying' ? 'on' : 'off';
        const dehumidifier = state.currentState === 'dehumidifying' ? 'on' : 'off';
        return { humidifier, dehumidifier, state: state.currentState };
      }
    };

    // Update node status display
    const updateStatus = (control: { state: string; override?: string }) => {
      if (state.openLoopMode) {
        return; // Status already set by watchdog
      }
      
      if (state.currentHumidity === undefined || state.targetHumidity === undefined) {
        node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
        return;
      }

      const humidity = state.currentHumidity.toFixed(1);
      const target = state.targetHumidity.toFixed(1);
      
      if (control.override) {
        node.status({ fill: 'red', shape: 'dot', text: `SAFETY: ${control.override} (${humidity}%)` });
      } else if (control.state === 'humidifying') {
        node.status({ fill: 'green', shape: 'dot', text: `Humidifying: ${humidity}% → ${target}%` });
      } else if (control.state === 'dehumidifying') {
        node.status({ fill: 'blue', shape: 'dot', text: `Dehumidifying: ${humidity}% → ${target}%` });
      } else {
        node.status({ fill: 'grey', shape: 'dot', text: `Idle: ${humidity}% (${target}%)` });
      }
    };

    // Execute control loop - called on every sensor update
    const _executeControlLoop = () => {
      const control = calculateControl();
      
      // Send actuator commands
      node.send([
        {
          payload: {
            humidifier: control.humidifier,
            dehumidifier: control.dehumidifier
          },
          topic: 'actuators'
        },
        {
          payload: {
            state: control.state,
            target: state.targetHumidity,
            reading: state.currentHumidity,
            safetyOverride: control.override || null,
            deadband: this.deadband,
            openLoopMode: state.openLoopMode
          },
          topic: 'status'
        }
      ]);
      
      updateStatus(control);
    };
    
    // Update humidity from sensor
    const updateHumidity = (humidity: number) => {
      state.currentHumidity = humidity;
      
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
          updateHumidity(msg.payload);
          node.log(`Current humidity updated: ${msg.payload}%`);
        }
      } else {
        // Target humidity from circadian core (no specific topic or other topics)
        if (typeof msg.payload === 'number') {
          state.targetHumidity = msg.payload;
          node.log(`Target humidity updated: ${msg.payload}%`);
          
          // Execute control loop if we have sensor data and not in open-loop mode
          if (state.currentHumidity !== undefined && !state.openLoopMode) {
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

  RED.nodes.registerType('humidity controller', HumidityControllerNode);
};

export = humidityController;