import { PacketError } from './errors'
import { INVALID_FORMAT } from './errorCodes'


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

export const createPacket = (type: ProtokolA2C | ProtokolC2A): Uint8Array => {
    const packet = new Uint8Array(35)
    packet[0] = type
    packet[1] = 0x6E
    packet[34] = 0xE6
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
export const parsePacket = (packet: Uint8Array) => {

}

// export const decodePacket = (packet: Uint8Array): string => {
//     checkPacket(packet)
//     const packetData = packet.slice(2, 34)
//     let data = ''
//     packetData.forEach((val) => data += String.fromCharCode(val))
//     return data
// }

export const createPingPacket = (numCode : number): Uint8Array => {
    const binaryCode = new Uint32Array(1);
    binaryCode[0] = numCode;
    const msg = Uint8Array.from(createPacket(ProtokolA2C.Ping));
    msg[2] = binaryCode.buffer[0];
    msg[3] = binaryCode.buffer[1];
    msg[4] = binaryCode.buffer[2];
    msg[5] = binaryCode.buffer[3];
    return  msg;
}

// this accepts only the 32B long data part of the 35B packet
export const decodePong = (data: Uint8Array): number => {
    const binaryCode = new Uint32Array(1);
    binaryCode.buffer[0] = data[0];
    binaryCode.buffer[1] = data[1];
    binaryCode.buffer[2] = data[2];
    binaryCode.buffer[3] = data[3]
    const numCode: number = binaryCode[0];
    return numCode;
}