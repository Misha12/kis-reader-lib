export class PacketError extends Error {
  errorCode: string;
  constructor(message: string, errorCode: string) {
    super(message)
    this.name = "PacketError"
    this.errorCode = errorCode
  }
}

export class SocketError extends Error {
  errorCode: string;
  constructor(message: string, errorCode: string) {
    super(message)
    this.name = "SocketError"
    this.errorCode = errorCode
  }
}

export class ReaderError extends Error {
  errorCode: string;
  constructor(message: string, errorCode: string) {
    super(message)
    this.name = "ReaderError"
    this.errorCode = errorCode
  }
}