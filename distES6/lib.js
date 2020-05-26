import { KisReaderClient } from "./Client.js";
export { KisReaderClient } from "./Client.js";
export { KisReaderWrapperClient } from "./WrapperClient.js";
export { KisReaderSimpleClient } from "./SimpleClient.js";
export { ReaderState } from "./IClient.js";
export const readOneCard = (readerUri, onData, onError, onConnect) => {
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
    });
    client.connect();
    return () => {
        client.disconnectedEvent.offOnce(onError);
        client.disconnect();
    };
};
export const testReader = (readerUri, onResult) => {
    if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
        readerUri = "wss://" + readerUri;
    let client = new KisReaderClient(readerUri);
    client.connectedEvent.once(() => onResult(true));
    client.connectedEvent.once(() => client.disconnect());
    client.errorEvent.once(() => onResult(false));
    client.connect();
};
//# sourceMappingURL=lib.js.map