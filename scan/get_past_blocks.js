const asyncAuto = require('async/auto');
const asyncWhilst = require('async/whilst');

const {getBlock} = require('./../chain');
const {getJsonFromCache} = require('./../cache');
const {setJsonInCache} = require('./../cache');
const {returnResult} = require('./../async-util');

const blockExpirationMs = 1000 * 60 * 60 * 3;
const fetchBlocksCount = 10;

/** Get past blocks

  {
    cache: <Cache Type String> 'dynamodb|memory|redis'
    current: <Current Block Hash Hex String>
    network: <Network Name String>
  }

  @returns via cbk
  {
    blocks: [{
      [previous_block_hash]: <Block Hash Hex String>
      transaction_ids: [<Transaction Id Hex String>]
    }]
  }
*/
module.exports = ({cache, current, network}, cbk) => {
  if (!cache) {
    return cbk([400, 'ExpectedCacheToCheckAgainst']);
  }

  if (!current) {
    return cbk([400, 'ExpectedCurrentBlockHash']);
  }

  if (!network) {
    return cbk([400, 'ExpectedNetworkName']);
  }

  const blocks = [];
  let cursor = current;

  return asyncWhilst(
    () => blocks.length < fetchBlocksCount && cursor,
    cbk => {
      return asyncAuto({
        // See if we have a cached block
        getCachedBlock: cbk => {
          return getJsonFromCache({cache, key: cursor, type: 'block'}, cbk);
        },

        // Get the block
        getBlock: ['getCachedBlock', ({getCachedBlock}, cbk) => {
          if (!!getCachedBlock) {
            return cbk(null, {
              is_cached: true,
              previous_block_hash: getCachedBlock.previous_block_hash,
              transaction_ids: getCachedBlock.transaction_ids,
            });
          }

          return getBlock({network, id: cursor}, cbk);
        }],

        // Add the block to the cache
        setCachedBlock: ['getBlock', ({getBlock}, cbk) => {
          if (!!getBlock.is_cached) {
            return cbk();
          }

          return setJsonInCache({
            cache,
            key: cursor,
            ms: blockExpirationMs,
            type: 'block',
            value: {
              previous_block_hash: getBlock.previous_block_hash,
              transaction_ids: getBlock.transaction_ids,
            },
          },
          cbk);
        }],

        // Final blocks result
        blocks: ['getBlock', ({getBlock}, cbk) => {
          cursor = getBlock.previous_block_hash;

          blocks.push(getBlock);

          return cbk(null, {blocks});
        }],
      },
      returnResult({of: 'blocks'}, cbk));
    },
    cbk
  );
};

