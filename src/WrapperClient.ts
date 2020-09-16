import { IKisReaderClient, ReaderState } from "./IClient";
import { KisReaderClient } from "./Client";
import { TypedEvent } from "./TypedEvent";
import { ReaderError, SocketError } from "./errors";

/*
K čemu slouží:
 - pokud je třeba jednu fyzickou čtečku používat pro dvě (nebo více) nezávislých komponent jedné aplikace, které jinak očekávají samostatné čtečky
 - interně se při vytvoření stane odberatelem všech eventů realného klienta, a podle vlastního modu je ignoruje nebo dále propaguje do svých eventů
Jak se používá:
 - vytvoří se nejdřívě jedna "pravá" instance KisReaderClienta, která reprezntuje spojení s jedinou čtečkou
 - poté lze nad ní vytvořit několik instancí wrapperu : new KisReaderWrapperClient(instance zakladniho klienta, exkluzivní mód ano/ne)
 --- po inicializaci wrapperu je instance pravého klienta vždy přepnuta do režimu auto-read
 --- ne-exkluzivní mód wrapperu: při použití modeAutoRead nebo modeSingleRead na wrapperu jsou eventy poslány jak přes tento wrapper tak přes všechny ostatní wrappery v non-IDLE stavech
 --- exkluzivní mód wrapperu: při použití modeAutoRead nebo modeSingleRead na wrapperu jsou odstraněny všechny dříve nastavené callbacky v použitém realném klientovi
     po zavolání modeIdle/načtení single-karty jsou callbacky vrácen zpět
     není dobré použít víc než jeden wrapper v exkluzivním módu (při obnově callbacků v jiném než opačném pořádí dojde ke ztrátě informací), 
     nebo vytvářet další (i ne exkluzivní wrappery) během použití exkluzivního modu
*/

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
        else if (this.client.state == ReaderState.ST_AUTO_READ)
        {
            this.state = ReaderState.ST_IDLE;
            this.connectedEvent.emit(this);
        }
        else
        {
            throw new Error("The passed reader is not in compatible state (ST_DISCONNECTED / ST_IDLE / ST_AUTO_READ)");
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
            // the delegate will be restored when modeIdle() is called
        }
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
