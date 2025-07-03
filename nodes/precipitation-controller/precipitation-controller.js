module.exports = function(RED) {
  function TemperatureControllerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.status({ fill:"green", shape:"dot", text:"running" });
    node.on('input', async function(msg) {
      node.send(msg);
    });
  }

  RED.nodes.registerType("temperature controller", TemperatureControllerNode);
}