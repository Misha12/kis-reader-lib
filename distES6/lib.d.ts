export { KisReaderClient } from "./Client";
export { KisReaderWrapperClient } from "./WrapperClient";
export { KisReaderSimpleClient } from "./SimpleClient";
export declare const readOneCard: (readerUri: string, onData: (data: string) => void, onError: (err: any) => void, onConnect?: () => void) => (() => void);
export declare const testReader: (readerUri: string, onResult: (success: boolean) => void) => void;
