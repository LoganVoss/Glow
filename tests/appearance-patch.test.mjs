import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { APPEARANCE_VARIANTS, patchAppearance } from '../scripts/appearance-patch.mjs';

function fixture(variant) {
  const bridgePath = 'webview/assets/app-shared-aabbcc.js';
  const generalPath = 'webview/assets/general-settings-ddeeff.js';
  const appearance = `import{${variant.jsx} as ${variant.jsxAlias},${variant.react} as ${variant.reactAlias},${variant.cache} as ${variant.cacheAlias}}from"./app-shared-aabbcc.js";import{n as u}from"./general-settings-ddeeff.js";var p,m,h;function initialize(){p=${variant.cacheAlias}(),m=${variant.reactAlias}(),h=${variant.jsxAlias}()}initialize();function AppearanceSettings(value,r){const i=value,o=value;return ${variant.mountNeedle}}`;
  const exported = [variant.jsx, variant.react, variant.cache, variant.scopeHook, variant.scope, variant.settings, variant.write];
  const bridge = `export{${exported.map((symbol,index)=>`native${index} as ${symbol}`).join(',')}};`;
  const general = `import{${variant.scopeHook} as useScope,${variant.scope} as scopeAtom,${variant.settings} as settings,${variant.write} as write}from"./app-shared-aabbcc.js";function Theme(){const scope=useScope(scopeAtom);return value=>write(scope,settings.theme,value,{optimistic:!1})}`;
  return { appearance, bridge, general, bridgePath, generalPath };
}

for(const variant of APPEARANCE_VARIANTS) {
  test(`${variant.id}: native mount is preserved and ref mounts the panel with scoped theme writes`, async()=>{
    const input=fixture(variant), patched=patchAppearance(input);
    assert.equal(patched.split(variant.mountNeedle).length-1,1);
    assert.ok(patched.endsWith(input.appearance.replace(variant.mountNeedle,`(0,h.jsxs)("div",{"data-neon-appearance":"v1",children:[${variant.mountNeedle},(0,h.jsx)(__neonAppearanceSlot,{})]})`)));
    const mounts=[],writes=[],dependencies=[],scope={},scopeAtom={},themeAtom={},nativeComponent=()=>{};
    let boots=0;
    const jsx=(type,props,key)=>({type,props,key});
    const context=vm.createContext({
      [variant.jsxAlias]:()=>({jsx,jsxs:jsx}),
      [variant.cacheAlias]:()=>({c:()=>[]}),
      [variant.reactAlias]:()=>({useCallback:(callback,deps)=>{dependencies.push(deps);return callback;}}),
      u:nativeComponent,
      __neonUseScope:atom=>{assert.equal(atom,scopeAtom);return scope;},
      __neonScope:scopeAtom,__neonSettings:{theme:themeAtom},
      __neonWrite:(...args)=>{writes.push(args);return Promise.resolve('saved');},
      __neonBoot:()=>{boots++;return {mountAppearance:(...args)=>mounts.push(args)};},
    });
    vm.runInContext(patched.replace(/import\{[^}]+\}from"[^"]+";/g,''),context);
    const wrapper=context.AppearanceSettings(true,'navigation');
    assert.equal(wrapper.props['data-neon-appearance'],'v1');
    assert.equal(wrapper.props.children[0].type,nativeComponent);
    assert.equal(wrapper.props.children[0].props.defaultAdvancedExpanded,true);
    assert.equal(wrapper.props.children[0].key,'navigation');
    const slot=wrapper.props.children[1].type();
    assert.equal(slot.props['data-neon-settings-slot'],'v1');
    assert.equal(dependencies.length,2);
    assert.equal(dependencies[0][0],scope);
    slot.props.ref(null);assert.equal(boots,0);
    const element={};slot.props.ref(element);
    assert.equal(boots,1);assert.equal(mounts[0][0],element);
    const setTheme=mounts[0][1].setTheme;
    assert.equal(dependencies[1][0],setTheme);
    for(const mode of ['light','dark']) {
      assert.equal(await setTheme(mode),'saved');
      const args=writes.at(-1);
      assert.equal(args[0],scope);assert.equal(args[1],themeAtom);assert.equal(args[2],mode);
      assert.equal(args[3].optimistic,false);
    }
    await assert.rejects(setTheme('system'),/Unsupported appearance mode/);
    assert.equal(writes.length,2);
  });
  test(`${variant.id}: changed mount, bindings, initialization and duplicate imports are rejected`,()=>{
    const original=fixture(variant);
    for(const [before,after] of [
      [variant.mountNeedle,variant.mountNeedle+variant.mountNeedle],
      [variant.mountNeedle,'null'],
      [variant.mountNeedle,variant.mountNeedle.replace('defaultAdvancedExpanded:','changedProp:')],
      [variant.mountNeedle,variant.mountNeedle.replace('},r)','},other)')],
      [`${variant.react} as ${variant.reactAlias}`,`${variant.react} as react`],
      [`${variant.jsx} as ${variant.jsxAlias}`,`${variant.jsx} as unknown`],
      [`${variant.cache} as ${variant.cacheAlias}`,`${variant.cache} as cache`],
      ['n as u','n as component'],
      [`m=${variant.reactAlias}()`,'m=unknown()'],
      [`h=${variant.jsxAlias}()`,`h=unknown()`],
      [`p=${variant.cacheAlias}()`,`p=unknown()`],
      ['app-shared-aabbcc.js','app-shared-111111.js'],
      ['general-settings-ddeeff.js','general-settings-111111.js'],
    ])assert.throws(()=>patchAppearance({...original,appearance:original.appearance.replace(before,after)}));
    for(const addition of [';let __neonCollision;', ';let __scope;', 'import{x as y}from"./app-shared-aabbcc.js";', 'import{n as other}from"./general-settings-ddeeff.js";']) {
      assert.throws(()=>patchAppearance({...original,appearance:original.appearance+addition}));
    }
    assert.throws(()=>patchAppearance({...original,appearance:patchAppearance(original)}),/Reserved/);
  });
  test(`${variant.id}: export and native writer changes are rejected`,()=>{
    const original=fixture(variant);
    for(const symbol of [variant.jsx,variant.react,variant.cache,variant.scopeHook,variant.scope,variant.settings,variant.write]) {
      assert.throws(()=>patchAppearance({...original,bridge:original.bridge.replace(` as ${symbol}`,` as missing`)}),/export/);
      assert.throws(()=>patchAppearance({...original,bridge:original.bridge+`export{duplicate as ${symbol}};`}),/export/);
    }
    for(const [before,after] of [
      [`${variant.write} as write`,'wrong as write'],
      [`${variant.scopeHook} as useScope`,'wrong as useScope'],
      [`${variant.scope} as scopeAtom`,'wrong as scopeAtom'],
      [`${variant.settings} as settings`,'wrong as settings'],
      ['scope=useScope(scopeAtom)','scope=other(scopeAtom)'],
      ['write(scope,settings.theme,value','write(other,settings.theme,value'],
      ['optimistic:!1','optimistic:!0'],
      ['settings.theme','settings.other'],
      ['app-shared-aabbcc.js','app-shared-111111.js'],
    ])assert.throws(()=>patchAppearance({...original,general:original.general.replace(before,after)}));
    assert.throws(()=>patchAppearance({...original,general:original.general+';write(scope,settings.theme,extra,{optimistic:!1})'}),/exactly one/);
    assert.throws(()=>patchAppearance({...original,general:original.general+';import{x as y}from"./app-shared-aabbcc.js";'}),/exactly one/);
  });
}
test('Appearance variants cannot mix reviewed roles or accept unknown names',()=>{
  for(const variant of APPEARANCE_VARIANTS)for(const other of APPEARANCE_VARIANTS){
    if(variant===other)continue;
    const original=fixture(variant);
    assert.throws(()=>patchAppearance({...original,appearance:original.appearance.replace(`${variant.react} as ${variant.reactAlias}`,`${other.react} as ${variant.reactAlias}`)}),/variant/);
    assert.throws(()=>patchAppearance({...original,appearance:original.appearance.replace(`${variant.jsx} as ${variant.jsxAlias}`,`unknown as ${variant.jsxAlias}`)}),/variant/);
    assert.throws(()=>patchAppearance({...original,general:fixture(other).general}),/native appearance/);
    if(variant.mountNeedle!==other.mountNeedle)assert.throws(()=>patchAppearance({...original,appearance:original.appearance.replace(variant.mountNeedle,other.mountNeedle)}),/native Appearance mount/);
  }
});
