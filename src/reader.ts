import * as errorCodes from './errorCodes'
import { ProtokolA2C, ProtokolC2A, createPacket, createPingPacket, decodePong } from './packet'
import { SocketError, ReaderError } from './errors'
import { TypedEvent } from "./TypedEvent";


const IdleMsg = createPacket(ProtokolA2C.Idle)
const AutoReadBeginMsg = createPacket(ProtokolA2C.AutoReadBegin)
const SingleReadMsg = createPacket(ProtokolA2C.SingleRead)


const enum ReaderState {
    ST_DISCONNECTED,
    ST_CONNECTED,
    ST_IDLE,
    ST_AUTO_READ,
    ST_SINGLE_READ,
    ST_ERROR,
}

export default class KisReaderClient {
    socket: WebSocket | null;
    url: string;
    request: Uint8Array;

    onMsgHandler: (ev: MessageEvent) => any;
    onErrorHandler: (ev: Event) => any;
    onCloseHandler: (ev: CloseEvent) => any;

    state: ReaderState;

    connectedEvent: TypedEvent<KisReaderClient> = new TypedEvent<KisReaderClient>();
    reconnectingEvent: TypedEvent<KisReaderClient> = new TypedEvent<KisReaderClient>();
    disconnectedEvent: TypedEvent<KisReaderClient> = new TypedEvent<KisReaderClient>();
    cardReadEvent: TypedEvent<{client: KisReaderClient, cardDate: string}> = new TypedEvent<{client: KisReaderClient, cardDate: string}>();
    errorEvent: TypedEvent<{client: KisReaderClient, error: Error}> = new TypedEvent<{client: KisReaderClient, error: Error}>();

    pingEnabled;
    pingFails;
    constructor(
        url: string
    ) {
        this.url = url;
        this.state = ReaderState.ST_DISCONNECTED;
        this.pingEnabled = true;
        this.pingFails = 0;
    }

    // oboslete code
    connectPromiseOld(): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (any) => void) => {
            if (!this.socket) {
                this.socket = new WebSocket(this.url);
                // byl jsem upozornen, ze optimalizátor by mohl měnit semantiku a zahodit lambda funkci
                this.socket.onmessage = (evt) => this.onMsgHandler(evt);
                this.socket.onerror = (evt) => this.onErrorHandler(evt);
                this.socket.onclose = (evt) => this.onCloseHandler(evt);
                this.socket.onopen = (evt: Event) => {
                    this.state = ReaderState.ST_CONNECTED;
                    if (this.pingEnabled)
                        this.startPinging();
                    resolve();
                };
                this.socket.binaryType = 'arraybuffer';
            } else {
                resolve();
            }
        });
    }

    connectPromise(): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (any) => void) => {
            if (!this.socket) {
                this.init();
                let onErr = ev => reject(ev.error);
                this.errorEvent.once(onErr);
                this.connectedEvent.once(() => {this.errorEvent.offOnce(onErr); resolve()});
            } else {
                resolve();
            }
        });
    }

    init() {
        this.socket = new WebSocket(this.url);
        // byl jsem upozornen, ze optimalizátor by mohl měnit semantiku a zahodit lambda funkci
        this.socket.onmessage = (ev) => this.onMsgHandler(ev);
        this.socket.onerror = (ev) => this.onErrorHandler(ev);
        this.socket.onclose = (ev) => this.onCloseHandler(ev);
        this.socket.onopen = (ev) => {
            this.state = ReaderState.ST_CONNECTED;
            this.connectedEvent.emit(this);
            this.connectedEvent.emit(
        };
        this.socket.binaryType = 'arraybuffer';
    }

    checkSocketReady() {
        if (!(this.socket && this.socket.readyState == WebSocket.OPEN)) {
            this.state = ReaderState.ST_DISCONNECTED
            throw new SocketError("Socket is not ready", errorCodes.READER_NOT_CONNECTED);
        }
    }

    modeIdle() {
        this.checkSocketReady();
        this.socket.send(IdleMsg);
    }

    modeAutoRead() {
        this.checkSocketReady();
        this.socket.send(AutoReadBeginMsg);
    }

    modeSingleRead() {
        this.checkSocketReady();
        this.socket.send(SingleReadMsg);
    }

    handleBinaryMessages(msg: ArrayBuffer) {
        if (this.state === ReaderState.ST_AUTO_READ) {
            switch (msg[0]) {
                case ProtokolC2A.Pong: {
                    if (this.pingCode !== decodePong(msg))
                        throw new SocketError('Ping data is not matching with pong.', errorCodes.INVALID_RESPONSE)
                    break
                }
                default:
                    throw new SocketError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE);
            }
        }
        else {
            throw new ReaderError("Unknown state.", errorCodes.READER_ERROR);
        }
    }

    pingCode: number;
    pingIntervalId: NodeJS.Timeout; // možná spíš :any nebo :number ?
    // init to true, like there was pre-first ping that was successfu
    pingReceived = true;
    startPinging() {
        // init ping value to some random uint32 number
        const uint32Max = (2 ^ 32 - 1);
        this.pingCode = Math.floor((Math.random() * uint32Max));

        // start regular pings
        this.pingIntervalId = setInterval(() => 
        {
            //if we did not receive response to last ping
            if(!this.pingReceived)
                this.pingFailed();

            // reset the flag and send new ping
            this.pingReceived = false;
            this.sendPing();
        }, 10 * 1000) // todo move the ping-rate to class config
    }
    sendPing() {
        const uint32Max = (2 ^ 32 - 1);
        this.pingCode = (this.pingCode + 1 % uint32Max);
        const pingMsg = createPingPacket(this.pingCode);
        this.checkSocketReady()
        this.socket.send(pingMsg)
    }
    // this accepts only the 32B long data part of the 35B packet
    handlePong(data: Uint8Array) {
        const rcvdCode = decodePong(data);
        if (this.pingCode == rcvdCode)
        {
            this.pingReceived = true;
        }
        else
        {
            // log something, maybe even do error?
        }
    }
    pingFailed() {
        this.pingFails++;
        //TODO do handle this somehow
    }


    // socketState(): Number {
    //     return this.socket.readyState;
    // }
}

export const readOneCard = (readerUri: string, onData: (data: string) => void, onError: (err: any) => void) => {
    if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
        readerUri = "wss://" + readerUri;
    let client = new KisReaderClient(readerUri);

};