import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';
import { SensorDriver } from './environment-sensor';

interface NodeConfig extends NodeDef {
  name: string;
  variable: string;
  sampleinterval: string;
}

const environmentSensor: NodeInitializer = (RED: NodeAPI) => {
  function EnvironmentSensorNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

    const variable = config.variable;
    const sampleinterval = parseFloat(config.sampleinterval);

    const sensorDriver = new SensorDriver();

    // On status events from the driver
    sensorDriver.on('status',(status:any)=>{
        switch (status.level){
            case 'ok':      node.status({ fill: 'green', shape: 'dot', text: status.message });
                            break;
            case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: status.message });
                            break;
            default:        node.status({ fill: 'red', shape: 'dot', text: status.message });
                            break;
        }
    })

    sensorDriver.on('measurement', (measurement:any)=>{
      //if(measurement[variable] || variable === null){
        this.send(measurement);
      //}
    });

    // indicate running status in the editor
    node.status({ fill: 'green', shape: 'dot', text: 'running' });

    node.on( 'input', async ( msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void ) => {
        send(msg);
        done?.();
      }
    );
  }

  RED.nodes.registerType('environment sensor', EnvironmentSensorNode);
};

export = environmentSensor;