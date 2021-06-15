import * as errorCodes from './errorCodes'
import { ProtokolA2C, ProtokolC2A, createPacket, createPingPacket, decodePongData, parsePacket, decodeRfidData, createDisplayPacket } from './packet'
import { SocketError, ReaderError } from './errors'
import { TypedEvent } from "./TypedEvent";
import { IKisReaderClient, ReaderState } from './IClient';

const IdleMsg = createPacket(ProtokolA2C.Idle)
const AutoReadBeginMsg = createPacket(ProtokolA2C.AutoReadBegin)
const SingleReadMsg = createPacket(ProtokolA2C.SingleRead)

/* 
Hlavní třída implementují stabilní komunikaci se čtečkou:
 - automaticky vytváří nové spojení pokud přestane čtečka odpovídat
 - automaticky obnovuje spojení při výpadku

Ve výchozím stavu:
 - posílá kontrolní ping každých 5s, čas na odpověd je 0.5s
 - při 5ti spožděních během jednoho spojení dojde k restartu spojení
 - pokouší se a znovu-připojení až 3x, vždy s prodlevou 1s
 - vše jde nastavit pomocí public fieldů po zavolání konstruktoru, viz kód o kousek níže

new KisReaderClient(
        url: adresa čtečky
        loggingLevel: 0 = vše, 1 = warn, > 1 = pouze errors
    )

Použití (zjenodušené v test1.ts)
 - zkontruuj objekt klienta KisReaderClient
 - přiřaď callback cardReadEvent (pro zpracování karty) a errorEvent (do toast notifikací), 
   a případně taky reconnecting (zkoušíme) a disconnect (odpojeno na žádost nebo selhalo znovu připojení)
   doporučení je, vždy po přijetí errorEventu zkontrolovat "state" klienta a případně upravit stav aplikace
 - přiřad callback connectedEvent (on nebo once) - ten je vyvolán je jako následek volání connect, nikdy ne kvůli znovu-připojení
   doporučení je přejít do módu pro čtení a/nebo změnit stav aplikace
 - zavolej connect(), případně lze použít connectPromise(), který přímo vytvoří promise který se resolvuje při onConnected nebo selhání připojení
 - enjoy! haha
 - spojení lze uzavřít pomocí disconnect()
 - režim čtečky se připíná pomocí modeXXX (viz IKisReaderClient)
 - na displej čtečky se vypisují věci pomocí setDisplay2x16(0-2 řádky oddělené \n, každý max 16 znaků, clear timeout v ms)
 - stav čtečky pomocí fieldu state, metody getState() nebo pomoc metody isReady() (varcí true pro IDLE, SINGLE a AUTOREAD stavy)
*/

// if run on NodeJS use websocket/ws
declare var require: (id: string) => any;
if (typeof WebSocket === 'undefined')
{
    WebSocket = require('ws');
}
export class KisReaderClient implements IKisReaderClient {
    socket: WebSocket | null;
    url: string;

    // TODO: tohle tu být asi už nemusí
    onMsgHandler: (ev: MessageEvent) => any;
    onErrorHandler: (ev: Event) => any;
    onCloseHandler: (ev: CloseEvent) => any;

    state: ReaderState;

    // explicits types left out (they are deduced && its tooo long)
    connectedEvent = new TypedEvent<IKisReaderClient>();
    reconnectingEvent = new TypedEvent<IKisReaderClient>();
    disconnectedEvent = new TypedEvent<IKisReaderClient>();
    cardReadEvent = new TypedEvent<{client: IKisReaderClient, cardData: string}>();
    errorEvent = new TypedEvent<{client: IKisReaderClient, error: ReaderError | SocketError}>();
    warnEvent = new TypedEvent<{client: IKisReaderClient, msg: string, data: any[]}>();
    debugEvent = new TypedEvent<{client: IKisReaderClient, msg: string, data: any[]}>();

    loggingLevel: number;
    pingEnabled: boolean;
    pingInterval: number; // ms, must be greater or equal to pingTimeout
    pingTimeout: number; // ms
    pingFails: number; // connect()
    pingFailsLimit: number;
    reconnectAttempts: number ; // connect()
    reconnectDelay: number; // ms
    reconnectLimit: number;
    lastKnownState: ReaderState;
    constructor(
        url: string,
        loggingLevel: number = 0
    ) {
        this.loggingLevel = loggingLevel;
        this.url = url;
        this.socket = null;
        this.state = ReaderState.ST_DISCONNECTED;
        this.lastKnownState = ReaderState.ST_UNKNOWN;
        // defaults
        this.pingEnabled = true; // this would detect if the TCP connection was terminated without RST/us noticing
        // set the ping interval to 5s, timeout to 0.5s and 5 late pings will trigger reconnect
        this.pingInterval = 5000;
        this.pingTimeout = 500;
        this.pingFailsLimit = 5;
        // reconnect after 1s, make 3 attempts before disconnecting
        this.reconnectDelay = 1000;
        this.reconnectLimit = 3;
        // defaults, these are reset on every successful connection
        this.pingFails = 0;
        this.reconnectAttempts = 0;
    }

    // TODO: vylepšit logování
    private logDebug(msg: string, ...data: any[]) {
        if (this.loggingLevel > 0)
            return;
        console.log(msg, data);
        this.debugEvent.emit({client:this, msg, data});
    }

    private logWarn(msg: string, ...data: any[]) {
        if (this.loggingLevel > 1)
            return;
        console.log(msg, data);
        this.warnEvent.emit({client:this, msg, data});
    }

    private logError(error: ReaderError | SocketError) {
        console.log(error);
        this.errorEvent.emit({client:this, error});
    }

    getState() { return this.state; }

    isReady() { 
        return (
            this.state == ReaderState.ST_IDLE ||
            this.state == ReaderState.ST_SINGLE_READ || 
            this.state == ReaderState.ST_AUTO_READ);
    }

    connect() {
        if (this.socket)
            throw new ReaderError("Already connected or connecting", errorCodes.READER_ALREADY_CONNECTED);

        // TODO: move to class body maybe/probably?
        this.onMsgHandler = (ev) => {
            let data:ArrayBuffer = ev.data;
            this.handleBinaryMessages(data);
        };
        this.onErrorHandler = (ev) => {
            let error = new SocketError(String(ev), errorCodes.SOCKET_ERROR);
            this.logError(error);
            this.onConnectionProblem();
        };
        this.onCloseHandler = (ev) => {
            this.logWarn(`Socket closed: code:${ev.code}, reason:${ev.reason}, wasClean:${ev.wasClean}`);
            if ( // if we are not aware of being closed state already
                this.state !== ReaderState.ST_DISCONNECTED &&
                this.state !== ReaderState.ST_RECONNECTING )
            { // then let the onConnectionProblem handle it
                this.onConnectionProblem();
            }
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

            /**/ if(this.lastKnownState == ReaderState.ST_AUTO_READ)
                this.modeAutoRead();
            else if(this.lastKnownState == ReaderState.ST_SINGLE_READ)
                this.modeSingleRead();

            this.connectedEvent.emit(this);
        };
        this.socket.binaryType = 'arraybuffer';
    }

    // disconects socket and most of internal state (not event delegates)
    disconnect() {
        this.stopPinging();
        this.state = ReaderState.ST_DISCONNECTED;
        this.lastKnownState = ReaderState.ST_UNKNOWN;
        this.pingFails = 0;
        this.reconnectAttempts = 0;
        if (this.socket)
            this.socket.close(1000, "disconnect requested");
        this.socket = null;
    }

    private onConnectionProblem() {
        if (this.state != ReaderState.ST_RECONNECTING)
                this.lastKnownState = this.state;

        this.stopPinging();
        this.logDebug("Entered onConnectionProblem()\n", {
            pingFails: this.pingFails,
            reconnectAttempts: this.reconnectAttempts,
            state: this.state,
            socketState: this.socket.readyState
        });
        if (this.socket && (
            this.socket.readyState === WebSocket.CONNECTING ||
            this.socket.readyState === WebSocket.OPEN
            ))
        {
            // we need to set ST_RECONNECTING or ST_DISCONNECTED here, in case the socket.onClose is called
            this.state = ReaderState.ST_RECONNECTING;
            this.socket.close(4000, "connection problems detected");
        }
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
        setTimeout(() => this.connect(), this.reconnectDelay);
    }

    connectPromise(): Promise<void> {
        return new Promise<void>((resolve: () => void, reject: (error: any) => void) => {
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

    // this method is an exception to "do log, do NOT throw if you are in inner/private method" rule here
    // !it might throw an exception!
    private checkSocketReady() {
        if (!(this.socket && this.socket.readyState == WebSocket.OPEN)) {
            this.state = ReaderState.ST_DISCONNECTED; // TODO: - does this make sense? maybe check wthere it is not in error state and let it there then
            let error = new SocketError("WebSocket is not ready", errorCodes.READER_NOT_CONNECTED);
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
        throw new ReaderError("Encrypted cards operations are not supported", errorCodes.NOT_SUPPORTED_OPERATION);
    }

    displayClearTimeoutId: any;
    // clearTimeoutMs <= 0 means no display clearing
    setDisplay2x16(content: string, clearTimeoutMs: number) {
        // we are re-drawing the display, so cancel any pending display clearing
        clearTimeout(this.displayClearTimeoutId);

        this.checkSocketReady();
        let lines = content.split("\n").map(s=>s.trim());
        let lineOne = lines[0] ?? '';
        let lineTwo = lines[1] ?? '';
        if (lineOne.length > 16 || lineTwo.length > 16)
            throw new ReaderError("Lines are >16 chars", errorCodes.INVALID_FORMAT); // TODO: maybe better error or different errorCode
        let packet = createDisplayPacket(lineOne, lineTwo);
        this.socket.send(packet);

        // if the clearing of dispaly is requested
        if (clearTimeoutMs > 0)
            this.displayClearTimeoutId = setTimeout(
                () => this.setDisplay2x16("", 0),
                clearTimeoutMs);
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
                    this.logError(new ReaderError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE));
                    return;
                }

                let rfid = decodeRfidData(data);
                this.cardReadEvent.emit({client: this, cardData:rfid.signatureBase64});
                break;
            }
            case ProtokolC2A.SingleId: {
                if (this.state !== ReaderState.ST_SINGLE_READ) {
                    this.logError(new ReaderError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE));
                    return;
                }
                this.state = ReaderState.ST_IDLE; // adjust the state

                let rfid = decodeRfidData(data);
                this.cardReadEvent.emit({client: this, cardData:rfid.signatureBase64});
                break;
            }
            case ProtokolC2A.SingleIdSendKey:
            case ProtokolC2A.VerificationCode:
                this.state = ReaderState.ST_UNKNOWN;
                this.logError(new ReaderError("Encrypted cards operations are not supported", errorCodes.NOT_SUPPORTED_OPERATION));
                this.onConnectionProblem();
                break;
            default:
                this.state = ReaderState.ST_UNKNOWN;
                this.logError(new ReaderError("Unsupported message", errorCodes.INVALID_RESPONSE));
                this.onConnectionProblem();
                break;
        }
    }

    pingCode: number;
    pingPeriodIdx: number;
    pingIntervalId: any;
    // init to true, like there was pre-first ping that was successfu
    pingReceived: boolean = true;
    readonly uint32Max = (Math.pow(2, 32) - 1);
    private startPinging() {
        // init ping value to some random uint32 number
        this.pingCode = Math.floor((Math.random() * this.uint32Max));

        // the run-interval is given by the timeout
        // if the pingInterval is larger then pingTimeout
        // we just skip some cycles
        let interval = this.pingTimeout;
        let periodsPerPing = Math.ceil(this.pingInterval / this.pingTimeout);
        this.pingPeriodIdx = 0;

        // start regular pings
        this.pingIntervalId = setInterval(() =>
        {
            // skip if this is not cycle idx == 0, always increment
            let active = this.pingPeriodIdx == 0;
            this.pingPeriodIdx = (this.pingPeriodIdx + 1) % periodsPerPing;
            if (!active)
                return;

            // if we did not receive response to last ping
            if(!this.pingReceived) {
                this.logError(new ReaderError('Ping not received in time limit ' + this.pingInterval, errorCodes.READER_ERROR));
                this.pingFailed();
            }

            // reset the flag and send new ping
            this.pingReceived = false;
            this.sendPing();
        }, interval) // TODO: move the ping-rate to class config
    }
    private stopPinging() {
        clearInterval(this.pingIntervalId);
        this.pingIntervalId = null;
    }
    private sendPing() {
        this.pingCode = (this.pingCode + 1) % this.uint32Max;
        const pingMsg = createPingPacket(this.pingCode);
        this.checkSocketReady()
        this.socket.send(pingMsg)
    }
    // this accepts only the 32B long data part of the 35B packet
    private handlePong(data: Uint8Array) {
        const rcvdCode = decodePongData(data);
        if (this.pingCode == rcvdCode)
        {
            // accept the pong
            this.pingReceived = true;
        }
        else
        {
            // do not accept the pong and log error
            let codeDiff = this.pingCode - rcvdCode; // difference between last sent code and the one just received
            this.logError(new ReaderError('Ping data is not matching with pong, the ping is N iterations old, N: ' + codeDiff, errorCodes.READER_ERROR));
        }
    }
    private pingFailed() {
        this.pingFails++;
        // TODO: do handle this somehow
        if (this.pingFails > this.pingFailsLimit) {
            this.onConnectionProblem();
        }
    }

    // socketState(): Number {
    //     return this.socket.readyState;
    // }
}
