import { KisReaderClient } from "./reader";

export { KisReaderClient } from "./reader";

export const readOneCard = (readerUri: string, onData: (data: string) => void, onError: (err: any) => void) : ((any) => void) => {
    if (!(readerUri.startsWith("ws:// ") || readerUri.startsWith("wss:// ")))
        readerUri = "wss:// " + readerUri;
    let client = new KisReaderClient(readerUri);
    client.disconnectedEvent.once(onError);
    client.connectedEvent.once(reader => reader.modeSingleRead());
    client.cardReadEvent.once(ev => {
        client.disconnectedEvent.offOnce(onError);
        client.disconnect();
        onData(ev.cardData);
    })
    client.connect();
    return () => {
        client.disconnectedEvent.offOnce(onError);
        client.disconnect();
    }
};
