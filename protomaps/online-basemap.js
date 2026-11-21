/* OpenFreeMap online; existing Sevilla PMTiles stays independent and unchanged. */
(function(root){
 'use strict';
 const STYLES={light:'https://tiles.openfreemap.org/styles/bright',dark:'https://tiles.openfreemap.org/styles/fiord'};
 const CREDITS={online:'<a href="https://openfreemap.org/">OpenFreeMap</a> · © <a href="https://openmaptiles.org/">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',offline:'<a href="https://protomaps.com/">Protomaps</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'};
 class Basemap {
  constructor(gl,options={}){this.gl=gl;this.fetch=options.fetch||root.fetch.bind(root);this.base=options.base;this.saved=options.saved||(()=>false);this.bounds=options.bounds;this.online=options.online||(()=>root.navigator.onLine!==false);this.theme=options.theme||(()=>root.document.documentElement.dataset.theme==='night'?'dark':'light');this.status=options.status||(()=>{});this.credit=options.credit||(()=>{});this.setTimeout=options.setTimeout||root.setTimeout.bind(root);this.clearTimeout=options.clearTimeout||root.clearTimeout.bind(root);this.cache=new Map();this.current=null;this.wanted=null;this.busy=false;this.degraded=false;this.stopped=false;this.revision=0;this.stats={styleFetches:0,styleChanges:0,styleErrors:0};}
  inSevilla(){const p=this.gl.getCenter(),b=this.bounds;return p.lng>=b[0]&&p.lng<=b[2]&&p.lat>=b[1]&&p.lat<=b[3];}
  target(){return ((!this.online()||this.degraded)&&this.saved()&&this.inSevilla()?'offline:':'online:')+this.theme();}
  refresh(){if(this.stopped)return Promise.resolve();this.wanted=this.target();if(this.busy)return this.running;this.running=this.pump();return this.running;}
  async style(mode,theme,signal){const key=mode+':'+theme;if(this.cache.has(key))return structuredClone(this.cache.get(key));const url=mode==='online'?STYLES[theme]:new URL('style-'+theme+'.json',this.base).href;this.stats.styleFetches++;const r=await this.fetch(url,{signal});if(!r.ok)throw Error('Style unavailable '+r.status);const s=await r.json();if(s.version!==8||!s.sources||!Array.isArray(s.layers))throw Error('Invalid map style');if(mode==='online'&&!s.sources.openmaptiles)throw Error('Missing OpenFreeMap source');if(mode==='offline'){s.glyphs='localglyph://{fontstack}/{range}.pbf';s.sprite=new URL(theme,this.base).href;s.sources.protomaps.url='pmtiles://copiloter-sevilla';}this.cache.set(key,structuredClone(s));return s;}
  async apply(style){
   // Provider styles may change upstream. Never send extrusion layers to the GPU.
   if(style.sources?.openmaptiles)style.layers=style.layers.filter(layer=>layer.type!=='fill-extrusion');
   await new Promise((resolve,reject)=>{let timer;const done=()=>{cleanup();resolve();},cleanup=()=>{this.gl.off('style.load',done);this.clearTimeout(timer);};this.gl.on('style.load',done);timer=this.setTimeout(()=>{cleanup();reject(Error('Style load timeout'));},20000);try{this.gl.setStyle(style,{diff:!!this.current&&this.gl.isStyleLoaded()});}catch(e){cleanup();reject(e);}});
  }
  async pump(){this.busy=true;try{while(!this.stopped&&this.wanted!==this.current){const target=this.wanted,[mode,theme]=target.split(':'),controller=new AbortController();this.attempted=target;this.loading=controller;const timeout=this.setTimeout(()=>controller.abort(),12000);let style;try{style=await this.style(mode,theme,controller.signal);}finally{this.clearTimeout(timeout);if(this.loading===controller)this.loading=null;}if(this.wanted!==target)continue;await this.apply(style);this.current=target;this.stats.styleChanges++;this.credit(CREDITS[mode],mode,theme);this.status(mode==='offline'?'offline':this.online()&&!this.degraded?'ready':'unavailable');}}
   catch(error){if(this.wanted===this.attempted){this.stats.styleErrors++;this.lastError=String(error.message||error);this.status('unavailable');if(this.online()&&!this.degraded&&this.saved()&&this.inSevilla()){this.degraded=true;this.wanted=this.target();this.retry();}else this.wanted=this.current;}}
   finally{this.busy=false;}if(!this.stopped&&this.wanted!==this.current)return this.refresh();
  }
  offline(){this.degraded=true;this.status('unavailable');this.loading?.abort();this.clearTimeout(this.recoveryTimer);this.clearTimeout(this.retryTimer);return this.refresh();}
  reconnect(){this.clearTimeout(this.recoveryTimer);this.recoveryTimer=this.setTimeout(()=>{void this.probe();},1500);}
  probe(){if(this.probing)return this.probing;this.probing=this.checkConnection().finally(()=>{this.probing=null;});return this.probing;}
  async checkConnection(){if(!this.online()||this.stopped)return;const controller=new AbortController(),timer=this.setTimeout(()=>controller.abort(),8000);try{const r=await this.fetch(STYLES[this.theme()],{signal:controller.signal,cache:'no-cache'});if(!r.ok)throw Error('Offline');const s=await r.json();if(s.version!==8||!s.sources?.openmaptiles)throw Error('Invalid style');this.clearTimeout(this.retryTimer);this.clearTimeout(this.recoveryTimer);this.cache.set('online:'+this.theme(),s);this.degraded=false;this.reloadOnline=this.current?.startsWith('online:');if(this.reloadOnline)this.current=null;await this.refresh();}catch{this.status('unavailable');this.retry();}finally{this.clearTimeout(timer);}}
  retry(){this.clearTimeout(this.retryTimer);if(this.online()&&!this.stopped)this.retryTimer=this.setTimeout(()=>{void this.probe();},30000);}
  networkError(){if(this.current?.startsWith('offline:'))return;this.status('unavailable');this.clearTimeout(this.failureTimer);this.failureTimer=this.setTimeout(()=>{this.failureTimer=null;this.degraded=true;void this.refresh();this.retry();},2000);}
  recovered(success=false){if(success){this.clearTimeout(this.failureTimer);this.failureTimer=null;}if(this.online()&&!this.failureTimer&&this.current?.startsWith('online:')&&!this.degraded)this.status('ready');}
  dispose(){this.stopped=true;this.loading?.abort();for(const key of ['failureTimer','retryTimer','recoveryTimer'])this.clearTimeout(this[key]);}
 }
 const api={Basemap,STYLES,CREDITS};root.CopiloterOnlineBasemap=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
