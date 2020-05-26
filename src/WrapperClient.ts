import { IKisReaderClient, ReaderState } from "./IClient";
import { KisReaderClient } from "./Client";
import { TypedEvent } from "./TypedEvent";
import { ReaderError, SocketError } from "./errors";


export class KisReaderWrapperClient implements IKisReaderClient {
    private client: KisReaderClient;
    private exclusiveMode: boolean;
    private state: ReaderState = ReaderState.ST_UNKNOWN;
    constructor(reader: KisReaderClient, exclusiveMode: boolean = false) {
        this.client = reader;
        this.exclusiveMode = exclusiveMode;

        // forward original events (including wrapped client in the event args)
        this.client.connectedEvent.pipe(this.connectedEvent);
        this.client.reconnectingEvent.pipe(this.reconnectingEvent);
        this.client.disconnectedEvent.pipe(this.disconnectedEvent);
        this.client.errorEvent.pipe(this.errorEvent);

        // adjust state on specical occasions
        this.client.disconnectedEvent.on(() => this.state = ReaderState.ST_DISCONNECTED);
        this.client.errorEvent.on(args => this.state = args.client.getState());

        // if the
        if (this.client.state == ReaderState.ST_DISCONNECTED)
        {
            // on-connect
            this.client.connectedEvent.once(() => {
                this.state = ReaderState.ST_IDLE;
                this.client.modeAutoRead();
                this.connectedEvent.emit(this);
            });
            this.client.connect();
        }
        else if (this.client.state == ReaderState.ST_IDLE)
        {
            this.state = ReaderState.ST_IDLE;
            this.client.modeAutoRead();
            this.connectedEvent.emit(this);
        }
        else
        {
            throw new Error("The passed reader is not in compatible state (ST_DISCONNECTED / ST_IDLE)");
        }
    }

    private exclusiveOldEvent: TypedEvent<{client: IKisReaderClient, cardData: string}>|null = null;
    exclusiveRestore = () => {
        if (this.exclusiveOldEvent)
            this.client.cardReadEvent = this.exclusiveOldEvent;
        this.exclusiveOldEvent = null;
    }

    connect(): void {
        // no-op
    }
    disconnect(): void {
        this.modeIdle();
    }
    
    modeIdle(): void {
        if (this.state == ReaderState.ST_IDLE)
            return; // no work needed

        this.exclusiveRestore();
        this.client.cardReadEvent.off(this.fireCardEventListener);
        this.client.cardReadEvent.offOnce(this.fireCardOnceEventListener);
        if (!this.isReady())
            throw new Error("The reader is in bad state, state: " + ReaderState[this.state]);
        this.state = ReaderState.ST_IDLE;
    }
    modeAutoRead(): void {
        // restore to neutral state first
        this.modeIdle();

        if (this.exclusiveMode)
        {
            // "move" the old delegate
            this.exclusiveOldEvent = this.client.cardReadEvent
            this.client.cardReadEvent = new TypedEvent();
        }
        else
            this.client.cardReadEvent.on(this.fireCardEventListener);
        this.state = ReaderState.ST_AUTO_READ;
    }
    modeSingleRead(): void {
        // restore to neutral state first
        this.modeIdle();

        if (this.exclusiveMode)
        {
            // "move" the old delegate
            this.exclusiveOldEvent = this.client.cardReadEvent
            this.client.cardReadEvent = new TypedEvent();
            // schedule the restore
            this.client.cardReadEvent.once(this.exclusiveRestore);
        }
        this.client.cardReadEvent.once(this.fireCardOnceEventListener);
        this.state = ReaderState.ST_SINGLE_READ;
    }

    setDisplay2x16(content: string, clearTimeoutMs: number): void {
        this.client.setDisplay2x16(content, clearTimeoutMs);
    }
    getState(): ReaderState {   
        return this.state;  
    }

    isReady(): boolean { 
        return (
            this.state == ReaderState.ST_IDLE ||
            this.state == ReaderState.ST_SINGLE_READ || 
            this.state == ReaderState.ST_AUTO_READ);
    }

    // this as a this-bound listener
    // the initialization maybe needs to be in constructor?
    private fireCardEventListener = (arg: {client: IKisReaderClient, cardData: string}) =>
    {
        this.cardReadEvent.emit({client: this, cardData: arg.cardData});
    }
    private fireCardOnceEventListener = (arg: {client: IKisReaderClient, cardData: string}) =>
    {
        this.state = ReaderState.ST_IDLE;
        this.cardReadEvent.emit({client: this, cardData: arg.cardData});
    }

    // explicitní types left out (they are deduced && its tooo long)
    connectedEvent = new TypedEvent<IKisReaderClient>();
    reconnectingEvent = new TypedEvent<IKisReaderClient>();
    disconnectedEvent = new TypedEvent<IKisReaderClient>();
    cardReadEvent = new TypedEvent<{client: IKisReaderClient, cardData: string}>();
    errorEvent = new TypedEvent<{client: IKisReaderClient, error: ReaderError | SocketError}>();
}
