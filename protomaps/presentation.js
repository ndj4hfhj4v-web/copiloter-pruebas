/* Presentation only. Existing data-refresh handlers, stores and map engines are retained. */
(() => {
 'use strict';
 const d=document,$=id=>d.getElementById(id),settings=$('settingsView'),info=$('infoView');
 const statusBox=$('dataStatus'),status=$('status'),refresh=$('refresh');
 // Retain dormant provider controls and credentials code without advertising unavailable maps.
 for(const tags of d.querySelectorAll('#mapsView .provider-pro-tags'))tags.hidden=true;
 for(const panel of d.querySelectorAll('#mapsView>.map-settings'))panel.hidden=true;
 const action=d.createElement('section');action.id='lineDataAction';
 refresh.classList.remove('primary');refresh.classList.add('line-data-refresh');action.append(refresh);info.append(action);
 statusBox.className='compact-data-status';statusBox.hidden=true;statusBox.setAttribute('aria-live','polite');statusBox.setAttribute('aria-atomic','true');
 d.body.append(statusBox);
 // About is the final settings option, followed by the existing legal disclaimer.
 const legal=settings.querySelector('footer');if(legal)settings.append(legal);
 let expiry=0,manual=false,generation=0;
 const hide=()=>{clearTimeout(expiry);statusBox.hidden=true;};
 const show=()=>{clearTimeout(expiry);statusBox.hidden=false;expiry=setTimeout(hide,6500);};
 const handler=refresh.onclick;
 refresh.onclick=async function(event){
  const ticket=++generation;manual=true;
  I18n.setText(status,I18n.msg(navigator.onLine===false?'uiConnect':'uiChecking'));show();
  try{await handler.call(this,event);}
  catch{I18n.setText(status,I18n.msg('m350'));}
  finally{if(ticket===generation){manual=false;show();}}
 };
 let lastState=statusBox.dataset.state,lastText=status.textContent;
 const observer=new MutationObserver(()=>{
  const state=statusBox.dataset.state;
  if(manual)return;
  if(state==='error'&&(lastState!==state||lastText!==status.textContent))show();
  else if(state==='loading'&&lastState!==state)show();
  else if(lastState==='loading'&&state!=='loading')hide();
  lastState=state;lastText=status.textContent;
 });
 observer.observe(statusBox,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-state']});
 if(['loading','error'].includes(lastState))show();
 const cityPanels=[['busSettingsView','sevilla'],['madridBusView','madrid'],['munichBusView','munich'],['nurembergBusView','nuremberg']];
 for(const [id,city]of cityPanels){
  const panel=$(id);let section=panel.querySelector('section');
  if(city==='sevilla'){
   // The retired IGN auto-download panel stays hidden, with its IDs/code preserved.
   section=d.createElement('section');section.id='sevillaMapHelp';
   const heading=d.createElement('h2');I18n.setText(heading,'Sevilla');section.append(heading);
   const copy=d.createElement('p');I18n.setText(copy,I18n.msg('uiSevilla'));section.append(copy);panel.prepend(section);
  }
  const provider=d.createElement('p');provider.className='current-map-provider';I18n.setText(provider,I18n.msg('uiProvider'));
  section.insertBefore(provider,section.firstChild.nextSibling);
  if(city!=='sevilla'){
   const availability=section.querySelector('.city-availability');
   if(availability)I18n.setText(availability,I18n.msg('m287'));
  }
 }
 // OSM tile-server policy is not the policy for the active OpenFreeMap service.
 const retired=info.querySelector('a[href="https://operations.osmfoundation.org/policies/tiles/"]');
 if(retired){I18n.setText(retired,'OpenFreeMap');retired.href='https://openfreemap.org/';}
 const licenses=retired?.parentElement;
 if(licenses){
  for(const [name,url]of [['OpenMapTiles','https://openmaptiles.org/'],['MapLibre','https://maplibre.org/'],['Leaflet','https://leafletjs.com/']]){
   const link=d.createElement('a');link.textContent=name;link.href=url;link.target='_blank';link.rel='noopener';licenses.append(d.createTextNode(' · '),link);
  }
 }
 I18n.mount(d.body);
 window.CopiloterPresentation={hideStatus:hide,destroy(){clearTimeout(expiry);observer.disconnect();}};
})();
