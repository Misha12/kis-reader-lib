import { KisReaderClient } from "./Client.js";
import { ReaderState } from "./IClient.js";
import { TypedEvent } from "./TypedEvent.js";
export class KisReaderSimpleClient {
    readCard(readerUri, onData, onError) {
        if (!(this.client && this.client.getState() == ReaderState.ST_IDLE)) {
            if (this.client)
                this.client.disconnect();
            if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
                readerUri = "wss://" + readerUri;
            this.client = new KisReaderClient(readerUri);
            this.client.disconnectedEvent.once(onError);
            this.client.connect();
            this.client.connectedEvent.once(reader => reader.modeSingleRead());
        }
        else
            this.client.modeSingleRead();
        this.client.disconnectedEvent.once(onError);
        this.client.cardReadEvent.once(ev => {
            this.client.disconnectedEvent.offOnce(onError);
            onData(ev.cardData);
        });
    }
    ;
    disconnect() {
        if (!this.client)
            return;
        this.client.disconnectedEvent = new TypedEvent();
        this.client.disconnect();
        this.client = null;
    }
    tryConnect(readerUri, onResult) {
        if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
            readerUri = "wss://" + readerUri;
        this.client = new KisReaderClient(readerUri);
        this.client.connectedEvent.once(() => onResult(true));
        this.client.errorEvent.once(() => onResult(false));
        this.client.connect();
    }
}
//# sourceMappingURL=SimpleClient.js.map