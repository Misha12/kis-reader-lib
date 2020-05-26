import { TypedEvent } from "./TypedEvent";
import { ReaderError, SocketError } from "./errors";
export declare enum ReaderState {
    ST_DISCONNECTED = 0,
    ST_RECONNECTING = 1,
    ST_IDLE = 2,
    ST_AUTO_READ = 3,
    ST_SINGLE_READ = 4,
    ST_UNKNOWN = 5
}
export interface IKisReaderClient {
    connect(): void;
    disconnect(): void;
    modeIdle(): void;
    modeAutoRead(): void;
    modeSingleRead(): void;
    setDisplay2x16(content: string, clearTimeoutMs: number): void;
    getState(): ReaderState;
    isReady(): boolean;
    connectedEvent: TypedEvent<IKisReaderClient>;
    reconnectingEvent: TypedEvent<IKisReaderClient>;
    disconnectedEvent: TypedEvent<IKisReaderClient>;
    cardReadEvent: TypedEvent<{
        client: IKisReaderClient;
        cardData: string;
    }>;
    errorEvent: TypedEvent<{
        client: IKisReaderClient;
        error: ReaderError | SocketError;
    }>;
}
