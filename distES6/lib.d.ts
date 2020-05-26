export { KisReaderClient } from "./reader";
export { WrapperReader } from "./wrapperReader";
export declare const readOneCard: (readerUri: string, onData: (data: string) => void, onError: (err: any) => void, onConnect?: () => void) => (() => void);
export declare const testReader: (readerUri: string, onResult: (success: boolean) => void) => void;
