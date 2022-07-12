import logger from '../../logger';
import DB from '../../database';

class NodesApi {
  public async $getNode(public_key: string): Promise<any> {
    try {
      const query = `SELECT nodes.*, (SELECT COUNT(*) FROM channels WHERE channels.status < 2 AND (channels.node1_public_key = ? OR channels.node2_public_key = ?)) AS channel_count, (SELECT SUM(capacity) FROM channels WHERE channels.status < 2 AND (channels.node1_public_key = ? OR channels.node2_public_key = ?)) AS capacity, (SELECT AVG(capacity) FROM channels WHERE status < 2 AND (node1_public_key = ? OR node2_public_key = ?)) AS channels_capacity_avg FROM nodes WHERE public_key = ?`;
      const [rows]: any = await DB.query(query, [public_key, public_key, public_key, public_key, public_key, public_key, public_key]);
      return rows[0];
    } catch (e) {
      logger.err('$getNode error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $getAllNodes(): Promise<any> {
    try {
      const query = `SELECT * FROM nodes`;
      const [rows]: any = await DB.query(query);
      return rows;
    } catch (e) {
      logger.err('$getAllNodes error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $getNodeStats(public_key: string): Promise<any> {
    try {
      const query = `SELECT UNIX_TIMESTAMP(added) AS added, capacity, channels FROM node_stats WHERE public_key = ? ORDER BY added DESC`;
      const [rows]: any = await DB.query(query, [public_key]);
      return rows;
    } catch (e) {
      logger.err('$getNodeStats error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $getTopCapacityNodes(): Promise<any> {
    try {
      const query = `SELECT nodes.*, node_stats.capacity, node_stats.channels FROM nodes LEFT JOIN node_stats ON node_stats.public_key = nodes.public_key ORDER BY node_stats.added DESC, node_stats.capacity DESC LIMIT 10`;
      const [rows]: any = await DB.query(query);
      return rows;
    } catch (e) {
      logger.err('$getTopCapacityNodes error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $getTopChannelsNodes(): Promise<any> {
    try {
      const query = `SELECT nodes.*, node_stats.capacity, node_stats.channels FROM nodes LEFT JOIN node_stats ON node_stats.public_key = nodes.public_key ORDER BY node_stats.added DESC, node_stats.channels DESC LIMIT 10`;
      const [rows]: any = await DB.query(query);
      return rows;
    } catch (e) {
      logger.err('$getTopChannelsNodes error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $searchNodeByPublicKeyOrAlias(search: string) {
    try {
      const searchStripped = search.replace('%', '') + '%';
      const query = `SELECT nodes.public_key, nodes.alias, node_stats.capacity FROM nodes LEFT JOIN node_stats ON node_stats.public_key = nodes.public_key WHERE nodes.public_key LIKE ? OR nodes.alias LIKE ? GROUP BY nodes.public_key ORDER BY node_stats.capacity DESC LIMIT 10`;
      const [rows]: any = await DB.query(query, [searchStripped, searchStripped]);
      return rows;
    } catch (e) {
      logger.err('$searchNodeByPublicKeyOrAlias error: ' + (e instanceof Error ? e.message : e));
      throw e;
    }
  }

  public async $getConnectedNodesForPublicKey(publicKey: string) {
    try {
      // Get outbound nodes connection
      let query = `SELECT DISTINCT longitude, latitude, nodes.public_key, nodes.alias
        FROM channels
        JOIN nodes ON nodes.public_key = node2_public_key
        WHERE node1_public_key = ?
        AND nodes.longitude IS NOT NULL
      `;
      const [outbound]: any = await DB.query(query, [publicKey]);

      // Get inbound nodes connection
      query = `SELECT DISTINCT longitude, latitude, nodes.public_key, nodes.alias
        FROM channels
        JOIN nodes ON nodes.public_key = node1_public_key
        WHERE node2_public_key = ?
        AND nodes.longitude IS NOT NULL
      `;
      const [inbound]: any = await DB.query(query, [publicKey]);

      return {
        outbound: outbound.map((node) => [node.public_key, node.alias, node.longitude, node.latitude]),
        inbound: inbound.map((node) => [node.public_key, node.alias, node.longitude, node.latitude]),
      };
    } catch (e) {
      logger.err(`Cannot get connected nodes list for public key ${publicKey}. Reason: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }
}

export default new NodesApi();
