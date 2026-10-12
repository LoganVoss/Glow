import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchSidebarCycle, SIDEBAR_CALLBACK, SIDEBAR_REGISTRATION, SIDEBAR_BRIDGE } from '../scripts/sidebar-cycle-patch.mjs';

const fixture = () => `function Qni(e,t,n){let r=[],i=n===void 0||n,a;${SIDEBAR_CALLBACK};${SIDEBAR_REGISTRATION}}`;
function harness(runtime, { open=true, enabled=true, peek=false, animate=true }={}) {
  const calls=[], handlers={}, state={open};
  const context=vm.createContext({__neonCodexRuntime:runtime,gC:'open',WH:'peek',Pw:(name,handler)=>{handlers.command=handler;},xs:(name,handler)=>{handlers.ipc=handler;},$Rt:(scope,value,options)=>{state.open=value;calls.push({value,options});}});
  vm.runInContext(patchSidebarCycle(fixture()),context);
  context.Qni({get:key=>key==='open'?state.open:peek?{type:'peek'}:null},animate,enabled);
  return {calls,handlers,state};
}
test('only native callback changes; native registration and module dependencies stay intact',()=>{
  const source=fixture(), patched=patchSidebarCycle(source);
  assert.equal(patched.replace(SIDEBAR_BRIDGE,''),source);
  assert.equal(patched.includes('import'),false);
  assert.equal(patched.includes(SIDEBAR_REGISTRATION),true);
});
test('absent, missing, declining and throwing optional bridges retain native toggle',()=>{
  for(const runtime of [undefined,{}, {cycleSidebar:()=>false},{cycleSidebar:()=>undefined},{cycleSidebar:()=>{throw Error('optional failure');}}]) {
    const h=harness(runtime);
    h.handlers.command();
    assert.equal(h.state.open,false);
    assert.equal(h.calls.length,1);
    h.handlers.ipc();
    assert.equal(h.state.open,true);
    assert.equal(h.calls.length,2);
  }
});
test('three-state runtime can consume opening and restore without double native toggle',()=>{
  let hidden=false;
  const h=harness({cycleSidebar:({open,setOpen})=>{
    if(hidden){hidden=false;return true;}
    if(!open){hidden=true;setOpen(true);return true;}
    return false;
  }});
  h.handlers.command(); assert.equal(h.state.open,false);assert.equal(hidden,false);
  h.handlers.ipc(); assert.equal(h.state.open,true);assert.equal(hidden,true);
  h.handlers.command(); assert.equal(h.state.open,true);assert.equal(hidden,false);
  assert.deepEqual(h.calls.map(x=>x.value),[false,true]);
});
test('disabled native commands never call optional code or native writer',()=>{
  const h=harness({cycleSidebar:()=>assert.fail('disabled bridge called')},{enabled:false});
  h.handlers.command();h.handlers.ipc();assert.equal(h.calls.length,0);
});
test('native animation and peek transition options are preserved by setOpen',()=>{
  for(const animate of [true,false])for(const peek of [true,false]){
    const h=harness({cycleSidebar:({setOpen})=>{setOpen(true);return true;}},{open:false,animate,peek});
    h.handlers.command();const options=h.calls[0].options;
    assert.equal(options.animate,animate);
    assert.equal(options.transition?.duration,peek ? .12 : undefined);
    assert.equal(options.transition?.type,peek?'tween':undefined);
  }
});
test('changed, duplicate and already patched native hooks fail closed at build time',()=>{
  const source=fixture();
  assert.throws(()=>patchSidebarCycle(source.replace('animate:t','animate:!1')),/reviewed native/);
  assert.throws(()=>patchSidebarCycle(source+source),/exactly one/);
  assert.throws(()=>patchSidebarCycle(patchSidebarCycle(source)),/reviewed native|already patched/);
  assert.throws(()=>patchSidebarCycle(source.replace('Pw(`toggleSidebar`,o)','Pw(`other`,o)')),/registration/);
});
