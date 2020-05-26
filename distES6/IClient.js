export var ReaderState;
(function (ReaderState) {
    ReaderState[ReaderState["ST_DISCONNECTED"] = 0] = "ST_DISCONNECTED";
    ReaderState[ReaderState["ST_RECONNECTING"] = 1] = "ST_RECONNECTING";
    ReaderState[ReaderState["ST_IDLE"] = 2] = "ST_IDLE";
    ReaderState[ReaderState["ST_AUTO_READ"] = 3] = "ST_AUTO_READ";
    ReaderState[ReaderState["ST_SINGLE_READ"] = 4] = "ST_SINGLE_READ";
    ReaderState[ReaderState["ST_UNKNOWN"] = 5] = "ST_UNKNOWN";
})(ReaderState || (ReaderState = {}));
//# sourceMappingURL=IClient.js.map