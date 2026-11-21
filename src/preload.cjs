const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('threadflow',{
  invoke:(name,...args)=>ipcRenderer.invoke('threadflow:'+name,...args),
  onChange:callback=>ipcRenderer.on('threadflow:change',()=>callback())
});
