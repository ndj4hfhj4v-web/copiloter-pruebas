/* Isolated test-pack database. No legacy maps, routes or preferences are deleted. */
(function(root){
 class PackStore {
  constructor(config,env={}){this.config=config;this.fetch=env.fetch||root.fetch.bind(root);this.idb=env.indexedDB||root.indexedDB;this.memory=new Map();this.active=null;}
  async db(){if(!this.opening)this.opening=new Promise((resolve,reject)=>{const r=this.idb.open('copiloter-protomaps-test-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.opening;}
  async operation(mode,fn){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('packs',mode);const request=fn(tx.objectStore('packs'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage aborted'));});}
  async saved(){return this.operation('readonly',s=>s.get(this.config.id));}
  async remove(){if(this.active)throw Error('Download already running');await this.operation('readwrite',s=>s.delete(this.config.id));this.memory.clear();}
  async blob(name){if(!this.memory.has(name))this.memory.set(name,this.saved().then(record=>record?.files?.[name]||null).catch(()=>null));return this.memory.get(name);}
  async bytes(name,offset,length,signal){const spec=this.config.files[name];if(!spec||!Number.isSafeInteger(offset)||offset<0||length<=0||offset+length>spec.bytes)throw Error('Invalid map range');const saved=await this.blob(name);if(saved)return{data:await saved.slice(offset,offset+length).arrayBuffer()};
   const r=await this.fetch(spec.url,{headers:{Range:`bytes=${offset}-${offset+length-1}`},signal,cache:'no-store'});if(r.status===206){const expected=`bytes ${offset}-${offset+length-1}/${spec.bytes}`;if(r.headers.get('Content-Range')!==expected)throw Error('Invalid Content-Range');const b=await r.arrayBuffer();if(b.byteLength!==length)throw Error('Truncated map range');return{data:b};}
   if(r.status!==200)throw Error('Map unavailable');const b=await r.arrayBuffer();if(b.byteLength!==spec.bytes)throw Error('Truncated map file');return{data:b.slice(offset,offset+length)};
  }
  async download(progress=()=>{},signal){if(this.active)throw Error('Download already running');this.active=true;try{
   const total=Object.values(this.config.files).reduce((n,f)=>n+f.bytes,0),estimate=await root.navigator?.storage?.estimate?.();if(estimate?.quota&&estimate.quota-estimate.usage<total*1.25)throw Error('Insufficient storage');let done=0;const files={};
   for(const [name,spec]of Object.entries(this.config.files)){const r=await this.fetch(spec.url,{cache:'no-store',signal});if(!r.ok)throw Error('Map download failed');const reader=r.body.getReader(),chunks=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>spec.bytes){await reader.cancel();throw Error('Oversized map');}chunks.push(part.value);progress(done+size,total);}if(size!==spec.bytes)throw Error('Incomplete map');const blob=new Blob(chunks),hash=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==spec.sha256)throw Error('Map checksum mismatch');files[name]=blob;done+=size;
   }
   if(signal?.aborted)throw Error('Download cancelled');await this.operation('readwrite',s=>s.put({files,completed:Date.now(),bytes:total},this.config.id));this.memory.clear();return{bytes:total,persistent:await root.navigator?.storage?.persist?.().catch(()=>false)||false};
  }finally{this.active=false;}}
 }
 root.CopiloterPackStore=PackStore;if(typeof module!=='undefined')module.exports=PackStore;
})(globalThis);
