module.exports = function(RED) {
  function HumidityControllerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on('input', async function(msg) {
      node.send(msg);
    });
  }

  RED.nodes.registerType("humidity controller", HumidityControllerNode);
}