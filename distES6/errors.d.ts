export declare class PacketError extends Error {
    errorCode: string;
    constructor(message: string, errorCode: string);
}
export declare class SocketError extends Error {
    errorCode: string;
    constructor(message: string, errorCode: string);
}
export declare class ReaderError extends Error {
    errorCode: string;
    constructor(message: string, errorCode: string);
}
