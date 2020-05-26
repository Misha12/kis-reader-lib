import * as errorCodes from "./errorCodes.js";
import { ProtokolA2C, ProtokolC2A, createPacket, createPingPacket, decodePongData, parsePacket, decodeRfidData, createDisplayPacket } from "./packet.js";
import { SocketError, ReaderError } from "./errors.js";
import { TypedEvent } from "./TypedEvent.js";
import { ReaderState } from "./IClient.js";
const IdleMsg = createPacket(ProtokolA2C.Idle);
const AutoReadBeginMsg = createPacket(ProtokolA2C.AutoReadBegin);
const SingleReadMsg = createPacket(ProtokolA2C.SingleRead);
if (typeof WebSocket === 'undefined') {
    WebSocket = require('ws');
}
export class KisReaderClient {
    constructor(url) {
        this.connectedEvent = new TypedEvent();
        this.reconnectingEvent = new TypedEvent();
        this.disconnectedEvent = new TypedEvent();
        this.cardReadEvent = new TypedEvent();
        this.errorEvent = new TypedEvent();
        this.pingReceived = true;
        this.uint32Max = (Math.pow(2, 32) - 1);
        this.url = url;
        this.socket = null;
        this.state = ReaderState.ST_DISCONNECTED;
        this.lastKnownState = ReaderState.ST_UNKNOWN;
        this.pingEnabled = true;
        this.pingInterval = 5000;
        this.pingTimeout = 500;
        this.pingFailsLimit = 5;
        this.reconnectDelay = 1000;
        this.reconnectLimit = 3;
        this.pingFails = 0;
        this.reconnectAttempts = 0;
    }
    logWarn(msg) {
        console.log(msg);
    }
    logError(error) {
        console.log(error);
        this.errorEvent.emit({ client: this, error });
    }
    getState() { return this.state; }
    isReady() {
        return (this.state == ReaderState.ST_IDLE ||
            this.state == ReaderState.ST_SINGLE_READ ||
            this.state == ReaderState.ST_AUTO_READ);
    }
    connect() {
        if (this.socket)
            throw new ReaderError("Already connected or connecting", errorCodes.READER_ALREADY_CONNECTED);
        this.onMsgHandler = (ev) => {
            let data = ev.data;
            this.handleBinaryMessages(data);
        };
        this.onErrorHandler = (ev) => {
            let error = new SocketError(String(ev), errorCodes.SOCKET_ERROR);
            this.logError(error);
            this.onConnectionProblem();
        };
        this.onCloseHandler = (ev) => {
            this.logWarn(`Socket closed: code:${ev.code}, reason:${ev.reason}, wasClean:${ev.wasClean}`);
            if (this.state !== ReaderState.ST_DISCONNECTED &&
                this.state !== ReaderState.ST_RECONNECTING) {
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
            if (this.lastKnownState == ReaderState.ST_AUTO_READ)
                this.modeAutoRead();
            else if (this.lastKnownState == ReaderState.ST_SINGLE_READ)
                this.modeSingleRead();
            this.connectedEvent.emit(this);
        };
        this.socket.binaryType = 'arraybuffer';
    }
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
    onConnectionProblem() {
        if (this.state != ReaderState.ST_RECONNECTING)
            this.lastKnownState = this.state;
        this.stopPinging();
        console.log("Entered onConnectionProblem()\n", {
            pingFails: this.pingFails,
            reconnectAttempts: this.reconnectAttempts,
            state: this.state,
            socketState: this.socket.readyState
        });
        if (this.socket && (this.socket.readyState === WebSocket.CONNECTING ||
            this.socket.readyState === WebSocket.OPEN)) {
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
        this.state = ReaderState.ST_RECONNECTING;
        this.reconnectingEvent.emit(this);
        setTimeout(() => this.connect(), this.reconnectDelay);
    }
    connectPromise() {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                let onErr = ev => reject(ev.error);
                this.errorEvent.once(onErr);
                this.connectedEvent.once(() => { this.errorEvent.offOnce(onErr); resolve(); });
                this.connect();
            }
            else {
                resolve();
            }
        });
    }
    checkSocketReady() {
        if (!(this.socket && this.socket.readyState == WebSocket.OPEN)) {
            this.state = ReaderState.ST_DISCONNECTED;
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
    setDisplay2x16(content, clearTimeoutMs) {
        var _a, _b;
        clearTimeout(this.displayClearTimeoutId);
        this.checkSocketReady();
        let lines = content.split("\n").map(s => s.trim());
        let lineOne = (_a = lines[0]) !== null && _a !== void 0 ? _a : '';
        let lineTwo = (_b = lines[1]) !== null && _b !== void 0 ? _b : '';
        if (lineOne.length > 16 || lineTwo.length > 16)
            throw new ReaderError("Lines are >16 chars", errorCodes.INVALID_FORMAT);
        let packet = createDisplayPacket(lineOne, lineTwo);
        this.socket.send(packet);
        if (clearTimeoutMs > 0)
            this.displayClearTimeoutId = setTimeout(() => this.setDisplay2x16("", 0), clearTimeoutMs);
    }
    handleBinaryMessages(msg) {
        let { type, data } = parsePacket(new Uint8Array(msg));
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
                this.cardReadEvent.emit({ client: this, cardData: rfid.signatureBase64 });
                break;
            }
            case ProtokolC2A.SingleId: {
                if (this.state !== ReaderState.ST_SINGLE_READ) {
                    this.logError(new ReaderError("Unexpected message in current state.", errorCodes.INVALID_RESPONSE));
                    return;
                }
                this.state = ReaderState.ST_IDLE;
                let rfid = decodeRfidData(data);
                this.cardReadEvent.emit({ client: this, cardData: rfid.signatureBase64 });
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
    startPinging() {
        this.pingCode = Math.floor((Math.random() * this.uint32Max));
        let interval = this.pingTimeout;
        let periodsPerPing = Math.ceil(this.pingInterval / this.pingTimeout);
        this.pingPeriodIdx = 0;
        this.pingIntervalId = setInterval(() => {
            let active = this.pingPeriodIdx == 0;
            this.pingPeriodIdx = (this.pingPeriodIdx + 1) % periodsPerPing;
            if (!active)
                return;
            if (!this.pingReceived) {
                this.logError(new ReaderError('Ping not received in time limit ' + this.pingInterval, errorCodes.READER_ERROR));
                this.pingFailed();
            }
            this.pingReceived = false;
            this.sendPing();
        }, interval);
    }
    stopPinging() {
        clearInterval(this.pingIntervalId);
        this.pingIntervalId = null;
    }
    sendPing() {
        this.pingCode = (this.pingCode + 1) % this.uint32Max;
        const pingMsg = createPingPacket(this.pingCode);
        this.checkSocketReady();
        this.socket.send(pingMsg);
    }
    handlePong(data) {
        const rcvdCode = decodePongData(data);
        if (this.pingCode == rcvdCode) {
            this.pingReceived = true;
        }
        else {
            let codeDiff = this.pingCode - rcvdCode;
            this.logError(new ReaderError('Ping data is not matching with pong, the ping is N iterations old, N: ' + codeDiff, errorCodes.READER_ERROR));
        }
    }
    pingFailed() {
        this.pingFails++;
        if (this.pingFails > this.pingFailsLimit) {
            this.onConnectionProblem();
        }
    }
}
//# sourceMappingURL=Client.js.map