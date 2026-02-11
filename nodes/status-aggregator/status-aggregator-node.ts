/*
 * Freya Vivarium Control System - Status Aggregator Node
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
import { NodeAPI, NodeInitializer, Node, NodeMessageInFlow, NodeDef } from 'node-red';

interface NodeConfig extends NodeDef {

}

const StatusAggregator: NodeInitializer = (RED: NodeAPI) => {
  function StatusAggregatorNode( this: Node, config: NodeConfig ) {
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

  RED.nodes.registerType( 'status aggregator', StatusAggregatorNode );
};

export = StatusAggregator;