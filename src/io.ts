export class BinaryReader {
  private offset: number

  constructor(private buf: Buffer) {
    this.offset = 0
  }

  nextUInt8() {
    const res = this.buf.readUInt8(this.offset)
    this.offset++
    return res
  }

  nextUInt16() {
    const res = this.buf.readUInt16BE(this.offset)
    this.offset += 2
    return res
  }

  nextString() {
    let i = this.offset
    while (this.buf[i] !== 0) i++
    const res = this.buf.slice(this.offset, i).toString()
    this.offset = i + 1
    return res
  }

  nextStringWithLen(len: number) {
    const res = this.buf.slice(this.offset, this.offset + len).toString()
    this.offset += len
    return res
  }
}

export class BinaryWriter {
  private offset: number

  constructor(private buf: Buffer) {
    this.offset = 0
  }

  writeUInt8(v: number) {
    this.buf.writeUInt8(v, this.offset++)
  }

  writeUInt16(v: number) {
    this.buf.writeUInt16BE(v, this.offset)
    this.offset += 2
  }
}
