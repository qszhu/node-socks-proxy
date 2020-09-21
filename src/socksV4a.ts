// https://github.com/cfcs/ocaml-socks/blob/master/rfc/SOCKS4.protocol.txt
// https://github.com/cfcs/ocaml-socks/blob/master/rfc/SOCKS4A.protocol.txt

import * as net from 'net'

import { BinaryReader, BinaryWriter } from './io'
import { addr, BaseUpstreamSocket } from './util'

const VERSION = 4
const REPLY_VERSION = 0

const REPLY = {
  GRANTED: 90,
  FAILED: 91,
}

/*
                +----+----+----+----+----+----+----+----+----+----+....+----+
                | VN | CD | DSTPORT |      DSTIP        | USERID       |NULL|
                +----+----+----+----+----+----+----+----+----+----+....+----+
 # of bytes:       1    1      2              4           variable       1
*/
function readRequest(buf: Buffer) {
  const reader = new BinaryReader(buf)

  const VN = reader.nextUInt8()
  if (VN !== VERSION) throw new Error(`Invalid version: ${VN}, expected ${VERSION}`)

  const CD = reader.nextUInt8()
  const DSTPORT = reader.nextUInt16()

  const ip = []
  for (let i = 0; i < 4; i++) ip.push(reader.nextUInt8())

  const USERID = reader.nextString()

  let DSTADDR = ip.join('.')
  if (ip[0] === 0 && ip[1] === 0 && ip[2] === 0 && ip[3] !== 0) {
    DSTADDR = reader.nextString()
  }

  return { CD, DSTPORT, DSTADDR, USERID }
}

/*
                +----+----+----+----+----+----+----+----+
                | VN | CD | DSTPORT |      DSTIP        |
                +----+----+----+----+----+----+----+----+
 # of bytes:       1    1      2              4
*/
function replyRequest(socket: net.Socket, CD: number) {
  const resp = Buffer.alloc(8)
  const writer = new BinaryWriter(resp)
  writer.writeUInt8(REPLY_VERSION)
  writer.writeUInt8(CD)
  socket.write(resp)
}

class UpstreamSocket extends BaseUpstreamSocket {
  onConnection() {
    replyRequest(this.clientSocket, REPLY.GRANTED)
  }

  onError(e: Error) {
    replyRequest(this.clientSocket, REPLY.FAILED)
  }
}

export class SocksV4aSocket {
  constructor(private socket: net.Socket) {
    this.socket = socket

    this.socket.once('data', this.onData.bind(this))
    this.socket.on('error', this.onError.bind(this))
    this.socket.once('close', this.onClose.bind(this))
  }

  private onData(data: Buffer) {
    try {
      const { CD, DSTPORT, DSTADDR } = readRequest(data)

      if (CD === 1) {
        console.log(`Trying to connect ${DSTADDR}:${DSTPORT}...`)
        const upstream = net.createConnection(DSTPORT, DSTADDR)
        new UpstreamSocket(upstream, this.socket, DSTADDR, DSTPORT)
      } else {
        throw new Error(`Command not yet supported: ${CD}`)
      }
    } catch (e) {
      console.error('❌Error', e.message)
    }
  }

  private onError(e: Error) {
    console.error(`❌Error for ${addr(this.socket)}: ${e.message}`)
  }

  private onClose() {
    console.log(`💨Disconnected from ${addr(this.socket)}`)
  }
}
