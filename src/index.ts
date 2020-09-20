import * as net from 'net'

import { SocksV4aSocket } from './socksV4a'
import { SocksV5Socket } from './socksV5'
import { addr } from './util'

const { PORT } = process.env

async function main() {
  net
    .createServer((conn) => {
      console.log(`🔗Connected from ${addr(conn)}`)

      conn.once('data', (data) => {
        const version = data.readUInt8()
        if (version === 4) {
          new SocksV4aSocket(conn)
        } else if (version === 5) {
          new SocksV5Socket(conn)
        }
        conn.emit('data', data)
      })
    })
    .listen(PORT, () => console.log(`Listening on port ${PORT}...`))
}

if (require.main === module) {
  main().catch(console.error)
}
