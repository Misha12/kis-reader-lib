import { TypedEvent } from "./TypedEvent";
import { ReaderError, SocketError } from "./errors";

export enum ReaderState {
    ST_DISCONNECTED,
    ST_RECONNECTING,
    ST_IDLE,
    ST_AUTO_READ,
    ST_SINGLE_READ,
    ST_UNKNOWN,
}

export interface IKisReaderClient {
    connect(): void;
    disconnect(): void;
    //connectPromise(): Promise<void>;
    modeIdle(): void;
    modeAutoRead(): void;
    modeSingleRead(): void;
    //modeSingleReadAuth(): void;
    setDisplay2x16(content: string, clearTimeoutMs: number): void;

    getState(): ReaderState;
    isReady(): boolean;

    connectedEvent: TypedEvent<IKisReaderClient>;
    reconnectingEvent: TypedEvent<IKisReaderClient>;
    disconnectedEvent: TypedEvent<IKisReaderClient>;
    cardReadEvent: TypedEvent<{client: IKisReaderClient, cardData: string}>;
    errorEvent: TypedEvent<{client: IKisReaderClient, error: ReaderError | SocketError}>;
}
