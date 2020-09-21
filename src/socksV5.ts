// https://github.com/cfcs/ocaml-socks/blob/master/rfc/SOCKS5_rfc1928.txt

import * as net from 'net'

import { BinaryReader, BinaryWriter } from './io'
import { addr, ClientStatus, BaseUpstreamSocket } from './util'

const VERSION = 0x05

const METHOD = {
  NO_AUTH: 0x00,
  NO_ACCEPTABLE: 0xff,
}

const RESERVED = 0x00

const REPLY = {
  SUCCEEDED: 0x00,
  FAILURE: 0x01,
}

const COMMAND = {
  CONNECT: 0x01,
  BIND: 0x02,
  UDP: 0x03,
}

const ADDRESS_TYPE = {
  IPV4: 0x01,
  DOMAIN: 0x03,
  IPV6: 0x04,
}

const SUPPORTED_METHODS = [METHOD.NO_AUTH]

const CLIENT_STATUS = {
  CONNECTED: 0,
  NEGOTIATED: 1,
  REQUESTED: 2,
}

/*
                   +----+----------+----------+
                   |VER | NMETHODS | METHODS  |
                   +----+----------+----------+
                   | 1  |    1     | 1 to 255 |
                   +----+----------+----------+
*/
function readNegotiation(buf: Buffer) {
  const reader = new BinaryReader(buf)

  const VER = reader.nextUInt8()
  if (VER !== VERSION) throw new Error(`Invalid version: ${VER}, expected ${VERSION}`)

  const NMETHODS = reader.nextUInt8()
  const METHODS = []
  for (let i = 0; i < NMETHODS; i++) {
    METHODS.push(reader.nextUInt8())
  }

  return { METHODS }
}

function selectMethod(methods: number[]) {
  for (const m of SUPPORTED_METHODS) {
    if (methods.includes(m)) {
      return m
    }
  }
  return METHOD.NO_ACCEPTABLE
}

/*
                         +----+--------+
                         |VER | METHOD |
                         +----+--------+
                         | 1  |   1    |
                         +----+--------+
*/
function replyNegotiation(socket: net.Socket, method: number) {
  const resp = Buffer.alloc(2)
  const writer = new BinaryWriter(resp)
  writer.writeUInt8(VERSION)
  writer.writeUInt8(method)
  socket.write(resp)
}

/*
        +----+-----+-------+------+----------+----------+
        |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
        +----+-----+-------+------+----------+----------+
        | 1  |  1  | X'00' |  1   | Variable |    2     |
        +----+-----+-------+------+----------+----------+
*/
function readRequest(buf: Buffer) {
  const reader = new BinaryReader(buf)

  const VER = reader.nextUInt8()
  if (VER !== VERSION) throw new Error(`Invalid version: ${VER}`)

  const CMD = reader.nextUInt8()

  const RSV = reader.nextUInt8()

  const ATYP = reader.nextUInt8()
  let DST_ADDR = ''
  if (ATYP === ADDRESS_TYPE.IPV4) {
    const ips = []
    for (let i = 0; i < 4; i++) ips.push(reader.nextUInt8())
    DST_ADDR = ips.join('.')
  } else if (ATYP === ADDRESS_TYPE.DOMAIN) {
    const len = reader.nextUInt8()
    DST_ADDR = reader.nextStringWithLen(len)
  } else {
    throw new Error('IPv6 not yet supported')
  }

  const DST_PORT = reader.nextUInt16()

  return { CMD, DST_ADDR, DST_PORT }
}

/*
        +----+-----+-------+------+----------+----------+
        |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
        +----+-----+-------+------+----------+----------+
        | 1  |  1  | X'00' |  1   | Variable |    2     |
        +----+-----+-------+------+----------+----------+
*/
function replyRequest(socket: net.Socket, REP: number, upstream?: net.Socket) {
  const resp = Buffer.alloc(10)
  const writer = new BinaryWriter(resp)
  writer.writeUInt8(VERSION)
  writer.writeUInt8(REP)
  writer.writeUInt8(RESERVED)

  writer.writeUInt8(ADDRESS_TYPE.IPV4) // needed
  if (REP === REPLY.SUCCEEDED) {
    if (upstream.remoteFamily !== 'IPv4') {
      console.warn('only IPv4 is supported at the moment')
    }
    const ip = upstream.remoteAddress.split('.').map(Number)
    for (const n of ip) writer.writeUInt8(n)
    writer.writeUInt16(upstream.remotePort)
  }

  socket.write(resp)
}

class UpstreamSocket extends BaseUpstreamSocket {
  onConnection() {
    replyRequest(this.clientSocket, REPLY.SUCCEEDED, this.socket)
  }

  onError(e: Error) {
    replyRequest(this.clientSocket, REPLY.FAILURE) // TODO: detailed error
  }
}

const clients = new ClientStatus()

export class SocksV5Socket {
  constructor(private socket: net.Socket) {
    this.socket = socket

    this.socket.on('data', this.onData.bind(this))
    this.socket.on('error', this.onError.bind(this))
    this.socket.once('close', this.onClose.bind(this))
  }

  private onData(data: Buffer) {
    const status = clients.getStatus(this.socket, CLIENT_STATUS.CONNECTED)
    try {
      switch (status) {
        case CLIENT_STATUS.CONNECTED:
          this.doNegotiate(data)
          clients.setStatus(this.socket, CLIENT_STATUS.NEGOTIATED)
          break
        case CLIENT_STATUS.NEGOTIATED:
          this.doRequest(data)
          clients.setStatus(this.socket, CLIENT_STATUS.REQUESTED)
          break
      }
    } catch (e) {
      console.error('❌Error', e.message)
    }
  }

  private doNegotiate(data: Buffer) {
    const { METHODS } = readNegotiation(data)
    const method = selectMethod(METHODS)
    replyNegotiation(this.socket, method)
  }

  private doRequest(data: Buffer) {
    const { CMD, DST_ADDR, DST_PORT } = readRequest(data)

    switch (CMD) {
      case COMMAND.CONNECT:
        this.doCmdConnect(DST_ADDR, DST_PORT)
        break
      default:
        throw new Error(`Command not yet supported: ${CMD}`)
    }
  }

  private doCmdConnect(addr: string, port: number) {
    console.log(`Trying to connect ${addr}:${port}...`)
    const upstream = net.createConnection(port, addr)
    new UpstreamSocket(upstream, this.socket, addr, port)
  }

  private onError(e: Error) {
    console.error(`❌Error for ${addr(this.socket)}: ${e.message}`)
  }

  private onClose() {
    console.log(`💨Disconnected from ${addr(this.socket)}`)
    clients.remove(this.socket)
  }
}
