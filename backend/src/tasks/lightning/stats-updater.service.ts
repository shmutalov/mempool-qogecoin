import logger from "../../logger";
import DB from "../../database";
import lightningApi from "../../api/lightning/lightning-api-factory";
import channelsApi from "../../api/explorer/channels.api";

class LightningStatsUpdater {
  constructor() {}

  public async $startService() {
    logger.info('Starting Stats service');

    const now = new Date();
    const nextHourInterval = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(now.getHours() / 1) + 1, 0, 0, 0);
    const difference = nextHourInterval.getTime() - now.getTime();

    // setTimeout(() => {
      setInterval(async () => {
        await this.$runTasks();
      }, 1000 * 60 * 60);
    //}, difference);

    await this.$runTasks();
  }

  private async $runTasks() {
    await this.$populateHistoricalData();
    await this.$logLightningStatsDaily();
    await this.$logNodeStatsDaily();
  }

  private async $logNodeStatsDaily() {
    logger.info(`Running daily node stats update...`);

    const currentDate = new Date().toISOString().split('T')[0];
    try {
      const [state]: any = await DB.query(`SELECT string FROM state WHERE name = 'last_node_stats'`);
      // Only store once per day
      if (state[0].string === currentDate) {
        return;
      }

      let query = `SELECT nodes.public_key, c1.channels_count_left, c2.channels_count_right, c1.channels_capacity_left, c2.channels_capacity_right 
        FROM nodes
        LEFT JOIN (
          SELECT node1_public_key, COUNT(id) AS channels_count_left, SUM(capacity) AS channels_capacity_left
          FROM channels
          WHERE channels.status < 2
          GROUP BY node1_public_key
        ) c1 ON c1.node1_public_key = nodes.public_key
        LEFT JOIN (
          SELECT node2_public_key, COUNT(id) AS channels_count_right, SUM(capacity) AS channels_capacity_right
          FROM channels
          WHERE channels.status < 2
          GROUP BY node2_public_key
        ) c2 ON c2.node2_public_key = nodes.public_key
      `;
      const [nodes]: any = await DB.query(query);
      
      // First run we won't have any nodes yet
      if (nodes.length < 10) {
        return;
      }

      const feeBuckets = [0, 2, 4, 6, 8, 10, 20, 40, 60, 80, 100, 500, 1000, 5000, Number.MAX_SAFE_INTEGER];
      for (const node of nodes) {

        // Fee distribution / averages / median
        const [channels]: any[] = await DB.query(`SELECT
          IFNULL(node1_fee_rate, 0) as node1_fee_rate,
          IFNULL(node2_fee_rate, 0) as node2_fee_rate,
          IFNULL(node1_base_fee_mtokens, 0) AS node1_base_fee_mtokens,
          IFNULL(node2_base_fee_mtokens, 0) as node2_base_fee_mtokens,
          capacity
          FROM channels
          WHERE node1_public_key = "${node.public_key}" OR node2_public_key = "${node.public_key}" 
        `);

        const feeRateDistribution: number[] = [];
        for (let i = 0; i < feeBuckets.length - 1; ++i) {
          let capacity = 0;
          for (const channel of channels) {
            const feeRate = node.public_key === channel.node1_public_key ? channel.node1_fee_rate : channel.node2_fee_rate;
            if (feeRate >= feeBuckets[i] && feeRate < feeBuckets[i + 1]) {
              capacity += channel.capacity;
            }
          }
          feeRateDistribution.push(capacity);
        }

        let feeRates: number[] = [];
        let totalFeeRates = 0;
        let baseFees: number[] = [];
        let totalBaseFees = 0;
        const capacities: number[] = [];
        for (const channel of channels) {
          const feeRate = parseInt(node.public_key === channel.node1_public_key ? channel.node1_fee_rate : channel.node2_fee_rate, 10);
          feeRates.push(feeRate);
          totalFeeRates += feeRate;
          const baseFee = parseInt(node.public_key === channel.node1_public_key ? channel.node1_base_fee_mtokens : channel.node2_base_fee_mtokens, 10);
          baseFees.push(baseFee);
          totalBaseFees += baseFee;
          capacities.push(channel.capacity);
        }

        const avgFeeRate = totalFeeRates / feeRates.length;
        const avgBaseFee = totalBaseFees / baseFees.length;

        feeRates.sort((a, b) => a - b);
        baseFees.sort((a, b) => a - b);
        const medFeeRate = feeRates[Math.floor(feeRates.length / 2)];
        const medBaseFee = baseFees[Math.floor(baseFees.length / 2)];

        capacities.sort((a, b) => a - b);
        const medianCapacity = capacities[Math.floor(capacities.length / 2)];
        const capacity = (parseInt(node.channels_capacity_left || 0, 10)) + (parseInt(node.channels_capacity_right || 0, 10));
        const channelsCount = node.channels_count_left + node.channels_count_right

        // Save stats into db
        await DB.query(
          `INSERT INTO node_stats(
            public_key, added, capacity, channels,
            avg_fee_rate, avg_base_fee_mtokens, med_capacity, med_fee_rate,
            med_base_fee_mtokens, fee_rate_distribution)
          VALUES (
            ?, NOW(), ?, ?,
            ?, ?, ?, ?,
            ?, ?)`,
          [node.public_key, capacity, channelsCount,
            avgFeeRate, avgBaseFee, medianCapacity, medFeeRate,
            medBaseFee, JSON.stringify(feeRateDistribution)]);
      }

      await DB.query(`UPDATE state SET string = ? WHERE name = 'last_node_stats'`, [currentDate]);
      logger.info('Daily node stats has updated.');
    } catch (e) {
      logger.err('$logNodeStatsDaily() error: ' + (e instanceof Error ? e.message : e));
    }
  }

  // We only run this on first launch
  private async $populateHistoricalData() {
    logger.info(`Running historical stats population...`);

    const startTime = '2018-01-13';
    try {
      const [rows]: any = await DB.query(`SELECT COUNT(*) FROM lightning_stats`);
      // Only store once per day
      if (rows[0]['COUNT(*)'] > 0) {
        return;
      }
      const [channels]: any = await DB.query(`SELECT capacity, created, closing_date FROM channels ORDER BY created ASC`);

      let date: Date = new Date(startTime);
      const currentDate = new Date();

      while (date < currentDate) {
        let totalCapacity = 0;
        let channelsCount = 0;
        for (const channel of channels) {
          if (new Date(channel.created) > date) {
            break;
          }
          if (channel.closing_date !== null && new Date(channel.closing_date) < date) {
            continue;
          }
          totalCapacity += channel.capacity;
          channelsCount++;
        }

        const query = `INSERT INTO lightning_stats(
          added,
          channel_count,
          node_count,
          total_capacity
        )
        VALUES (FROM_UNIXTIME(?), ?, ?, ?)`;

      await DB.query(query, [
        date.getTime() / 1000,
        channelsCount,
        0,
        totalCapacity,
      ]);

        // Add one day and continue
        date.setDate(date.getDate() + 1);
      }

      const [nodes]: any = await DB.query(`SELECT first_seen FROM nodes ORDER BY first_seen ASC`);
      date = new Date(startTime);

      while (date < currentDate) {
        let nodeCount = 0;
        for (const node of nodes) {
          if (new Date(node.first_seen) > date) {
            break;
          }
          nodeCount++;
        }

        const query = `UPDATE lightning_stats SET node_count = ? WHERE added = FROM_UNIXTIME(?)`;

        await DB.query(query, [
          nodeCount,
          date.getTime() / 1000,
        ]);

        // Add one day and continue
        date.setDate(date.getDate() + 1);
      }

      logger.info('Historical stats populated.');
    } catch (e) {
      logger.err('$populateHistoricalData() error: ' + (e instanceof Error ? e.message : e));
    }
  }

  private async $logLightningStatsDaily() {
    logger.info(`Running lightning daily stats log...`);

    const currentDate = new Date().toISOString().split('T')[0];
    try {
      const [state]: any = await DB.query(`SELECT string FROM state WHERE name = 'last_node_stats'`);
      // Only store once per day
      if (state[0].string === currentDate) {
        return;
      }

      const networkGraph = await lightningApi.$getNetworkGraph();
      let total_capacity = 0;
      for (const channel of networkGraph.channels) {
        if (channel.capacity) {
          total_capacity += channel.capacity;
        }
      }

      const query = `INSERT INTO lightning_stats(
          added,
          channel_count,
          node_count,
          total_capacity
        )
        VALUES (NOW(), ?, ?, ?)`;

      await DB.query(query, [
        networkGraph.channels.length,
        networkGraph.nodes.length,
        total_capacity,
      ]);
      logger.info(`Lightning daily stats done.`);
    } catch (e) {
      logger.err('$logLightningStatsDaily() error: ' + (e instanceof Error ? e.message : e));
    }
  }
}

export default new LightningStatsUpdater();
