import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';
import { ActuatorsDriver } from './system-actuators';

interface NodeConfig extends NodeDef {

}

const systemActuators: NodeInitializer = (RED: NodeAPI) => {
  function SystemActuatorsNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

    const actuatorsDriver = new ActuatorsDriver();

    // On status events from the driver
    actuatorsDriver.on('status',(status:any)=>{
        switch (status.level){
            case 'ok':      node.status({ fill: 'green', shape: 'dot', text: status.message });
                            break;
            case 'warning': node.status({ fill: 'yellow', shape: 'dot', text: status.message });
                            break;
            default:        node.status({ fill: 'red', shape: 'dot', text: status.message });
                            break;
        }
        
    })


  node.on('input', async (msg: NodeMessageInFlow, send: (msg: any) => void, done: (err?: Error) => void) => {
    try {
      if (msg.topic === 'set' && msg.payload != null && typeof msg.payload === 'object') {
        const { channel, state } = msg.payload as { channel?: number; state?: boolean };
        if (typeof channel === 'number' && typeof state === 'boolean') {
          actuatorsDriver.setDigitalOutput(channel, state)
              .then((res)=>{
                if(res) node.status({ fill: 'green', shape: 'dot', text: `D${channel} turned ${state ? 'on' : 'off'}` });
                else node.status({ fill: 'yellow', shape: 'dot', text: 'Invalid request' });
              })
              .catch((err)=>{
                  node.status({ fill: 'yellow', shape: 'dot', text: err });
              });
        }
      }
    } catch (err) {
      node.status({ fill: 'red', shape: 'dot', text: "Failed to set output" });
      done(err as Error);
      return;
    }
    done();
    });
  }

  RED.nodes.registerType( 'system actuators', SystemActuatorsNode );
};

export = systemActuators;