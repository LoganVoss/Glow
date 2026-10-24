import assert from 'node:assert/strict';

// Complete reviewed command hooks, including React memoization and both native
// registrations. Minifier renames are accepted only as explicitly reviewed
// variants; unknown or mixed bindings must never be inferred from a new build.
export const SIDEBAR_VARIANTS = Object.freeze([
  Object.freeze({
    id: '20052-20156',
    hook: 'function Qni(e,t,n){let r=(0,$ni.c)(8),i=n===void 0||n,a;r[0]!==i||r[1]!==e||r[2]!==t?(a=()=>{if(!i)return;let n=!e.get(gC);$Rt(e,n,{animate:t,transition:n&&e.get(WH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})},r[0]=i,r[1]=e,r[2]=t,r[3]=a):a=r[3];let o=a;Pw(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],xs(`toggle-sidebar`,o,s)}',
    callback: 'a=()=>{if(!i)return;let n=!e.get(gC);$Rt(e,n,{animate:t,transition:n&&e.get(WH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}',
    registration: 'let o=a;Pw(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],xs(`toggle-sidebar`,o,s)',
    bridge: 'try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(gC),setOpen:__neonOpen=>$Rt(e,__neonOpen,{animate:t,transition:__neonOpen&&e.get(WH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})})===true)return}catch{}',
  }),
  Object.freeze({
    id: '20398',
    hook: 'function qni(e,t,n){let r=(0,Jni.c)(8),i=n===void 0||n,a;r[0]!==i||r[1]!==e||r[2]!==t?(a=()=>{if(!i)return;let n=!e.get(rC);fzt(e,n,{animate:t,transition:n&&e.get(YH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})},r[0]=i,r[1]=e,r[2]=t,r[3]=a):a=r[3];let o=a;xw(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],xs(`toggle-sidebar`,o,s)}',
    callback: 'a=()=>{if(!i)return;let n=!e.get(rC);fzt(e,n,{animate:t,transition:n&&e.get(YH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}',
    registration: 'let o=a;xw(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],xs(`toggle-sidebar`,o,s)',
    bridge: 'try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(rC),setOpen:__neonOpen=>fzt(e,__neonOpen,{animate:t,transition:__neonOpen&&e.get(YH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})})===true)return}catch{}',
  }),
  Object.freeze({
    id: '20586',
    hook: 'function EHa(e,t,n){let r=(0,DHa.c)(8),i=n===void 0||n,a;r[0]!==i||r[1]!==e||r[2]!==t?(a=()=>{if(!i)return;let n=!e.get(Hk);vur(e,n,{animate:t,transition:n&&e.get(FK)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})},r[0]=i,r[1]=e,r[2]=t,r[3]=a):a=r[3];let o=a;uj(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],go(`toggle-sidebar`,o,s)}',
    callback: 'a=()=>{if(!i)return;let n=!e.get(Hk);vur(e,n,{animate:t,transition:n&&e.get(FK)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}',
    registration: 'let o=a;uj(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],go(`toggle-sidebar`,o,s)',
    bridge: 'try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(Hk),setOpen:__neonOpen=>vur(e,__neonOpen,{animate:t,transition:__neonOpen&&e.get(FK)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})})===true)return}catch{}',
  }),

  Object.freeze({
    id: '21161',
    hook: 'function Rqa(e,t,n){let r=(0,zqa.c)(8),i=n===void 0||n,a;r[0]!==i||r[1]!==e||r[2]!==t?(a=()=>{if(!i)return;let n=!e.get(Gk);zpr(e,n,{animate:t,transition:n&&e.get(fq)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})},r[0]=i,r[1]=e,r[2]=t,r[3]=a):a=r[3];let o=a;yj(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],Li(`toggle-sidebar`,o,s)}',
    callback: 'a=()=>{if(!i)return;let n=!e.get(Gk);zpr(e,n,{animate:t,transition:n&&e.get(fq)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}',
    registration: 'let o=a;yj(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],Li(`toggle-sidebar`,o,s)',
    bridge: 'try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(Gk),setOpen:__neonOpen=>zpr(e,__neonOpen,{animate:t,transition:__neonOpen&&e.get(fq)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})})===true)return}catch{}',
  }),
  Object.freeze({
    id: '21828',
    hook: 'function oAt(e,t,n){let r=(0,sAt.c)(8),i=n===void 0||n,a;r[0]!==i||r[1]!==e||r[2]!==t?(a=()=>{if(!i)return;let n=!e.get(q_);M3e(e,n,{animate:t,transition:n&&e.get(xP)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})},r[0]=i,r[1]=e,r[2]=t,r[3]=a):a=r[3];let o=a;vx(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],Ee(`toggle-sidebar`,o,s)}',
    callback: 'a=()=>{if(!i)return;let n=!e.get(q_);M3e(e,n,{animate:t,transition:n&&e.get(xP)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}',
    registration: 'let o=a;vx(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],Ee(`toggle-sidebar`,o,s)',
    bridge: 'try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(q_),setOpen:__neonOpen=>M3e(e,__neonOpen,{animate:t,transition:__neonOpen&&e.get(xP)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})})===true)return}catch{}',
  }),
]);

// Preserve the original variant exports for existing source consumers.
export const SIDEBAR_CALLBACK = SIDEBAR_VARIANTS[0].callback;
export const SIDEBAR_REGISTRATION = SIDEBAR_VARIANTS[0].registration;
export const SIDEBAR_BRIDGE = SIDEBAR_VARIANTS[0].bridge;
const count = (source, text) => source.split(text).length - 1;

export function patchSidebarCycle(source) {
  assert.ok(!source.includes('__neonCodexRuntime') && !source.includes('__neonOpen'), 'Native sidebar command is already patched or reserved names collide');
  const occurrences = key => SIDEBAR_VARIANTS.reduce((total, variant) => total + count(source, variant[key]), 0);
  assert.equal(occurrences('callback'), 1, 'Expected exactly one reviewed native sidebar command callback');
  assert.equal(occurrences('registration'), 1, 'Expected exactly one reviewed native titlebar/menu sidebar command registration');
  assert.equal(occurrences('hook'), 1, 'Expected exactly one complete reviewed native sidebar command hook');
  const variant = SIDEBAR_VARIANTS.find(candidate => source.includes(candidate.hook));
  // Keep native startup independent of Glow: absent, declining or failed optional
  // code falls through to the unchanged native callback without new imports.
  const patchedHook = variant.hook.replace(variant.callback,
    variant.callback.replace('if(!i)return;', `if(!i)return;${variant.bridge}`));
  return source.replace(variant.hook, patchedHook);
}
