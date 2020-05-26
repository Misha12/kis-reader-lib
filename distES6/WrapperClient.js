import { TypedEvent } from "./TypedEvent.js";
export class KisReaderWrapperClient {
    constructor(reader, exclusiveMode = false) {
        this.state = 5;
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
            this.state = 2;
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
        this.client.disconnectedEvent.on(() => this.state = 0);
        this.client.errorEvent.on(args => this.state = args.client.getState());
        if (this.client.state == 0) {
            this.client.connectedEvent.once(() => {
                this.state = 2;
                this.client.modeAutoRead();
                this.connectedEvent.emit(this);
            });
            this.client.connect();
        }
        else if (this.client.state == 2) {
            this.state = 2;
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
        this.exclusiveRestore();
        this.client.cardReadEvent.off(this.fireCardEventListener);
        this.client.cardReadEvent.offOnce(this.fireCardOnceEventListener);
        this.state = 2;
    }
    modeAutoRead() {
        if (this.state != 2)
            this.modeIdle();
        if (this.exclusiveMode) {
            this.exclusiveOldEvent = this.client.cardReadEvent;
            this.client.cardReadEvent = new TypedEvent();
        }
        else
            this.client.cardReadEvent.on(this.fireCardEventListener);
        this.state = 3;
    }
    modeSingleRead() {
        if (this.state != 2)
            this.modeIdle();
        if (this.exclusiveMode) {
            this.exclusiveOldEvent = this.client.cardReadEvent;
            this.client.cardReadEvent = new TypedEvent();
            this.client.cardReadEvent.once(this.exclusiveRestore);
        }
        this.client.cardReadEvent.once(this.fireCardOnceEventListener);
        this.state = 4;
    }
    setDisplay2x16(content, clearTimeoutMs) {
        this.client.setDisplay2x16(content, clearTimeoutMs);
    }
    getState() {
        return this.state;
    }
}
//# sourceMappingURL=WrapperClient.js.map