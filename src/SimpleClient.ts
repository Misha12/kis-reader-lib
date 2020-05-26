import { KisReaderClient } from "./Client";
import { ReaderState } from "./IClient";
import { TypedEvent } from "./TypedEvent";

export class KisReaderSimpleClient {
    client: KisReaderClient;
  
    readCard(readerUri: string, onData: (data: string) => void, onError: (err: any) => void) : void {      
        // check if we are already connected  
        if(!(this.client && this.client.getState() == ReaderState.ST_IDLE))
        { // then re-connect
            if (this.client)
                this.client.disconnect();

            if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
                readerUri = "wss://" + readerUri;
            this.client = new KisReaderClient(readerUri);
            this.client.disconnectedEvent.once(onError);      
            this.client.connect();
            this.client.connectedEvent.once(reader => reader.modeSingleRead());
        }
        else // just switch mode
            this.client.modeSingleRead();
            
        // disconnection is not a wanted thing
        this.client.disconnectedEvent.once(onError);
        // attach the read event
        this.client.cardReadEvent.once(ev => {
            this.client.disconnectedEvent.offOnce(onError);
            onData(ev.cardData);
        })
    };
  
    disconnect() {
        if (!this.client)
            return;
        
        // we don't want notifications
        this.client.disconnectedEvent = new TypedEvent();
        this.client.disconnect();
        this.client = null;    
    }
  
    // for testing the availability of the reader - will likely fail on alredy-connected reader
    // takes URI, onResult callbacks, returns nothing
    tryConnect(readerUri: string, onResult: (success: boolean) => void) : void {
        if (!(readerUri.startsWith("ws://") || readerUri.startsWith("wss://")))
            readerUri = "wss://" + readerUri;
  
        this.client = new KisReaderClient(readerUri);
        this.client.connectedEvent.once(() => onResult(true));
        this.client.errorEvent.once(() => onResult(false));
        this.client.connect();
    }
}
