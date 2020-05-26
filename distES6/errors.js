export class PacketError extends Error {
    constructor(message, errorCode) {
        super(message);
        this.name = "PacketError";
        this.errorCode = errorCode;
    }
}
export class SocketError extends Error {
    constructor(message, errorCode) {
        super(message);
        this.name = "SocketError";
        this.errorCode = errorCode;
    }
}
export class ReaderError extends Error {
    constructor(message, errorCode) {
        super(message);
        this.name = "ReaderError";
        this.errorCode = errorCode;
    }
}
//# sourceMappingURL=errors.js.map