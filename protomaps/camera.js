/* Native MapLibre camera and projected overlays. The existing navigator owns GPS/recording. */
(function(root){
 class NativeCamera {
  constructor(renderer,map,getNavigator,env={}){
   this.gl=renderer;this.map=map;this.nav=getNavigator;this.L=env.L||root.L;this.document=env.document||root.document;this.raf=env.raf||root.requestAnimationFrame.bind(root);this.caf=env.caf||root.cancelAnimationFrame.bind(root);this.frame=null;this.dataFrame=null;this.updatingLeaflet=false;this.bound=new WeakSet();this.geometry=new WeakMap();this.disposed=false;
   this.nativeMove=()=>{if(!this.writingCamera&&!this.animation)this.toLeaflet();};this.manual=e=>{if(!e.originalEvent)return;this.handlingGesture=true;try{this.nav()?.suspendCamera?.();}finally{this.handlingGesture=false;}this.toLeaflet();};this.leafMove=()=>this.queueCamera();this.changed=e=>{this.bindLayer(e.layer);this.queueData();};
   map.options.zoomSnap=0;
   for(const handler of ['dragging','scrollWheelZoom','touchZoom','doubleClickZoom','boxZoom','keyboard','touchRotate','dragRotate'])map[handler]?.disable?.();
   for(const type of ['dragstart','rotatestart','pitchstart','zoomstart'])renderer.on(type,this.manual);
   renderer.on('move',this.nativeMove);map.on('move zoom rotate',this.leafMove);map.on('zoomend',()=>this.queueData());map.on('layeradd layerremove',this.changed);map.eachLayer(l=>this.bindLayer(l));
   map.getContainer().addEventListener('click',e=>{if(e.target.closest('.leaflet-control-zoom-in,.leaflet-control-zoom-out'))this.nav()?.suspendCamera?.();},true);
   renderer.on('style.load',()=>{this.installLayers();this.queueData();});renderer.on('click',e=>this.popup(e));
   root.document?.documentElement.setAttribute('data-camera-native','true');
   this.installLayoutTracking();
   this.toLeaflet();
  }
  static anchor(width,height,visible={top:0,bottom:height},controls=[]){
   const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));let top=clamp(visible.top||0,0,height-1),bottom=clamp(visible.bottom??height,top+1,height);
   for(const r of controls){if(r.left>width/2+18||r.right<width/2-18||r.bottom<=top||r.top>=bottom||r.bottom-r.top>height*.45)continue;
    if(r.bottom<=height*.45)top=Math.max(top,Math.min(r.bottom+8,bottom-1));
    else if(r.top>=height*.55)bottom=Math.min(bottom,Math.max(r.top-8,top+1));
   }
   return{width,height,top,bottom,point:[width/2,top+(bottom-top)*2/3]};
  }
  layout(){
   const host=this.gl.getContainer?.()||this.map.getContainer(),box=host.getBoundingClientRect?.()||{left:0,top:0,width:0,height:0},size=this.map.getSize?.()||{};
   const width=host.clientWidth||box.width||size.x||390,height=host.clientHeight||box.height||size.y||800,win=this.document.defaultView;
   let top=0,bottom=height;const controls=[];
   if(win){const safe=this.probe?win.getComputedStyle(this.probe):null;top=parseFloat(safe?.paddingTop)||0;bottom-=parseFloat(safe?.paddingBottom)||0;
    const viewport=win.visualViewport;if(viewport){top=Math.max(top,viewport.offsetTop-box.top);bottom=Math.min(bottom,viewport.offsetTop+viewport.height-box.top);}
    for(const element of this.layoutControls()){
     if(!element.getClientRects().length)continue;let visible=true;
     for(let node=element;node&&node!==this.document.documentElement;node=node.parentElement){const style=win.getComputedStyle(node);if(node.hidden||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'){visible=false;break;}}
     if(!visible)continue;const r=element.getBoundingClientRect();controls.push({left:r.left-box.left,right:r.right-box.left,top:r.top-box.top,bottom:r.bottom-box.top});
    }
   }
   return NativeCamera.anchor(width,height,{top,bottom},controls);
  }
  layoutControls(){return this.document.querySelectorAll?.('.route-heading,#senseBar,#gpsPanel,#gpsInformationView,.map-readouts,.leaflet-control-attribution')||[];}
  installLayoutTracking(){
   const win=this.document.defaultView;if(!win)return;const host=this.gl.getContainer?.()||this.map.getContainer();
   this.probe=this.document.createElement('div');this.probe.setAttribute('aria-hidden','true');this.probe.style.cssText='position:absolute;inset:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)';host.append(this.probe);
   this.onLayout=()=>this.requestLayout();this.gl.on('resize',this.onLayout);win.visualViewport?.addEventListener('resize',this.onLayout);win.visualViewport?.addEventListener('scroll',this.onLayout);
   if(win.ResizeObserver){this.layoutResize=new win.ResizeObserver(this.onLayout);this.layoutResize.observe(host);for(const node of this.layoutControls())this.layoutResize.observe(node);}
   if(win.MutationObserver){this.layoutObserver=new win.MutationObserver(records=>{const nodes=[...this.layoutControls()];if(records.some(r=>nodes.some(n=>n===r.target||r.target.contains?.(n))))this.requestLayout();});this.layoutObserver.observe(this.document.getElementById('gpsDetail')||host,{subtree:true,attributes:true,attributeFilter:['hidden','class','style','data-options-hidden','data-recording','data-navigating','data-menu-open']});}
   (this.document.getElementById('gpsDetail')||host).addEventListener('transitionend',event=>{if([...this.layoutControls()].some(n=>n===event.target||event.target.contains?.(n)))this.requestLayout();});
  }
  requestLayout(){if(this.disposed||!this.lastFollowFix||this.nav()?.isFollowing?.()===false||this.layoutFrame!=null)return;this.layoutFrame=this.raf(()=>{this.layoutFrame=null;if(this.nav()?.isFollowing?.()!==false)this.follow(this.lastFollowFix,this.course);});}
  bindLayer(layer){if(!layer||this.bound.has(layer))return;this.bound.add(layer);layer.on?.('move add remove',()=>this.queueData());
   for(const name of ['setLatLngs','addLatLng','setRadius','setStyle','setOpacity','bindTooltip']){const original=layer[name];if(typeof original!=='function')continue;const camera=this;layer[name]=function(...args){const result=original.apply(this,args);if(name==='setLatLngs'||name==='addLatLng')camera.geometry.delete(this);camera.queueData();return result;};}
  }
  isSyncing(){return this.updatingLeaflet||!!this.writingCamera;}
  cancel(){if(this.isSyncing())return;this.animation=null;if(this.motionFrame!=null)this.caf(this.motionFrame);if(this.layoutFrame!=null)this.caf(this.layoutFrame);this.layoutFrame=null;this.motionFrame=null;if(!this.handlingGesture)this.gl.stop();if(this.frame!==null)this.caf(this.frame);this.frame=null;this.toLeaflet();}
  observeFix(fix,heading){
   if(!Number.isFinite(fix.time)||fix.time<=(this.courseTime??-Infinity))return;
   const previousTime=this.courseTime;this.courseTime=fix.time;
   if(!Number.isFinite(heading)||heading<0||heading>=360||fix.accuracy>35||(Number.isFinite(fix.speed)&&fix.speed<1.5)){this.pendingCourse=null;return;}
   if(this.course==null){this.course=heading;this.validCourseTime=fix.time;return;}
   const delta=this.turn(heading-this.course),dt=Math.max(.1,Math.min(3,(fix.time-(previousTime??fix.time-1000))/1000));
   if(Math.abs(delta)>70){const pending=this.pendingCourse;if(!pending||fix.time-pending.time>4000||Math.abs(this.turn(heading-pending.heading))>25){this.pendingCourse={heading,time:fix.time};return;}}
   this.pendingCourse=null;this.validCourseTime=fix.time;
   if(Math.abs(delta)<=4)return;
   const filtered=delta*(1-Math.exp(-dt/.45)),limit=Math.min(90,45*dt);
   this.course=(this.course+Math.max(-limit,Math.min(limit,filtered))+360)%360;
  }
  turn(angle){return ((angle%360+540)%360)-180;}
  follow(fix,heading,reset=false){
   if(this.nav()?.isFollowing?.()===false||!Number.isFinite(fix.lat)||!Number.isFinite(fix.lon))return;
   this.observeFix(fix,heading);
   this.lastFollowFix=fix;const layout=this.layout(),screen=layout.point;
   const target={center:[fix.lon,fix.lat],bearing:this.course??this.gl.getBearing(),screen,size:[layout.width,layout.height]};
   // A queued Leaflet zoom is a real UI request, not a GPS animation to replay.
   if(this.frame!==null){target.zoom=this.map.getZoom()-1;this.caf(this.frame);this.frame=null;}
   if(this.animation){this.animation.target={...this.animation.target,...target};return;}
   const c=this.gl.unproject(screen),bearing=this.gl.getBearing(),position=this.gl.project(target.center);
   if(Math.hypot(position.x-screen[0],position.y-screen[1])<.05&&Math.abs(this.turn(target.bearing-bearing))<.01&&target.zoom==null)return;
   this.gl.stop();
   this.animation={from:{center:[c.lng,c.lat],bearing,zoom:this.gl.getZoom(),screen:[...screen],size:[layout.width,layout.height]},target,started:null,duration:reset?280:240};
   this.motionFrame=this.raf(time=>this.tick(time));
  }
  tick(time){
   this.motionFrame=null;const animation=this.animation;if(!animation)return;
   if(this.nav()?.isFollowing?.()===false){this.animation=null;return;}
   if(animation.started===null)animation.started=time;
   const t=Math.min(1,Math.max(0,(time-animation.started)/animation.duration)),ease=t*t*(3-2*t),{from,target}=animation;
   const options={center:[from.center[0]+(target.center[0]-from.center[0])*ease,from.center[1]+(target.center[1]-from.center[1])*ease],bearing:from.bearing+this.turn(target.bearing-from.bearing)*ease,padding:{top:0,bottom:0,left:0,right:0}};
   if(target.zoom!=null)options.zoom=from.zoom+(target.zoom-from.zoom)*ease;
   const size=this.map.getSize(),dimensions=[size.x,size.y],screen=from.screen.map((p,i)=>{const start=p*dimensions[i]/from.size[i],end=target.screen[i]*dimensions[i]/target.size[i];return start+(end-start)*ease;});
   options.offset=[screen[0]-size.x/2,screen[1]-size.y/2];options.duration=0;options.animate=false;
   // MapLibre resolves the pixel anchor at the current pitch/bearing synchronously.
   // Its zero-duration segment has no timer: this RAF remains the only animation clock.
   this.writingCamera=true;try{this.gl.easeTo(options);}finally{this.writingCamera=false;}
   if(this.animation!==animation)return;
   // Leaflet is a data mirror; rebuilding its route arrows every camera frame is wasteful.
   if(t===1){this.animation=null;this.toLeaflet();}else this.motionFrame=this.raf(next=>this.tick(next));
  }
  toLeaflet(){if(this.disposed)return;const center=this.gl.getCenter(),zoom=this.gl.getZoom()+1,bearing=-this.gl.getBearing();const host=this.gl.getContainer?.();if(host){host.dataset.cameraRevision='native-4';host.dataset.cameraBearing=String(this.gl.getBearing());host.dataset.cameraPitch=String(this.gl.getPitch());host.dataset.cameraZoom=String(this.gl.getZoom());}this.updatingLeaflet=true;try{const current=this.map.getCenter();if(Math.abs(((((this.map.getBearing?.()||0)-bearing)%360+540)%360)-180)>.01)this.map.setBearing?.(bearing);if(Math.abs(current.lat-center.lat)>1e-9||Math.abs(current.lng-center.lng)>1e-9||Math.abs(this.map.getZoom()-zoom)>1e-7)this.map.setView([center.lat,center.lng],zoom,{animate:false});}finally{this.updatingLeaflet=false;}}
  queueCamera(){if(this.updatingLeaflet||this.disposed||this.frame!==null)return;this.frame=this.raf(()=>{this.frame=null;this.fromLeaflet();});}
  fromLeaflet(){if(this.updatingLeaflet||this.disposed)return;const c=this.map.getCenter(),now=this.gl.getCenter(),zoom=this.map.getZoom()-1,bearing=-(this.map.getBearing?.()||0);const turn=(((bearing-this.gl.getBearing())%360+540)%360)-180;if(Math.abs(c.lat-now.lat)<1e-9&&Math.abs(c.lng-now.lng)<1e-9&&Math.abs(zoom-this.gl.getZoom())<1e-7&&Math.abs(turn)<.01)return;this.gl.easeTo({center:[c.lng,c.lat],zoom,bearing:this.gl.getBearing()+turn,duration:350,essential:true});}
  queueData(){if(this.disposed||this.dataFrame!==null)return;this.dataFrame=this.raf(()=>{this.dataFrame=null;const source=this.gl.getSource('copiloter-overlays');if(source)source.setData(this.collect());});}
  collect(){const features=[],L=this.L;this.map.eachLayer(layer=>{
   if(layer instanceof L.LayerGroup||!layer.toGeoJSON)return;const options=layer.options||{};let feature;
   if(layer instanceof L.Circle){const p=layer.getLatLng(),metres=layer.getRadius(),ring=[];for(let n=0;n<=48;n++){const a=n/48*Math.PI*2;ring.push([p.lng+Math.cos(a)*metres/(111320*Math.cos(p.lat*Math.PI/180)),p.lat+Math.sin(a)*metres/111320]);}feature={type:'Feature',geometry:{type:'Polygon',coordinates:[ring]}};}
   else if(layer instanceof L.Polyline){let cached=this.geometry.get(layer);if(!cached||cached.ref!==layer.getLatLngs()){cached={ref:layer.getLatLngs(),geometry:layer.toGeoJSON().geometry};this.geometry.set(layer,cached);}feature={type:'Feature',geometry:cached.geometry};}
   else feature=layer.toGeoJSON();
   if(!feature?.geometry||feature.type!=='Feature')return;
   const gps=String(options.icon?.options?.className||'').includes('gps-arrow'),terminal=String(options.className||'').includes('route-terminal-stop'),direction=String(options.className||'').split(/\s+/).includes('route-direction-arrow');let label=layer.getTooltip?.()?.getContent?.();if(typeof label!=='string')label=label?.textContent||'';if(root.I18n)label=root.I18n.value(label);
   feature.properties={kind:gps?'gps':terminal?'terminal':layer instanceof L.Circle?'accuracy':direction?'direction':feature.geometry.type==='Point'?'stop':feature.geometry.type.includes('Polygon')?'polygon':'line',color:options.color||'#315e46',fill:options.fillColor||options.color||'#315e46',width:options.weight??2,opacity:options.opacity??1,fillOpacity:options.fillOpacity??.5,radius:options.radius||6.25,label,heading:this.course??0};features.push(feature);
  });return{type:'FeatureCollection',features};}
  installLayers(){const gl=this.gl;if(gl.getSource('copiloter-overlays'))return;gl.addSource('copiloter-overlays',{type:'geojson',data:this.collect()});
   const canvas=this.document.createElement('canvas');canvas.width=canvas.height=36;const ctx=canvas.getContext('2d');ctx.beginPath();ctx.moveTo(18,3);ctx.lineTo(32,32);ctx.lineTo(18,26);ctx.lineTo(4,32);ctx.closePath();ctx.fillStyle='#e2231a';ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#fff';ctx.lineJoin='round';ctx.stroke();if(!gl.hasImage('copiloter-gps'))gl.addImage('copiloter-gps',ctx.getImageData(0,0,36,36));ctx.clearRect(0,0,36,36);ctx.fillStyle='#e2f3a2';ctx.fillRect(9,9,18,18);ctx.strokeStyle='#244b3b';ctx.lineWidth=3;ctx.strokeRect(9,9,18,18);if(!gl.hasImage('copiloter-terminal'))gl.addImage('copiloter-terminal',ctx.getImageData(0,0,36,36));
   const layer=(id,type,filter,paint,layout)=>gl.addLayer({id,source:'copiloter-overlays',type,filter,paint,...(layout?{layout}:{})});
   layer('copiloter-area','fill',['in',['get','kind'],['literal',['accuracy','polygon']]],{'fill-color':['get','fill'],'fill-opacity':['get','fillOpacity']});
   layer('copiloter-lines','line',['all',['in',['geometry-type'],['literal',['LineString','Polygon']]],['!=',['get','kind'],'direction']],{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':['get','opacity']},{'line-cap':'round','line-join':'round'});
   // Paint both parts of direction arrows after the route stroke, before stops/GPS.
   layer('copiloter-directions-fill','fill',['==',['get','kind'],'direction'],{'fill-color':['get','fill'],'fill-opacity':['get','fillOpacity']});
   layer('copiloter-directions-outline','line',['==',['get','kind'],'direction'],{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':['get','opacity']},{'line-cap':'round','line-join':'round'});
   layer('copiloter-stops','circle',['==',['get','kind'],'stop'],{'circle-radius':['get','radius'],'circle-color':['get','fill'],'circle-opacity':['get','fillOpacity'],'circle-stroke-color':['get','color'],'circle-stroke-width':['get','width']});
   layer('copiloter-terminals','symbol',['==',['get','kind'],'terminal'],{}, {'icon-image':'copiloter-terminal','icon-size':['/',['get','radius'],9],'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-pitch-alignment':'map','icon-rotation-alignment':'map'});
   layer('copiloter-position','symbol',['==',['get','kind'],'gps'],{'icon-opacity':['get','opacity']},{'icon-image':'copiloter-gps','icon-allow-overlap':true,'icon-ignore-placement':true,'icon-rotate':['get','heading'],'icon-rotation-alignment':'map','icon-pitch-alignment':'map'});
  }
  popup(event){if(!this.Popup||!this.gl.getLayer("copiloter-stops"))return;const features=this.gl.queryRenderedFeatures([[event.point.x-7,event.point.y-7],[event.point.x+7,event.point.y+7]],{layers:['copiloter-stops','copiloter-terminals']});const feature=features.find(f=>f.properties.label);if(feature)new this.Popup({closeButton:true}).setLngLat(feature.geometry.coordinates).setText(feature.properties.label).addTo(this.gl);}
 }
 root.CopiloterNativeCamera=NativeCamera;if(typeof module!=='undefined')module.exports=NativeCamera;
})(globalThis);
