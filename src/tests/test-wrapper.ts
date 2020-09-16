import { KisReaderClient } from "../Client";
import { KisReaderWrapperClient } from "../WrapperClient";

// vytvoří dve wrappery čtečky nad realnou čtečku
// pernamentně čte karty od zákazníka, na začátku čte jednu kartu pro barmana prioritně, a po úspěšném načtení pak po 5s ještě jednu karta pro barmana

let client = new KisReaderClient("wss://localhost");
let wrapperZakazanik = new KisReaderWrapperClient(client, false);
let wrapperBarman = new KisReaderWrapperClient(client, true);

// lze použít connectedEvent z kterékoli classy, v tomto případě budou vyhozeny hned po sobě
client.connectedEvent.once(() => {
    console.log("reader connected");
    wrapperZakazanik.modeAutoRead(); // musí být první, protože pak následuje exkluzivní single-read od barmana
    wrapperBarman.modeSingleRead();
});

wrapperZakazanik.cardReadEvent.on(ev => {
    console.log({co: "zakaznik", cardData: ev.cardData, clientState: client.state});
});

wrapperBarman.cardReadEvent.on(ev => {
    console.log({co: "barman", cardData: ev.cardData, clientState: client.state});    
    setTimeout(() => wrapperBarman.modeSingleRead(), 5000); // za 5000ms znovu načti barmanskou kartu
});

// start this!
wrapperZakazanik.connect(); // no-op
wrapperBarman.connect(); // no-op
