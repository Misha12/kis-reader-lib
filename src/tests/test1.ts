import { KisReaderClient } from "../reader";

let client = new KisReaderClient("wss://localhost");
client.connectedEvent.once(() => {
    console.log("connected");
    client.modeSingleRead();
});
client.cardReadEvent.on(ev => {
    console.log({cardData: ev.cardData, clientState: client.state});
});
client.connect();

declare var gclient;
if (typeof gclient !== 'undefined')
    gclient = client;
