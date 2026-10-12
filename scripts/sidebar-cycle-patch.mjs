import assert from 'node:assert/strict';

// This exact callback is shared by the native titlebar, menu and keyboard
// command in both reviewed vendor builds. Keep native startup independent of
// Glow: an absent or failed optional bridge falls through to the original code.
export const SIDEBAR_CALLBACK = 'a=()=>{if(!i)return;let n=!e.get(gC);$Rt(e,n,{animate:t,transition:n&&e.get(WH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0})}';
export const SIDEBAR_REGISTRATION = 'let o=a;Pw(`toggleSidebar`,o);let s;r[4]!==i||r[5]!==e||r[6]!==t?(s=[i,e,t],r[4]=i,r[5]=e,r[6]=t,r[7]=s):s=r[7],xs(`toggle-sidebar`,o,s)';
const OPEN_OPTIONS = 'animate:t,transition:__neonOpen&&e.get(WH)?.type===`peek`?{type:`tween`,duration:.12,ease:[0,0,.58,1]}:void 0';
export const SIDEBAR_BRIDGE = `try{if(globalThis.__neonCodexRuntime?.cycleSidebar?.({open:e.get(gC),setOpen:__neonOpen=>$Rt(e,__neonOpen,{${OPEN_OPTIONS}})})===true)return}catch{}`;
const count = (source, text) => source.split(text).length - 1;

export function patchSidebarCycle(source) {
  assert.equal(count(source, SIDEBAR_CALLBACK), 1, 'Expected exactly one reviewed native sidebar command callback');
  assert.equal(count(source, SIDEBAR_REGISTRATION), 1, 'Expected native titlebar/menu sidebar command registration');
  assert.ok(!source.includes('__neonCodexRuntime') && !source.includes('__neonOpen'), 'Native sidebar command is already patched or reserved names collide');
  const start = source.indexOf('function Qni(e,t,n){');
  const callback = source.indexOf(SIDEBAR_CALLBACK);
  assert.ok(start >= 0 && callback > start && callback - start < 160, 'Native sidebar callback is no longer in the reviewed command hook');
  const registration = source.indexOf(SIDEBAR_REGISTRATION, callback);
  assert.ok(registration > callback && registration - callback < SIDEBAR_CALLBACK.length + 100,
    'Native sidebar callback no longer belongs to both registered command paths');
  return source.replace(SIDEBAR_CALLBACK, SIDEBAR_CALLBACK.replace('if(!i)return;', `if(!i)return;${SIDEBAR_BRIDGE}`));
}
