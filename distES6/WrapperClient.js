import { ReaderState } from "./IClient.js";
import { TypedEvent } from "./TypedEvent.js";
export class KisReaderWrapperClient {
    constructor(reader, exclusiveMode = false) {
        this.state = ReaderState.ST_UNKNOWN;
        this.exclusiveOldEvent = null;
        this.exclusiveRestore = () => {
            if (this.exclusiveOldEvent)
                this.client.cardReadEvent = this.exclusiveOldEvent;
            this.exclusiveOldEvent = null;
        };
        this.fireCardEventListener = (arg) => {
            this.cardReadEvent.emit({ client: this, cardData: arg.cardData });
        };
        this.fireCardOnceEventListener = (arg) => {
            this.state = ReaderState.ST_IDLE;
            this.cardReadEvent.emit({ client: this, cardData: arg.cardData });
        };
        this.connectedEvent = new TypedEvent();
        this.reconnectingEvent = new TypedEvent();
        this.disconnectedEvent = new TypedEvent();
        this.cardReadEvent = new TypedEvent();
        this.errorEvent = new TypedEvent();
        this.client = reader;
        this.exclusiveMode = exclusiveMode;
        this.client.connectedEvent.pipe(this.connectedEvent);
        this.client.reconnectingEvent.pipe(this.reconnectingEvent);
        this.client.disconnectedEvent.pipe(this.disconnectedEvent);
        this.client.errorEvent.pipe(this.errorEvent);
        this.client.disconnectedEvent.on(() => this.state = ReaderState.ST_DISCONNECTED);
        this.client.errorEvent.on(args => this.state = args.client.getState());
        if (this.client.state == ReaderState.ST_DISCONNECTED) {
            this.client.connectedEvent.once(() => {
                this.state = ReaderState.ST_IDLE;
                this.client.modeAutoRead();
                this.connectedEvent.emit(this);
            });
            this.client.connect();
        }
        else if (this.client.state == ReaderState.ST_IDLE) {
            this.state = ReaderState.ST_IDLE;
            this.client.modeAutoRead();
            this.connectedEvent.emit(this);
        }
        else {
            throw new Error("The passed reader is not in compatible state (ST_DISCONNECTED / ST_IDLE)");
        }
    }
    connect() {
    }
    disconnect() {
        this.modeIdle();
    }
    modeIdle() {
        if (this.state == ReaderState.ST_IDLE)
            return;
        this.exclusiveRestore();
        this.client.cardReadEvent.off(this.fireCardEventListener);
        this.client.cardReadEvent.offOnce(this.fireCardOnceEventListener);
        if (!this.isReady())
            throw new Error("The reader is in bad state, state: " + ReaderState[this.state]);
        this.state = ReaderState.ST_IDLE;
    }
    modeAutoRead() {
        this.modeIdle();
        if (this.exclusiveMode) {
            this.exclusiveOldEvent = this.client.cardReadEvent;
            this.client.cardReadEvent = new TypedEvent();
        }
        else
            this.client.cardReadEvent.on(this.fireCardEventListener);
        this.state = ReaderState.ST_AUTO_READ;
    }
    modeSingleRead() {
        this.modeIdle();
        if (this.exclusiveMode) {
            this.exclusiveOldEvent = this.client.cardReadEvent;
            this.client.cardReadEvent = new TypedEvent();
            this.client.cardReadEvent.once(this.exclusiveRestore);
        }
        this.client.cardReadEvent.once(this.fireCardOnceEventListener);
        this.state = ReaderState.ST_SINGLE_READ;
    }
    setDisplay2x16(content, clearTimeoutMs) {
        this.client.setDisplay2x16(content, clearTimeoutMs);
    }
    getState() {
        return this.state;
    }
    isReady() {
        return (this.state == ReaderState.ST_IDLE ||
            this.state == ReaderState.ST_SINGLE_READ ||
            this.state == ReaderState.ST_AUTO_READ);
    }
}
//# sourceMappingURL=WrapperClient.js.map