import { assert } from 'chai'
import nock from 'nock'
import bsv from 'bsv'
import { Presto } from '../src/index'
import { Forge, Cast } from 'txforge'
import { P2PKH, P2RPH } from 'txforge/casts'

let key, wif;
before(() => {
  wif = 'L3ucptoJ7YdYMh4JRFGWF75Nknx95Aw1KBaXWCvFcMj6swJkYvgu'
  key = bsv.PrivKey.fromWif(wif)
})


describe('new Presto()', () => {
  it('initiates with a WIF key', () => {
    const pay = new Presto({ key: wif })
    assert.deepEqual(pay.privKey, key)
  })

  it('initiates with an existing key', () => {
    const pay = new Presto({ key })
    assert.deepEqual(pay.privKey, key)
  })

  it('initiates without any key in simple mode', () => {
    const pay = new Presto({
      outputs: [
        {to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 50000}
      ]
    })
    assert.equal(pay.mode, 'simple')
  })

  it('throws error without any key in proxypay mode', () => {
    assert.throws(_ => {
      new Presto({ outputs: [{data: ['0xeeefef', 'foo', 'bar']}] })
    }, 'Must initiate Presto with P2PKH outputs only in `simple` mode')
  })

  it('throws error with invalid key', () => {
    assert.throws(_ => {
      new Presto({key: 'NOTAKEY'})
    }, 'Must initiate Presto with valid private key in `proxypay` mode')
  })

  it('creates payment with outputs', () => {
    const pay = new Presto({
      key,
      outputs: [
        {to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 50000},
        {data: ['0xeeefef', 'foo', 'bar']}
      ]
    })
    assert.lengthOf(pay.forge.outputs, 2)
    assert.equal(pay.forge.outputs[0].satoshis, 50000)
    assert.isTrue(pay.forge.outputs[0].getScript().isPubKeyHashOut())
    assert.equal(pay.forge.outputs[1].satoshis, 0)
    assert.isTrue(pay.forge.outputs[1].getScript().chunks[0].opCodeNum === bsv.OpCode.OP_FALSE)
    assert.isTrue(pay.forge.outputs[1].getScript().chunks[1].opCodeNum === bsv.OpCode.OP_RETURN)
  })

  it('creates payment with inputs', () => {
    const pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 15399,
        script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
      }]
    })
    assert.lengthOf(pay.forge.inputs, 1)
    assert.equal(pay.forge.inputs[0].txid, '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12')
  })

  it('creates payment with existing forge instance', () => {
    const forge = new Forge({
      outputs: [{data: ['foo', 'bar']}]
    })
    const pay = new Presto({ key, forge })
    assert.lengthOf(pay.forge.outputs, 1)
    assert.isTrue(pay.forge.outputs[0].getScript().chunks[0].opCodeNum === bsv.OpCode.OP_FALSE)
    assert.isTrue(pay.forge.outputs[0].getScript().chunks[1].opCodeNum === bsv.OpCode.OP_RETURN)
  })
})


describe('Presto.create()', () => {
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .post('/api/invoices')
      .twice()
      .replyWithFile(200, 'test/mocks/create-invoice.json', {
        'Content-Type': 'application/json'
      })
  })

  it('inits invoice and emits the invoice event', done => {
    const pay = Presto.create({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
    assert.instanceOf(pay, Presto)
    pay.on('invoice', invoice => {
      assert.equal(invoice.id, 'test01')
      done()
    })
  })
})


describe('Presto.load()', () => {
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .get('/api/invoices/test01')
      .once()
      .replyWithFile(200, 'test/mocks/create-invoice.json', {
        'Content-Type': 'application/json'
      })
  })

  it('inits invoice and emits the invoice event', done => {
    const pay = Presto.load('test01', {
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
    assert.instanceOf(pay, Presto)
    pay.on('invoice', invoice => {
      assert.equal(invoice.id, 'test01')
      done()
    })
  })
})


describe('Presto#addInput()', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({ key })
  })

  it('adds cast instance input', () => {
    const cast = Cast.unlockingScript(P2PKH, {
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 15399,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    pay.addInput(cast)
    assert.lengthOf(pay.forge.inputs, 1)
  })

  it('adds valid UTXO params to the payment', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 15399,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.lengthOf(pay.forge.inputs, 1)
  })

  it('throws error with invalid params', () => {
    assert.throws(_ => pay.addInput({}), "Cast type 'unlockingScript' requires 'txid' param")
  })
})


describe('Presto#addOutput()', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({ key })
  })

  it('adds cast instance output', () => {
    const cast = Cast.lockingScript(P2PKH, {
      address: bsv.Address.fromString('1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq'),
      satoshis: 50000
    })
    pay.addOutput(cast)
    assert.lengthOf(pay.forge.outputs, 1)
  })

  it('adds output script params to the payment', () => {
    pay.addOutput({
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac',
      satoshis: 15399
    })
    assert.lengthOf(pay.forge.outputs, 1)
  })

  it('adds output data params to the payment', () => {
    pay.addOutput({
      data: ['0xeeefef', 'foo', 'bar']
    })
    assert.lengthOf(pay.forge.outputs, 1)
  })

  it('adds output p2pkh params to the payment', () => {
    pay.addOutput({
      to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq',
      satoshis: 50000
    })
    assert.lengthOf(pay.forge.outputs, 1)
  })

  it('throws error with invalid params', () => {
    assert.throws(_ => pay.addOutput({}), 'Invalid TxOut params')
  })
})


describe('Presto#address', () => {
  it('returns the public address of the configured key', () => {
    const pay = new Presto({ key })
    assert.equal(pay.address, '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq')
  })
})


describe('Presto#keyPair', () => {
  it('returns the KeyPair of the configured key', () => {
    const pay = new Presto({ key })
    assert.equal(pay.keyPair.privKey, key)
  })
})


describe('Presto#amount', () => {
  it('calculates accurate fee when no inputs have been added', () => {
    const pay = new Presto({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
    assert.equal(pay.amount, 1096)
  })

  it('calculates accurate fee when input has been added', () => {
    const pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 15399,
        script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
      }],
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
    assert.equal(pay.amount, 1096)
  })
})


describe('Presto#amountDue', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('defaults to same as #amount', () => {
    assert.equal(pay.amountDue, 1096)
  })

  it('calculates remaining unfunded satoshis', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 600,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.equal(pay.amountDue, 496)
  })

  it('returns zero if tx funded', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 2000,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.equal(pay.amountDue, 0)
  })

  it('emits the ready event when sufficient inputs added', done => {
    pay.on('funded', pay => {
      assert.equal(pay.amountDue, 0)
      done()
    })
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 2000,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
  })
})


describe('Presto#script', () => {
  it('returns p2p funding script for invoice', () => {
    const pay = new Presto({ key })
    assert.equal(pay.script, '76a91485b55443c7d5b7cd69813136ce428ad861aeb87088ac')
  })
})


describe('Presto#createInvoice()', () => {
  let pay;
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .post('/api/invoices')
      .once()
      .replyWithFile(200, 'test/mocks/create-invoice.json', {
        'Content-Type': 'application/json'
      })

    pay = new Presto({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('emits the invoice event and attaches the inoice to the payment', done => {
    pay.on('invoice', invoice => {
      assert.isObject(pay.invoice)
      assert.equal(pay.invoice.id, 'test01')
      assert.equal(invoice.id, 'test01')
      done()
    })
    pay.createInvoice()
  })
})


describe('Presto#loadInvoice()', () => {
  let pay;
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .get('/api/invoices/test01')
      .once()
      .replyWithFile(200, 'test/mocks/create-invoice.json', {
        'Content-Type': 'application/json'
      })

    pay = new Presto({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('emits the invoice event and attaches the inoice to the payment', done => {
    pay.on('invoice', invoice => {
      assert.isObject(pay.invoice)
      assert.equal(pay.invoice.id, 'test01')
      assert.equal(invoice.id, 'test01')
      done()
    })
    pay.loadInvoice('test01')
  })
})


//describe('Presto#pushTx()', () => {
//  let pay;
//  beforeEach(() => {
//    nock('https://merchantapi.taal.com')
//      .post('/mapi/tx')
//      .once()
//      .replyWithFile(200, 'test/mocks/mapi-push.json', {
//        'Content-Type': 'application/json'
//      })
//
//    nock('https://www.paypresto.co')
//      .post('/api/invoices/test/tx')
//      .once()
//      .replyWithFile(200, 'test/mocks/push-tx.json', {
//        'Content-Type': 'application/json'
//      })
//
//    pay = new Presto({
//      key,
//      inputs: [{txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12', vout: 0, satoshis: 2000, script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'}],
//      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
//    })
//    pay.invoice = { id: 'test' }
//  })
//
//  it('emits the success event after building and pushing the tx', done => {
//    pay.on('success', payload => {
//      assert.equal(payload.txid, '9c8c5cf37f4ad1a82891ff647b13ec968f3ccb44af2d9deaa205b03ab70a81fa')
//      done()
//    })
//    pay.pushTx()
//  })
//})


describe('Presto#signTx()', () => {
  let address, keyPair, pay;
  beforeEach(() => {
    keyPair = bsv.KeyPair.fromPrivKey(key)
    address = bsv.Address.fromPubKey(keyPair.pubKey)
    pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 2000,
        script: '76a914'+ address.hashBuf.toString('hex') +'88ac'
      }],
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('signs all inputs with the keyPair', () => {
    assert.lengthOf(pay.getRawTx(), 20)
    pay.signTx()
    assert.isAbove(pay.getRawTx().length, 20)
    assert.notMatch(pay.getRawTx(), /(00){72}.*(00){33}/)
  })

  it('wont sign if given the wrong keypair as params', () => {
    pay.signTx({ keyPair: bsv.KeyPair.fromRandom() })
    assert.isAbove(pay.getRawTx().length, 20)
    assert.match(pay.getRawTx(), /(00){72}.*(00){33}/)
  })

  it('signs all inputs when params given to casts', () => {
    pay.signTx({ keyPair })
    assert.isAbove(pay.getRawTx().length, 20)
    assert.notMatch(pay.getRawTx(), /(00){72}.*(00){33}/)
  })
})


describe('Presto#signTxIn()', () => {
  let address, kBuf, keyPair, pay;
  beforeEach(() => {
    kBuf = Buffer.from('ed7d04e7ec6de2d550992479ad9f52e941049a68cd5b7a24b15659204c78b338', 'hex')
    keyPair = bsv.KeyPair.fromPrivKey(key)
    address = bsv.Address.fromPubKey(keyPair.pubKey)
    pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 2000,
        script: '76a914'+ address.hashBuf.toString('hex') +'88ac'
      }],
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('signs the specified input with the given params', () => {
    const cast = Cast.unlockingScript(P2RPH, {
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 2000,
      script: '78537f77517f7c7f75a914de7bacce2f3bb02f03773483096ce4a61c28537a88ac'
    })
    pay.addInput(cast)
    pay.forge.build()
    pay.signTxIn(0, { keyPair })
    pay.signTxIn(1, { kBuf })
    assert.isAbove(pay.getRawTx().length, 20)
    assert.notMatch(pay.getRawTx(), /(00){72}.*(00){33}/)
  })
})


describe('Presto#getRawTx()', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({
      key,
      inputs: [{
        txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
        vout: 0,
        satoshis: 2000,
        script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
      }],
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('returns a value even when tx has not been built', () => {
    assert.equal(pay.getRawTx(), '01000000000000000000')
  })

  it('returns full rawtx after signing', () => {
    pay.signTx()
    assert.notEqual(pay.getRawTx(), '01000000000000000000')
    assert.match(pay.getRawTx(), /^[a-f0-9]+$/)
  })
})