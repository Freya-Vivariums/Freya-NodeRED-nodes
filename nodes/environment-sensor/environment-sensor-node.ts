import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface NodeConfig extends NodeDef {

}

const environmentSensor: NodeInitializer = (RED: NodeAPI) => {
  function EnvironmentSensorNode( this: Node, config: NodeConfig ) {
    RED.nodes.createNode(this, config);
    const node = this;

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