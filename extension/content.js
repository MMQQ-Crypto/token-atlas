const pushEnabled=async()=>{const {enabled=false}=await chrome.storage.local.get('enabled');window.postMessage({channel:'token-atlas-control',enabled},location.origin);};
pushEnabled();document.addEventListener('DOMContentLoaded',pushEnabled,{once:true});chrome.storage.onChanged.addListener(pushEnabled);
window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  if(event.data?.channel==='token-atlas-usage'&&event.data.record)chrome.runtime.sendMessage({type:'usage',record:event.data.record}).catch(()=>{});
  if(event.data?.channel==='token-atlas-observed')chrome.runtime.sendMessage({type:'observed',hasUsage:event.data.hasUsage===true}).catch(()=>{});
});
