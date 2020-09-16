import { KisReaderClient } from "./Client";
import { ReaderState } from "./IClient";
import { TypedEvent } from "./TypedEvent";

/*
Kotyho komentář k "jednoduchému klientovi"
K čemu to NESLOUŽÍ:
- k plnému využití čtečky a tohoto softwaru 
  (pro to použijte implementaci IKisReaderClient, tedy KisReaderClient v Client.cs nebo KisReaderWrapperClient v WrapperClient.cs)
K čemu slouží:
- k rychlému použití čtečky, kdy KisReaderSimpleClient je použit jako singleton
--- singleton = instanci máme jen jednu (vytvoření po staru / před prvním requestem)  
Jak se používá:
- vytvoří se singleton třídy
- pokud je potřeba načíst jednu kartu, volá se readCard(adresa čtečky, callback při datech, callback při chybě)
--- při opakovaných voláních readData se spojení re-usuje, pokud je ve správném stavu
    (A TO I POKUD JE URL ODLIŠNÁ PŘI NÁSLEDNÝCH VOLÁNÍ) 
    [tohle je řešené v adminovi pomocí kontroly, kde pokud je adresa jiná, dojde nejdřív k odpojení starého spojení, v src\app\core\services\card-reader.service.ts]
- pokud je třeba/vhodné čtečku odpojit, volá se diconnect()
- pokud je třeba jen navázat spojení a zatím není třeba číst kartu, volá se tryConnect(adresa, callback uspech/neuspech)
*/

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
  
    // for testing the availability of the reader 
    // if used in sequence of "tryConnect, readCard", it will likely lead to a fail of "alredy-connected reader limitation of max 1 client", 
    //     bcs. the firmware of reader will not release the first connection quickly enough
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
