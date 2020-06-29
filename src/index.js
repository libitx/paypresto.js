import {
  Address,
  Bn,
  KeyPair,
  OpCode,
  PrivKey,
  Script,
  TxBuilder,
  TxOut,
  VarInt
} from 'bsv'
import energy from 'energy'
import api from './api'
import embed from './ui/embed'


// Constants
const DUST_LIMIT = 546;
const HTTP_ORIGIN = process.env.API_HOST === undefined ?
  'https://www.paypresto.co' :
  process.env.API_HOST;

// Default miner rates
const minerRates = {
  data: 0.5,
  standard: 0.5
}

// Presto default options
const defaults = {
  inputs: [],
  outputs: [],
  rates: minerRates,
  debug: false
}


/**
 * Presto class
 * Create invoices on the PayPresto platform with custom built transactions.
 */
class Presto {
  /**
   * Builds a Presto payment instance.
   * @param {Object} options Payment options
   * @constructor
   */
  constructor(options = {}) {
    // Build options
    this.options = {
      ...defaults,
      ...options
    }

    // Set keyPair
    if (this.options.key && this.options.key.constructor.name === 'PrivKey') {
      this.privKey = this.options.key
    } else if (typeof this.options.key === 'string') {
      this.privKey = PrivKey.fromWif(this.options.key)
    }

    // Validate private key
    if (!this.privKey || this.privKey.constructor.name !== 'PrivKey') {
      throw new Error('Must initiate Presto with valid private key')
    } else {
      this.privKey.validate()
    }

    // Setup
    this.$events = energy()
    this.invoice = null
    this.token = null

    // Build the tx
    this.builder = new TxBuilder()
    this.builder.sendDustChangeToFees(true)
    this.builder.setChangeAddress(
      this.options.changeAddress ?
      new Address().fromString(this.options.changeAddress) :
      this.address
    )
    this.addOutput(this.options.outputs)
    this.addInput(this.options.inputs)

    debug.call(this, 'Presto', this.address, {
      inputs: this.inputs,
      outputs: this.outputs
    })
  }

  /**
   * Builds a Presto payment instance with the given options and creates a new
   * PayPresto invoice.
   * @param {Object} options Payment options
   * @returns {Presto}
   */
  static create(options) {
    const payment = new this(options)
    return payment.createInvoice()
  }

  /**
   * Builds a Presto payment instance with the given options and loads an
   * existing PayPresto invoice.
   * @param {String} invoiceId Invoice ID
   * @param {Object} options Payment options
   * @returns {Presto}
   */
  static load(invoiceId, options) {
    const payment = new this(options)
    return payment.loadInvoice(invoiceId)
  }

  /**
   * Returns the payment funding address.
   * @type {Address}
   */
  get address() {
    return Address.fromPrivKey(this.privKey)
  }

  /**
   * Returns the total amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get amount() {
    const value = this.builder.txOuts
      .reduce((acc, o) => acc.add(o.valueBn), Bn(0))
      .add(estimateFee(this.builder, this.options.rates))
      .toNumber()
    return Math.max(value, DUST_LIMIT + 1)
  }

  /**
   * Returns the remaining amount of sotoshis required to fund the transaction.
   * @type {Number}
   */
  get remainingAmount() {
    const value = this.builder.txIns
      .map(i => this.builder.uTxOutMap.get(i.txHashBuf, i.txOutNum))
      .reduce((acc, o) => acc.add(o.valueBn), Bn(0))
      .toNumber()
    return Math.max(this.amount - value, 0)
  }

  /**
   * Returns the payment funding script as a hex encoded string.
   * @type {String}
   */
  get script() {
    // TODO - support additional script types
    return this.address.toTxOutScript().toHex()
  }

  /**
   * Adds the given input attributes to the payment.
   * @param {Object} input UTXO input attributes
   * @returns {Presto}
   */
  addInput(input) {
    if (Array.isArray(input)) {
      return input.forEach(i => this.addInput(i));
    } else if (isValidInput(input)) {
      this.builder.inputFromPubKeyHash(
        Buffer.from(input.txid, 'hex').reverse(),
        Number.isInteger(input.vout) ? input.vout : input.outputIndex,
        TxOut.fromProperties(
          satoshisToBn(input),
          Script.fromHex(input.script)
        )
      )
    } else {
      throw new Error('Invalid TxIn params')
    }

    if (this.remainingAmount <= 0) {
      this.$events.emit('funded', this)
    }
    return this
  }

  /**
   * Adds the given output attributes to the payment.
   * @param {Object} output transaction output attributes
   * @returns {Presto}
   */
  addOutput(output) {
    if (Array.isArray(output)) {
      return output.forEach(o => this.addOutput(o));
    } else if (output.constructor.name === 'TxOut') {
      this.builder.txOuts.push(output)
    } else if (output.script) {
      this.builder.outputToScript(
        satoshisToBn(output),
        Script.fromHex(output.script)
      )
    } else if (output.data) {
      this.builder.outputToScript(
        satoshisToBn(output),
        dataToScript(output.data)
      )
    } else if (output.to) {
      this.builder.outputToAddress(
        satoshisToBn(output),
        new Address().fromString(output.to)
      )
    } else {
      throw new Error('Invalid TxOut params')
    }
    return this
  }

  /**
   * Creates a PayPresto invoice and attaches the invoice object to the payment.
   * @emits Presto#invoice
   * @returns {Presto}
   */
  createInvoice() {
    const invoice = {
      satoshis: this.remainingAmount,
      script: this.script,
      description: this.options.description
    }
    debug.call(this, 'Creating invoice', invoice)

    api.post('/invoices', { invoice })
      .then(({ data }) => {
        debug.call(this, 'Created invoice', data)
        this.invoice = data
        this.$events.emit('invoice', this.invoice)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })
    
    return this
  }

  /**
   * Loads a PayPresto invoice and attaches the invoice object to the payment.
   * @param {String} invoiceId Invoice ID 
   * @emits Presto#invoice
   * @returns {Presto}
   */
  loadInvoice(invoiceId) {
    debug.call(this, 'Loading invoice', invoiceId)

    api.get(`/invoices/${ invoiceId }`)
      .then(({ data }) => {
        debug.call(this, 'Loaded invoice', data)
        this.invoice = data
        this.$events.emit('invoice', this.invoice)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })

    return this
  }

  /**
   * Gets the signed raw transaction and pushes it to miners, via the mount
   * point window.
   * @returns {Presto}
   */
  pushTx() {
    const rawtx = this.getSignedTx()
    debug.call(this, 'Pushing tx', this.builder.tx.id)
    this.postMessage('tx.push', { rawtx })
    return this
  }

  /**
   * Builds and signs the tx, returning the rawtx hex string.
   * @returns {String}
   */
  getSignedTx() {
    if (this.remainingAmount > 0) {
      throw new Error('Insufficient inputs')
    }

    const keyPair = KeyPair.fromPrivKey(this.privKey)
    this.builder
      .build({ useAllInputs: true })
      .signWithKeyPairs([keyPair])
    
    return this.builder.tx.toHex()
  }

  /**
   * Mounts the payment in the given mount point. The mount point must be a class
   * insctance that responds to the `mount()` function.
   * @param {Embed} point mount point
   * @returns {Presto}
   */
  mount(point) {
    window.addEventListener('message', event => {
      if (event.origin === HTTP_ORIGIN && !!event.data.payload) {
        this.handleMessage(event.data)
      }
    }, false)

    point.mount(this)
      .then(ui => {
        debug.call(this, 'Proxypay mounted', ui)
        this.$ui = ui
        this.postMessage('handshake')
        this.postMessage('configure', this.$ui.options)
      })
      .catch(err => {
        this.$events.emit('error', err)
      })

    return this
  }

  /**
   * Posts a message to the mount point window.
   * @param {String} event Event name
   * @param {any} payload Event payload
   */
  postMessage(event, payload) {
    if (!this.$ui) return;
    this.$ui.$iframe.contentWindow.postMessage({
      event,
      payload
    }, HTTP_ORIGIN)
  }

  /**
   * Handles incoming messages from the mount point
   * @param {Object} message Event message object
   */
  handleMessage({event, payload}) {
    debug.call(this, 'Iframe msg', event, payload)
    switch(event) {
      case 'invoice.status':
        this.addInput(payload.utxos)
        break;
      case 'tx.success':
        this.$events.emit('success', payload.txid)
        break;
      case 'tx.failure':
        this.$events.emit('error', payload.resultDescription || payload.error || payload)
        break;
      case 'tx.error':
        this.$events.emit('error', payload.error || payload)
        break;
      case 'resize':
        this.$ui.$iframe.style.height = payload.height + 'px'
        break
    }
  }

  /**
   * Add an event listener for the specified event.
   * @param {String} event Event name
   * @param {Function} callback Event listener
   * @returns {Presto}
   */
  on(event, callback) {
    this.$events.on(event, callback)
    return this
  }

  /**
   * Add a one-time event listener for the specified event.
   * @param {String} event Event name
   * @param {Function} callback Event listener
   * @returns {Presto}
   */
  once(event, callback) {
    this.$events.once(event, callback)
    return this
  }
}


// Converts the given array of data chunks into a OP_RETURN output script
function dataToScript(data) {
  const script = new Script()
  script.writeOpCode(OpCode.OP_FALSE)
  script.writeOpCode(OpCode.OP_RETURN)
  data.forEach(item => {
    // Hex string
    if (typeof item === 'string' && /^0x/i.test(item)) {
      script.writeBuffer(Buffer.from(item.slice(2), 'hex'))
    // Opcode number
    } else if (typeof item === 'number' || item === null) {
      script.writeOpCode(Number.isInteger(item) ? item : 0)
    // Opcode
    } else if (typeof item === 'object' && item.hasOwnProperty('op')) {
      script.writeOpCode(item.op)
    // All else
    } else {
      script.writeBuffer(Buffer.from(item))
    }
  })
  return script
}


// Returns satoshis or amount on object as bignum
function satoshisToBn(data) {
  const val = Number.isInteger(data.satoshis) ? data.satoshis : data.amount;
  return Bn(val)
}


// Returns true if the given parameters are a valid input UTXO
function isValidInput(data) {
  return ['txid', 'script'].every(k => Object.keys(data).includes(k)) &&
    ['vout', 'outputIndex'].some(k => Object.keys(data).includes(k)) &&
    ['satoshis', 'amount'].some(k => Object.keys(data).includes(k))
}


// Estimate the fee for the given tx builder
// Uses technique used in minercraft and manic
function estimateFee(builder, rates = minerRates) {
  const parts = [
    {standard: 4}, // version
    {standard: 4}, // locktime
    {standard: VarInt.fromNumber(builder.txIns.length).buf.length},
    {standard: VarInt.fromNumber(builder.txOuts.length).buf.length},
    // bsv2 fee calc always assumes the output script is used so adds 34 bytes
    // this is a bug really, but requres a change with bsv2 before can be removed here
    // TODO - watch bsv2 to see if this changes. create PR if needed
    {standard: 34} 
  ]

  if (builder.txIns.length > 0) {
    builder.txIns.forEach(i => {
      if (i.script.isPubKeyHashIn()) {
        parts.push({standard: 148})
      } else {
        // TODO - implement fee calculation for other scripts
        console.warn('Curently unable to calculate fee for custom input script')
      }
    })
  } else {
    parts.push({standard: 148})
  }

  builder.txOuts.forEach(o => {
    const p = {}
    const type = o.script.chunks[0].opCodeNum === 0 && o.script.chunks[1].opCodeNum === 106 ? 'data' : 'standard';
    p[type] = 8 + o.scriptVi.buf.length + o.scriptVi.toNumber()
    parts.push(p)
  })
  
  const fee = parts.reduce((fee, p) => {
    return Object
      .keys(p)
      .reduce((acc, k) => {
        const bytes = p[k],
              rate = rates[k];
        return acc + Math.ceil(bytes * rate)
      }, fee)
  }, 0)

  return Bn(fee)
}


// Log the given arguments if debug mode enabled
function debug(...args) {
  if (this.options.debug) {
    console.log(...args)
  }
}


export { Presto, embed }