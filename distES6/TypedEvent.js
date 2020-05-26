export class TypedEvent {
    constructor() {
        this.listeners = [];
        this.listenersOnce = [];
        this.on = (listener) => {
            this.listeners.push(listener);
            return {
                dispose: () => this.off(listener)
            };
        };
        this.once = (listener) => {
            this.listenersOnce.push(listener);
        };
        this.off = (listener) => {
            var callbackIndex = this.listeners.indexOf(listener);
            if (callbackIndex > -1)
                this.listeners.splice(callbackIndex, 1);
        };
        this.offOnce = (listener) => {
            var callbackIndex = this.listenersOnce.indexOf(listener);
            if (callbackIndex > -1)
                this.listenersOnce.splice(callbackIndex, 1);
        };
        this.emit = (event) => {
            this.listeners.forEach((listener) => listener(event));
            if (this.listenersOnce.length > 0) {
                const toCall = this.listenersOnce;
                this.listenersOnce = [];
                toCall.forEach((listener) => listener(event));
            }
        };
        this.pipe = (te) => {
            return this.on((e) => te.emit(e));
        };
        this.count = () => {
            return this.listeners.length + this.listenersOnce.length;
        };
    }
}
//# sourceMappingURL=TypedEvent.js.map