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
    setDisplay2x16(content: string, clearTimeoutMs: number): void; // content is 0-2 lines of max 16 chars, separated by \n

    getState(): ReaderState;
    isReady(): boolean; // is in ST_IDLE, ST_SINGLE_READ or ST_AUTO_READ states

    connectedEvent: TypedEvent<IKisReaderClient>; // occurs if connect() is successful
    reconnectingEvent: TypedEvent<IKisReaderClient>; // when reconneting is in progress
    disconnectedEvent: TypedEvent<IKisReaderClient>; // when requested or reconnecting failed
    cardReadEvent: TypedEvent<{client: IKisReaderClient, cardData: string}>; // when a card is read
    errorEvent: TypedEvent<{client: IKisReaderClient, error: ReaderError | SocketError}>;
}
