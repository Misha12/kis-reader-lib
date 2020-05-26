import { PacketError } from './errors'
import { INVALID_FORMAT, EMPTY_RESPONSE } from './errorCodes'

/*
    Packet format for reader protocol version 1
    1 byte lead-mark: 0x6E
    1 byte message type: 0x0-0x6 App->Ctecka, 0x8-0xC Ctecka->App
    32 byte data
    1 byte end-mark: 0xE6
*/

/*
struct ProtokolPacket {
    uint8_t messageType;
    uint8_t checkByteOne;
    uint8_t data[32];
    uint8_t checkByteTwo;
};

struct IdData {
    uint8_t uid_length;
    uint8_t uid[7];
    uint8_t padding[8];
    uint8_t card0[16];
};
*/

// APP->CTECKA
export enum ProtokolA2C {
    // PING
    Ping = 0x0,
    // zapnout nonstop ctení ID
    AutoReadBegin = 0x01,
    // zapnout jedno ctení ID
    SingleRead = 0x02,
    // vypnout cteni ID ci cokoliv
    Idle = 0x03,
    // precti ID, posli mi ho, cekej na klic
    SingleAuthenticateId = 0x04,
    // timto klicem kartu over [16B TDES klíč]
    SingleAuthenticateKey = 0x05,
    // zobraz text dvouradkovy
    PrintTextDual = 0x06,
}

// APP<-CTECKA
export enum ProtokolC2A {
    // PONG
    Pong = 0x08,
    // prectene auto ID
    AutoId = 0x09,
    // prectene single ID
    SingleId = 0x0A,
    // prectene single-auth ID
    SingleIdSendKey = 0x0B,
    // precteny overovaci kod
    VerificationCode = 0x0C,
}

export const createPacket = (type: ProtokolA2C | ProtokolC2A, data?: ArrayBuffer): Uint8Array => {
    const packet = new Uint8Array(35)
    packet[0] = type
    packet[1] = 0x6E
    packet[34] = 0xE6
    if (data) {
        if (!(data instanceof ArrayBuffer))
            throw new Error("data must be ArrayBuffer");
        if (data.byteLength > 32)
            throw new Error("data must be <=32 bytes");
        packet.set(new Uint8Array(data), 2);
    }
    return packet
}

export const checkPacket = (packet: Uint8Array) => {
    // tahhle funkce není tak podstatná,
    // protože při websocket spojení (a TCP už asi nepoužijeme) netřeba kontrolovat intro/outro byte
    // jediné co by stálo za to asi zkontrolovat, je délka frameu

    // druhá otázka je: jsou výjimky dobrá věc tady?
    // můžeme si dovolit z JS knihovny prostě vyhodit exception a doufat že klient si s tím poradí?
    // nemusíme kvůli asynchronosti použít spíš nějaký "onerror" event/callback?

    // já vím že jsem je měl i v původní kodu,
    // ale hádám, že nejpozději na nějakém rozhraní našeho kodu, kde by ta výjimka probulala dál,
    // budeme muset tu výjimku chytnout a zavolat nějaký callback a uvést ten objekt do rozumného stavu (ST_ERROR např)
    // a případně zahájit proces znovu připojování

    if (packet[1] !== 0x6E || packet[34] !== 0xE6)
        throw new PacketError('Invalid packet header / footer', INVALID_FORMAT)
    if (packet.length !== 35)
        throw new PacketError('Invalid packet size', INVALID_FORMAT)
    packet.forEach((val) => {
        if (val < 0) // nemá smysl testovat uint8 byte na < 0, to bude vždy 0--255
            throw new PacketError('Invalid packet data', INVALID_FORMAT)
    })
}

// todo function that parse packet into type and 32B data
export const parsePacket = (packet: Uint8Array): {type: ProtokolC2A, data: Uint8Array } => {
    checkPacket(packet);

    let typeNum = packet[0];
    let data = packet.slice(2, 2 + 32); //copy the data, so it is aligned for multi-byte operations

    return {type: typeNum, data};
}

export const decodeRfidData = (data: Uint8Array): {cardIdBase64:string, signatureBase64:string} => {
    let cardIdBase64: string;
    let signatureBase64: string;
    
    {
        let binary = '';
        let isNonZero = false;
        let idLen = data[0];
        for (let i = 1; i < (1 + idLen); i++) {
            if (!isNonZero && data[i] > 0)
                isNonZero = true;
            binary += String.fromCharCode(data[i]);
        }
        if (!isNonZero) {
            throw new PacketError('Card ID is null', EMPTY_RESPONSE);
        }
        cardIdBase64 = window.btoa(binary);
    }
    
    {
        let binary = '';
        let isNonZero = false;
        for (let i = 16; i <= 31; i++) {
            if (!isNonZero && data[i] > 0)
                isNonZero = true;
            binary += String.fromCharCode(data[i]);
        }
        if (!isNonZero) {
            throw new PacketError('Card signature is null', EMPTY_RESPONSE);
        }
        signatureBase64 = window.btoa(binary);
    }

    return {cardIdBase64, signatureBase64};
}

export const createPingPacket = (numCode : number): Uint8Array => {
    const uint32 = new Uint32Array(1);
    uint32[0] = numCode;
    let msg = createPacket(ProtokolA2C.Ping, uint32.buffer);
    return msg;
}

// this accepts only the 32B long data part of the 35B packet
export const decodePongData = (data: Uint8Array): number => {
    let uint32: Uint32Array;
    if (data.byteOffset % Uint32Array.BYTES_PER_ELEMENT == 0)
        uint32 = new Uint32Array(data.buffer, data.byteOffset, Uint32Array.BYTES_PER_ELEMENT);
    else // copy the data
        uint32 = new Uint32Array(data.slice(data.byteOffset, data.byteOffset + Uint32Array.BYTES_PER_ELEMENT));
    const numCode: number = uint32[0];
    return numCode;
}

// takes two lines of text of at most 16 (ASCII) characters (ignores the rest)
export const createDisplayPacket = (lineOne: string, lineTwo: string): Uint8Array => {
    const msg = createPacket(ProtokolA2C.PrintTextDual);
    for(let i = 0; i < 16 && lineOne.length; i++)
        msg[2 + i] = lineOne.charCodeAt(i); // this will emmit modulo-256 for too big codes
    for(let i = 0; i < 16 && lineTwo.length; i++)
        msg[2 + 16 + i] = lineTwo.charCodeAt(i); // this will emmit modulo-256 for too big codes
    return msg;
}
