import * as errorCodes from './errorCodes'
import { ProtokolA2C, ProtokolC2A, createPacket, createPingPacket, decodePongData, parsePacket, decodeRfidData, createDisplayPacket } from './packet'
import { SocketError, ReaderError } from './errors'
import { TypedEvent } from "./TypedEvent";

const IdleMsg = createPacket(ProtokolA2C.Idle)
const AutoReadBeginMsg = createPacket(ProtokolA2C.AutoReadBegin)
const SingleReadMsg = createPacket(ProtokolA2C.SingleRead)


const enum ReaderState {
    ST_DISCONNECTED,
    ST_IDLE,
    ST_AUTO_READ,
    ST_SINGLE_READ,
    ST_RECONNECTING,
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
    cardReadEvent: TypedEvent<{client: KisReaderClient, cardData: string}> = new TypedEvent<{client: KisReaderClient, cardData: string}>();
    errorEvent: TypedEvent<{client: KisReaderClient, error: ReaderError}> = new TypedEvent<{client: KisReaderClient, error: ReaderError}>();

    pingEnabled;
    pingInterval = 2000; //ms
    pingFails; // connect()
    pingFailsLimit = 1;
    reconnectAttempts; // connect()
    reconnectLimit = 1;
    constructor(
        url: string
    ) {
        this.url = url;
        this.state = ReaderState.ST_DISCONNECTED;
        this.pingEnabled = true;
        this.pingFails = 0;
    }

    // todo vylepšit logování
    private logWarn(msg: any) {
        console.log(msg);
    }

    private logError(error: ReaderError) {
        console.log(error);
        this.errorEvent.emit({client:this, error});
    }

    connect() {
        if (this.socket)
            throw new ReaderError("Already connected or connecting", errorCodes.READER_ALREADY_CONNECTED);

        // todo move to class body maybe/probably?
        this.onMsgHandler = (ev) => {
            let data:ArrayBuffer = ev.data;
            this.handleBinaryMessages(data);
        };
        this.onErrorHandler = (ev) => {
            let error = new ReaderError("Socket error: " + ev, errorCodes.READER_ERROR);
            this.logError(error);
            this.state = ReaderState.ST_ERROR;
            this.errorEvent.emit({
                client: this,
                error: error
            });
            this.onConnectionProblem();
        };
        this.onCloseHandler = (ev) => {
            this.logWarn(`Socket closed: code:${ev.code}, reason:${ev.reason}, wasClean:${ev.wasClean}`);
            this.state = ReaderState.ST_DISCONNECTED;
            this.disconnectedEvent.emit(this);
        };

        this.socket = new WebSocket(this.url);
        this.socket.onmessage = (ev) => this.onMsgHandler(ev);
        this.socket.onerror = (ev) => this.onErrorHandler(ev);
        this.socket.onclose = (ev) => this.onCloseHandler(ev);
        this.socket.onopen = (ev) => {
            this.state = ReaderState.ST_IDLE;
            this.pingFails = 0;
            this.reconnectAttempts = 0;
            if (this.pingEnabled)
                this.startPinging();
            this.connectedEvent.emit(this);
        };
        this.socket.binaryType = 'arraybuffer';
    }

    disconnect() {
        this.socket.close(null, "disconnect requested");
    }

    private onConnectionProblem() {
        this.socket.close(null, "connection problems detected");
        this.socket = null;
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.reconnectLimit) {
            this.state = ReaderState.ST_DISCONNECTED;
            this.disconnectedEvent.emit(this);
            return;
        }
        // else
        this.state = ReaderState.ST_RECONNECTING;
        this.reconnectingEvent.emit(this);
        this.connect();
    }

    connectPromise(): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (any) => void) => {
            if (!this.socket) {
                let onErr = ev => reject(ev.error);
                this.errorEvent.once(onErr);
                this.connectedEvent.once(() => {this.errorEvent.offOnce(onErr); resolve()});
                this.connect();
            } else {
                // already connected
                resolve();
            }
        });
    }

    private checkSocketReady() {
        if (!(this.socket && this.socket.readyState == WebSocket.OPEN)) {
            this.state = ReaderState.ST_DISCONNECTED; //todo - does this make sense? maybe check wthere it is not in error state and let it there then
            let error = new SocketError("Socket is not ready", errorCodes.READER_NOT_CONNECTED);
            this.logError(error);
            throw error;
        }
    }

    modeIdle() {
        this.checkSocketReady();
        this.socket.send(IdleMsg);
        this.state = ReaderState.ST_IDLE;
    }

    modeAutoRead() {
        this.checkSocketReady();
        this.socket.send(AutoReadBeginMsg);
        this.state = ReaderState.ST_AUTO_READ;
    }

    modeSingleRead() {
        this.checkSocketReady();
        this.socket.send(SingleReadMsg);
        this.state = ReaderState.ST_SINGLE_READ;
    }

    modeSingleReadAuth() {
        throw new SocketError("Encrypted cards operations are not supported", errorCodes.NOT_SUPPORTED_OPERATION);
    }

    setDisplay2x16(content: string) {
        this.checkSocketReady();
        let lines = content.split("\n").map(s=>s.trim());
        let lineOne = lines[0] ?? '';
        let lineTwo = lines[1] ?? '';
        if (lineOne.length > 16 || lineTwo.length > 16)
            throw new ReaderError("Lines are >16 chars", errorCodes.INVALID_FORMAT); //todo maybe better error or different errorCode
        let packet = createDisplayPacket(lineOne, lineTwo);
        this.socket.send(packet);
    }

    private handleBinaryMessages(msg: ArrayBuffer) {
        let {type, data} = parsePacket(new Uint8Array(msg));
        switch (type) {
            case ProtokolC2A.Pong: {
                this.handlePong(data);
                break;
            }
            case ProtokolC2A.AutoId: {
                if (this.state !== ReaderState.ST_AUTO_READ) {
                    this.logError(new SocketError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE));
                    return;
                }

                let rfid = decodeRfidData(data);
                this.cardReadEvent.emit({client: this, cardData:rfid.signatureBase64});
                break;
            }
            case ProtokolC2A.SingleId: {
                if (this.state !== ReaderState.ST_SINGLE_READ) {
                    this.logError(new SocketError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE));
                    return;
                }
                this.state = ReaderState.ST_IDLE; // adjust the state

                let rfid = decodeRfidData(data);
                this.cardReadEvent.emit({client: this, cardData:rfid.signatureBase64});
                break;
            }
            case ProtokolC2A.SingleIdSendKey:
            case ProtokolC2A.VerificationCode:
                this.state = ReaderState.ST_ERROR;
                this.logError(new SocketError("Encrypted cards operations are not supported", errorCodes.NOT_SUPPORTED_OPERATION));
                this.onConnectionProblem();
                break;
            default:
                this.state = ReaderState.ST_ERROR;
                this.logError(new SocketError("Unsupported message", errorCodes.INVALID_RESPONSE));
                this.onConnectionProblem();
                break;
        }
    }

    pingCode: number;
    pingIntervalId: any;
    // init to true, like there was pre-first ping that was successfu
    pingReceived = true;
    private startPinging() {
        // init ping value to some random uint32 number
        const uint32Max = (2 ^ 32 - 1);
        this.pingCode = Math.floor((Math.random() * uint32Max));

        // start regular pings
        this.pingIntervalId = setInterval(() =>
        {
            //if we did not receive response to last ping
            if(!this.pingReceived) {
                this.logError(new SocketError('Ping not received in limit ' + this.pingFailsLimit, errorCodes.READER_ERROR));
                this.pingFailed();
            }

            // reset the flag and send new ping
            this.pingReceived = false;
            this.sendPing();
        }, this.pingInterval) // todo move the ping-rate to class config
    }
    private sendPing() {
        const uint32Max = (2 ^ 32 - 1);
        this.pingCode = (this.pingCode + 1 % uint32Max);
        const pingMsg = createPingPacket(this.pingCode);
        this.checkSocketReady()
        this.socket.send(pingMsg)
    }
    // this accepts only the 32B long data part of the 35B packet
    private handlePong(data: Uint8Array) {
        const rcvdCode = decodePongData(data);
        if (this.pingCode == rcvdCode)
        {
            this.pingReceived = true;
        }
        else
        {
            // log something, maybe even do error?
            let codeDiff = this.pingCode - rcvdCode; // difference between last sent code and the one just received
            this.logError(new SocketError('Ping data is not matching with pong, the ping is N iterations old, N: ' + codeDiff, errorCodes.READER_ERROR));
            this.pingFailed();
        }
    }
    private pingFailed() {
        this.pingFails++;
        //TODO do handle this somehow
        if (this.pingFails > this.pingFailsLimit) {
            this.onConnectionProblem();
        }
    }

    // socketState(): Number {
    //     return this.socket.readyState;
    // }
}

export const readOneCard = (readerUri: string, onData: (data: string) => void, onError: (err: any) => void) => {
    if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
        readerUri = "wss://" + readerUri;
    let client = new KisReaderClient(readerUri);
    client.errorEvent.once(onError); //maybe just the error message?
    client.connectedEvent.once(reader => reader.modeSingleRead());
    client.cardReadEvent.once(ev => {
        client.disconnect();
        onData(ev.cardData);
    })
    client.connect();
};
