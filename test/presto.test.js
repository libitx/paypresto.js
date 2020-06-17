import { assert } from 'chai'
import nock from 'nock'
import bsv from 'bsv'
import { Presto } from '../src/index'

let key, wif;
before(() => {
  wif = 'L3ucptoJ7YdYMh4JRFGWF75Nknx95Aw1KBaXWCvFcMj6swJkYvgu'
  key = bsv.PrivKey.fromWif(wif)
})


describe('new Presto()', () => {
  it('creates payment from a WIF key', () => {
    const pay = new Presto({ key: wif })
    assert.deepEqual(pay.privKey, key)
  })

  it('creates payment from existing key', () => {
    const pay = new Presto({ key })
    assert.deepEqual(pay.privKey, key)
  })

  it('throws error without any key', () => {
    assert.throws(_ => new Presto(), 'Must initiate Presto with valid private key')
  })

  it('throws error with invalid key', () => {
    assert.throws(_ => new Presto({key: 'NOTAKEY'}))
  })

  it('creates payment with outputs', () => {
    const pay = new Presto({
      key,
      outputs: [
        {to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 50000},
        {data: ['0xeeefef', 'foo', 'bar']}
      ]
    })
    assert.equal(pay.builder.txOuts[0].valueBn.toNumber(), 50000)
    assert.isTrue(pay.builder.txOuts[0].script.isPubKeyHashOut())
    assert.equal(pay.builder.txOuts[1].valueBn.toNumber(), 0)
    assert.isTrue(pay.builder.txOuts[1].script.isSafeDataOut())
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
    assert.isTrue(pay.builder.txIns[0].script.isPubKeyHashIn())
    assert.include(Object.keys(pay.builder.uTxOutMap.toJSON()), '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12:0')
  })
})


describe('Presto.create()', () => {
  beforeEach(() => {
    nock('https://www.paypresto.co')
      .post('/api/invoices')
      .once()
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

  it('adds valid UTXO params to the payment', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 15399,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.lengthOf(pay.builder.txIns, 1)
  })

  it('throws error with invalid params', () => {
    assert.throws(_ => pay.addInput({}), 'Invalid TxIn params')
  })
})


describe('Presto#addOutput()', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({ key })
  })

  it('adds pre-built TxOut to the payment', () => {
    const output = bsv.TxOut.fromProperties(
      bsv.Bn(15399),
      bsv.Script.fromHex('76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac')
    )
    pay.addOutput(output)
    assert.lengthOf(pay.builder.txOuts, 1)
  })

  it('adds output script params to the payment', () => {
    pay.addOutput({
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac',
      satoshis: 15399
    })
    assert.lengthOf(pay.builder.txOuts, 1)
  })

  it('adds output data params to the payment', () => {
    pay.addOutput({
      data: ['0xeeefef', 'foo', 'bar']
    })
    assert.lengthOf(pay.builder.txOuts, 1)
  })

  it('adds output p2pkh params to the payment', () => {
    pay.addOutput({
      to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq',
      satoshis: 50000
    })
    assert.lengthOf(pay.builder.txOuts, 1)
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


describe('Presto#amount', () => {
  it('defaults to minimum dust limit', () => {
    const pay = new Presto({ key })
    assert.equal(pay.amount, 547)
  })

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


describe('Presto#remainingAmount', () => {
  let pay;
  beforeEach(() => {
    pay = new Presto({
      key,
      outputs: [{to: '1DBz6V6CmvjZTvfjvWpvvwuM1X7GkRmWEq', satoshis: 1000}]
    })
  })

  it('defaults to same as #amount', () => {
    assert.equal(pay.remainingAmount, 1096)
  })

  it('calculates remaining unfunded satoshis', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 600,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.equal(pay.remainingAmount, 496)
  })

  it('returns zero if tx funded', () => {
    pay.addInput({
      txid: '5e3014372338f079f005eedc85359e4d96b8440e7dbeb8c35c4182e0c19a1a12',
      vout: 0,
      satoshis: 2000,
      script: '76a91410bdcba3041b5e5517a58f2e405293c14a7c70c188ac'
    })
    assert.equal(pay.remainingAmount, 0)
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
    pay.createInvoice()
    pay.on('invoice', invoice => {
      assert.isObject(pay.invoice)
      assert.equal(pay.invoice.id, 'test01')
      assert.equal(invoice.id, 'test01')
      done()
    })
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
    pay.loadInvoice('test01')
    pay.on('invoice', invoice => {
      assert.isObject(pay.invoice)
      assert.equal(pay.invoice.id, 'test01')
      assert.equal(invoice.id, 'test01')
      done()
    })
  })
})


//describe('test', () => {
//  it('foo', () => {
//    let builder = new bsv.TxBuilder()
//    console.log(builder)
//    assert.isTrue(true)
//  })
//})