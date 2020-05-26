import { KisReaderClient } from "./Client";
export declare class KisReaderSimpleClient {
    client: KisReaderClient;
    readCard(readerUri: string, onData: (data: string) => void, onError: (err: any) => void): void;
    disconnect(): void;
    tryConnect(readerUri: string, onResult: (success: boolean) => void): void;
}
