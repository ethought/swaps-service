const EventEmitter = require('events');

const blockListener = require('./block_listener');
const detectSwaps = require('./detect_swaps');
const mempoolListener = require('./mempool_listener');

/** The swap output scanner is an event emitter for swap outputs

  When instantiated the scanner will start looking for relevant swap outputs.

  Notifications:
  - Claim transaction has entered the mempool, has confirmed
  - Funding transaction has entered the mempool, has confirmed
  - Refund transaction has entered the mempool, has confirmed

  The scanner is non-authoritative, since it uses an expiring cache backend it
  may miss some events.

  {
    cache: <Cache Type String>
    network: <Network Name String>
  }

  @throws
  <Error> when scanner instantiation fails

  @returns
  <Swap Output EventEmitter Object>

  // Notification that a claim transaction is seen for a swap
  @event 'claim'
  {
    id: <Transaction Id String>
    network: <Network Name String>
    outpoint: <Outpoint String>
    preimage: <Preimage Hex String>
    script: <Redeem Script Hex String>
    type: <Type String> // 'claim'
  }

  // Notification that an error was encountered by the scanner
  @event 'error'
  <Error>

  // Notification that a funding transaction is seen for a swap
  @event 'funding'
  {
    id: <Transaction Id String>
    index: <HD Seed Key Index Number>
    invoice: <BOLT 11 Invoice String>
    network: <Network Name String>
    output: <Output Script Hex String>
    script: <Redeem Script Hex String>
    tokens: <Token Count Number>
    type: <Type String> // 'funding'
    vout: <Output Index Number>
  }

  // Notification that a refund transaction is seen for a swap
  @event 'refund'
  {
    id: <Transaction Id String>
    network: <Network Name String>
    outpoint: <Spent Outpoint String>
    script: <Redeem Script Hex String>
    type: <Type String> 'refund'
  }
*/
module.exports = ({cache, network}) => {
  if (!cache) {
    throw new Error('ExpectedCacheTypeForScanCaching');
  }

  if (!network) {
    throw new Error('ExpectedNetworkName');
  }

  const listeners = [
    blockListener({cache, network}),
    mempoolListener({network}),
  ];

  const scanner = new EventEmitter();

  // Both block listeners and mempool listeners emit transaction ids when they
  // detect new transactions.
  listeners.forEach(listener => {
    listener.on('error', err => scanner.emit('error', err));

    listener.on('transaction', id => {
      return detectSwaps({cache, id, network}, (err, detected) => {
        if (!!err) {
          return scanner.emit('error', err);
        }

        // Notify on all found swaps
        return detected.swaps.forEach(swap => {
          switch (swap.type) {
          case 'claim':
            scanner.emit(swap.type, {
              id,
              network,
              index: swap.index,
              outpoint: swap.outpoint,
              preimage: swap.preimage,
              script: swap.script,
              type: swap.type,
            });
            break;

          case 'funding':
            scanner.emit(swap.type, {
              id,
              network,
              index: swap.index,
              invoice: swap.invoice,
              output: swap.output,
              script: swap.script,
              tokens: swap.tokens,
              type: swap.type,
              vout: swap.vout
            });
            break;

          case 'refund':
            scanner.emit(swap.type, {
              id,
              network,
              index: swap.index,
              outpoint: swap.outpoint,
              script: swap.script,
              type: swap.type,
            });
            break;

          default:
            scanner.emit('error', [500, 'UnknownSwapType']);
            break;
          }
        });
      });
    });

    return;
  });

  return scanner;
};

