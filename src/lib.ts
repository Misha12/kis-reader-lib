import { KisReaderClient } from "./reader";

export { KisReaderClient } from "./reader";
export { WrapperReader } from "./wrapperReader";

// takes URI, onData, onError, onConnect(optional) callbacks, returns disconnect lambda
export const readOneCard = (readerUri: string, onData: (data: string) => void, onError: (err: any) => void, onConnect?: () => void) : (() => void) => {
    if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
        readerUri = "wss://" + readerUri;
    let client = new KisReaderClient(readerUri);
    client.disconnectedEvent.once(onError);
    client.connectedEvent.once(reader => reader.modeSingleRead());
    if (onConnect)
        client.connectedEvent.once(onConnect);
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

// for testing the availability of the reader - will likely fail on alredy-connected reader
// takes URI, onResult callbacks, returns nothing
export const testReader = (readerUri: string, onResult: (success: boolean) => void) : void => {
    let client = new KisReaderClient(readerUri);
    client.connectedEvent.once(() => onResult(true));
    client.connectedEvent.once(() => client.disconnect());
    client.errorEvent.once(() => onResult(false));
    client.connect();
}
