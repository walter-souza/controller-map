"use strict";
const electron = require("electron");
const api = {
  invoke(channel, ...args) {
    return electron.ipcRenderer.invoke(channel, ...args);
  },
  on(channel, listener) {
    const wrapped = (_, payload) => listener(payload);
    electron.ipcRenderer.on(channel, wrapped);
    return () => electron.ipcRenderer.removeListener(channel, wrapped);
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
