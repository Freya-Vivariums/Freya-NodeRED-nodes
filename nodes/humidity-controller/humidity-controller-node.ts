import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface NodeConfig extends NodeDef {
  deadband: number;
  minimumHumidity: number;
  maximumHumidity: number;
}

interface ControllerState {
  currentHumidity?: number;
  targetHumidity?: number;
  currentState: 'idle' | 'humidifying' | 'dehumidifying';
  safetyOverride: null | 'min' | 'max';
}

const humidityController: NodeInitializer = (RED: NodeAPI) => {
  function HumidityControllerNode(this: Node, config: NodeConfig) {
    RED.nodes.createNode(this, config);
    const node = this;
    
    // Store configuration
    this.deadband = config.deadband || 2.0;
    this.minimumHumidity = config.minimumHumidity || 0.0;
    this.maximumHumidity = config.maximumHumidity || 100.0;
    
    // Controller state
    const state: ControllerState = {
      currentState: 'idle',
      safetyOverride: null
    };

    // Bang-bang control logic with deadband
    const calculateControl = (): { humidifier: string; dehumidifier: string; state: string; override?: string } => {
      if (state.currentHumidity === undefined || state.targetHumidity === undefined) {
        return { humidifier: 'off', dehumidifier: 'off', state: 'idle' };
      }

      const humidity = state.currentHumidity;
      const target = state.targetHumidity;
      const deadband = this.deadband;
      
      // Safety overrides take precedence
      if (humidity < this.minimumHumidity) {
        state.safetyOverride = 'min';
        state.currentState = 'humidifying';
        return { humidifier: 'on', dehumidifier: 'off', state: 'humidifying', override: 'minimum humidity' };
      }
      
      if (humidity > this.maximumHumidity) {
        state.safetyOverride = 'max';
        state.currentState = 'dehumidifying';
        return { humidifier: 'off', dehumidifier: 'on', state: 'dehumidifying', override: 'maximum humidity' };
      }
      
      // Clear safety override if we're back in normal range
      state.safetyOverride = null;
      
      // Bang-bang control with deadband
      if (humidity < target - deadband) {
        state.currentState = 'humidifying';
        return { humidifier: 'on', dehumidifier: 'off', state: 'humidifying' };
      } else if (humidity > target + deadband) {
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

    // Process control calculation and emit outputs
    const processControl = () => {
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
          state.currentHumidity = msg.payload;
          node.log(`Current humidity updated: ${msg.payload}%`);
        }
      } else {
        // Target humidity from circadian core (no specific topic or other topics)
        if (typeof msg.payload === 'number') {
          state.targetHumidity = msg.payload;
          node.log(`Target humidity updated: ${msg.payload}%`);
        }
      }
      
      // Process control if we have both values
      if (state.targetHumidity !== undefined && state.currentHumidity !== undefined) {
        processControl();
      }
      
      if (done) done();
    });

    // Initial status
    node.status({ fill: 'yellow', shape: 'dot', text: 'awaiting inputs' });
  }

  RED.nodes.registerType('humidity controller', HumidityControllerNode);
};

export = humidityController;