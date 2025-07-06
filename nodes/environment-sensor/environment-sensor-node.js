module.exports = function(RED) {
  function EnvironmentSensorNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.status({ fill:"green", shape:"dot", text:"Connected" });
    node.on('input', async function(msg) {
      node.send(msg);
    });
  }

  RED.nodes.registerType("environment sensor", EnvironmentSensorNode);
}