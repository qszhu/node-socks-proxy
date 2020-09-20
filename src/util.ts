import * as net from 'net'

export function addr(socket: net.Socket) {
  return `${socket.remoteAddress}:${socket.remotePort}`
}

export class ClientStatus {
  private clients: Map<string, number>

  constructor() {
    this.clients = new Map()
  }

  getStatus(socket: net.Socket, defaultStatus: number) {
    const address = addr(socket)
    if (!this.clients.has(address)) {
      this.clients.set(address, defaultStatus)
    }
    return this.clients.get(address)
  }

  setStatus(socket: net.Socket, status: number) {
    const address = addr(socket)
    this.clients.set(address, status)
  }

  remove(socket: net.Socket) {
    const address = addr(socket)
    this.clients.delete(address)
  }
}

export class BaseUpstreamSocket {
  protected remote: string

  constructor(
    protected socket: net.Socket,
    protected clientSocket: net.Socket,
    dstAddr: string,
    dstPort: number
  ) {
    this.socket = socket
    this.clientSocket = clientSocket
    this.remote = `${dstAddr}:${dstPort}`

    this.socket.once('connect', this.baseOnConnection.bind(this))
    this.socket.on('error', this.baseOnError.bind(this))
    this.socket.once('close', this.onClose.bind(this))
  }

  protected onConnection() {}

  private baseOnConnection() {
    console.log(`Upstream created: ${addr(this.clientSocket)} 🔗️ ${this.remote}`)

    this.onConnection()
    this.socket.pipe(this.clientSocket)
    this.clientSocket.pipe(this.socket)
  }

  protected onError(e: Error) {}

  private baseOnError(e: Error) {
    console.error(`Upstream error: ${addr(this.clientSocket)} ❌ ${this.remote}: ${e.message}`)

    this.onError(e)
    this.clientSocket.destroy()
  }

  private onClose() {
    console.log(`Upstream closed: ${addr(this.clientSocket)} 💨 ${this.remote}`)

    this.clientSocket.destroy()
  }
}
