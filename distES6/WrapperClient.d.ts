import { IKisReaderClient, ReaderState } from "./IClient";
import { KisReaderClient } from "./Client";
import { TypedEvent } from "./TypedEvent";
import { ReaderError, SocketError } from "./errors";
export declare class KisReaderWrapperClient implements IKisReaderClient {
    private client;
    private exclusiveMode;
    private state;
    constructor(reader: KisReaderClient, exclusiveMode?: boolean);
    private exclusiveOldEvent;
    exclusiveRestore: () => void;
    connect(): void;
    disconnect(): void;
    modeIdle(): void;
    modeAutoRead(): void;
    modeSingleRead(): void;
    setDisplay2x16(content: string, clearTimeoutMs: number): void;
    getState(): ReaderState;
    isReady(): boolean;
    private fireCardEventListener;
    private fireCardOnceEventListener;
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
