import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchSidebarCycle, SIDEBAR_VARIANTS } from '../scripts/sidebar-cycle-patch.mjs';

const bindings = {
  '20052-20156': { hook: 'Qni', memo: '$ni', open: 'gC', peek: 'WH', writer: '$Rt', command: 'Pw', ipc: 'xs' },
  '20398': { hook: 'qni', memo: 'Jni', open: 'rC', peek: 'YH', writer: 'fzt', command: 'xw', ipc: 'xs' },
  '20586': { hook: 'EHa', memo: 'DHa', open: 'Hk', peek: 'FK', writer: 'vur', command: 'uj', ipc: 'go' },
  '21161': { hook: 'Rqa', memo: 'zqa', open: 'Gk', peek: 'fq', writer: 'zpr', command: 'yj', ipc: 'Li' },
  '21828': { hook: 'oAt', memo: 'sAt', open: 'q_', peek: 'xP', writer: 'M3e', command: 'vx', ipc: 'Ee' },
};
function harness(variant, runtime, { open=true, enabled=true, peek=false, animate=true }={}) {
  const calls=[], handlers={}, state={open}, cache=Array(8).fill(Symbol('unset'));
  const names=bindings[variant.id];
  const context=vm.createContext({
    __neonCodexRuntime:runtime,
    [names.memo]:{c:size=>{assert.equal(size,8);return cache;}},
    [names.open]:'open', [names.peek]:'peek',
    [names.command]:(name,handler)=>{assert.equal(name,'toggleSidebar');handlers.command=handler;},
    [names.ipc]:(name,handler)=>{assert.equal(name,'toggle-sidebar');handlers.ipc=handler;},
    [names.writer]:(scope,value,options)=>{state.open=value;calls.push({value,options});},
  });
  vm.runInContext(patchSidebarCycle(variant.hook),context);
  const scope={get:key=>key==='open'?state.open:peek?{type:'peek'}:null};
  const render=(nextEnabled=enabled)=>context[names.hook](scope,animate,nextEnabled);
  render();
  return {calls,handlers,state,render};
}
for (const variant of SIDEBAR_VARIANTS) {
  test(`${variant.id}: only native callback changes; registration and dependencies stay intact`,()=>{
    const source=`/* before */${variant.hook}/* after */`, patched=patchSidebarCycle(source);
    assert.equal(patched.replace(variant.bridge,''),source);
    assert.equal(patched.includes('import'),false);
    assert.equal(patched.includes(variant.registration),true);
  });
  test(`${variant.id}: absent, missing, declining and throwing bridges retain native toggle`,()=>{
    for(const runtime of [undefined,{}, {cycleSidebar:()=>false},{cycleSidebar:()=>undefined},{cycleSidebar:()=>{throw Error('optional failure');}}]) {
      const h=harness(variant,runtime);
      h.handlers.command();
      assert.equal(h.state.open,false);
      assert.equal(h.calls.length,1);
      h.handlers.ipc();
      assert.equal(h.state.open,true);
      assert.equal(h.calls.length,2);
    }
  });
  test(`${variant.id}: three-state runtime consumes opening and restores without double toggle`,()=>{
    let hidden=false;
    const h=harness(variant,{cycleSidebar:({open,setOpen})=>{
      if(hidden){hidden=false;return true;}
      if(!open){hidden=true;setOpen(true);return true;}
      return false;
    }});
    h.handlers.command(); assert.equal(h.state.open,false);assert.equal(hidden,false);
    h.handlers.ipc(); assert.equal(h.state.open,true);assert.equal(hidden,true);
    h.handlers.command(); assert.equal(h.state.open,true);assert.equal(hidden,false);
    assert.deepEqual(h.calls.map(x=>x.value),[false,true]);
  });
  test(`${variant.id}: native memoization retains handlers and refreshes disabled state`,()=>{
    const h=harness(variant,{cycleSidebar:()=>assert.fail('disabled bridge called')},{enabled:false});
    const original=h.handlers.command;
    h.render();assert.equal(h.handlers.command,original);assert.equal(h.handlers.ipc,original);
    h.handlers.command();h.handlers.ipc();assert.equal(h.calls.length,0);
    h.render(true);assert.notEqual(h.handlers.command,original);assert.equal(h.handlers.ipc,h.handlers.command);
  });
  test(`${variant.id}: native animation and peek options are preserved by setOpen`,()=>{
    for(const animate of [true,false])for(const peek of [true,false]){
      const h=harness(variant,{cycleSidebar:({setOpen})=>{setOpen(true);return true;}},{open:false,animate,peek});
      h.handlers.command();const options=h.calls[0].options;
      assert.equal(options.animate,animate);
      assert.equal(options.transition?.duration,peek ? .12 : undefined);
      assert.equal(options.transition?.type,peek?'tween':undefined);
    }
  });
  test(`${variant.id}: changed, duplicate and already patched hooks fail closed`,()=>{
    const source=variant.hook;
    assert.throws(()=>patchSidebarCycle(source.replace('animate:t','animate:!1')),/reviewed native/);
    assert.throws(()=>patchSidebarCycle(source+source),/exactly one/);
    assert.throws(()=>patchSidebarCycle(patchSidebarCycle(source)),/already patched/);
    assert.throws(()=>patchSidebarCycle(source.replace('`toggleSidebar`','`other`')),/registration/);
    assert.throws(()=>patchSidebarCycle(source.replace('(8)','(9)')),/complete reviewed/);
    assert.throws(()=>patchSidebarCycle(source.replace('r[3]=a','r[3]=null')),/complete reviewed/);
    assert.throws(()=>patchSidebarCycle(source.replace('n===void 0||n','!!n')),/complete reviewed/);
  });
}
test('mixed reviewed bindings and multiple variant hooks are rejected',()=>{
  for(const original of SIDEBAR_VARIANTS)for(const other of SIDEBAR_VARIANTS){
    if(original===other)continue;
    assert.throws(()=>patchSidebarCycle(original.hook.replace(original.callback,other.callback)),/complete reviewed/);
    assert.throws(()=>patchSidebarCycle(original.hook.replace(original.registration,other.registration)),/complete reviewed/);
    assert.throws(()=>patchSidebarCycle(original.hook+other.hook),/exactly one/);
    assert.throws(()=>patchSidebarCycle(original.hook+other.callback),/exactly one/);
    assert.throws(()=>patchSidebarCycle(original.hook+other.registration),/exactly one/);
  }
});
test('unknown minifier rename and reserved-name collisions are rejected',()=>{
  for(const variant of SIDEBAR_VARIANTS){
    assert.throws(()=>patchSidebarCycle(variant.hook.replace(`${bindings[variant.id].hook}(`,'unknown(')),/complete reviewed/);
    assert.throws(()=>patchSidebarCycle(`${variant.hook};let __neonOpen;`),/reserved names/);
  }
});
